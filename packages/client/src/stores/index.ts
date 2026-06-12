import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ClipsUpdatedPayload, DashcamClip, PlaybackSettings, ScanFolder, ScanProgress } from '@/types/electron'
import { DEFAULT_PLAYBACK_SETTINGS } from '@/utils/clipTimingShared'

function getApi() {
  if (!window.teslaManager) {
    throw new Error('Tesla Manager API is unavailable outside Electron')
  }
  return window.teslaManager
}

export const useSettingsStore = defineStore('settings', () => {
  const scanFolders = ref<ScanFolder[]>([])
  const playbackSettings = ref<PlaybackSettings>({ ...DEFAULT_PLAYBACK_SETTINGS })
  const isLoading = ref(false)

  async function loadScanFolders() {
    isLoading.value = true
    try {
      scanFolders.value = await getApi().settings.getScanFolders()
    } finally {
      isLoading.value = false
    }
  }

  async function loadPlaybackSettings() {
    playbackSettings.value = await getApi().settings.getPlaybackSettings()
  }

  async function setPlaybackSettings(settings: PlaybackSettings) {
    playbackSettings.value = await getApi().settings.setPlaybackSettings(settings)
  }

  async function pickAndAddFolder() {
    const selectedPath = await getApi().settings.pickScanFolder()
    if (!selectedPath) {
      return null
    }

    scanFolders.value = await getApi().settings.addScanFolder(selectedPath)
    return selectedPath
  }

  async function removeFolder(id: string) {
    scanFolders.value = await getApi().settings.removeScanFolder(id)
  }

  return {
    scanFolders,
    playbackSettings,
    isLoading,
    loadScanFolders,
    loadPlaybackSettings,
    setPlaybackSettings,
    pickAndAddFolder,
    removeFolder,
  }
})

export const useDashcamStore = defineStore('dashcam', () => {
  const clips = ref<DashcamClip[]>([])
  const selectedClipId = ref<string | null>(null)
  const lastScanAt = ref<string | null>(null)
  const scanProgress = ref<ScanProgress>({
    status: 'idle',
    rootPath: null,
    scannedDirectories: 0,
    foundEvents: 0,
    currentPath: null,
    message: null,
  })
  const thumbnailUrls = ref<Record<string, string>>({})

  const selectedClip = ref<DashcamClip | null>(null)

  let unsubscribeProgress: (() => void) | null = null
  let unsubscribeClips: (() => void) | null = null

  function selectClip(clipId: string) {
    selectedClipId.value = clipId
    selectedClip.value = clips.value.find((clip) => clip.id === clipId) ?? null
  }

  function clearSelection() {
    selectedClipId.value = null
    selectedClip.value = null
  }

  function selectNextClip() {
    if (clips.value.length === 0 || !selectedClipId.value) {
      return
    }
    const index = clips.value.findIndex((clip) => clip.id === selectedClipId.value)
    if (index < 0 || index >= clips.value.length - 1) {
      return
    }
    selectClip(clips.value[index + 1]!.id)
  }

  function selectPreviousClip() {
    if (clips.value.length === 0 || !selectedClipId.value) {
      return
    }
    const index = clips.value.findIndex((clip) => clip.id === selectedClipId.value)
    if (index <= 0) {
      return
    }
    selectClip(clips.value[index - 1]!.id)
  }

  async function resolveThumbnailUrls(items: DashcamClip[]) {
    const api = getApi()
    const entries = await Promise.all(
      items
        .filter((clip) => clip.thumbnailPath)
        .map(async (clip) => {
          const url = await api.assets.toAssetUrl(clip.thumbnailPath!)
          return [clip.id, url] as const
        }),
    )

    const next: Record<string, string> = {}
    for (const [clipId, url] of entries) {
      if (url) {
        next[clipId] = url
      }
    }
    thumbnailUrls.value = next
  }

  async function loadClips() {
    const payload = await getApi().dashcam.getClips()
    clips.value = payload.clips
    lastScanAt.value = payload.lastScanAt

    if (!selectedClipId.value && clips.value.length > 0) {
      selectClip(clips.value[0]!.id)
    } else if (selectedClipId.value) {
      selectClip(selectedClipId.value)
    }

    await resolveThumbnailUrls(clips.value)
  }

  async function loadScanProgress() {
    scanProgress.value = await getApi().dashcam.getScanProgress()
  }

  async function startScan() {
    const payload = await getApi().dashcam.startScan()
    applyClipsUpdate(payload)
  }

  function applyClipsUpdate(payload: ClipsUpdatedPayload) {
    clips.value = payload.clips
    lastScanAt.value = payload.lastScanAt

    if (selectedClipId.value) {
      const stillExists = clips.value.some((clip) => clip.id === selectedClipId.value)
      if (stillExists) {
        selectClip(selectedClipId.value)
      } else {
        clearSelection()
      }
    } else if (clips.value.length > 0) {
      selectClip(clips.value[0]!.id)
    }

    void resolveThumbnailUrls(clips.value)
  }

  async function setClipFavorite(clipId: string, isFavorite: boolean) {
    const payload = await getApi().dashcam.setClipFavorite(clipId, isFavorite)
    applyClipsUpdate(payload)
  }

  async function setClipArchived(clipId: string, isArchived: boolean) {
    const payload = await getApi().dashcam.setClipArchived(clipId, isArchived)
    applyClipsUpdate(payload)
  }

  async function setClipMarkers(
    clipId: string,
    inOffsetSeconds: number | null,
    outOffsetSeconds: number | null,
  ) {
    const payload = await getApi().dashcam.setClipMarkers(clipId, inOffsetSeconds, outOffsetSeconds)
    applyClipsUpdate(payload)
  }

  async function setClipTitle(clipId: string, customTitle: string | null) {
    const payload = await getApi().dashcam.setClipTitle(clipId, customTitle)
    applyClipsUpdate(payload)
  }

  async function deleteClip(clipId: string) {
    const payload = await getApi().dashcam.deleteClip(clipId)
    applyClipsUpdate(payload)
  }

  function bindIpcListeners() {
    const api = getApi()
    unsubscribeProgress?.()
    unsubscribeClips?.()

    unsubscribeProgress = api.dashcam.onScanProgress((progress) => {
      scanProgress.value = progress
    })

    unsubscribeClips = api.dashcam.onClipsUpdated((payload) => {
      applyClipsUpdate(payload)
    })
  }

  function unbindIpcListeners() {
    unsubscribeProgress?.()
    unsubscribeClips?.()
    unsubscribeProgress = null
    unsubscribeClips = null
  }

  return {
    clips,
    selectedClipId,
    selectedClip,
    lastScanAt,
    scanProgress,
    thumbnailUrls,
    loadClips,
    loadScanProgress,
    startScan,
    selectClip,
    clearSelection,
    selectNextClip,
    selectPreviousClip,
    setClipFavorite,
    setClipArchived,
    setClipMarkers,
    setClipTitle,
    deleteClip,
    bindIpcListeners,
    unbindIpcListeners,
  }
})
