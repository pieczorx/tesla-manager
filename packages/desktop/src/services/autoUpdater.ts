import { app, BrowserWindow } from 'electron'
import { IPC, type UpdateStatusPayload } from '../shared/types'

let currentStatus: UpdateStatusPayload = {
  status: 'idle',
  version: null,
  progress: null,
  error: null,
}

function broadcastUpdateStatus() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.update.onStatusChange, currentStatus)
    }
  }
}

function setUpdateStatus(partial: Partial<UpdateStatusPayload>) {
  currentStatus = { ...currentStatus, ...partial }
  broadcastUpdateStatus()
}

export function getUpdateStatus(): UpdateStatusPayload {
  return currentStatus
}

export async function quitAndInstallUpdate(): Promise<void> {
  const { autoUpdater } = await import('electron-updater')
  autoUpdater.quitAndInstall()
}

export async function setupAutoUpdater(): Promise<void> {
  if (!app.isPackaged) {
    return
  }

  const { autoUpdater } = await import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({ status: 'checking', version: null, progress: null, error: null })
  })

  autoUpdater.on('update-available', (info) => {
    setUpdateStatus({ status: 'downloading', version: info.version, progress: 0, error: null })
  })

  autoUpdater.on('update-not-available', () => {
    setUpdateStatus({ status: 'idle', version: null, progress: null, error: null })
  })

  autoUpdater.on('download-progress', (progress) => {
    setUpdateStatus({
      status: 'downloading',
      progress: progress.percent / 100,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateStatus({ status: 'ready', version: info.version, progress: 1, error: null })
  })

  autoUpdater.on('error', (error) => {
    setUpdateStatus({ status: 'error', error: error.message })
  })

  void autoUpdater.checkForUpdates()
}
