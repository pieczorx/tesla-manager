<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import type { DashcamClip } from '@/types/electron'
import { EVENT_TYPE_FILTER_OPTIONS } from '@/utils/clipEventReason'
import {
  CLIP_LIST_VIEW_OPTIONS,
  countClipsByEventType,
  DATE_RANGE_PRESET_OPTIONS,
  getDatePresetLabel,
  type ClipFilterState,
  type ClipListViewMode,
  type DateRangePreset,
} from '@/utils/clipFilters'
import type { EventTypeFilter } from '@/utils/clipEventReason'

const props = defineProps<{
  clips: DashcamClip[]
  filters: ClipFilterState
  listViewMode: ClipListViewMode
}>()

const emit = defineEmits<{
  'update:eventType': [value: EventTypeFilter]
  'update:datePreset': [value: DateRangePreset]
  'update:dateFrom': [value: string]
  'update:dateTo': [value: string]
  'update:listViewMode': [value: ClipListViewMode]
  reset: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const openPanel = ref<'eventType' | 'date' | null>(null)

const typeCounts = computed(() => countClipsByEventType(props.clips))

const currentEventTypeOption = computed(() => {
  return (
    EVENT_TYPE_FILTER_OPTIONS.find((option) => option.value === props.filters.eventType) ??
    EVENT_TYPE_FILTER_OPTIONS[0]
  )
})

const currentEventTypeLabel = computed(() => currentEventTypeOption.value?.label ?? 'All types')

const currentDateLabel = computed(() => getDatePresetLabel(props.filters))

const showCustomDates = computed(() => props.filters.datePreset === 'custom')

const hasActiveFilters = computed(
  () =>
    props.filters.eventType !== 'all' ||
    props.filters.datePreset !== 'all' ||
    props.filters.dateFrom.length > 0 ||
    props.filters.dateTo.length > 0,
)

function typeLabel(value: EventTypeFilter, label: string): string {
  if (value === 'all') {
    return `${label} (${props.clips.length})`
  }
  return `${label} (${typeCounts.value[value]})`
}

function togglePanel(panel: 'eventType' | 'date') {
  openPanel.value = openPanel.value === panel ? null : panel
}

function closePanel() {
  openPanel.value = null
}

function selectEventType(value: EventTypeFilter) {
  emit('update:eventType', value)
  closePanel()
}

function selectDatePreset(value: DateRangePreset) {
  emit('update:datePreset', value)
  if (value !== 'custom') {
    closePanel()
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    closePanel()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div ref="rootRef" class="clip-filters">
    <div class="clip-filters__toolbar">
      <div class="clip-filters__pills">
        <div class="clip-filters__pill-wrap">
          <button
            type="button"
            class="clip-filters__pill"
            :class="{
              'clip-filters__pill--active': filters.eventType !== 'all',
              'clip-filters__pill--open': openPanel === 'eventType',
            }"
            @click="togglePanel('eventType')"
          >
            <FontAwesomeIcon
              v-if="currentEventTypeOption"
              :icon="currentEventTypeOption.icon"
              class="clip-filters__pill-type-icon"
            />
            <span class="clip-filters__pill-text">{{ currentEventTypeLabel }}</span>
            <FontAwesomeIcon :icon="['fas', 'chevron-down']" class="clip-filters__pill-chevron" />
          </button>

          <div v-if="openPanel === 'eventType'" class="clip-filters__panel">
            <button
              v-for="option in EVENT_TYPE_FILTER_OPTIONS"
              :key="option.value"
              type="button"
              class="clip-filters__option"
              :class="{ 'clip-filters__option--active': filters.eventType === option.value }"
              @click="selectEventType(option.value)"
            >
              <FontAwesomeIcon :icon="option.icon" class="clip-filters__option-icon" />
              <span>{{ typeLabel(option.value, option.label) }}</span>
            </button>
          </div>
        </div>

        <div class="clip-filters__pill-wrap">
          <button
            type="button"
            class="clip-filters__pill"
            :class="{
              'clip-filters__pill--active': filters.datePreset !== 'all' || filters.dateFrom || filters.dateTo,
              'clip-filters__pill--open': openPanel === 'date',
            }"
            @click="togglePanel('date')"
          >
            <span class="clip-filters__pill-text">{{ currentDateLabel }}</span>
            <FontAwesomeIcon :icon="['fas', 'chevron-down']" class="clip-filters__pill-chevron" />
          </button>

          <div v-if="openPanel === 'date'" class="clip-filters__panel">
            <button
              v-for="option in DATE_RANGE_PRESET_OPTIONS"
              :key="option.value"
              type="button"
              class="clip-filters__option"
              :class="{ 'clip-filters__option--active': filters.datePreset === option.value }"
              @click="selectDatePreset(option.value)"
            >
              {{ option.label }}
            </button>

            <div v-if="showCustomDates" class="clip-filters__date-range">
              <label class="clip-filters__date-field">
                <span>From</span>
                <input
                  type="date"
                  :value="filters.dateFrom"
                  @input="emit('update:dateFrom', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="clip-filters__date-field">
                <span>To</span>
                <input
                  type="date"
                  :value="filters.dateTo"
                  @input="emit('update:dateTo', ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="clip-filters__view-modes" role="group" aria-label="List view">
        <FloatingTooltipComponent
          v-for="option in CLIP_LIST_VIEW_OPTIONS"
          :key="option.value"
          placement="top"
        >
          <button
            type="button"
            class="clip-filters__view-mode"
            :class="{ 'clip-filters__view-mode--active': listViewMode === option.value }"
            :aria-label="option.label"
            :aria-pressed="listViewMode === option.value"
            @click="emit('update:listViewMode', option.value)"
          >
            <FontAwesomeIcon :icon="option.icon" />
          </button>
          <template #tooltip>{{ option.label }}</template>
        </FloatingTooltipComponent>
      </div>
    </div>

    <button v-if="hasActiveFilters" type="button" class="clip-filters__reset" @click="emit('reset')">
      Clear filters
    </button>
  </div>
</template>

<style scoped lang="scss">
.clip-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 0;
}

.clip-filters__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.clip-filters__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.clip-filters__pill-wrap {
  position: relative;
}

.clip-filters__pill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 8px 12px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;

  &:hover,
  &--open {
    border-color: var(--color-border-strong);
    color: var(--color-text-strong);
  }

  &--active {
    border-color: var(--color-border-strong);
  }
}

.clip-filters__pill-type-icon {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-subtle);
}

.clip-filters__pill-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-strong);
  font-weight: 600;
}

.clip-filters__pill-chevron {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-subtle);
}

.clip-filters__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100%;
  width: max-content;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-elevated);
  box-shadow: 0 10px 30px rgba(17, 24, 39, 0.12);
}

.clip-filters__option {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-strong);
  }

  &--active {
    background: var(--color-bg-soft);
    color: var(--color-text-strong);
  }
}

.clip-filters__option-icon {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  color: var(--color-text-subtle);
}

.clip-filters__view-modes {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  margin-left: auto;
}

.clip-filters__view-mode {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-subtle);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-strong);
  }

  &--active {
    border-color: var(--color-border-strong);
    color: var(--color-text-strong);
    background: var(--color-bg-soft);
  }
}

.clip-filters__date-range {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.clip-filters__date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-subtle);

  input {
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: transparent;
    color: var(--color-text-strong);
    padding: 7px 10px;
    font: inherit;

    &:focus {
      outline: none;
      border-color: var(--color-border-strong);
    }
  }
}

.clip-filters__reset {
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;

  &:hover {
    color: var(--color-text-strong);
  }
}
</style>
