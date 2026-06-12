<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import CameraVideoComponent from '@/components/player/CameraVideoComponent.vue'
import type { CameraTrack } from '@/utils/clipCameras'

const props = defineProps<{
  tracks: CameraTrack[]
  focusedCameraId: string | null
  globalTime: number
  isPlaying: boolean
  playbackRate: number
}>()

const emit = defineEmits<{
  focusCamera: [cameraId: string]
}>()

const focusedTrack = computed(() =>
  props.tracks.find((track) => track.id === props.focusedCameraId) ?? null,
)

const isFocused = computed(() => focusedTrack.value !== null)

const filmstripTracks = computed(() =>
  props.tracks.filter((track) => track.id !== props.focusedCameraId),
)

function gridStyle(track: CameraTrack) {
  return { gridRow: track.gridRow, gridColumn: track.gridCol }
}
</script>

<template>
  <div class="camera-layout" :class="{ 'camera-layout--focused': isFocused }">
    <template v-if="!isFocused">
      <button
        v-for="track in tracks"
        :key="track.id"
        type="button"
        class="camera-layout__slot camera-layout__slot--grid"
        :style="gridStyle(track)"
        @click="emit('focusCamera', track.id)"
      >
        <CameraVideoComponent
          :track="track"
          :global-time="globalTime"
          :is-playing="isPlaying"
          :playback-rate="playbackRate"
          :active="true"
          muted
        />
      </button>
    </template>

    <template v-else-if="focusedTrack">
      <button
        type="button"
        class="camera-layout__slot camera-layout__slot--hero"
        @click="emit('focusCamera', focusedTrack.id)"
      >
        <CameraVideoComponent
          :track="focusedTrack"
          :global-time="globalTime"
          :is-playing="isPlaying"
          :playback-rate="playbackRate"
          :active="true"
          :muted="false"
          fit
        />
      </button>

      <div class="camera-layout__filmstrip">
        <FloatingTooltipComponent placement="top">
          <button
            type="button"
            class="camera-layout__filmstrip-item camera-layout__back-to-grid"
            @click="emit('focusCamera', '')"
          >
            <FontAwesomeIcon :icon="['fas', 'table-cells']" />
          </button>
          <template #tooltip>Show all cameras</template>
        </FloatingTooltipComponent>

        <button
          v-for="track in filmstripTracks"
          :key="track.id"
          type="button"
          class="camera-layout__filmstrip-item camera-layout__slot camera-layout__slot--filmstrip"
          @click="emit('focusCamera', track.id)"
        >
          <CameraVideoComponent
            :track="track"
            :global-time="globalTime"
            :is-playing="isPlaying"
            :playback-rate="playbackRate"
            :active="true"
            muted
            compact
          />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.camera-layout {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.camera-layout__slot {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 0;
  background: var(--color-media-bg);
  cursor: pointer;
  overflow: hidden;
  min-height: 0;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: var(--color-border-strong);
  }
}

.camera-layout--focused {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.camera-layout__slot--hero {
  flex: 1;
  min-height: 0;
  border-color: var(--color-border-strong);
  border-radius: 16px;
}

.camera-layout__filmstrip {
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex-shrink: 0;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.camera-layout__filmstrip-item {
  flex: 1 1 0;
  min-width: 0;
  aspect-ratio: 16 / 9;
}

.camera-layout__slot--filmstrip {
  border-radius: 10px;
  min-height: 0;
}

.camera-layout__back-to-grid {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0;
  background: var(--color-bg-soft);
  color: var(--color-text-muted);
  font-size: clamp(16px, 2vw, 22px);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface-hover);
    color: var(--color-text-strong);
  }
}
</style>
