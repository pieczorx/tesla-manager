import ffmpegStaticPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * ffmpeg-static / ffprobe-static report paths inside `app.asar`, but an executable cannot be
 * spawned from inside the archive (ENOENT). electron-builder unpacks them (`asarUnpack`) to
 * `app.asar.unpacked`, so point there in the packaged app.
 */
function toUnpackedPath(binaryPath: string): string {
  return binaryPath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}

export function getFfmpegPath(): string {
  if (!ffmpegStaticPath) {
    throw new Error('ffmpeg binary is unavailable')
  }
  return toUnpackedPath(ffmpegStaticPath)
}

export function getFfprobePath(): string {
  return toUnpackedPath(ffprobeStatic.path)
}
