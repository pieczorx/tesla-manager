import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import * as path from 'node:path'
import type { DashcamClip, ScanProgress, TeslaEventJson } from '../shared/types'
import { computeClipTiming, parseVideoSegmentStart, TESLA_SEGMENT_DURATION_SECONDS } from '../utils/clipTiming'
import { getVideoThumbnail } from '../utils/thumbnailGenerator'
import { probeVideoDuration } from '../utils/videoProbe'
import { isEncryptedFile } from './teslaDecrypt/container'

const VIDEO_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-/i
const EVENT_FOLDER_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})$/
/** Folders that hold the SavedClips / SentryClips / RecentClips categories. */
const CATEGORY_ROOT_NAMES = new Set(['teslacam', 'encryptedclips'])

const THUMBNAIL_NAMES = ['thumb.png', 'thumb.jpg', 'thumbnail.png']
const VIDEO_EXTENSIONS = new Set(['.mp4', '.MP4'])

function isValidTeslaEventJson(data: unknown): data is TeslaEventJson {
  if (!data || typeof data !== 'object') {
    return false
  }

  const record = data as Record<string, unknown>
  const timestamp = record.timestamp ?? record.event_timestamp
  return typeof timestamp === 'string' && timestamp.trim().length > 0
}

function parseEventJson(data: TeslaEventJson) {
  const timestamp = (data.timestamp ?? data.event_timestamp ?? '').trim()
  const city = data.city ?? data.event_city ?? null
  const latRaw = data.est_lat ?? data.event_latitude
  const lonRaw = data.est_lon ?? data.event_longitude
  const latitude = latRaw === undefined || latRaw === null || latRaw === '' ? null : Number(latRaw)
  const longitude = lonRaw === undefined || lonRaw === null || lonRaw === '' ? null : Number(lonRaw)
  const reason = data.reason ?? data.event_reason ?? null

  return {
    timestamp,
    city: typeof city === 'string' && city.length > 0 ? city : null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    reason: typeof reason === 'string' && reason.length > 0 ? reason : null,
  }
}

function inferClipCategory(folderPath: string): string | null {
  const normalized = folderPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  const teslaCamIndex = segments.findIndex((segment) => CATEGORY_ROOT_NAMES.has(segment.toLowerCase()))
  if (teslaCamIndex >= 0 && segments[teslaCamIndex + 1]) {
    return segments[teslaCamIndex + 1]
  }
  return null
}

function createClipId(folderPath: string): string {
  return createHash('sha256').update(folderPath.toLowerCase()).digest('hex').slice(0, 16)
}

async function findThumbnail(folderPath: string): Promise<string | null> {
  for (const name of THUMBNAIL_NAMES) {
    const candidate = path.join(folderPath, name)
    try {
      const fileStat = await stat(candidate)
      if (fileStat.isFile()) {
        return candidate
      }
    } catch {
      // continue
    }
  }
  return null
}

async function probeSegmentDurations(videoFiles: string[]): Promise<Record<string, number>> {
  const byTimestamp = new Map<string, string>()

  for (const filePath of videoFiles) {
    const match = path.basename(filePath).match(VIDEO_TIMESTAMP_PATTERN)
    if (!match) {
      continue
    }

    const timestampKey = match[1]
    const basename = path.basename(filePath).toLowerCase()
    const existing = byTimestamp.get(timestampKey)
    if (!existing || basename.includes('-front.mp4')) {
      byTimestamp.set(timestampKey, filePath)
    }
  }

  const durations: Record<string, number> = {}
  await Promise.all(
    [...byTimestamp.entries()].map(async ([timestampKey, filePath]) => {
      const duration = await probeVideoDuration(filePath)
      if (duration !== null) {
        durations[timestampKey] = duration
      }
    }),
  )

  return durations
}

async function findVideoFiles(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(folderPath, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function readEventJson(folderPath: string): Promise<TeslaEventJson | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(folderPath, 'event.json'), 'utf8')) as unknown
    return isValidTeslaEventJson(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Tesla names event folders after the moment the clip was saved. Used when event.json is
 * missing or unreadable - with encryption (firmware 2026.20+) the car encrypts event.json
 * without key metadata, so it cannot be decrypted and the clip only has its folder name.
 */
function eventFromFolderName(folderPath: string) {
  const match = path.basename(folderPath).match(EVENT_FOLDER_PATTERN)
  if (!match) {
    return null
  }
  const [, date, hours, minutes, seconds] = match
  return {
    timestamp: `${date}T${hours}:${minutes}:${seconds}`,
    city: null,
    latitude: null,
    longitude: null,
    reason: null,
  }
}

/**
 * Picks the front-camera frame at the event moment (what Tesla's own thumb.png shows), or the
 * closest playable video when there is no front camera.
 */
function pickThumbnailFrame(
  videoFiles: string[],
  encryptedFlags: boolean[],
  clipStartIso: string | null,
  eventOffsetSeconds: number | null,
  segmentDurations: Record<string, number>,
): { videoPath: string; seekSeconds: number } | null {
  const playable = videoFiles
    .filter((_, index) => !encryptedFlags[index])
    .map((filePath) => ({ filePath, start: parseVideoSegmentStart(filePath) }))
    .filter((item): item is { filePath: string; start: Date } => item.start !== null)
  if (playable.length === 0) {
    return null
  }
  const front = playable.filter((item) => /-front\.mp4$/i.test(item.filePath))
  const candidates = (front.length > 0 ? front : playable).sort((a, b) => a.start.getTime() - b.start.getTime())

  const clipStart = clipStartIso ? new Date(clipStartIso).getTime() : candidates[0]!.start.getTime()
  const eventTime = clipStart + (eventOffsetSeconds ?? 0) * 1000
  const segment = [...candidates].reverse().find((item) => item.start.getTime() <= eventTime) ?? candidates[0]!

  const timestampKey = path.basename(segment.filePath).match(VIDEO_TIMESTAMP_PATTERN)?.[1]
  const segmentDuration = (timestampKey && segmentDurations[timestampKey]) || TESLA_SEGMENT_DURATION_SECONDS
  const seekSeconds = Math.min(Math.max(0, (eventTime - segment.start.getTime()) / 1000), Math.max(0, segmentDuration - 1))
  return { videoPath: segment.filePath, seekSeconds }
}

async function processEventFolder(folderPath: string, options: DashcamScannerOptions): Promise<DashcamClip | null> {
  try {
    const eventJson = await readEventJson(folderPath)
    const event = eventJson ? parseEventJson(eventJson) : eventFromFolderName(folderPath)
    if (!event) {
      return null
    }

    const [teslaThumbnail, videoFiles] = await Promise.all([
      findThumbnail(folderPath),
      findVideoFiles(folderPath),
    ])
    const encryptedFlags = await Promise.all(videoFiles.map((filePath) => isEncryptedFile(filePath)))
    const encryptedFileCount = encryptedFlags.filter(Boolean).length
    // ffprobe cannot read encrypted files; durations then come from the file name timestamps.
    if (!eventJson && !videoFiles.some((filePath) => VIDEO_TIMESTAMP_PATTERN.test(path.basename(filePath)))) {
      return null
    }
    const segmentDurations = await probeSegmentDurations(videoFiles.filter((_, index) => !encryptedFlags[index]))
    const timing = computeClipTiming(event.timestamp, videoFiles, segmentDurations)

    // An encrypted thumb.png is not an image; generate one from the video instead.
    let thumbnailPath = teslaThumbnail && !(await isEncryptedFile(teslaThumbnail)) ? teslaThumbnail : null
    const thumbnailCacheDir = options.thumbnailCacheDir?.() ?? null
    if (!thumbnailPath && thumbnailCacheDir) {
      const frame = pickThumbnailFrame(
        videoFiles,
        encryptedFlags,
        timing.clipStartIso,
        timing.eventOffsetSeconds,
        segmentDurations,
      )
      if (frame) {
        thumbnailPath = await getVideoThumbnail(frame.videoPath, frame.seekSeconds, thumbnailCacheDir)
      }
    }

    return {
      id: createClipId(folderPath),
      folderPath,
      folderName: path.basename(folderPath),
      timestamp: event.timestamp,
      city: event.city,
      latitude: event.latitude,
      longitude: event.longitude,
      reason: event.reason,
      thumbnailPath,
      videoFiles,
      segmentDurations,
      clipCategory: inferClipCategory(folderPath),
      durationSeconds: timing.durationSeconds,
      eventOffsetSeconds: timing.eventOffsetSeconds,
      clipStartIso: timing.clipStartIso,
      clipEndIso: timing.clipEndIso,
      scannedAt: new Date().toISOString(),
      isFavorite: false,
      isArchived: false,
      inOffsetSeconds: null,
      outOffsetSeconds: null,
      customTitle: null,
      encryptedFileCount,
    }
  } catch {
    return null
  }
}

async function walkDirectory(
  directoryPath: string,
  options: DashcamScannerOptions,
  onDirectoryVisited: (currentPath: string) => void,
  onClipFound?: () => void,
): Promise<DashcamClip[]> {
  const clips: DashcamClip[] = []

  async function walk(currentPath: string): Promise<void> {
    onDirectoryVisited(currentPath)

    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    const hasEventJson = entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'event.json')
    const isNamedEventFolder =
      EVENT_FOLDER_PATTERN.test(path.basename(currentPath)) &&
      entries.some((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name)))
    if (hasEventJson || isNamedEventFolder) {
      const clip = await processEventFolder(currentPath, options)
      if (clip) {
        clips.push(clip)
        onClipFound?.()
      }
      return
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => walk(path.join(currentPath, entry.name))),
    )
  }

  await walk(directoryPath)
  return clips
}

export interface DashcamScannerOptions {
  /** Where generated thumbnails are cached; resolved lazily because it needs the Electron app to be ready. */
  thumbnailCacheDir?: () => string
}

export class DashcamScanner {
  constructor(private readonly options: DashcamScannerOptions = {}) {}

  private progress: ScanProgress = {
    status: 'idle',
    rootPath: null,
    scannedDirectories: 0,
    foundEvents: 0,
    currentPath: null,
    message: null,
  }

  private abortController: AbortController | null = null

  getProgress(): ScanProgress {
    return {...this.progress}
  }

  async scanRoots(rootPaths: string[], onProgress: (progress: ScanProgress) => void): Promise<DashcamClip[]> {
    if (this.progress.status === 'scanning') {
      throw new Error('Scan already in progress')
    }

    this.abortController = new AbortController()
    const uniqueRoots = [...new Set(rootPaths.map((item) => path.normalize(item)))]

    this.progress = {
      status: 'scanning',
      rootPath: uniqueRoots[0] ?? null,
      scannedDirectories: 0,
      foundEvents: 0,
      currentPath: null,
      message: `Scanning ${uniqueRoots.length} folder(s)...`,
    }
    onProgress({...this.progress})

    const allClips: DashcamClip[] = []

    try {
      for (const rootPath of uniqueRoots) {
        if (this.abortController.signal.aborted) {
          break
        }

        this.progress.rootPath = rootPath
        this.progress.message = `Scanning ${rootPath}`
        onProgress({...this.progress})

        let foundInRoot = 0
        const clips = await walkDirectory(rootPath, this.options, (currentPath) => {
          this.progress.scannedDirectories += 1
          this.progress.currentPath = currentPath
          this.progress.foundEvents = allClips.length + foundInRoot
          onProgress({...this.progress})
        }, () => {
          foundInRoot += 1
          this.progress.foundEvents = allClips.length + foundInRoot
          onProgress({...this.progress})
        })

        allClips.push(...clips)
        this.progress.foundEvents = allClips.length
        onProgress({...this.progress})
      }

      this.progress = {
        ...this.progress,
        status: 'complete',
        message: `Found ${allClips.length} clip(s)`,
      }
      onProgress({...this.progress})
      return allClips
    } catch (error) {
      this.progress = {
        ...this.progress,
        status: 'error',
        message: error instanceof Error ? error.message : 'Scan failed',
      }
      onProgress({...this.progress})
      throw error
    } finally {
      this.abortController = null
    }
  }
}
