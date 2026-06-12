<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import { formatDuration } from '@/utils/clipTimeline'

const props = defineProps<{
  currentTime: number
  durationSeconds: number
  eventMarkerPercent: number | null
  inOffsetSeconds: number | null
  outOffsetSeconds: number | null
}>()

const emit = defineEmits<{
  seek: [seconds: number]
  previewSeek: [seconds: number]
  updateIn: [seconds: number]
  updateOut: [seconds: number]
  markerDragEnd: [resumeTime: number]
}>()

type DragMode = 'in' | 'out' | 'seek' | null

const trackRef = ref<HTMLElement | null>(null)
const dragMode = ref<DragMode>(null)
const dragPreviewIn = ref<number | null>(null)
const dragPreviewOut = ref<number | null>(null)
const frozenThumbTime = ref<number | null>(null)

const displayIn = computed(() => dragPreviewIn.value ?? props.inOffsetSeconds)
const displayOut = computed(() => dragPreviewOut.value ?? props.outOffsetSeconds)

const THUMB_WIDTH_PX = 18

function ratioFromSeconds(seconds: number): number {
  if (props.durationSeconds <= 0) {
    return 0
  }
  return Math.max(0, Math.min(1, seconds / props.durationSeconds))
}

function getThumbTime(): number {
  if ((dragMode.value === 'in' || dragMode.value === 'out') && frozenThumbTime.value !== null) {
    return frozenThumbTime.value
  }
  return props.currentTime
}

function getPlaybackRatio(): number {
  return ratioFromSeconds(getThumbTime())
}

function getThumbLeftCss(ratio: number): string {
  return `calc(${ratio * 100}% - ${ratio * THUMB_WIDTH_PX}px)`
}

function getThumbCenterCss(ratio: number): string {
  const halfThumb = THUMB_WIDTH_PX / 2
  return `calc(${ratio * 100}% - ${ratio * THUMB_WIDTH_PX}px + ${halfThumb}px)`
}

function markerStyleFromSeconds(seconds: number | null) {
  if (seconds === null || props.durationSeconds <= 0) {
    return null
  }
  return { left: getThumbCenterCss(ratioFromSeconds(seconds)) }
}

function ratioFromClientX(clientX: number): number {
  const track = trackRef.value
  if (!track || props.durationSeconds <= 0) {
    return 0
  }

  const rect = track.getBoundingClientRect()
  const x = clientX - rect.left
  const travel = rect.width - THUMB_WIDTH_PX
  if (travel <= 0) {
    return 0
  }

  const ratio = (x - THUMB_WIDTH_PX / 2) / travel
  return Math.max(0, Math.min(1, ratio))
}

const thumbStyle = computed(() => {
  if (props.durationSeconds <= 0) {
    return { left: '0px' }
  }
  return { left: getThumbLeftCss(getPlaybackRatio()) }
})

const fillStyle = computed(() => {
  if (props.durationSeconds <= 0) {
    return { width: '0px' }
  }
  return { width: getThumbCenterCss(getPlaybackRatio()) }
})

const markerRangeStyle = computed(() => {
  if (props.durationSeconds <= 0) {
    return null
  }
  if (displayIn.value === null && displayOut.value === null) {
    return null
  }

  const inRatio = ratioFromSeconds(displayIn.value ?? 0)
  const outRatio = ratioFromSeconds(displayOut.value ?? props.durationSeconds)
  const deltaRatio = outRatio - inRatio

  return {
    left: getThumbCenterCss(inRatio),
    width: `calc(${deltaRatio * 100}% - ${deltaRatio * THUMB_WIDTH_PX}px)`,
  }
})

const inMarkerStyle = computed(() => markerStyleFromSeconds(displayIn.value))
const outMarkerStyle = computed(() => markerStyleFromSeconds(displayOut.value))

const eventMarkerStyle = computed(() => {
  if (props.eventMarkerPercent === null || props.durationSeconds <= 0) {
    return null
  }
  return { left: getThumbLeftCss(props.eventMarkerPercent / 100) }
})

function percentFromClientX(clientX: number): number {
  return ratioFromClientX(clientX)
}

function secondsFromClientX(clientX: number): number {
  return percentFromClientX(clientX) * props.durationSeconds
}

function seekFromClientX(clientX: number) {
  emit('seek', secondsFromClientX(clientX))
}

function clampIn(seconds: number): number {
  const maxIn = displayOut.value ?? props.durationSeconds
  return Math.max(0, Math.min(seconds, maxIn))
}

function clampOut(seconds: number): number {
  const minOut = displayIn.value ?? 0
  return Math.max(minOut, Math.min(seconds, props.durationSeconds))
}

function previewInFromClientX(clientX: number) {
  const seconds = clampIn(secondsFromClientX(clientX))
  dragPreviewIn.value = seconds
  emit('previewSeek', seconds)
}

function previewOutFromClientX(clientX: number) {
  const seconds = clampOut(secondsFromClientX(clientX))
  dragPreviewOut.value = seconds
  emit('previewSeek', seconds)
}

function onTrackClick(event: MouseEvent) {
  if (dragMode.value) {
    return
  }
  seekFromClientX(event.clientX)
}

function onTrackPointerDown(event: PointerEvent) {
  event.preventDefault()
  dragMode.value = 'seek'
  trackRef.value?.setPointerCapture(event.pointerId)
  seekFromClientX(event.clientX)
}

function onInPointerDown(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  frozenThumbTime.value = props.currentTime
  dragMode.value = 'in'
  dragPreviewIn.value = props.inOffsetSeconds
  trackRef.value?.setPointerCapture(event.pointerId)
  previewInFromClientX(event.clientX)
}

function onOutPointerDown(event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  frozenThumbTime.value = props.currentTime
  dragMode.value = 'out'
  dragPreviewOut.value = props.outOffsetSeconds
  trackRef.value?.setPointerCapture(event.pointerId)
  previewOutFromClientX(event.clientX)
}

function onPointerMove(event: PointerEvent) {
  if (!dragMode.value) {
    return
  }
  event.preventDefault()
  if (dragMode.value === 'seek') {
    seekFromClientX(event.clientX)
  } else if (dragMode.value === 'in') {
    previewInFromClientX(event.clientX)
  } else if (dragMode.value === 'out') {
    previewOutFromClientX(event.clientX)
  }
}

function onPointerUp(event: PointerEvent) {
  if (!dragMode.value) {
    return
  }

  const wasMarkerDrag = dragMode.value === 'in' || dragMode.value === 'out'
  const resumeTime = frozenThumbTime.value

  if (dragMode.value === 'in' && dragPreviewIn.value !== null) {
    emit('updateIn', dragPreviewIn.value)
  } else if (dragMode.value === 'out' && dragPreviewOut.value !== null) {
    emit('updateOut', dragPreviewOut.value)
  }

  dragMode.value = null
  dragPreviewIn.value = null
  dragPreviewOut.value = null
  frozenThumbTime.value = null
  trackRef.value?.releasePointerCapture(event.pointerId)

  if (wasMarkerDrag && resumeTime !== null) {
    emit('markerDragEnd', resumeTime)
  }
}
</script>

<template>
  <div class="playback-progress">
    <div
      ref="trackRef"
      class="playback-progress__track"
      @click="onTrackClick"
      @pointerdown="onTrackPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dragstart.prevent
    >
      <div
        v-if="markerRangeStyle"
        class="playback-progress__range"
        :style="markerRangeStyle"
      />

      <div
        class="playback-progress__fill"
        :style="fillStyle"
      />

      <FloatingTooltipComponent
        v-if="eventMarkerStyle"
        placement="top"
        class="playback-progress__event-marker-wrapper"
        :style="eventMarkerStyle"
      >
        <div class="playback-progress__event-marker">
          <FontAwesomeIcon :icon="['fas', 'exclamation']" />
        </div>
        <template #tooltip>Event moment</template>
      </FloatingTooltipComponent>

      <FloatingTooltipComponent
        v-if="inMarkerStyle"
        placement="top"
        class="playback-progress__marker-wrapper"
        :style="inMarkerStyle"
      >
        <div
          class="playback-progress__marker playback-progress__marker--in"
          @pointerdown="onInPointerDown"
        />
        <template #tooltip>IN point</template>
      </FloatingTooltipComponent>

      <FloatingTooltipComponent
        v-if="outMarkerStyle"
        placement="top"
        class="playback-progress__marker-wrapper"
        :style="outMarkerStyle"
      >
        <div
          class="playback-progress__marker playback-progress__marker--out"
          @pointerdown="onOutPointerDown"
        />
        <template #tooltip>OUT point</template>
      </FloatingTooltipComponent>

      <div
        class="playback-progress__thumb"
        :style="thumbStyle"
      >
        <span class="playback-progress__thumb-inner" />
      </div>
    </div>

    <div class="playback-progress__labels">
      <span>{{ formatDuration(currentTime) }}</span>
      <span v-if="displayIn !== null || displayOut !== null" class="playback-progress__range-label">
        <template v-if="displayIn !== null">IN {{ formatDuration(displayIn) }}</template>
        <template v-if="displayIn !== null && displayOut !== null"> · </template>
        <template v-if="displayOut !== null">OUT {{ formatDuration(displayOut) }}</template>
      </span>
      <span v-else-if="eventMarkerPercent !== null" class="playback-progress__event-label">Event</span>
      <span>{{ formatDuration(durationSeconds) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
$track-bg: #e5e7eb;

.playback-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: none;
  -webkit-user-select: none;
}

.playback-progress__track {
  position: relative;
  height: 18px;
  border-radius: 999px;
  background: $track-bg;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.playback-progress__range {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 0;
  background: #d1d5db;
  pointer-events: none;
  z-index: 0;
}

.playback-progress__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: #9ca3af;
  pointer-events: none;
  z-index: 1;
}

.playback-progress__event-marker-wrapper,
.playback-progress__marker-wrapper {
  position: absolute;
}

.playback-progress__event-marker-wrapper {
  top: 0;
  height: 100%;
  z-index: 2;
  display: flex;
  align-items: center;
  line-height: 0;
}

.playback-progress__marker-wrapper {
  top: 1px;
  z-index: 5;
}

.playback-progress__event-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #ef4444;
  color: #ffffff;
  font-size: 9px;
  pointer-events: none;
}

.playback-progress__marker {
  width: 2px;
  height: 16px;
  margin-left: -1px;
  background: #111827;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-drag: none;

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 14px;
    height: 22px;
    transform: translate(-50%, -50%);
  }
}

.playback-progress__thumb {
  position: absolute;
  top: 0;
  width: 18px;
  height: 100%;
  padding: 2px;
  border-radius: 999px;
  background: $track-bg;
  box-sizing: border-box;
  pointer-events: none;
  z-index: 4;
}

.playback-progress__thumb-inner {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: #111827;
}

.playback-progress__labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.playback-progress__event-label {
  color: #ef4444;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.playback-progress__range-label {
  color: var(--color-text);
  font-weight: 500;
}
</style>
