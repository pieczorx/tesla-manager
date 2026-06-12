import { app } from 'electron'

export async function setupAutoUpdater(): Promise<void> {
  if (!app.isPackaged) {
    return
  }

  const { autoUpdater } = await import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.checkForUpdatesAndNotify()
}
