<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import ClipFiltersComponent from '@/components/ClipFiltersComponent.vue'
import ClipLibraryFilterComponent from '@/components/ClipLibraryFilterComponent.vue'
import ClipListItemComponent from '@/components/ClipListItemComponent.vue'
import ClipSearchComponent from '@/components/ClipSearchComponent.vue'
import ClipPlayerComponent from '@/components/player/ClipPlayerComponent.vue'
import { useDashcamStore, useSettingsStore } from '@/stores'
import {
  createDefaultClipFilters,
  filterClips,
  filterClipsByLibrary,
  type ClipLibraryFilter,
  type ClipListViewMode,
} from '@/utils/clipFilters'
import { groupClipsForList } from '@/utils/clipListGrouping'

const dashcamStore = useDashcamStore()
const settingsStore = useSettingsStore()
const { clips, selectedClip, selectedClipId, thumbnailUrls } = storeToRefs(dashcamStore)

const filters = reactive(createDefaultClipFilters())
const libraryFilter = ref<ClipLibraryFilter>('all')
const listViewMode = ref<ClipListViewMode>('default')
const searchQuery = ref('')

const libraryClips = computed(() => filterClipsByLibrary(clips.value, libraryFilter.value))
const filteredClips = computed(() => filterClips(clips.value, filters, libraryFilter.value, searchQuery.value))
const groupedClips = computed(() => groupClipsForList(filteredClips.value))

const isArchiveView = computed(() => libraryFilter.value === 'archive')

const playerRef = ref<InstanceType<typeof ClipPlayerComponent> | null>(null)

function resetFilters() {
  Object.assign(filters, createDefaultClipFilters())
}

function onClipSelect(clipId: string) {
  if (clipId === selectedClipId.value) {
    playerRef.value?.resetCameraFocus()
    return
  }

  dashcamStore.selectClip(clipId)
}

function selectNextFilteredClip() {
  const list = filteredClips.value
  if (list.length === 0 || !selectedClipId.value) {
    return
  }

  const index = list.findIndex((clip) => clip.id === selectedClipId.value)
  if (index < 0 || index >= list.length - 1) {
    return
  }

  dashcamStore.selectClip(list[index + 1]!.id)
}

function selectPreviousFilteredClip() {
  const list = filteredClips.value
  if (list.length === 0 || !selectedClipId.value) {
    return
  }

  const index = list.findIndex((clip) => clip.id === selectedClipId.value)
  if (index <= 0) {
    return
  }

  dashcamStore.selectClip(list[index - 1]!.id)
}

async function toggleFavorite() {
  if (!selectedClip.value) {
    return
  }
  await dashcamStore.setClipFavorite(selectedClip.value.id, !selectedClip.value.isFavorite)
}

async function archiveSelectedClip() {
  if (!selectedClip.value || selectedClip.value.isArchived) {
    return
  }
  await dashcamStore.setClipArchived(selectedClip.value.id, true)
}

async function restoreSelectedClip() {
  if (!selectedClip.value || !selectedClip.value.isArchived) {
    return
  }
  await dashcamStore.setClipArchived(selectedClip.value.id, false)
}

async function updateClipMarkers(inOffsetSeconds: number | null, outOffsetSeconds: number | null) {
  if (!selectedClip.value) {
    return
  }
  await dashcamStore.setClipMarkers(selectedClip.value.id, inOffsetSeconds, outOffsetSeconds)
}

async function updateClipTitle(customTitle: string | null) {
  if (!selectedClip.value) {
    return
  }
  await dashcamStore.setClipTitle(selectedClip.value.id, customTitle)
}

async function deleteSelectedClip() {
  if (!selectedClip.value) {
    return
  }
  await dashcamStore.deleteClip(selectedClip.value.id)
}

async function addScanFolder() {
  const addedPath = await settingsStore.pickAndAddFolder()
  if (addedPath) {
    await dashcamStore.startScan()
  }
}

watch(filteredClips, (list) => {
  if (list.length === 0) {
    dashcamStore.clearSelection()
    return
  }

  if (!selectedClipId.value || !list.some((clip) => clip.id === selectedClipId.value)) {
    dashcamStore.selectClip(list[0]!.id)
  }
})

onMounted(async () => {
  await dashcamStore.loadClips()
})
</script>

<template>
  <div class="dashcam-view">
    <div class="dashcam-view__content">
      <section class="dashcam-view__list-panel">
        <ClipFiltersComponent
          :clips="libraryClips"
          :filters="filters"
          :list-view-mode="listViewMode"
          @update:event-type="filters.eventType = $event"
          @update:date-preset="filters.datePreset = $event"
          @update:date-from="filters.dateFrom = $event"
          @update:date-to="filters.dateTo = $event"
          @update:list-view-mode="listViewMode = $event"
          @reset="resetFilters"
        />

        <div v-if="libraryClips.length > 0" class="dashcam-view__list-toolbar">
          <ClipSearchComponent v-model="searchQuery" />
        </div>

        <div v-if="libraryClips.length === 0" class="dashcam-view__empty">
          <p v-if="libraryFilter === 'favourites'">No favourite clips yet.</p>
          <p v-else-if="libraryFilter === 'archive'">No archived clips.</p>
          <template v-else>
            <p class="dashcam-view__empty-title">No clips found yet.</p>
            <p class="dashcam-view__empty-description">
              Choose a folder with TeslaCam recordings. You can pick a specific subfolder
              (SavedClips, SentryClips, RecentClips) or a parent folder such as the TeslaCam root
              on your USB drive - all subfolders are scanned recursively.
            </p>
            <button type="button" class="dashcam-view__add-folder" @click="addScanFolder">
              Choose folder
            </button>
          </template>
        </div>

        <div v-else-if="filteredClips.length === 0" class="dashcam-view__empty">
          <p v-if="searchQuery.trim()">No events match your search.</p>
          <p v-else>No events match the current filters.</p>
          <button
            v-if="searchQuery.trim() || filters.eventType !== 'all' || filters.datePreset !== 'all'"
            type="button"
            class="dashcam-view__clear-filters"
            @click="searchQuery = ''; resetFilters()"
          >
            Clear filters
          </button>
        </div>

        <div v-else class="dashcam-view__list">
          <div
            class="dashcam-view__list-content"
            :class="{ 'dashcam-view__list-content--thumbnails': listViewMode === 'thumbnails' }"
          >
          <template v-for="block in groupedClips" :key="block.key">
            <template v-if="block.type === 'week'">
              <div
                v-if="block.sectionLabel"
                class="dashcam-view__list-section-header"
              >
                {{ block.sectionLabel }}
              </div>
              <template v-for="group in block.groups" :key="group.key">
                <div class="dashcam-view__list-day-header">{{ group.label }}</div>
                <ClipListItemComponent
                  v-for="clip in group.clips"
                  :key="clip.id"
                  :clip="clip"
                  :thumbnail-url="thumbnailUrls[clip.id]"
                  :selected="clip.id === selectedClipId"
                  :view-mode="listViewMode"
                  @select="onClipSelect(clip.id)"
                />
              </template>
            </template>

            <template v-else>
              <div class="dashcam-view__list-section-header">{{ block.label }}</div>
              <ClipListItemComponent
                v-for="clip in block.clips"
                :key="clip.id"
                :clip="clip"
                :thumbnail-url="thumbnailUrls[clip.id]"
                :selected="clip.id === selectedClipId"
                :view-mode="listViewMode"
                @select="onClipSelect(clip.id)"
              />
            </template>
          </template>
          </div>
        </div>

        <ClipLibraryFilterComponent v-model="libraryFilter" />
      </section>

      <section class="dashcam-view__preview-panel">
        <ClipPlayerComponent
          ref="playerRef"
          :clip="selectedClip"
          :show-archive-actions="!isArchiveView"
          :show-restore-action="isArchiveView"
          @select-next="selectNextFilteredClip()"
          @select-previous="selectPreviousFilteredClip()"
          @toggle-favorite="toggleFavorite()"
          @archive="archiveSelectedClip()"
          @restore="restoreSelectedClip()"
          @delete="deleteSelectedClip()"
          @update-markers="updateClipMarkers"
          @update-title="updateClipTitle"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashcam-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.dashcam-view__content {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 420px 1fr;
}

.dashcam-view__list-panel {
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dashcam-view__list-toolbar {
  flex-shrink: 0;
  padding: 12px 12px 6px;
}

.dashcam-view__list {
  flex: 1;
  overflow: auto;
  padding: 0 12px 12px;
}

.dashcam-view__list-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;

  &--thumbnails {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-content: start;

    > * {
      min-width: 0;
    }

    .dashcam-view__list-section-header,
    .dashcam-view__list-day-header {
      grid-column: 1 / -1;
    }
  }
}

.dashcam-view__list-section-header,
.dashcam-view__list-day-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 4px 4px;
  font-family: Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text-strong);
  background: var(--color-bg);
}

.dashcam-view__list-section-header {
  z-index: 2;

  &:not(:first-child) {
    padding-top: 12px;
  }
}

.dashcam-view__list-day-header {
  &:not(:first-child) {
    padding-top: 8px;
  }
}

.dashcam-view__empty {
  flex: 1;
  padding: 32px 24px;
  color: var(--color-text-muted);
  line-height: 1.5;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dashcam-view__empty-title {
  margin: 0;
  font-weight: 600;
  color: var(--color-text-strong);
}

.dashcam-view__empty-description {
  margin: 0;
  max-width: 320px;
  font-size: 13px;
}

.dashcam-view__add-folder {
  margin-top: 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  padding: 8px 14px;
  background: var(--color-accent);
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    filter: brightness(1.05);
  }
}

.dashcam-view__clear-filters {
  margin-top: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 8px 14px;
  background: transparent;
  color: var(--color-text-strong);
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface-hover);
  }
}

.dashcam-view__preview-panel {
  min-height: 0;
  overflow: hidden;
}
</style>
