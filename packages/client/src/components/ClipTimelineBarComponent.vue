<script setup lang="ts">
import { computed } from 'vue'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import { formatDuration, getEffectiveMarkerRange, getEventMarkerPercent } from '@/utils/clipTimeline'

const props = defineProps<{
  durationSeconds: number
  eventOffsetSeconds: number | null
  inOffsetSeconds?: number | null
  outOffsetSeconds?: number | null
}>()

const eventMarkerPercent = computed(() =>
  getEventMarkerPercent(props.durationSeconds, props.eventOffsetSeconds),
)

const markerRange = computed(() =>
  getEffectiveMarkerRange(
    props.durationSeconds,
    props.inOffsetSeconds ?? null,
    props.outOffsetSeconds ?? null,
  ),
)

const durationLabel = computed(() => formatDuration(props.durationSeconds))

const rangeLabel = computed(() => {
  const hasRange = props.inOffsetSeconds !== null || props.outOffsetSeconds !== null
  if (!hasRange || props.durationSeconds <= 0) {
    return null
  }

  const inSeconds = props.inOffsetSeconds ?? 0
  const outSeconds = props.outOffsetSeconds ?? props.durationSeconds
  return formatDuration(Math.max(0, outSeconds - inSeconds))
})

const durationDisplay = computed(() => {
  if (rangeLabel.value) {
    return `${rangeLabel.value} / ${durationLabel.value}`
  }
  return durationLabel.value
})
</script>

<template>
  <div class="clip-timeline">
    <div class="clip-timeline__track">
      <div
        v-if="markerRange"
        class="clip-timeline__range"
        :style="{
          left: `${markerRange.inPercent}%`,
          width: `${markerRange.outPercent - markerRange.inPercent}%`,
        }"
      />

      <FloatingTooltipComponent
        v-if="eventMarkerPercent !== null"
        placement="top"
        class="clip-timeline__event-marker-wrapper"
        :style="{ left: `${eventMarkerPercent}%` }"
      >
        <div class="clip-timeline__event-marker" />
        <template #tooltip>Event moment</template>
      </FloatingTooltipComponent>
    </div>
    <span class="clip-timeline__duration">{{ durationDisplay }}</span>
  </div>
</template>

<style scoped lang="scss">
.clip-timeline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.clip-timeline__track {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: visible;
}

.clip-timeline__range {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: #d1d5db;
  pointer-events: none;
}

.clip-timeline__event-marker-wrapper {
  position: absolute;
  top: 0;
  height: 100%;
  transform: translateX(-50%);
  z-index: 1;
  line-height: 0;
}

.clip-timeline__event-marker {
  width: 6px;
  height: 100%;
  border-radius: 50%;
  background: #ef4444;
  pointer-events: none;
}

.clip-timeline__duration {
  flex-shrink: 0;
  min-width: 52px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  text-align: right;
  white-space: nowrap;
}
</style>
