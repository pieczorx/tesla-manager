import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import * as path from 'node:path'
import type { DashcamClip, ScanProgress, TeslaEventJson } from '../shared/types'
import { computeClipTiming } from '../utils/clipTiming'
import { probeVideoDuration } from '../utils/videoProbe'

const VIDEO_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-/i

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
  const teslaCamIndex = segments.findIndex((segment) => segment.toLowerCase() === 'teslacam')
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

async function processEventFolder(folderPath: string): Promise<DashcamClip | null> {
  const eventPath = path.join(folderPath, 'event.json')
  try {
    const raw = await readFile(eventPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!isValidTeslaEventJson(parsed)) {
      return null
    }

    const event = parseEventJson(parsed)
    const [thumbnailPath, videoFiles] = await Promise.all([
      findThumbnail(folderPath),
      findVideoFiles(folderPath),
    ])
    const segmentDurations = await probeSegmentDurations(videoFiles)
    const timing = computeClipTiming(event.timestamp, videoFiles, segmentDurations)

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
    }
  } catch {
    return null
  }
}

async function walkDirectory(
  directoryPath: string,
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
    if (hasEventJson) {
      const clip = await processEventFolder(currentPath)
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

export class DashcamScanner {
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
        const clips = await walkDirectory(rootPath, (currentPath) => {
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
