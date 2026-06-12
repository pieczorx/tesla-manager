<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import type { DashcamClip } from '@/types/electron'
import ClipTimelineBarComponent from '@/components/ClipTimelineBarComponent.vue'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import { useSettingsStore } from '@/stores'
import { getReasonPresentation } from '@/utils/clipEventReason'
import type { ClipListViewMode } from '@/utils/clipFilters'
import { getClipDisplayTitle } from '@/utils/clipTimeline'
import { clipHasMarkerRange, resolveClipMarkers } from '@/utils/clipTimingShared'

const props = defineProps<{
  clip: DashcamClip
  thumbnailUrl?: string | null
  selected?: boolean
  showDelete?: boolean
  viewMode?: ClipListViewMode
}>()

const emit = defineEmits<{
  select: []
  delete: []
}>()

const settingsStore = useSettingsStore()
const { playbackSettings } = storeToRefs(settingsStore)

const titleLabel = computed(() => getClipDisplayTitle(props.clip))

const locationLabel = computed(() => {
  if (props.clip.city) {
    return props.clip.city
  }
  if (props.clip.latitude !== null && props.clip.longitude !== null) {
    return `${props.clip.latitude.toFixed(4)}, ${props.clip.longitude.toFixed(4)}`
  }
  return 'Unknown location'
})

const reasonPresentation = computed(() => getReasonPresentation(props.clip.reason))

const displayMarkers = computed(() => {
  if (!clipHasMarkerRange(props.clip)) {
    return { inOffsetSeconds: null, outOffsetSeconds: null }
  }

  const resolved = resolveClipMarkers(props.clip, playbackSettings.value)
  return {
    inOffsetSeconds: resolved.inOffsetSeconds,
    outOffsetSeconds: resolved.outOffsetSeconds,
  }
})

function onDeleteClick(event: MouseEvent) {
  event.stopPropagation()
  emit('delete')
}
</script>

<template>
  <button
    type="button"
    class="clip-item"
    :class="{
      'clip-item--selected': selected,
      'clip-item--minimal': viewMode === 'minimal',
      'clip-item--minimal-delete': viewMode === 'minimal' && showDelete,
      'clip-item--thumbnails': viewMode === 'thumbnails',
    }"
    @click="emit('select')"
  >
    <template v-if="viewMode === 'thumbnails'">
      <div class="clip-item__thumb">
        <img v-if="thumbnailUrl" :src="thumbnailUrl" alt="" />
        <div v-else class="clip-item__thumb-placeholder">No thumb</div>
        <FloatingTooltipComponent
          v-if="clip.isFavorite && !showDelete"
          placement="top"
          class="clip-item__favorite-badge-wrapper"
        >
          <FontAwesomeIcon
            :icon="['fas', 'star']"
            class="clip-item__favorite-badge"
          />
          <template #tooltip>Favourite</template>
        </FloatingTooltipComponent>
      </div>
      <div class="clip-item__content">
        <div class="clip-item__title-row">
          <div class="clip-item__title">{{ titleLabel }}</div>
          <FloatingTooltipComponent v-if="showDelete" placement="top">
            <button
              type="button"
              class="clip-item__delete"
              @click="onDeleteClick"
            >
              <FontAwesomeIcon :icon="['fas', 'trash']" />
            </button>
            <template #tooltip>Delete folder</template>
          </FloatingTooltipComponent>
        </div>
        <div class="clip-item__meta-row clip-item__meta-row--split">
          <span class="clip-item__location">{{ locationLabel }}</span>
          <FloatingTooltipComponent placement="top">
            <span class="clip-item__reason">
              <FontAwesomeIcon :icon="reasonPresentation.icon" class="clip-item__reason-icon" />
              <span>{{ reasonPresentation.label }}</span>
            </span>
            <template #tooltip>{{ reasonPresentation.label }}</template>
          </FloatingTooltipComponent>
        </div>
        <ClipTimelineBarComponent
          :duration-seconds="clip.durationSeconds"
          :event-offset-seconds="clip.eventOffsetSeconds"
          :in-offset-seconds="displayMarkers.inOffsetSeconds"
          :out-offset-seconds="displayMarkers.outOffsetSeconds"
        />
      </div>
    </template>

    <template v-else-if="viewMode === 'minimal'">
      <div class="clip-item__thumb">
        <img v-if="thumbnailUrl" :src="thumbnailUrl" alt="" />
        <div v-else class="clip-item__thumb-placeholder">No thumb</div>
        <FloatingTooltipComponent
          v-if="clip.isFavorite && !showDelete"
          placement="top"
          class="clip-item__favorite-badge-wrapper"
        >
          <FontAwesomeIcon
            :icon="['fas', 'star']"
            class="clip-item__favorite-badge"
          />
          <template #tooltip>Favourite</template>
        </FloatingTooltipComponent>
      </div>
      <div class="clip-item__title clip-item__title--minimal">{{ titleLabel }}</div>
      <span class="clip-item__location clip-item__location--minimal">{{ locationLabel }}</span>
      <FloatingTooltipComponent placement="top">
        <span class="clip-item__reason clip-item__reason--icon-only">
          <FontAwesomeIcon :icon="reasonPresentation.icon" class="clip-item__reason-icon" />
        </span>
        <template #tooltip>{{ reasonPresentation.label }}</template>
      </FloatingTooltipComponent>
      <ClipTimelineBarComponent
        class="clip-item__timeline clip-item__timeline--minimal"
        :duration-seconds="clip.durationSeconds"
        :event-offset-seconds="clip.eventOffsetSeconds"
        :in-offset-seconds="displayMarkers.inOffsetSeconds"
        :out-offset-seconds="displayMarkers.outOffsetSeconds"
      />
      <FloatingTooltipComponent v-if="showDelete" placement="top">
        <button
          type="button"
          class="clip-item__delete clip-item__delete--minimal"
          @click="onDeleteClick"
        >
          <FontAwesomeIcon :icon="['fas', 'trash']" />
        </button>
        <template #tooltip>Delete folder</template>
      </FloatingTooltipComponent>
    </template>

    <template v-else>
      <div class="clip-item__thumb">
        <img v-if="thumbnailUrl" :src="thumbnailUrl" alt="" />
        <div v-else class="clip-item__thumb-placeholder">No thumb</div>
        <FloatingTooltipComponent
          v-if="clip.isFavorite && !showDelete"
          placement="top"
          class="clip-item__favorite-badge-wrapper"
        >
          <FontAwesomeIcon
            :icon="['fas', 'star']"
            class="clip-item__favorite-badge"
          />
          <template #tooltip>Favourite</template>
        </FloatingTooltipComponent>
      </div>
      <div class="clip-item__content">
        <div class="clip-item__title-row">
          <div class="clip-item__title">{{ titleLabel }}</div>
          <FloatingTooltipComponent v-if="showDelete" placement="top">
            <button
              type="button"
              class="clip-item__delete"
              @click="onDeleteClick"
            >
              <FontAwesomeIcon :icon="['fas', 'trash']" />
            </button>
            <template #tooltip>Delete folder</template>
          </FloatingTooltipComponent>
        </div>
        <div class="clip-item__meta-row">
          <span class="clip-item__location">{{ locationLabel }}</span>
          <span class="clip-item__meta-separator" aria-hidden="true">·</span>
          <FloatingTooltipComponent placement="top">
            <span class="clip-item__reason">
              <FontAwesomeIcon :icon="reasonPresentation.icon" class="clip-item__reason-icon" />
              <span>{{ reasonPresentation.label }}</span>
            </span>
            <template #tooltip>{{ reasonPresentation.label }}</template>
          </FloatingTooltipComponent>
        </div>
        <ClipTimelineBarComponent
          :duration-seconds="clip.durationSeconds"
          :event-offset-seconds="clip.eventOffsetSeconds"
          :in-offset-seconds="displayMarkers.inOffsetSeconds"
          :out-offset-seconds="displayMarkers.outOffsetSeconds"
        />
      </div>
    </template>
  </button>
</template>

<style scoped lang="scss">
.clip-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: var(--color-border-strong);
  }

  &--selected {
    border-color: var(--color-border-strong);
  }

  &--minimal {
    display: grid;
    grid-template-columns: auto minmax(0, 1.2fr) minmax(0, 1fr) auto minmax(72px, 120px);
    gap: 8px 10px;
    padding: 6px 10px;
    align-items: center;
  }

  &--minimal-delete {
    grid-template-columns: auto minmax(0, 1.2fr) minmax(0, 1fr) auto minmax(72px, 120px) auto;
  }

  &--thumbnails {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 8px;
  }
}

.clip-item__thumb {
  position: relative;
  width: 96px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--color-media-bg);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .clip-item--minimal & {
    width: auto;
    height: 28px;
    aspect-ratio: 4 / 3;
    border-radius: 4px;
  }

  .clip-item--thumbnails & {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
    border-radius: 8px;
  }
}

.clip-item__favorite-badge-wrapper {
  position: absolute;
  top: 6px;
  right: 6px;

  .clip-item--minimal & {
    top: 3px;
    right: 3px;
  }
}

.clip-item__favorite-badge {
  color: #ca8a04;
  font-size: 12px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));

  .clip-item--minimal & {
    font-size: 9px;
  }
}

.clip-item__thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--color-text-subtle);

  .clip-item--minimal & {
    font-size: 9px;
  }
}

.clip-item__content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .clip-item--thumbnails & {
    flex: initial;
    width: 100%;
  }
}

.clip-item__title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.clip-item__title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.3;
  color: var(--color-text-strong);

  &--minimal {
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-text-strong);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.clip-item__delete {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--color-danger);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: var(--color-danger);
    background: #fef2f2;
  }

  &--minimal {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    font-size: 11px;
  }
}

.clip-item__meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;

  &--split {
    justify-content: space-between;
    gap: 8px;
  }
}

.clip-item__location {
  flex-shrink: 0;
  white-space: nowrap;

  &--minimal {
    min-width: 0;
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.clip-item__meta-separator {
  flex-shrink: 0;
}

.clip-item__reason {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;

  span {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &--icon-only {
    justify-self: end;
    color: var(--color-text-muted);
  }

  .clip-item__meta-row--split & {
    flex: 0 1 auto;
    justify-content: flex-end;
    text-align: right;
  }
}

.clip-item__reason-icon {
  flex-shrink: 0;
  width: 13px;

  .clip-item--minimal & {
    width: 11px;
  }
}

.clip-item__timeline--minimal {
  min-width: 0;
  margin-top: 0;

  :deep(.clip-timeline__duration) {
    min-width: 40px;
    font-size: 10px;
  }
}

</style>
