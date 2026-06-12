import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { DashcamClip } from '@/types/electron'
import { useSettingsStore } from '@/stores'
import { buildCameraTracks, type CameraTrack } from '@/utils/clipCameras'
import { clipHasMarkerRange, resolveClipMarkers } from '@/utils/clipTimingShared'
import { clearAssetUrlCache, preloadAssetUrls } from '@/composables/useAssetUrl'

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const

export function useClipPlayback(clip: Ref<DashcamClip | null>) {
  const settingsStore = useSettingsStore()
  const { playbackSettings } = storeToRefs(settingsStore)

  const currentTime = ref(0)
  const isPlaying = ref(false)
  const playbackRate = ref(1)
  const focusedCameraId = ref<string | null>(null)

  let rafId: number | null = null
  let lastTickMs = 0

  const cameraTracks = computed(() => {
    if (!clip.value) {
      return [] as CameraTrack[]
    }
    return buildCameraTracks(clip.value.videoFiles, clip.value.clipStartIso, {
      segmentDurations: clip.value.segmentDurations,
      clipDurationSeconds: clip.value.durationSeconds,
    })
  })

  const durationSeconds = computed(() => clip.value?.durationSeconds ?? 0)
  const eventOffsetSeconds = computed(() => clip.value?.eventOffsetSeconds ?? null)
  const inOffsetSeconds = computed(() => clip.value?.inOffsetSeconds ?? null)
  const outOffsetSeconds = computed(() => clip.value?.outOffsetSeconds ?? null)

  const resolvedMarkers = computed(() => {
    if (!clip.value) {
      return null
    }
    return resolveClipMarkers(clip.value, playbackSettings.value)
  })

  const hasMarkerRange = computed(() => {
    if (!clip.value) {
      return false
    }
    return clipHasMarkerRange(clip.value)
  })

  const effectiveIn = computed(() => resolvedMarkers.value?.inOffsetSeconds ?? 0)
  const effectiveOut = computed(() => resolvedMarkers.value?.outOffsetSeconds ?? durationSeconds.value)

  const shouldLoopInRange = computed(() => {
    if (!hasMarkerRange.value || durationSeconds.value <= 0) {
      return false
    }
    return effectiveIn.value < effectiveOut.value
  })

  const displayInOffsetSeconds = computed(() =>
    hasMarkerRange.value ? effectiveIn.value : null,
  )

  const displayOutOffsetSeconds = computed(() =>
    hasMarkerRange.value ? effectiveOut.value : null,
  )

  const eventMarkerPercent = computed(() => {
    if (durationSeconds.value <= 0 || eventOffsetSeconds.value === null) {
      return null
    }
    return (eventOffsetSeconds.value / durationSeconds.value) * 100
  })

  function stopTicker() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function tick(now: number) {
    if (!isPlaying.value) {
      return
    }

    if (lastTickMs === 0) {
      lastTickMs = now
    }

    const deltaSeconds = ((now - lastTickMs) / 1000) * playbackRate.value
    lastTickMs = now
    currentTime.value += deltaSeconds

    if (shouldLoopInRange.value && currentTime.value >= effectiveOut.value) {
      currentTime.value = effectiveIn.value
      rafId = requestAnimationFrame(tick)
      return
    }

    if (currentTime.value >= durationSeconds.value) {
      currentTime.value = durationSeconds.value
      isPlaying.value = false
      stopTicker()
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  function play() {
    if (durationSeconds.value <= 0) {
      return
    }
    if (shouldLoopInRange.value && currentTime.value >= effectiveOut.value) {
      currentTime.value = effectiveIn.value
    }
    isPlaying.value = true
    lastTickMs = 0
    stopTicker()
    rafId = requestAnimationFrame(tick)
  }

  function pause() {
    isPlaying.value = false
    stopTicker()
    lastTickMs = 0
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  function seekTo(seconds: number, options?: { bypassRange?: boolean }) {
    if (durationSeconds.value <= 0) {
      currentTime.value = 0
      return
    }

    if (options?.bypassRange) {
      currentTime.value = Math.max(0, Math.min(durationSeconds.value, seconds))
      return
    }

    const min = hasMarkerRange.value ? effectiveIn.value : 0
    const max = hasMarkerRange.value ? effectiveOut.value : durationSeconds.value
    currentTime.value = Math.max(min, Math.min(max, seconds))

    if (!hasMarkerRange.value && currentTime.value >= durationSeconds.value) {
      pause()
    }
  }

  function seekBy(deltaSeconds: number) {
    seekTo(currentTime.value + deltaSeconds)
  }

  function cyclePlaybackRate() {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate.value as (typeof PLAYBACK_SPEEDS)[number])
    const defaultIndex = PLAYBACK_SPEEDS.indexOf(1)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % PLAYBACK_SPEEDS.length : defaultIndex
    playbackRate.value = PLAYBACK_SPEEDS[nextIndex]
  }

  function setPlaybackRate(rate: number) {
    playbackRate.value = rate
  }

  function focusCamera(cameraId: string) {
    if (!cameraId) {
      focusedCameraId.value = null
      return
    }

    if (cameraId === focusedCameraId.value) {
      focusedCameraId.value = null
      return
    }

    focusedCameraId.value = cameraId
  }

  function resetForClip(nextClip: DashcamClip | null) {
    pause()
    clearAssetUrlCache()

    if (!nextClip) {
      currentTime.value = 0
      focusedCameraId.value = null
      return
    }

    focusedCameraId.value = null

    if (clipHasMarkerRange(nextClip)) {
      const resolved = resolveClipMarkers(nextClip, playbackSettings.value)
      currentTime.value = resolved.inOffsetSeconds
    } else {
      currentTime.value = 0
    }

    const tracks = buildCameraTracks(nextClip.videoFiles, nextClip.clipStartIso, {
      segmentDurations: nextClip.segmentDurations,
      clipDurationSeconds: nextClip.durationSeconds,
    })
    const segmentPaths = tracks.flatMap((track) => track.segments.map((segment) => segment.filePath))
    void preloadAssetUrls(segmentPaths)

    if (nextClip.durationSeconds > 0) {
      play()
    }
  }

  watch(
    () => clip.value?.id ?? null,
    (nextId, prevId) => {
      if (nextId !== prevId) {
        resetForClip(clip.value)
      }
    },
    { immediate: true },
  )

  watch([effectiveIn, effectiveOut, hasMarkerRange, playbackSettings], () => {
    if (!clip.value) {
      return
    }
    seekTo(currentTime.value)
  })

  onUnmounted(() => {
    stopTicker()
  })

  return {
    cameraTracks,
    currentTime,
    isPlaying,
    playbackRate,
    focusedCameraId,
    durationSeconds,
    eventOffsetSeconds,
    inOffsetSeconds,
    outOffsetSeconds,
    displayInOffsetSeconds,
    displayOutOffsetSeconds,
    hasMarkerRange,
    effectiveIn,
    effectiveOut,
    eventMarkerPercent,
    playbackSpeeds: PLAYBACK_SPEEDS,
    play,
    pause,
    togglePlay,
    seekTo,
    seekBy,
    cyclePlaybackRate,
    setPlaybackRate,
    focusCamera,
  }
}
