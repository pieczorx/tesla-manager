<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveAssetUrl } from '@/composables/useAssetUrl'
import { withVideoLoadSlot } from '@/composables/useVideoLoadQueue'
import { resolvePlaybackPosition, type CameraTrack } from '@/utils/clipCameras'

const props = withDefaults(
  defineProps<{
    track: CameraTrack
    globalTime: number
    isPlaying: boolean
    playbackRate: number
    active?: boolean
    muted?: boolean
    label?: boolean
    compact?: boolean
    fit?: boolean
  }>(),
  {
    active: true,
    muted: true,
    label: true,
    compact: false,
    fit: false,
  },
)

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable'

const videoRef = ref<HTMLVideoElement | null>(null)
const loadState = ref<LoadState>('idle')

const MIN_SEEKABLE_DURATION_SECONDS = 0.1
const END_HOLD_SECONDS = 0.25
const PAUSED_SYNC_THRESHOLD_SECONDS = 0.05
const PLAYING_SYNC_THRESHOLD_SECONDS = 0.35
const IMMEDIATE_SYNC_THRESHOLD_SECONDS = 0.05
const MAX_ERROR_RETRIES = 2
const RETRY_DELAY_MS = 180

let loadedSegmentPath: string | null = null
let loadedSrc: string | null = null
let loadToken = 0
let retryTimer: number | null = null
let isReleasing = false
let errorRetries = 0

const playbackPosition = computed(() => {
  if (!props.active) {
    return null
  }
  return resolvePlaybackPosition(props.track, props.globalTime)
})

const segmentPath = computed(() => playbackPosition.value?.segment.filePath ?? null)
const localSeconds = computed(() => playbackPosition.value?.localSeconds ?? 0)

function clearRetryTimer() {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer)
    retryTimer = null
  }
}

function getVideo(): HTMLVideoElement | null {
  return videoRef.value
}

function getPlayableEnd(video: HTMLVideoElement): number | null {
  const duration = video.duration
  if (!Number.isFinite(duration) || duration <= MIN_SEEKABLE_DURATION_SECONDS) {
    return null
  }
  return Math.max(0, duration - 0.05)
}

function seekVideo(video: HTMLVideoElement, seconds: number, threshold = PAUSED_SYNC_THRESHOLD_SECONDS) {
  const playableEnd = getPlayableEnd(video)
  if (playableEnd === null) {
    return false
  }

  const targetTime = Math.max(0, Math.min(seconds, playableEnd))
  if (Math.abs(video.currentTime - targetTime) > threshold) {
    video.currentTime = targetTime
  }
  return true
}

function pauseVideo(video: HTMLVideoElement) {
  if (!video.paused) {
    video.pause()
  }
}

function releaseVideo() {
  loadToken += 1
  clearRetryTimer()
  loadedSegmentPath = null
  loadedSrc = null
  errorRetries = 0
  loadState.value = 'idle'

  const video = getVideo()
  if (!video) {
    return
  }

  isReleasing = true
  pauseVideo(video)
  video.removeAttribute('src')
  video.load()
  isReleasing = false
}

async function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(video.error?.message ?? 'Video failed to load'))
    }
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

function retryLoad(path: string) {
  if (errorRetries >= MAX_ERROR_RETRIES) {
    loadedSegmentPath = path
    loadedSrc = null
    loadState.value = 'unavailable'
    return
  }

  errorRetries += 1
  loadedSrc = null
  loadState.value = 'loading'
  clearRetryTimer()
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    scheduleLoad(true)
  }, RETRY_DELAY_MS)
}

async function loadCurrentSegment(force = false) {
  if (!props.active) {
    return
  }

  const video = getVideo()
  const path = segmentPath.value
  const position = playbackPosition.value

  if (!video || !path || !position) {
    loadState.value = 'idle'
    return
  }

  if (
    !force &&
    loadState.value === 'ready' &&
    loadedSegmentPath === path &&
    loadedSrc
  ) {
    syncPlayback()
    return
  }

  const token = ++loadToken
  clearRetryTimer()
  loadState.value = 'loading'

  try {
    const url = await resolveAssetUrl(path)
    if (token !== loadToken) {
      return
    }
    if (!url) {
      retryLoad(path)
      return
    }

    video.loop = false
    video.muted = props.muted
    video.playbackRate = props.playbackRate
    pauseVideo(video)

    if (loadedSrc !== url) {
      await withVideoLoadSlot(async () => {
        if (token !== loadToken) {
          return
        }

        video.src = url
        video.load()
        await waitForVideoReady(video)
      })
    }

    if (token !== loadToken) {
      return
    }

    if (!seekVideo(video, position.localSeconds, IMMEDIATE_SYNC_THRESHOLD_SECONDS)) {
      throw new Error('Invalid video duration')
    }

    loadedSegmentPath = path
    loadedSrc = url
    loadState.value = 'ready'
    errorRetries = 0

    syncPlayback(true)
  } catch {
    if (token !== loadToken) {
      return
    }
    retryLoad(path)
  }
}

function syncPlayback(immediate = false) {
  const video = getVideo()
  if (!video || loadState.value !== 'ready') {
    return
  }

  const playableEnd = getPlayableEnd(video)
  if (playableEnd === null) {
    return
  }

  video.muted = props.muted
  video.playbackRate = props.playbackRate

  const local = localSeconds.value
  const target = Math.max(0, Math.min(local, playableEnd))
  const isInsideSegment = local >= 0 && local < playableEnd - END_HOLD_SECONDS

  if (!props.isPlaying || !isInsideSegment) {
    pauseVideo(video)
    seekVideo(video, target, immediate ? IMMEDIATE_SYNC_THRESHOLD_SECONDS : PAUSED_SYNC_THRESHOLD_SECONDS)
    return
  }

  const threshold = immediate ? IMMEDIATE_SYNC_THRESHOLD_SECONDS : PLAYING_SYNC_THRESHOLD_SECONDS
  seekVideo(video, target, threshold)

  if (video.paused) {
    void video.play().catch(() => {
      pauseVideo(video)
      seekVideo(video, target, IMMEDIATE_SYNC_THRESHOLD_SECONDS)
    })
  }
}

function scheduleLoad(force = false) {
  void loadCurrentSegment(force)
}

watch(segmentPath, (nextPath, prevPath) => {
  if (!props.active || !nextPath) {
    return
  }

  if (nextPath !== prevPath) {
    errorRetries = 0
    scheduleLoad(true)
  }
})

watch(
  () => props.globalTime,
  () => {
    if (!props.active) {
      return
    }
    syncPlayback()
  },
)

watch(
  () => props.isPlaying,
  () => {
    if (!props.active) {
      return
    }
    syncPlayback(true)
  },
)

watch(
  () => props.playbackRate,
  () => {
    syncPlayback(true)
  },
)

watch(
  () => props.track.segments.map((segment) => segment.filePath).join('\0'),
  () => {
    loadedSegmentPath = null
    loadedSrc = null
    errorRetries = 0
    loadState.value = 'idle'
    scheduleLoad(true)
  },
)

watch(
  () => props.active,
  (active) => {
    if (active) {
      scheduleLoad(true)
      return
    }
    releaseVideo()
  },
  { immediate: true },
)

watch(
  () => props.muted,
  (muted) => {
    const video = getVideo()
    if (video) {
      video.muted = muted
      syncPlayback(true)
    }
  },
)

function onVideoEnded() {
  const video = getVideo()
  if (video) {
    pauseVideo(video)
    syncPlayback(true)
  }
}

function onVideoError() {
  if (isReleasing || loadState.value === 'loading') {
    return
  }

  const path = segmentPath.value
  if (path) {
    retryLoad(path)
  }
}

onMounted(() => {
  void nextTick(() => scheduleLoad(true))
})

onBeforeUnmount(() => {
  releaseVideo()
})
</script>

<template>
  <div class="camera-video" :class="{ 'camera-video--compact': compact, 'camera-video--fit': fit }">
    <video
      v-show="loadState === 'ready'"
      ref="videoRef"
      class="camera-video__element"
      playsinline
      preload="auto"
      :muted="muted"
      @ended="onVideoEnded"
      @error="onVideoError"
    />

    <div v-if="loadState === 'unavailable'" class="camera-video__placeholder">
      <FontAwesomeIcon :icon="['fas', 'video-slash']" class="camera-video__placeholder-icon" />
      <span>Video unavailable</span>
    </div>

    <div v-else-if="loadState === 'loading'" class="camera-video__loading" />

    <div v-if="label" class="camera-video__label">{{ track.label }}</div>
  </div>
</template>

<style scoped lang="scss">
.camera-video {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 10px;
  background: var(--color-media-bg);
}

.camera-video__element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: var(--color-media-bg);
}

.camera-video--fit .camera-video__element {
  object-fit: contain;
}

.camera-video__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-media-bg);

  span {
    font-size: 11px;
    line-height: 1.3;
    color: var(--color-text-subtle);
  }
}

.camera-video__placeholder-icon {
  font-size: 18px;
  color: var(--color-text-subtle);
}

.camera-video__label {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 3px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(17, 24, 39, 0.72);
  color: #f9fafb;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  pointer-events: none;
}

.camera-video__loading {
  position: absolute;
  inset: 0;
  background: #d1d5db;
  overflow: hidden;
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(17, 24, 39, 0) 0%,
      rgba(17, 24, 39, 0.08) 42%,
      rgba(17, 24, 39, 0.18) 50%,
      rgba(17, 24, 39, 0.08) 58%,
      rgba(17, 24, 39, 0) 100%
    );
    animation: shimmer 1.2s infinite;
  }
}

.camera-video--compact {
  border-radius: 8px;

  .camera-video__label {
    font-size: 10px;
    left: 6px;
    bottom: 6px;
  }

  .camera-video__placeholder span {
    font-size: 10px;
  }

  .camera-video__placeholder-icon {
    font-size: 14px;
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
