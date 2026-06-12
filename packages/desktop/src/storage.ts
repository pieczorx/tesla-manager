import Store from 'electron-store'
import type { AppState, DashcamClip, PlaybackSettings, ScanFolder, ClipsUpdatedPayload } from './shared/types'
import { DEFAULT_PLAYBACK_SETTINGS } from './shared/types'
import { computeClipTiming } from './utils/clipTiming'
import { applySidecarToClip, readClipSidecar, writeClipSidecar, writeClipSidecars } from './services/clipSidecar'

const DEFAULT_STATE: AppState = {
  scanFolders: [],
  clips: [],
  lastScanAt: null,
  playbackSettings: DEFAULT_PLAYBACK_SETTINGS,
  exportFolderPath: null,
}

const store = new Store<AppState>({
  name: 'tesla-manager',
  defaults: DEFAULT_STATE,
})

function normalizeClip(clip: DashcamClip): DashcamClip {
  const withDefaults: DashcamClip = {
    ...clip,
    isFavorite: clip.isFavorite ?? false,
    isArchived: clip.isArchived ?? false,
    inOffsetSeconds: clip.inOffsetSeconds ?? null,
    outOffsetSeconds: clip.outOffsetSeconds ?? null,
    customTitle: clip.customTitle?.trim() || null,
  }

  const timing = computeClipTiming(
    withDefaults.timestamp,
    withDefaults.videoFiles ?? [],
    withDefaults.segmentDurations,
  )

  return {
    ...withDefaults,
    durationSeconds: timing.durationSeconds,
    eventOffsetSeconds: timing.eventOffsetSeconds,
    clipStartIso: timing.clipStartIso,
    clipEndIso: timing.clipEndIso,
  }
}

export function getScanFolders(): ScanFolder[] {
  return store.get('scanFolders', [])
}

export function addScanFolder(folder: ScanFolder): ScanFolder[] {
  const folders = getScanFolders()
  if (folders.some((item) => item.path === folder.path)) {
    return folders
  }
  const next = [...folders, folder]
  store.set('scanFolders', next)
  return next
}

export function removeScanFolder(id: string): ScanFolder[] {
  const next = getScanFolders().filter((folder) => folder.id !== id)
  store.set('scanFolders', next)
  return next
}

export function getClips(): DashcamClip[] {
  return store.get('clips', []).map((clip) => normalizeClip(clip))
}

export async function saveClips(clips: DashcamClip[], lastScanAt: string): Promise<void> {
  store.set('clips', clips)
  store.set('lastScanAt', lastScanAt)
  await writeClipSidecars(clips)
}

export function getLastScanAt(): string | null {
  return store.get('lastScanAt', null)
}

export async function mergeClips(newClips: DashcamClip[]): Promise<DashcamClip[]> {
  const existing = new Map(getClips().map((clip) => [clip.id, clip]))

  const merged = await Promise.all(
    newClips.map(async (clip) => {
      const previous = existing.get(clip.id)
      if (previous) {
        return {
          ...clip,
          isFavorite: previous.isFavorite,
          isArchived: previous.isArchived,
          inOffsetSeconds: previous.inOffsetSeconds,
          outOffsetSeconds: previous.outOffsetSeconds,
          customTitle: previous.customTitle,
        }
      }

      const sidecar = await readClipSidecar(clip.folderPath)
      if (sidecar) {
        return normalizeClip(applySidecarToClip(clip, sidecar))
      }

      return clip
    }),
  )

  return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

async function persistClips(clips: DashcamClip[], sidecarClip?: DashcamClip): Promise<ClipsUpdatedPayload> {
  const lastScanAt = getLastScanAt()
  store.set('clips', clips)
  if (sidecarClip) {
    await writeClipSidecar(sidecarClip)
  }
  return { clips, lastScanAt }
}

export async function setClipFavorite(clipId: string, isFavorite: boolean): Promise<ClipsUpdatedPayload> {
  let updatedClip: DashcamClip | undefined
  const clips = getClips().map((clip) => {
    if (clip.id !== clipId) {
      return clip
    }
    updatedClip = { ...clip, isFavorite }
    return updatedClip
  })
  return persistClips(clips, updatedClip)
}

export async function setClipArchived(clipId: string, isArchived: boolean): Promise<ClipsUpdatedPayload> {
  let updatedClip: DashcamClip | undefined
  const clips = getClips().map((clip) => {
    if (clip.id !== clipId) {
      return clip
    }
    updatedClip = { ...clip, isArchived }
    return updatedClip
  })
  return persistClips(clips, updatedClip)
}

export async function setClipMarkers(
  clipId: string,
  inOffsetSeconds: number | null,
  outOffsetSeconds: number | null,
): Promise<ClipsUpdatedPayload> {
  let updatedClip: DashcamClip | undefined
  const clips = getClips().map((clip) => {
    if (clip.id !== clipId) {
      return clip
    }
    updatedClip = { ...clip, inOffsetSeconds, outOffsetSeconds }
    return updatedClip
  })
  return persistClips(clips, updatedClip)
}

export async function setClipTitle(clipId: string, customTitle: string | null): Promise<ClipsUpdatedPayload> {
  const normalizedTitle = customTitle?.trim() || null
  let updatedClip: DashcamClip | undefined
  const clips = getClips().map((clip) => {
    if (clip.id !== clipId) {
      return clip
    }
    updatedClip = { ...clip, customTitle: normalizedTitle }
    return updatedClip
  })
  return persistClips(clips, updatedClip)
}

export async function removeClip(clipId: string): Promise<ClipsUpdatedPayload> {
  const clips = getClips().filter((clip) => clip.id !== clipId)
  return persistClips(clips)
}

function normalizePlaybackSettings(settings: PlaybackSettings): PlaybackSettings {
  return {
    inLeadSeconds: Math.max(0, Math.min(600, Math.round(settings.inLeadSeconds))),
    outTrailSeconds: Math.max(0, Math.min(600, Math.round(settings.outTrailSeconds))),
  }
}

export function getPlaybackSettings(): PlaybackSettings {
  const stored = store.get('playbackSettings', DEFAULT_PLAYBACK_SETTINGS)
  return normalizePlaybackSettings(stored ?? DEFAULT_PLAYBACK_SETTINGS)
}

export function setPlaybackSettings(settings: PlaybackSettings): PlaybackSettings {
  const normalized = normalizePlaybackSettings(settings)
  store.set('playbackSettings', normalized)
  return normalized
}

export function getExportFolder(): string | null {
  return store.get('exportFolderPath', null)
}

export function setExportFolder(folderPath: string | null): string | null {
  const normalized = folderPath?.trim() || null
  store.set('exportFolderPath', normalized)
  return normalized
}
