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

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'complete' | 'error'
  rootPath: string | null
  scannedDirectories: number
  foundEvents: number
  currentPath: string | null
  message: string | null
}

export interface ClipsUpdatedPayload {
  clips: DashcamClip[]
  lastScanAt: string | null
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

export interface TeslaManagerApi {
  platform: 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
  settings: {
    getScanFolders: () => Promise<ScanFolder[]>
    addScanFolder: (folderPath: string) => Promise<ScanFolder[]>
    removeScanFolder: (id: string) => Promise<ScanFolder[]>
    pickScanFolder: () => Promise<string | null>
    getPlaybackSettings: () => Promise<PlaybackSettings>
    setPlaybackSettings: (settings: PlaybackSettings) => Promise<PlaybackSettings>
  }
  dashcam: {
    getClips: () => Promise<{ clips: DashcamClip[]; lastScanAt: string | null }>
    getScanProgress: () => Promise<ScanProgress>
    startScan: () => Promise<ClipsUpdatedPayload>
    setClipFavorite: (clipId: string, isFavorite: boolean) => Promise<ClipsUpdatedPayload>
    setClipArchived: (clipId: string, isArchived: boolean) => Promise<ClipsUpdatedPayload>
    setClipMarkers: (
      clipId: string,
      inOffsetSeconds: number | null,
      outOffsetSeconds: number | null,
    ) => Promise<ClipsUpdatedPayload>
    setClipTitle: (clipId: string, customTitle: string | null) => Promise<ClipsUpdatedPayload>
    deleteClip: (clipId: string) => Promise<ClipsUpdatedPayload>
    prepareExport: (request: ExportClipRequest) => Promise<PrepareExportResult>
    cancelExport: (clipId: string) => Promise<boolean>
    saveExport: (payload: {
      tempFilePath: string
      suggestedFileName: string
      sessionId: string
    }) => Promise<{ saved: boolean; filePath: string | null; exportFolder: string | null }>
    copyExportToClipboard: (payload: {
      tempFilePath: string
      suggestedFileName: string
      sessionId: string
    }) => Promise<{ copied: boolean }>
    discardExport: (sessionId: string) => Promise<void>
    getExportFolder: () => Promise<string | null>
    pickExportFolder: () => Promise<string | null>
    revealExportedFile: (filePath: string) => Promise<void>
    onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
    onClipsUpdated: (callback: (payload: ClipsUpdatedPayload) => void) => () => void
    onExportProgress: (callback: (progress: ExportProgressPayload) => void) => () => void
  }
  assets: {
    toAssetUrl: (filePath: string) => Promise<string | null>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: (state: boolean) => Promise<void>
    toggleFullscreen: (state: boolean) => Promise<void>
    close: () => Promise<void>
    getMaximized: () => Promise<boolean>
    getFullscreen: () => Promise<boolean>
    onMaximizeChange: (callback: (state: boolean) => void) => () => void
    onFullscreenChange: (callback: (state: boolean) => void) => () => void
  }
}

declare global {
  interface Window {
    teslaManager?: TeslaManagerApi
  }
}

export {}
