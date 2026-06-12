import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './shared/types'
import type {
  ClipsUpdatedPayload,
  DashcamClip,
  ExportClipRequest,
  ExportPreparedResult,
  PrepareExportResult,
  ExportProgressPayload,
  ScanFolder,
  ScanProgressPayload,
} from './shared/types'

contextBridge.exposeInMainWorld('teslaManager', {
  settings: {
    getScanFolders: () => ipcRenderer.invoke(IPC.settings.getScanFolders) as Promise<ScanFolder[]>,
    addScanFolder: (folderPath: string) =>
      ipcRenderer.invoke(IPC.settings.addScanFolder, folderPath) as Promise<ScanFolder[]>,
    removeScanFolder: (id: string) =>
      ipcRenderer.invoke(IPC.settings.removeScanFolder, id) as Promise<ScanFolder[]>,
    pickScanFolder: () => ipcRenderer.invoke(IPC.settings.pickScanFolder) as Promise<string | null>,
    getPlaybackSettings: () =>
      ipcRenderer.invoke(IPC.settings.getPlaybackSettings) as Promise<import('./shared/types').PlaybackSettings>,
    setPlaybackSettings: (settings: import('./shared/types').PlaybackSettings) =>
      ipcRenderer.invoke(IPC.settings.setPlaybackSettings, settings) as Promise<import('./shared/types').PlaybackSettings>,
  },
  dashcam: {
    getClips: () =>
      ipcRenderer.invoke(IPC.dashcam.getClips) as Promise<{ clips: DashcamClip[]; lastScanAt: string | null }>,
    getScanProgress: () => ipcRenderer.invoke(IPC.dashcam.getScanProgress) as Promise<ScanProgressPayload>,
    startScan: () => ipcRenderer.invoke(IPC.dashcam.startScan) as Promise<ClipsUpdatedPayload>,
    setClipFavorite: (clipId: string, isFavorite: boolean) =>
      ipcRenderer.invoke(IPC.dashcam.setClipFavorite, clipId, isFavorite) as Promise<ClipsUpdatedPayload>,
    setClipArchived: (clipId: string, isArchived: boolean) =>
      ipcRenderer.invoke(IPC.dashcam.setClipArchived, clipId, isArchived) as Promise<ClipsUpdatedPayload>,
    setClipMarkers: (clipId: string, inOffsetSeconds: number | null, outOffsetSeconds: number | null) =>
      ipcRenderer.invoke(IPC.dashcam.setClipMarkers, clipId, inOffsetSeconds, outOffsetSeconds) as Promise<ClipsUpdatedPayload>,
    setClipTitle: (clipId: string, customTitle: string | null) =>
      ipcRenderer.invoke(IPC.dashcam.setClipTitle, clipId, customTitle) as Promise<ClipsUpdatedPayload>,
    deleteClip: (clipId: string) =>
      ipcRenderer.invoke(IPC.dashcam.deleteClip, clipId) as Promise<ClipsUpdatedPayload>,
    prepareExport: (request: ExportClipRequest) =>
      ipcRenderer.invoke(IPC.dashcam.prepareExport, request) as Promise<PrepareExportResult>,
    cancelExport: (clipId: string) =>
      ipcRenderer.invoke(IPC.dashcam.cancelExport, clipId) as Promise<boolean>,
    saveExport: (payload: { tempFilePath: string; suggestedFileName: string; sessionId: string }) =>
      ipcRenderer.invoke(IPC.dashcam.saveExport, payload) as Promise<{
        saved: boolean
        filePath: string | null
        exportFolder: string | null
      }>,
    copyExportToClipboard: (payload: {
      tempFilePath: string
      suggestedFileName: string
      sessionId: string
    }) =>
      ipcRenderer.invoke(IPC.dashcam.copyExportToClipboard, payload) as Promise<{ copied: boolean }>,
    discardExport: (sessionId: string) =>
      ipcRenderer.invoke(IPC.dashcam.discardExport, sessionId) as Promise<void>,
    getExportFolder: () => ipcRenderer.invoke(IPC.dashcam.getExportFolder) as Promise<string | null>,
    pickExportFolder: () => ipcRenderer.invoke(IPC.dashcam.pickExportFolder) as Promise<string | null>,
    revealExportedFile: (filePath: string) =>
      ipcRenderer.invoke(IPC.dashcam.revealExportedFile, filePath) as Promise<void>,
    onScanProgress: (callback: (progress: ScanProgressPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgressPayload) => callback(progress)
      ipcRenderer.on(IPC.dashcam.onScanProgress, listener)
      return () => ipcRenderer.off(IPC.dashcam.onScanProgress, listener)
    },
    onClipsUpdated: (callback: (payload: ClipsUpdatedPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ClipsUpdatedPayload) => callback(payload)
      ipcRenderer.on(IPC.dashcam.onClipsUpdated, listener)
      return () => ipcRenderer.off(IPC.dashcam.onClipsUpdated, listener)
    },
    onExportProgress: (callback: (progress: ExportProgressPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgressPayload) => callback(progress)
      ipcRenderer.on(IPC.dashcam.onExportProgress, listener)
      return () => ipcRenderer.off(IPC.dashcam.onExportProgress, listener)
    },
  },
  assets: {
    toAssetUrl: (filePath: string) => ipcRenderer.invoke(IPC.assets.toAssetUrl, filePath) as Promise<string | null>,
  },
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke(IPC.window.minimize) as Promise<void>,
    toggleMaximize: (state: boolean) =>
      ipcRenderer.invoke(IPC.window.toggleMaximize, state) as Promise<void>,
    toggleFullscreen: (state: boolean) =>
      ipcRenderer.invoke(IPC.window.toggleFullscreen, state) as Promise<void>,
    close: () => ipcRenderer.invoke(IPC.window.close) as Promise<void>,
    getMaximized: () => ipcRenderer.invoke(IPC.window.getMaximized) as Promise<boolean>,
    getFullscreen: () => ipcRenderer.invoke(IPC.window.getFullscreen) as Promise<boolean>,
    onMaximizeChange: (callback: (state: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: boolean) => callback(state)
      ipcRenderer.on(IPC.window.onMaximizeChange, listener)
      return () => ipcRenderer.off(IPC.window.onMaximizeChange, listener)
    },
    onFullscreenChange: (callback: (state: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: boolean) => callback(state)
      ipcRenderer.on(IPC.window.onFullscreenChange, listener)
      return () => ipcRenderer.off(IPC.window.onFullscreenChange, listener)
    },
  },
})
