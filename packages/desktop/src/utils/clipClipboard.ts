import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function copyFileToClipboard(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      `Set-Clipboard -LiteralPath ${JSON.stringify(filePath)}`,
    ])
    return
  }

  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      `set the clipboard to (POSIX file ${JSON.stringify(filePath)})`,
    ])
    return
  }

  try {
    await execFileAsync('xclip', ['-selection', 'clipboard', '-t', 'text/uri-list', '-i', filePath])
  } catch {
    await execFileAsync('wl-copy', [filePath])
  }
}
