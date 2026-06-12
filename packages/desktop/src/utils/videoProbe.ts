import { spawn } from 'node:child_process'
import ffprobePath from 'ffprobe-static'

export function probeVideoDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const ffprobe = spawn(
      ffprobePath.path,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { windowsHide: true },
    )

    let stdout = ''
    ffprobe.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    ffprobe.on('error', () => resolve(null))
    ffprobe.on('close', () => {
      const duration = Number(stdout.trim())
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null)
    })
  })
}
