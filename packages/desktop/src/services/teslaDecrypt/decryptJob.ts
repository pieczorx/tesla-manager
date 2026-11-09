import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import type {
  DecryptAnalysis,
  DecryptFileIssue,
  DecryptJobProgress,
  DecryptOptions,
} from '../../shared/types'
import { DecryptCancelledError, decryptFile, probeFile, type EncryptedHeader, type ProbeResult } from './container'
import { requestFileKeys, TeslaUnauthorizedError } from './teslaKeyApi'

const KEY_BATCH_SIZE = 20
const MAX_CONSECUTIVE_BATCH_FAILURES = 3
const PROBE_CONCURRENCY = 16
const PROGRESS_THROTTLE_MS = 150
const MAX_REPORTED_ISSUES = 500
const SKIPPED_DIRECTORY_NAMES = new Set(['system volume information', '$recycle.bin'])

interface AnalyzedFile {
  path: string
  size: number
  isVideo: boolean
  probe: ProbeResult
}

interface PlanEntry {
  sourcePath: string
  destinationPath: string
  kind: 'decrypt' | 'copy'
  isVideo: boolean
  bytes: number
  header: EncryptedHeader | null
  /** Retry with the key bytes exactly as stored, after Tesla rejected the normalized point. */
  useRawPublicKey?: boolean
}

function canRetryWithRawKey(entry: PlanEntry) {
  return !entry.useRawPublicKey && !!entry.header && !entry.header.publicKeyRaw.equals(entry.header.publicKey)
}

function isVideoFile(filePath: string) {
  return path.extname(filePath).toLowerCase() === '.mp4'
}

function normalizeForCompare(filePath: string) {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isSameOrInside(child: string, parent: string) {
  const relative = path.relative(normalizeForCompare(parent), normalizeForCompare(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Output mirrors the input from the `TeslaCam` folder down, so the library scanner still
 * recognises SavedClips / SentryClips / RecentClips in the decrypted copy.
 */
function mirrorAnchor(sourceRoot: string) {
  const resolved = path.resolve(sourceRoot)
  const segments = resolved.split(path.sep)
  const teslaCamIndex = segments.findIndex((segment) => segment.toLowerCase() === 'teslacam')
  if (teslaCamIndex > 0) {
    return segments.slice(0, teslaCamIndex).join(path.sep) + path.sep
  }
  const parent = path.dirname(resolved)
  return parent === resolved ? resolved : parent
}

function dedupeRoots(sourcePaths: string[]) {
  const unique = [...new Map(sourcePaths.map((item) => [normalizeForCompare(item), path.resolve(item)])).values()]
  return unique.filter((candidate) => !unique.some((other) => other !== candidate && isSameOrInside(candidate, other)))
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await worker(items[index]!)
      }
    }),
  )
  return results
}

async function fileSizeOrNull(filePath: string) {
  try {
    const info = await stat(filePath)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

function emptyProgress(): DecryptJobProgress {
  return {
    status: 'idle',
    message: null,
    totalFiles: 0,
    processedFiles: 0,
    decrypted: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    unavailable: 0,
    bytesDone: 0,
    bytesTotal: 0,
    currentFile: null,
    failures: [],
    outputRoots: [],
    startedAt: null,
    finishedAt: null,
  }
}

export interface DecryptJobHooks {
  getToken: () => string | null
  onUnauthorized: () => void
  onProgress: (progress: DecryptJobProgress) => void
  onComplete: (progress: DecryptJobProgress, options: DecryptOptions) => Promise<void> | void
}

export class DecryptJobService {
  private analysis: DecryptAnalysis | null = null
  private analyzedFiles: AnalyzedFile[] = []
  private analyzedRoots: string[] = []
  private progress: DecryptJobProgress = emptyProgress()
  private queue: PlanEntry[] = []
  private options: DecryptOptions | null = null
  private abortController: AbortController | null = null
  private lastEmitAt = 0
  private pendingEmit: NodeJS.Timeout | null = null

  constructor(private readonly hooks: DecryptJobHooks) {}

  getAnalysis() {
    return this.analysis
  }

  getProgress(): DecryptJobProgress {
    return { ...this.progress, failures: [...this.progress.failures] }
  }

  isBusy() {
    return this.progress.status === 'running' || this.progress.status === 'analyzing'
  }

  private emit(force = false) {
    const now = Date.now()
    if (force || now - this.lastEmitAt >= PROGRESS_THROTTLE_MS) {
      if (this.pendingEmit) {
        clearTimeout(this.pendingEmit)
        this.pendingEmit = null
      }
      this.lastEmitAt = now
      this.hooks.onProgress(this.getProgress())
      return
    }
    if (!this.pendingEmit) {
      this.pendingEmit = setTimeout(() => {
        this.pendingEmit = null
        this.emit(true)
      }, PROGRESS_THROTTLE_MS)
    }
  }

  private recordFailure(issue: DecryptFileIssue) {
    this.progress.failed += 1
    if (this.progress.failures.length < MAX_REPORTED_ISSUES) {
      this.progress.failures.push(issue)
    }
  }

  async analyze(sourcePaths: string[]): Promise<DecryptAnalysis> {
    if (this.isBusy()) {
      throw new Error('Another decryption task is already running')
    }
    const roots = dedupeRoots(sourcePaths.filter((item) => item.trim().length > 0))
    if (roots.length === 0) {
      throw new Error('Choose at least one folder with recordings')
    }

    this.progress = { ...emptyProgress(), status: 'analyzing', message: 'Looking for recordings...' }
    this.emit(true)

    try {
      const candidates: Array<{ path: string; size: number }> = []
      let eventFolders = 0

      const walk = async (directory: string): Promise<void> => {
        let entries
        try {
          entries = await readdir(directory, { withFileTypes: true })
        } catch {
          return
        }
        this.progress.currentFile = directory
        this.emit()

        const files = entries.filter(
          (entry) => entry.isFile() && !entry.name.startsWith('.') && !entry.name.endsWith('.part'),
        )
        if (files.some((entry) => isVideoFile(entry.name))) {
          eventFolders += 1
          for (const entry of files) {
            const filePath = path.join(directory, entry.name)
            const size = await fileSizeOrNull(filePath)
            if (size !== null) {
              candidates.push({ path: filePath, size })
            }
          }
        }

        await Promise.all(
          entries
            .filter(
              (entry) =>
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                !SKIPPED_DIRECTORY_NAMES.has(entry.name.toLowerCase()),
            )
            .map((entry) => walk(path.join(directory, entry.name))),
        )
      }

      for (const root of roots) {
        const rootInfo = await stat(root).catch(() => null)
        if (!rootInfo?.isDirectory()) {
          throw new Error(`Folder not found: ${root}`)
        }
        await walk(root)
      }

      this.progress.message = `Reading headers of ${candidates.length} file(s)...`
      this.emit(true)

      const files = await mapWithConcurrency(candidates, PROBE_CONCURRENCY, async (candidate) => {
        let probe: ProbeResult
        try {
          probe = await probeFile(candidate.path)
        } catch (error) {
          probe = { kind: 'invalid', reason: error instanceof Error ? error.message : 'Cannot read file' }
        }
        return { ...candidate, isVideo: isVideoFile(candidate.path), probe } satisfies AnalyzedFile
      })

      const vins = new Set<string>()
      const invalidFiles: DecryptFileIssue[] = []
      let encryptedFiles = 0
      let keylessFiles = 0
      let encryptedBytes = 0
      let plainVideoFiles = 0
      let otherFiles = 0
      let totalBytes = 0
      let samplePath: string | null = null
      let sampleSize = Infinity

      for (const file of files) {
        totalBytes += file.size
        if (file.probe.kind === 'encrypted') {
          encryptedFiles += 1
          encryptedBytes += file.size
          vins.add(file.probe.header.vin)
          // The smallest encrypted video is the cheapest one to hand to dashcam.tesla.com.
          if (file.isVideo && file.size < sampleSize) {
            samplePath = file.path
            sampleSize = file.size
          }
        } else if (file.probe.kind === 'keyless') {
          keylessFiles += 1
        } else if (file.probe.kind === 'invalid') {
          invalidFiles.push({ path: file.path, reason: file.probe.reason })
        } else if (file.isVideo) {
          plainVideoFiles += 1
        } else {
          otherFiles += 1
        }
      }

      this.analyzedFiles = files
      this.analyzedRoots = roots
      this.analysis = {
        sourcePaths: roots,
        encryptedFiles,
        keylessFiles,
        encryptedBytes,
        plainVideoFiles,
        otherFiles,
        totalBytes,
        eventFolders,
        vins: [...vins].sort(),
        invalidFiles: invalidFiles.slice(0, MAX_REPORTED_ISSUES),
        samplePath,
        analyzedAt: new Date().toISOString(),
      }

      this.progress = { ...emptyProgress(), status: 'idle' }
      this.emit(true)
      return this.analysis
    } catch (error) {
      this.progress = {
        ...emptyProgress(),
        status: 'error',
        message: error instanceof Error ? error.message : 'Analysis failed',
      }
      this.emit(true)
      throw error
    }
  }

  /** First encrypted header, used to check that the Tesla session can actually fetch keys. */
  getSampleHeader(): EncryptedHeader | null {
    const sample = this.analyzedFiles.find((file) => file.probe.kind === 'encrypted' && file.isVideo)
      ?? this.analyzedFiles.find((file) => file.probe.kind === 'encrypted')
    return sample && sample.probe.kind === 'encrypted' ? sample.probe.header : null
  }

  private buildPlan(options: DecryptOptions) {
    const outputFolder = path.resolve(options.outputFolder)
    for (const root of this.analyzedRoots) {
      if (isSameOrInside(outputFolder, root) || isSameOrInside(root, outputFolder)) {
        throw new Error(
          'The output folder must be outside the folders you are decrypting (and must not contain them).',
        )
      }
    }

    const entries: PlanEntry[] = []
    const outputRoots = new Set<string>()
    let unavailable = 0

    for (const root of this.analyzedRoots) {
      const anchor = mirrorAnchor(root)
      outputRoots.add(path.join(outputFolder, path.relative(anchor, root)))

      for (const file of this.analyzedFiles) {
        if (!isSameOrInside(file.path, root)) {
          continue
        }
        const destinationPath = path.join(outputFolder, path.relative(anchor, file.path))
        if (file.probe.kind === 'keyless') {
          unavailable += 1
        } else if (file.probe.kind === 'encrypted') {
          entries.push({
            sourcePath: file.path,
            destinationPath,
            kind: 'decrypt',
            isVideo: file.isVideo,
            bytes: file.probe.header.plaintextSize,
            header: file.probe.header,
          })
        } else if (file.probe.kind === 'plain' && (!file.isVideo || options.copyUnencrypted)) {
          entries.push({
            sourcePath: file.path,
            destinationPath,
            kind: 'copy',
            isVideo: file.isVideo,
            bytes: file.size,
            header: null,
          })
        }
      }
    }

    // Sidecars (event.json, thumbnails) first so a partial run is already browsable,
    // then the encrypted videos, then plain videos.
    const rank = (entry: PlanEntry) => (entry.kind === 'copy' && !entry.isVideo ? 0 : entry.kind === 'decrypt' ? 1 : 2)
    entries.sort((a, b) => rank(a) - rank(b) || a.sourcePath.localeCompare(b.sourcePath))

    return { entries, outputRoots: [...outputRoots], unavailable }
  }

  async start(options: DecryptOptions) {
    if (this.isBusy()) {
      throw new Error('Decryption is already running')
    }
    if (!this.analysis) {
      throw new Error('Analyze the recordings first')
    }
    if (!options.outputFolder?.trim()) {
      throw new Error('Choose an output folder')
    }
    if (this.analysis.encryptedFiles > 0 && !this.hooks.getToken()) {
      throw new Error('Connect your Tesla account first')
    }

    const { entries, outputRoots, unavailable } = this.buildPlan(options)
    this.options = options
    this.queue = entries
    this.progress = {
      ...emptyProgress(),
      status: 'running',
      message: 'Starting...',
      unavailable,
      totalFiles: entries.length,
      bytesTotal: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      outputRoots,
      startedAt: new Date().toISOString(),
    }
    this.emit(true)
    void this.run()
  }

  async resume() {
    if (this.isBusy()) {
      return
    }
    if (!this.options || this.queue.length === 0) {
      throw new Error('There is nothing to resume')
    }
    if (this.queue.some((entry) => entry.kind === 'decrypt') && !this.hooks.getToken()) {
      throw new Error('Connect your Tesla account first')
    }
    this.progress.status = 'running'
    this.progress.message = 'Resuming...'
    this.progress.finishedAt = null
    this.emit(true)
    void this.run()
  }

  cancel() {
    if (this.progress.status === 'running') {
      this.abortController?.abort()
      return true
    }
    if (this.progress.status === 'paused-auth' || this.progress.status === 'error') {
      this.queue = []
      this.progress.status = 'cancelled'
      this.progress.message = 'Cancelled'
      this.progress.finishedAt = new Date().toISOString()
      this.emit(true)
      return true
    }
    return false
  }

  private markProcessed(entry: PlanEntry, outcome: 'decrypted' | 'copied' | 'skipped' | 'failed') {
    this.progress.processedFiles += 1
    if (outcome !== 'failed') {
      this.progress[outcome] += 1
    }
    const index = this.queue.indexOf(entry)
    if (index >= 0) {
      this.queue.splice(index, 1)
    }
  }

  private async processCopy(entry: PlanEntry, signal: AbortSignal) {
    this.progress.currentFile = entry.sourcePath
    this.emit()
    const options = this.options!
    const existing = await fileSizeOrNull(entry.destinationPath)
    if (options.skipExisting && existing === entry.bytes) {
      this.progress.bytesDone += entry.bytes
      this.markProcessed(entry, 'skipped')
      return
    }
    if (signal.aborted) {
      throw new DecryptCancelledError()
    }
    try {
      await mkdir(path.dirname(entry.destinationPath), { recursive: true })
      const tempPath = `${entry.destinationPath}.part`
      await copyFile(entry.sourcePath, tempPath)
      await rename(tempPath, entry.destinationPath)
      this.progress.bytesDone += entry.bytes
      this.markProcessed(entry, 'copied')
    } catch (error) {
      await rm(`${entry.destinationPath}.part`, { force: true }).catch(() => undefined)
      this.progress.bytesDone += entry.bytes
      this.recordFailure({ path: entry.sourcePath, reason: error instanceof Error ? error.message : 'Copy failed' })
      this.markProcessed(entry, 'failed')
    }
  }

  /** Records a failed file, or puts it back in the queue for one retry with the raw key bytes. */
  private failOrRetry(entry: PlanEntry, reason: string) {
    if (canRetryWithRawKey(entry)) {
      entry.useRawPublicKey = true
      return
    }
    this.progress.bytesDone += entry.bytes
    this.recordFailure({ path: entry.sourcePath, reason })
    this.markProcessed(entry, 'failed')
  }

  private async processDecrypt(entry: PlanEntry, key: Buffer, signal: AbortSignal) {
    this.progress.currentFile = entry.sourcePath
    this.emit()
    await mkdir(path.dirname(entry.destinationPath), { recursive: true })
    let counted = 0
    try {
      await decryptFile(entry.sourcePath, entry.destinationPath, entry.header!, key, {
        expectMp4: entry.isVideo,
        signal,
        onBytes: (bytes) => {
          counted += bytes
          this.progress.bytesDone += bytes
          this.emit()
        },
      })
      this.markProcessed(entry, 'decrypted')
    } catch (error) {
      this.progress.bytesDone -= counted
      if (error instanceof DecryptCancelledError) {
        throw error
      }
      this.failOrRetry(entry, error instanceof Error ? error.message : 'Decryption failed')
    }
  }

  /** Up to KEY_BATCH_SIZE pending files with distinct correlation ids (ids are not unique). */
  private nextKeyBatch(): PlanEntry[] {
    const seen = new Set<string>()
    const batch: PlanEntry[] = []
    for (const entry of this.queue) {
      if (entry.kind !== 'decrypt' || seen.has(entry.header!.id)) {
        continue
      }
      seen.add(entry.header!.id)
      batch.push(entry)
      if (batch.length >= KEY_BATCH_SIZE) {
        break
      }
    }
    return batch
  }

  private async run() {
    const options = this.options!
    this.abortController = new AbortController()
    const { signal } = this.abortController
    let consecutiveBatchFailures = 0

    try {
      for (const entry of this.queue.filter((item) => item.kind === 'copy' && !item.isVideo)) {
        await this.processCopy(entry, signal)
      }

      for (;;) {
        if (signal.aborted) {
          throw new DecryptCancelledError()
        }

        const pending = this.nextKeyBatch()
        if (pending.length === 0) {
          break
        }

        const batch: PlanEntry[] = []
        for (const entry of pending) {
          const existing = await fileSizeOrNull(entry.destinationPath)
          if (options.skipExisting && existing === entry.bytes) {
            this.progress.bytesDone += entry.bytes
            this.markProcessed(entry, 'skipped')
          } else {
            batch.push(entry)
          }
        }
        if (batch.length === 0) {
          continue
        }

        const token = this.hooks.getToken()
        if (!token) {
          throw new TeslaUnauthorizedError()
        }

        this.progress.message = `Requesting keys for ${batch.length} file(s) from Tesla...`
        this.emit(true)

        let keys
        try {
          keys = await requestFileKeys(
            token,
            batch.map((entry) => ({ header: entry.header!, useRawPublicKey: entry.useRawPublicKey })),
            signal,
          )
          consecutiveBatchFailures = 0
        } catch (error) {
          if (error instanceof TeslaUnauthorizedError || signal.aborted) {
            throw error
          }
          consecutiveBatchFailures += 1
          const reason = error instanceof Error ? error.message : 'Key request failed'
          if (consecutiveBatchFailures >= MAX_CONSECUTIVE_BATCH_FAILURES) {
            throw new Error(`${reason}. Stopped after ${MAX_CONSECUTIVE_BATCH_FAILURES} failed attempts in a row.`)
          }
          for (const entry of batch) {
            this.progress.bytesDone += entry.bytes
            this.recordFailure({ path: entry.sourcePath, reason })
            this.markProcessed(entry, 'failed')
          }
          continue
        }

        this.progress.message = 'Decrypting...'
        for (const entry of batch) {
          const result = keys.get(entry.header!.id)
          if (!result?.key) {
            this.failOrRetry(entry, result?.error ? `Tesla: ${result.error}` : 'Tesla returned no key for this file')
            continue
          }
          await this.processDecrypt(entry, result.key, signal)
        }
      }

      for (const entry of this.queue.filter((item) => item.kind === 'copy')) {
        await this.processCopy(entry, signal)
      }

      this.progress.status = 'complete'
      this.progress.currentFile = null
      this.progress.finishedAt = new Date().toISOString()
      this.progress.message =
        this.progress.failed > 0
          ? `Finished with ${this.progress.failed} problem(s)`
          : 'All recordings are ready'
      this.emit(true)
      await this.hooks.onComplete(this.getProgress(), options)
    } catch (error) {
      this.progress.currentFile = null
      if (error instanceof DecryptCancelledError || signal.aborted) {
        this.queue = []
        this.progress.status = 'cancelled'
        this.progress.message = 'Cancelled - files decrypted so far were kept'
        this.progress.finishedAt = new Date().toISOString()
      } else if (error instanceof TeslaUnauthorizedError) {
        this.hooks.onUnauthorized()
        this.progress.status = 'paused-auth'
        this.progress.message = 'Your Tesla session expired. Reconnect your account, then click Resume.'
      } else {
        this.progress.status = 'error'
        this.progress.message = error instanceof Error ? error.message : 'Decryption failed'
      }
      this.emit(true)
    } finally {
      this.abortController = null
    }
  }
}
