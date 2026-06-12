import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from 'ffprobe-static'
import type { DashcamClip } from '../shared/types'
import {
  buildCameraTracks,
  buildSegmentTrimParts,
  GRID_CAMERA_ORDER,
  type CameraTrack,
  type SegmentTrimPart,
} from '../utils/clipCameras'

export interface ExportClipRequest {
  clip: DashcamClip
  cameraId: string | null
  inOffsetSeconds: number
  outOffsetSeconds: number
  playbackRate: number
}

function normalizePlaybackRate(rate: number): number {
  return rate > 0 ? rate : 1
}

function toOutputDuration(sourceDurationSeconds: number, playbackRate: number): number {
  return sourceDurationSeconds / normalizePlaybackRate(playbackRate)
}

export interface ExportPreparedResult {
  tempFilePath: string
  suggestedFileName: string
  sessionId: string
}

export type ExportProgressCallback = (progress: number) => void

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled')
    this.name = 'ExportCancelledError'
  }
}

interface ActiveExportState {
  clipId: string
  sessionId: string
  workDir: string
  cancelled: boolean
  currentProcess: ChildProcess | null
}

const activeExportsByClipId = new Map<string, ActiveExportState>()

function assertNotCancelled(state: ActiveExportState): void {
  if (state.cancelled) {
    throw new ExportCancelledError()
  }
}

function killActiveProcess(state: ActiveExportState): void {
  const process = state.currentProcess
  if (!process || process.killed) {
    return
  }
  state.currentProcess = null
  process.kill()
}

const DEFAULT_CELL_WIDTH = 1280
const DEFAULT_CELL_HEIGHT = 960

function toEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function buildCompatibleEncoderArgs(): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'main',
    '-level',
    '4.0',
    '-tag:v',
    'avc1',
    '-movflags',
    '+faststart',
    '-an',
  ]
}

function getFfmpegPath(): string {
  if (!ffmpegPath) {
    throw new Error('ffmpeg binary is unavailable')
  }
  return ffmpegPath
}

function getFfprobePath(): string {
  return ffprobePath.path
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function runFfmpeg(
  args: string[],
  totalDurationSeconds: number,
  onProgress?: ExportProgressCallback,
  state?: ActiveExportState,
): Promise<void> {
  if (state) {
    assertNotCancelled(state)
  }

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegPath(), args, { windowsHide: true })
    let stderr = ''

    if (state) {
      state.currentProcess = ffmpeg
    }

    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text

      if (!onProgress || totalDurationSeconds <= 0) {
        return
      }

      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
      if (timeMatch) {
        const hours = Number(timeMatch[1])
        const minutes = Number(timeMatch[2])
        const seconds = Number(timeMatch[3])
        const centiseconds = Number(timeMatch[4])
        const currentSeconds = hours * 3600 + minutes * 60 + seconds + centiseconds / 100
        onProgress(Math.min(1, currentSeconds / totalDurationSeconds))
      }
    })

    ffmpeg.on('error', (error) => {
      if (state) {
        state.currentProcess = null
      }
      if (state?.cancelled) {
        reject(new ExportCancelledError())
        return
      }
      reject(error)
    })

    ffmpeg.on('close', (code) => {
      if (state) {
        state.currentProcess = null
      }

      if (state?.cancelled) {
        reject(new ExportCancelledError())
        return
      }

      if (code === 0) {
        onProgress?.(1)
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`))
    })
  })
}

async function probeVideoDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  if (!(await fileExists(filePath))) {
    return null
  }

  return new Promise((resolve) => {
    const ffprobe = spawn(
      getFfprobePath(),
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0:s=x',
        filePath,
      ],
      { windowsHide: true },
    )

    let stdout = ''
    ffprobe.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    ffprobe.on('error', () => resolve(null))
    ffprobe.on('close', () => {
      const match = stdout.trim().match(/^(\d+)x(\d+)$/)
      if (!match) {
        resolve(null)
        return
      }
      resolve({ width: Number(match[1]), height: Number(match[2]) })
    })
  })
}

function buildTrimFilter(parts: SegmentTrimPart[], playbackRate: number): string {
  const filters: string[] = []
  const labels: string[] = []

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!
    const trimEnd = part.trimStart + part.trimDuration
    filters.push(
      `[${index}:v]trim=start=${part.trimStart}:end=${trimEnd},setpts=PTS-STARTPTS[v${index}]`,
    )
    labels.push(`[v${index}]`)
  }

  const speedFilter =
    playbackRate === 1 ? '' : `,setpts=PTS/${playbackRate}`
  filters.push(`${labels.join('')}concat=n=${parts.length}:v=1:a=0${speedFilter},format=yuv420p[outv]`)
  return filters.join(';')
}

async function exportTrimmedParts(
  parts: SegmentTrimPart[],
  outputPath: string,
  sourceDurationSeconds: number,
  playbackRate: number,
  onProgress?: ExportProgressCallback,
  state?: ActiveExportState,
): Promise<void> {
  if (state) {
    assertNotCancelled(state)
  }

  const outputDurationSeconds = toOutputDuration(sourceDurationSeconds, playbackRate)

  if (parts.length === 0) {
    await exportBlackVideo(
      outputPath,
      outputDurationSeconds,
      DEFAULT_CELL_WIDTH,
      DEFAULT_CELL_HEIGHT,
      onProgress,
      state,
    )
    return
  }

  const inputArgs = parts.flatMap((part) => ['-i', part.filePath])
  const filterComplex = buildTrimFilter(parts, playbackRate)

  await runFfmpeg(
    [
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      ...buildCompatibleEncoderArgs(),
      '-y',
      outputPath,
    ],
    outputDurationSeconds,
    onProgress,
    state,
  )
}

async function exportBlackVideo(
  outputPath: string,
  durationSeconds: number,
  width: number,
  height: number,
  onProgress?: ExportProgressCallback,
  state?: ActiveExportState,
): Promise<void> {
  if (state) {
    assertNotCancelled(state)
  }
  const evenWidth = toEvenDimension(width)
  const evenHeight = toEvenDimension(height)

  await runFfmpeg(
    [
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=${evenWidth}x${evenHeight}:r=30:d=${durationSeconds}`,
      ...buildCompatibleEncoderArgs(),
      '-t',
      String(durationSeconds),
      '-y',
      outputPath,
    ],
    durationSeconds,
    onProgress,
    state,
  )
}

async function resolveCellDimensions(tracks: CameraTrack[]): Promise<{ width: number; height: number }> {
  const preferred = tracks.find((track) => track.id === 'front') ?? tracks[0]
  if (preferred) {
    for (const segment of preferred.segments) {
      const dimensions = await probeVideoDimensions(segment.filePath)
      if (dimensions) {
        return dimensions
      }
    }
  }

  for (const track of tracks) {
    for (const segment of track.segments) {
      const dimensions = await probeVideoDimensions(segment.filePath)
      if (dimensions) {
        return dimensions
      }
    }
  }

  return { width: DEFAULT_CELL_WIDTH, height: DEFAULT_CELL_HEIGHT }
}

function buildSuggestedFileName(clip: DashcamClip, cameraId: string | null): string {
  const timestamp = clip.timestamp.replace(/[:.]/g, '-')
  const suffix = cameraId ?? 'grid'
  return `${timestamp}_${suffix}.mp4`
}

async function exportSingleCamera(
  track: CameraTrack,
  startSeconds: number,
  endSeconds: number,
  outputPath: string,
  playbackRate: number,
  onProgress?: ExportProgressCallback,
  state?: ActiveExportState,
): Promise<void> {
  const durationSeconds = endSeconds - startSeconds
  const parts = buildSegmentTrimParts(track, startSeconds, endSeconds)
  await exportTrimmedParts(parts, outputPath, durationSeconds, playbackRate, onProgress, state)
}

async function exportGrid(
  tracks: CameraTrack[],
  startSeconds: number,
  endSeconds: number,
  outputPath: string,
  workDir: string,
  playbackRate: number,
  onProgress?: ExportProgressCallback,
  state?: ActiveExportState,
): Promise<void> {
  const durationSeconds = endSeconds - startSeconds
  const outputDurationSeconds = toOutputDuration(durationSeconds, playbackRate)
  const cellDimensions = await resolveCellDimensions(tracks)
  const cellWidth = toEvenDimension(cellDimensions.width)
  const cellHeight = toEvenDimension(cellDimensions.height)
  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const cellPaths: string[] = []

  for (let index = 0; index < GRID_CAMERA_ORDER.length; index += 1) {
    if (state) {
      assertNotCancelled(state)
    }

    const cameraId = GRID_CAMERA_ORDER[index]!
    const cellPath = join(workDir, `cell-${index}.mp4`)
    const track = trackById.get(cameraId)
    const cellProgress = (value: number) => {
      const sliceStart = index / GRID_CAMERA_ORDER.length
      const sliceEnd = (index + 1) / GRID_CAMERA_ORDER.length
      onProgress?.(sliceStart + value * (sliceEnd - sliceStart) * 0.85)
    }

    if (track) {
      const parts = buildSegmentTrimParts(track, startSeconds, endSeconds)
      await exportTrimmedParts(parts, cellPath, durationSeconds, playbackRate, cellProgress, state)
    } else {
      await exportBlackVideo(cellPath, outputDurationSeconds, cellWidth, cellHeight, cellProgress, state)
    }

    cellPaths.push(cellPath)
  }

  if (state) {
    assertNotCancelled(state)
  }

  const layout = [
    `0_0`,
    `${cellWidth}_0`,
    `${cellWidth * 2}_0`,
    `0_${cellHeight}`,
    `${cellWidth}_${cellHeight}`,
    `${cellWidth * 2}_${cellHeight}`,
  ].join('|')

  const scaleFilters = cellPaths
    .map(
      (_, index) =>
        `[${index}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[c${index}]`,
    )
    .join(';')

  const stackInputs = cellPaths.map((_, index) => `[c${index}]`).join('')
  const filterComplex = `${scaleFilters};${stackInputs}xstack=inputs=6:layout=${layout}:fill=black,format=yuv420p[outv]`
  const inputArgs = cellPaths.flatMap((path) => ['-i', path])

  await runFfmpeg(
    [
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      ...buildCompatibleEncoderArgs(),
      '-y',
      outputPath,
    ],
    outputDurationSeconds,
    (value) => onProgress?.(0.85 + value * 0.15),
    state,
  )
}

const activeSessions = new Map<string, string>()

async function cleanupExportSession(state: ActiveExportState): Promise<void> {
  activeSessions.delete(state.sessionId)
  activeExportsByClipId.delete(state.clipId)
  killActiveProcess(state)
  await rm(state.workDir, { recursive: true, force: true }).catch(() => {})
}

export function cancelClipExport(clipId: string): boolean {
  const state = activeExportsByClipId.get(clipId)
  if (!state) {
    return false
  }

  state.cancelled = true
  killActiveProcess(state)
  return true
}

export async function prepareClipExport(
  request: ExportClipRequest,
  onProgress?: ExportProgressCallback,
): Promise<ExportPreparedResult> {
  const { clip, cameraId, inOffsetSeconds, outOffsetSeconds } = request
  const playbackRate = normalizePlaybackRate(request.playbackRate)
  const startSeconds = Math.max(0, inOffsetSeconds)
  const endSeconds = Math.max(startSeconds, outOffsetSeconds)

  if (endSeconds <= startSeconds) {
    throw new Error('Export range is empty')
  }

  const tracks = buildCameraTracks(clip.videoFiles, clip.clipStartIso, {
    segmentDurations: clip.segmentDurations,
    clipDurationSeconds: clip.durationSeconds,
  })
  if (tracks.length === 0 && cameraId) {
    throw new Error('No camera tracks found for export')
  }

  const sessionId = randomUUID()
  const workDir = join(tmpdir(), 'tesla-manager-export', sessionId)
  await mkdir(workDir, { recursive: true })

  const outputPath = join(workDir, 'export.mp4')
  activeSessions.set(sessionId, workDir)

  const state: ActiveExportState = {
    clipId: clip.id,
    sessionId,
    workDir,
    cancelled: false,
    currentProcess: null,
  }
  activeExportsByClipId.set(clip.id, state)

  try {
    if (cameraId) {
      const track = tracks.find((item) => item.id === cameraId)
      if (!track) {
        throw new Error(`Camera "${cameraId}" not found`)
      }
      await exportSingleCamera(track, startSeconds, endSeconds, outputPath, playbackRate, onProgress, state)
    } else {
      await exportGrid(tracks, startSeconds, endSeconds, outputPath, workDir, playbackRate, onProgress, state)
    }

    activeExportsByClipId.delete(clip.id)

    return {
      tempFilePath: outputPath,
      suggestedFileName: buildSuggestedFileName(clip, cameraId),
      sessionId,
    }
  } catch (error) {
    if (state.cancelled || error instanceof ExportCancelledError) {
      await cleanupExportSession(state)
      throw new ExportCancelledError()
    }

    await cleanupExportSession(state)
    throw error
  }
}

async function copyFileWithProgress(
  sourcePath: string,
  destinationPath: string,
  onProgress?: ExportProgressCallback,
): Promise<void> {
  const { size } = await stat(sourcePath)
  if (size <= 0) {
    onProgress?.(1)
    return
  }

  let copied = 0
  const progressTracker = new Transform({
    transform(chunk, _encoding, callback) {
      copied += chunk.length
      onProgress?.(Math.min(1, copied / size))
      callback(null, chunk)
    },
  })

  await pipeline(
    createReadStream(sourcePath),
    progressTracker,
    createWriteStream(destinationPath),
  )
  onProgress?.(1)
}

export async function savePreparedExport(
  tempFilePath: string,
  suggestedFileName: string,
  exportFolder: string,
  onProgress?: ExportProgressCallback,
): Promise<string> {
  await mkdir(exportFolder, { recursive: true })
  const destinationPath = join(exportFolder, suggestedFileName)
  await copyFileWithProgress(tempFilePath, destinationPath, onProgress)
  return destinationPath
}

function getClipboardCacheDir(): string {
  return join(app.getPath('userData'), 'clipboard-cache')
}

async function clearClipboardCache(): Promise<void> {
  const cacheDir = getClipboardCacheDir()
  try {
    const entries = await readdir(cacheDir)
    await Promise.all(entries.map((entry) => rm(join(cacheDir, entry), { force: true })))
  } catch {
    // Cache may not exist yet.
  }
}

export async function stageExportForClipboard(
  tempFilePath: string,
  suggestedFileName: string,
  onProgress?: ExportProgressCallback,
): Promise<string> {
  const cacheDir = getClipboardCacheDir()
  await mkdir(cacheDir, { recursive: true })
  await clearClipboardCache()
  const stagedPath = join(cacheDir, suggestedFileName)
  await copyFileWithProgress(tempFilePath, stagedPath, (progress) => onProgress?.(progress * 0.9))
  onProgress?.(0.9)
  return stagedPath
}

export async function discardPreparedExport(sessionId: string): Promise<void> {
  const workDir = activeSessions.get(sessionId)
  if (!workDir) {
    return
  }
  activeSessions.delete(sessionId)
  await rm(workDir, { recursive: true, force: true })
}
