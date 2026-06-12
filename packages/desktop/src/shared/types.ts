export interface TeslaEventJson {
  timestamp?: string
  event_timestamp?: string
  city?: string
  event_city?: string
  est_lat?: string | number
  est_lon?: string | number
  event_latitude?: string | number
  event_longitude?: string | number
  reason?: string
  event_reason?: string
}

export interface DashcamClip {
  id: string
  folderPath: string
  folderName: string
  timestamp: string
  city: string | null
  latitude: number | null
  longitude: number | null
  reason: string | null
  thumbnailPath: string | null
  videoFiles: string[]
  segmentDurations?: Record<string, number>
  clipCategory: string | null
  durationSeconds: number
  eventOffsetSeconds: number | null
  clipStartIso: string | null
  clipEndIso: string | null
  scannedAt: string
  isFavorite: boolean
  isArchived: boolean
  inOffsetSeconds: number | null
  outOffsetSeconds: number | null
  customTitle: string | null
}

export interface ScanFolder {
  id: string
  path: string
  label: string
  addedAt: string
}

export interface PlaybackSettings {
  inLeadSeconds: number
  outTrailSeconds: number
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  inLeadSeconds: 10,
  outTrailSeconds: 10,
}

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'complete' | 'error'
  rootPath: string | null
  scannedDirectories: number
  foundEvents: number
  currentPath: string | null
  message: string | null
}

export interface AppState {
  scanFolders: ScanFolder[]
  clips: DashcamClip[]
  lastScanAt: string | null
  playbackSettings: PlaybackSettings
  exportFolderPath: string | null
}

export interface ExportClipRequest {
  clipId: string
  cameraId: string | null
  inOffsetSeconds: number
  outOffsetSeconds: number
  playbackRate: number
}

export interface ExportPreparedResult {
  tempFilePath: string
  suggestedFileName: string
  sessionId: string
}

export type PrepareExportResult = ExportPreparedResult | { cancelled: true }

export interface ExportProgressPayload {
  progress: number
}

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'

export interface UpdateStatusPayload {
  status: UpdateStatus
  version: string | null
  progress: number | null
  error: string | null
}

export const IPC = {
  settings: {
    getScanFolders: 'settings:getScanFolders',
    addScanFolder: 'settings:addScanFolder',
    removeScanFolder: 'settings:removeScanFolder',
    pickScanFolder: 'settings:pickScanFolder',
    getPlaybackSettings: 'settings:getPlaybackSettings',
    setPlaybackSettings: 'settings:setPlaybackSettings',
  },
  dashcam: {
    getClips: 'dashcam:getClips',
    getScanProgress: 'dashcam:getScanProgress',
    startScan: 'dashcam:startScan',
    setClipFavorite: 'dashcam:setClipFavorite',
    setClipArchived: 'dashcam:setClipArchived',
    setClipMarkers: 'dashcam:setClipMarkers',
    setClipTitle: 'dashcam:setClipTitle',
    deleteClip: 'dashcam:deleteClip',
    prepareExport: 'dashcam:prepareExport',
    cancelExport: 'dashcam:cancelExport',
    saveExport: 'dashcam:saveExport',
    copyExportToClipboard: 'dashcam:copyExportToClipboard',
    discardExport: 'dashcam:discardExport',
    getExportFolder: 'dashcam:getExportFolder',
    pickExportFolder: 'dashcam:pickExportFolder',
    revealExportedFile: 'dashcam:revealExportedFile',
    onScanProgress: 'dashcam:onScanProgress',
    onClipsUpdated: 'dashcam:onClipsUpdated',
    onExportProgress: 'dashcam:onExportProgress',
  },
  assets: {
    toAssetUrl: 'assets:toAssetUrl',
  },
  window: {
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggleMaximize',
    toggleFullscreen: 'window:toggleFullscreen',
    close: 'window:close',
    getMaximized: 'window:getMaximized',
    getFullscreen: 'window:getFullscreen',
    onMaximizeChange: 'window:onMaximizeChange',
    onFullscreenChange: 'window:onFullscreenChange',
  },
  update: {
    getStatus: 'update:getStatus',
    quitAndInstall: 'update:quitAndInstall',
    onStatusChange: 'update:onStatusChange',
  },
} as const

export type ScanProgressPayload = ScanProgress

export type ClipsUpdatedPayload = {
  clips: DashcamClip[]
  lastScanAt: string | null
}
