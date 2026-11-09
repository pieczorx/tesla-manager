import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { getFfmpegPath } from './mediaBinaries'

const THUMBNAIL_WIDTH = 480
const MAX_PARALLEL_JOBS = 3
const TIMEOUT_MS = 20_000

let running = 0
const waiting: Array<() => void> = []

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_JOBS) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  running += 1
  try {
    return await task()
  } finally {
    running -= 1
    waiting.shift()?.()
  }
}

function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(getFfmpegPath(), args, { windowsHide: true })
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

async function fileSize(filePath: string) {
  try {
    const info = await stat(filePath)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

/**
 * Returns a cached JPEG of one frame of `videoPath`, creating it with ffmpeg when needed.
 * Used when a clip has no usable thumb.png - with encryption (firmware 2026.20+) the car
 * encrypts thumb.png without key metadata, so it can never be decrypted.
 */
export async function getVideoThumbnail(
  videoPath: string,
  seekSeconds: number,
  cacheDir: string,
): Promise<string | null> {
  const info = await stat(videoPath).catch(() => null)
  if (!info?.isFile()) {
    return null
  }

  const seek = Math.max(0, Math.round(seekSeconds * 10) / 10)
  const key = createHash('sha256')
    .update(`${path.resolve(videoPath).toLowerCase()}|${info.size}|${info.mtimeMs}|${seek}|${THUMBNAIL_WIDTH}`)
    .digest('hex')
    .slice(0, 32)
  const outputPath = path.join(cacheDir, `${key}.jpg`)
  if (await fileSize(outputPath)) {
    return outputPath
  }

  return withSlot(async () => {
    await mkdir(cacheDir, { recursive: true })
    const tempPath = path.join(cacheDir, `.${key}.${randomBytes(4).toString('hex')}.jpg`)
    const args = (seekTo: number) => [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', String(seekTo),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', `scale=${THUMBNAIL_WIDTH}:-2`,
      '-q:v', '4',
      '-y', tempPath,
    ]

    try {
      // Seeking past the last frame produces no image; fall back to the first frame.
      let ok = (await runFfmpeg(args(seek))) && !!(await fileSize(tempPath))
      if (!ok && seek > 0) {
        ok = (await runFfmpeg(args(0))) && !!(await fileSize(tempPath))
      }
      if (!ok) {
        return null
      }
      await rename(tempPath, outputPath)
      return outputPath
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  })
}
