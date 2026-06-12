import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { ipcMain, dialog, shell, BrowserWindow, type BrowserWindow as BrowserWindowType } from 'electron'
import { DashcamScanner } from './services/dashcamScanner'
import {
  addScanFolder,
  getClips,
  getExportFolder,
  getLastScanAt,
  getScanFolders,
  getPlaybackSettings,
  mergeClips,
  removeClip,
  removeScanFolder,
  saveClips,
  setClipArchived,
  setClipMarkers,
  setClipFavorite,
  setClipTitle,
  setExportFolder,
  setPlaybackSettings,
} from './storage'
import {
  cancelClipExport,
  discardPreparedExport,
  ExportCancelledError,
  prepareClipExport,
  savePreparedExport,
  stageExportForClipboard,
} from './services/clipExportService'
import { copyFileToClipboard } from './utils/clipClipboard'
import {
  IPC,
  type ClipsUpdatedPayload,
  type DashcamClip,
  type ExportClipRequest,
  type ScanProgressPayload,
} from './shared/types'
import { encodeAssetFilePath } from './protocol/assetProtocol'

const scanner = new DashcamScanner()
let mainWindow: BrowserWindowType | null = null

export function setMainWindow(window: BrowserWindowType | null) {
  mainWindow = window
}

function getMainWindow(): BrowserWindowType {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window is unavailable')
  }
  return mainWindow
}

function broadcast(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

async function performLibraryScan(): Promise<ClipsUpdatedPayload> {
  const folders = getScanFolders()
  let discovered: DashcamClip[] = []

  if (folders.length > 0) {
    discovered = await scanner.scanRoots(
      folders.map((folder) => folder.path),
      (progress: ScanProgressPayload) => {
        broadcast(IPC.dashcam.onScanProgress, progress)
      },
    )
  }

  const merged = await mergeClips(discovered)
  const lastScanAt = new Date().toISOString()
  await saveClips(merged, lastScanAt)

  const payload: ClipsUpdatedPayload = {
    clips: merged,
    lastScanAt,
  }

  broadcast(IPC.dashcam.onClipsUpdated, payload)
  return payload
}

export function registerIpc() {
  ipcMain.handle(IPC.settings.getScanFolders, () => getScanFolders())

  ipcMain.handle(IPC.settings.addScanFolder, (_event, folderPath: string) => {
    const normalizedPath = folderPath.trim()
    if (!normalizedPath) {
      return getScanFolders()
    }

    const folder = {
      id: randomUUID(),
      path: normalizedPath,
      label: normalizedPath.split(/[\\/]/).filter(Boolean).pop() ?? normalizedPath,
      addedAt: new Date().toISOString(),
    }

    return addScanFolder(folder)
  })

  ipcMain.handle(IPC.settings.removeScanFolder, async (_event, id: string) => {
    const folders = removeScanFolder(id)
    await performLibraryScan()
    return folders
  })

  ipcMain.handle(IPC.settings.pickScanFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle(IPC.settings.getPlaybackSettings, () => getPlaybackSettings())

  ipcMain.handle(IPC.settings.setPlaybackSettings, (_event, settings) =>
    setPlaybackSettings(settings),
  )

  ipcMain.handle(IPC.dashcam.getClips, () => ({
    clips: getClips(),
    lastScanAt: getLastScanAt(),
  }))

  ipcMain.handle(IPC.dashcam.getScanProgress, () => scanner.getProgress())

  ipcMain.handle(IPC.dashcam.startScan, async () => performLibraryScan())

  ipcMain.handle(IPC.dashcam.setClipFavorite, async (_event, clipId: string, isFavorite: boolean) => {
    const payload = await setClipFavorite(clipId, isFavorite)
    broadcast(IPC.dashcam.onClipsUpdated, payload)
    return payload
  })

  ipcMain.handle(IPC.dashcam.setClipArchived, async (_event, clipId: string, isArchived: boolean) => {
    const payload = await setClipArchived(clipId, isArchived)
    broadcast(IPC.dashcam.onClipsUpdated, payload)
    return payload
  })

  ipcMain.handle(
    IPC.dashcam.setClipMarkers,
    async (_event, clipId: string, inOffsetSeconds: number | null, outOffsetSeconds: number | null) => {
      const payload = await setClipMarkers(clipId, inOffsetSeconds, outOffsetSeconds)
      broadcast(IPC.dashcam.onClipsUpdated, payload)
      return payload
    },
  )

  ipcMain.handle(IPC.dashcam.setClipTitle, async (_event, clipId: string, customTitle: string | null) => {
    const payload = await setClipTitle(clipId, customTitle)
    broadcast(IPC.dashcam.onClipsUpdated, payload)
    return payload
  })

  ipcMain.handle(IPC.dashcam.deleteClip, async (_event, clipId: string) => {
    const clip = getClips().find((item) => item.id === clipId)
    if (!clip) {
      return {
        clips: getClips(),
        lastScanAt: getLastScanAt(),
      } satisfies ClipsUpdatedPayload
    }

    const confirmation = await dialog.showMessageBox(getMainWindow(), {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete clip folder',
      message: `Delete "${clip.folderName}" permanently?`,
      detail: 'This removes the event folder from disk. This action cannot be undone.',
    })

    if (confirmation.response !== 1) {
      return {
        clips: getClips(),
        lastScanAt: getLastScanAt(),
      } satisfies ClipsUpdatedPayload
    }

    await rm(clip.folderPath, { recursive: true, force: true })
    const payload = await removeClip(clipId)
    broadcast(IPC.dashcam.onClipsUpdated, payload)
    return payload
  })

  ipcMain.handle(IPC.dashcam.prepareExport, async (event, request: ExportClipRequest) => {
    const clip = getClips().find((item) => item.id === request.clipId)
    if (!clip) {
      throw new Error('Clip not found')
    }

    const sender = event.sender
    try {
      return await prepareClipExport(
        {
          clip,
          cameraId: request.cameraId,
          inOffsetSeconds: request.inOffsetSeconds,
          outOffsetSeconds: request.outOffsetSeconds,
          playbackRate: request.playbackRate,
        },
        (progress) => {
          sender.send(IPC.dashcam.onExportProgress, { progress })
        },
      )
    } catch (error) {
      if (error instanceof ExportCancelledError) {
        return { cancelled: true as const }
      }
      throw error
    }
  })

  ipcMain.handle(IPC.dashcam.cancelExport, (_event, clipId: string) => cancelClipExport(clipId))

  ipcMain.handle(
    IPC.dashcam.saveExport,
    async (event, payload: { tempFilePath: string; suggestedFileName: string; sessionId: string }) => {
      let exportFolder = getExportFolder()
      if (!exportFolder) {
        const result = await dialog.showOpenDialog(getMainWindow(), {
          properties: ['openDirectory', 'createDirectory'],
          title: 'Choose export folder',
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { saved: false as const, filePath: null, exportFolder: null }
        }

        exportFolder = setExportFolder(result.filePaths[0]!)
      }

      if (!exportFolder) {
        return { saved: false as const, filePath: null, exportFolder: null }
      }

      const sender = event.sender
      const savedPath = await savePreparedExport(
        payload.tempFilePath,
        payload.suggestedFileName,
        exportFolder,
        (progress) => {
          sender.send(IPC.dashcam.onExportProgress, { progress })
        },
      )
      await discardPreparedExport(payload.sessionId)
      return { saved: true as const, filePath: savedPath, exportFolder }
    },
  )

  ipcMain.handle(
    IPC.dashcam.copyExportToClipboard,
    async (event, payload: { tempFilePath: string; suggestedFileName: string; sessionId: string }) => {
      const sender = event.sender
      const stagedPath = await stageExportForClipboard(
        payload.tempFilePath,
        payload.suggestedFileName,
        (progress) => {
          sender.send(IPC.dashcam.onExportProgress, { progress })
        },
      )
      await copyFileToClipboard(stagedPath)
      sender.send(IPC.dashcam.onExportProgress, { progress: 1 })
      await discardPreparedExport(payload.sessionId)
      return { copied: true as const }
    },
  )

  ipcMain.handle(IPC.dashcam.revealExportedFile, (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle(IPC.dashcam.discardExport, async (_event, sessionId: string) => {
    await discardPreparedExport(sessionId)
  })

  ipcMain.handle(IPC.dashcam.getExportFolder, () => getExportFolder())

  ipcMain.handle(IPC.dashcam.pickExportFolder, async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose export folder',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return setExportFolder(result.filePaths[0]!)
  })

  ipcMain.handle(IPC.assets.toAssetUrl, (_event, filePath: string) => {
    if (!filePath) {
      return null
    }
    return encodeAssetFilePath(filePath)
  })

  ipcMain.handle(IPC.window.minimize, () => {
    getMainWindow().minimize()
  })

  ipcMain.handle(IPC.window.toggleMaximize, (_event, state: boolean) => {
    const window = getMainWindow()
    if (state) {
      window.maximize()
    } else {
      window.unmaximize()
    }
  })

  ipcMain.handle(IPC.window.toggleFullscreen, (_event, state: boolean) => {
    getMainWindow().setFullScreen(state)
  })

  ipcMain.handle(IPC.window.close, () => {
    getMainWindow().close()
  })

  ipcMain.handle(IPC.window.getMaximized, () => getMainWindow().isMaximized())

  ipcMain.handle(IPC.window.getFullscreen, () => getMainWindow().isFullScreen())
}

export function setupMainWindowListeners(window: BrowserWindowType) {
  window.on('enter-full-screen', () => {
    window.webContents.send(IPC.window.onFullscreenChange, true)
  })

  window.on('leave-full-screen', () => {
    window.webContents.send(IPC.window.onFullscreenChange, false)
  })

  window.on('maximize', () => {
    window.webContents.send(IPC.window.onMaximizeChange, true)
  })

  window.on('unmaximize', () => {
    window.webContents.send(IPC.window.onMaximizeChange, false)
  })
}
