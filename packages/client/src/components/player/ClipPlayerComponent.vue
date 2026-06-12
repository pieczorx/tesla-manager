<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import CameraLayoutComponent from '@/components/player/CameraLayoutComponent.vue'
import ExportChoiceDialog from '@/components/player/ExportChoiceDialog.vue'
import ExportProgressButton from '@/components/player/ExportProgressButton.vue'
import PlaybackProgressBarComponent from '@/components/player/PlaybackProgressBarComponent.vue'
import { useClipExport } from '@/composables/useClipExport'
import { useClipPlayback } from '@/composables/useClipPlayback'
import { useSettingsStore } from '@/stores'
import type { DashcamClip } from '@/types/electron'
import { getReasonPresentation } from '@/utils/clipEventReason'
import { formatClipTimestamp, getClipDisplayTitle } from '@/utils/clipTimeline'
import { resolveClipMarkers } from '@/utils/clipTimingShared'

const props = defineProps<{
  clip: DashcamClip | null
  showArchiveActions?: boolean
  showRestoreAction?: boolean
}>()

const emit = defineEmits<{
  selectNext: []
  selectPrevious: []
  toggleFavorite: []
  archive: []
  restore: []
  delete: []
  updateMarkers: [inOffsetSeconds: number | null, outOffsetSeconds: number | null]
  updateTitle: [customTitle: string | null]
}>()

const rootRef = ref<HTMLElement | null>(null)
const titleInputRef = ref<HTMLInputElement | null>(null)
const isEditingTitle = ref(false)
const draftTitle = ref('')
const clipRef = toRef(props, 'clip')
const settingsStore = useSettingsStore()

const {
  cameraTracks,
  currentTime,
  isPlaying,
  playbackRate,
  focusedCameraId,
  durationSeconds,
  eventMarkerPercent,
  displayInOffsetSeconds,
  displayOutOffsetSeconds,
  playbackSpeeds,
  togglePlay,
  seekTo,
  seekBy,
  play,
  pause,
  setPlaybackRate,
  focusCamera,
} = useClipPlayback(clipRef)

function resetCameraFocus() {
  focusCamera('')
}

defineExpose({ resetCameraFocus })

const {
  exportProgress,
  exportError,
  showExportDialog,
  exportDialogPhase,
  exportActionProgress,
  exportDialogFileName,
  revealLabel,
  isClipExporting,
  isAnotherClipExporting,
  shouldShowExportError,
  startExport: startClipExport,
  cancelExport: cancelClipExport,
  closeExportDialog,
  savePreparedExport,
  copyPreparedExport,
  revealSavedExport,
} = useClipExport()

const reasonPresentation = computed(() => getReasonPresentation(props.clip?.reason))
const titleLabel = computed(() => (props.clip ? getClipDisplayTitle(props.clip) : ''))
const dateLabel = computed(() => (props.clip ? formatClipTimestamp(props.clip.timestamp) : ''))
const titleSizerText = computed(() => {
  const text = isEditingTitle.value ? draftTitle.value : titleLabel.value
  return text || '\u00a0'
})
const hasVideos = computed(() => (props.clip?.videoFiles.length ?? 0) > 0)

function startEditingTitle() {
  if (!props.clip || isEditingTitle.value) {
    return
  }

  draftTitle.value = props.clip.customTitle?.trim() || formatClipTimestamp(props.clip.timestamp)
  isEditingTitle.value = true
  void nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

function onTitleMouseDown(event: MouseEvent) {
  if (!isEditingTitle.value) {
    event.preventDefault()
    startEditingTitle()
  }
}

function onTitleInput(event: Event) {
  if (!isEditingTitle.value) {
    return
  }
  draftTitle.value = (event.target as HTMLInputElement).value
}

function commitTitleEdit() {
  if (!props.clip || !isEditingTitle.value) {
    return
  }

  isEditingTitle.value = false
  const trimmed = draftTitle.value.trim()
  const defaultTitle = formatClipTimestamp(props.clip.timestamp)
  const nextTitle = !trimmed || trimmed === defaultTitle ? null : trimmed
  const currentTitle = props.clip.customTitle?.trim() || null

  if (nextTitle !== currentTitle) {
    emit('updateTitle', nextTitle)
  }
}

function cancelTitleEdit() {
  isEditingTitle.value = false
}

function onTitleInputKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitTitleEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelTitleEdit()
  }
}

const isCurrentClipExporting = computed(() => isClipExporting(props.clip?.id))
const isBlockedByOtherExport = computed(() => isAnotherClipExporting(props.clip?.id))
const canExport = computed(
  () => hasVideos.value && cameraTracks.value.length > 0 && !isBlockedByOtherExport.value && !isCurrentClipExporting.value,
)

function getResolvedMarkers() {
  if (!props.clip) {
    return null
  }
  return resolveClipMarkers(props.clip, settingsStore.playbackSettings)
}

function setInMarker() {
  if (!props.clip) {
    return
  }
  const resolved = getResolvedMarkers()!
  const maxIn = props.clip.outOffsetSeconds ?? resolved.outOffsetSeconds
  const clampedIn = Math.max(0, Math.min(currentTime.value, maxIn))
  emit('updateMarkers', clampedIn, props.clip.outOffsetSeconds)
}

function setOutMarker() {
  if (!props.clip) {
    return
  }
  const resolved = getResolvedMarkers()!
  const minOut = props.clip.inOffsetSeconds ?? resolved.inOffsetSeconds
  const clampedOut = Math.max(minOut, Math.min(currentTime.value, durationSeconds.value))
  emit('updateMarkers', props.clip.inOffsetSeconds, clampedOut)
}

function onUpdateIn(seconds: number) {
  if (!props.clip) {
    return
  }
  emit('updateMarkers', seconds, props.clip.outOffsetSeconds)
}

function onUpdateOut(seconds: number) {
  if (!props.clip) {
    return
  }
  emit('updateMarkers', props.clip.inOffsetSeconds, seconds)
}

function onPreviewSeek(seconds: number) {
  if (isPlaying.value) {
    pause()
  }
  seekTo(seconds, { bypassRange: true })
}

function onMarkerDragEnd(resumeTime: number) {
  seekTo(resumeTime)
  play()
}

async function startExport() {
  if (!props.clip || !canExport.value) {
    return
  }

  const resolved = getResolvedMarkers()
  if (!resolved) {
    return
  }

  await startClipExport({
    clipId: props.clip.id,
    cameraId: focusedCameraId.value,
    inOffsetSeconds: resolved.inOffsetSeconds,
    outOffsetSeconds: resolved.outOffsetSeconds,
    playbackRate: playbackRate.value,
  })
}

async function cancelExport() {
  if (!props.clip) {
    return
  }
  await cancelClipExport(props.clip.id)
}

function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      emit('selectNext')
      break
    case 'ArrowUp':
      event.preventDefault()
      emit('selectPrevious')
      break
    case 'ArrowRight':
      event.preventDefault()
      seekBy(3)
      break
    case 'ArrowLeft':
      event.preventDefault()
      seekBy(-3)
      break
    case ' ':
      event.preventDefault()
      togglePlay()
      break
    case 'i':
    case 'I':
      event.preventDefault()
      setInMarker()
      break
    case 'o':
    case 'O':
      event.preventDefault()
      setOutMarker()
      break
  }
}

onMounted(() => {
  rootRef.value?.focus()
})

watch(
  () => props.clip?.id,
  () => {
    isEditingTitle.value = false
    rootRef.value?.focus()
  },
)

onUnmounted(() => {
  // Export state lives in useClipExport and continues across clip changes.
})
</script>

<template>
  <section
    ref="rootRef"
    class="clip-player"
    tabindex="0"
    @keydown="onKeyDown"
  >
    <div v-if="!clip" class="clip-player__empty">
      <h2>Select a clip</h2>
      <p>Choose an event from the list to start playback.</p>
    </div>

    <template v-else>
      <header class="clip-player__header">
        <div class="clip-player__header-main">
          <div class="clip-player__title-row">
            <span class="clip-player__title-sizer" aria-hidden="true">{{ titleSizerText }}</span>
            <FloatingTooltipComponent placement="bottom">
              <input
                ref="titleInputRef"
                :value="isEditingTitle ? draftTitle : titleLabel"
                :readonly="!isEditingTitle"
                type="text"
                class="clip-player__title-input"
                :class="{ 'clip-player__title-input--readonly': !isEditingTitle }"
                maxlength="120"
                @mousedown="onTitleMouseDown"
                @input="onTitleInput"
                @keydown="onTitleInputKeyDown"
                @blur="commitTitleEdit()"
              />
              <template #tooltip>Click to rename</template>
            </FloatingTooltipComponent>
          </div>
          <div class="clip-player__meta">
            <span v-if="clip.city">{{ clip.city }}</span>
            <span v-if="clip.city" class="clip-player__meta-separator" aria-hidden="true">·</span>
            <span>{{ dateLabel }}</span>
            <span class="clip-player__meta-separator" aria-hidden="true">·</span>
            <span class="clip-player__reason">
              <FontAwesomeIcon :icon="reasonPresentation.icon" />
              {{ reasonPresentation.label }}
            </span>
          </div>
        </div>
        <div
          v-if="showRestoreAction || showArchiveActions || (hasVideos && !showRestoreAction)"
          class="clip-player__header-side"
        >
          <div class="clip-player__actions">
            <FloatingTooltipComponent v-if="showRestoreAction" placement="top">
              <button
                type="button"
                class="clip-player__action clip-player__action--labeled"
                @click="emit('restore')"
              >
                <FontAwesomeIcon :icon="['fas', 'arrow-rotate-left']" />
                Restore
              </button>
              <template #tooltip>Restore</template>
            </FloatingTooltipComponent>
            <FloatingTooltipComponent v-if="showRestoreAction" placement="top">
              <button
                type="button"
                class="clip-player__action clip-player__action--labeled clip-player__action--danger"
                @click="emit('delete')"
              >
                <FontAwesomeIcon :icon="['fas', 'trash']" />
                Delete forever
              </button>
              <template #tooltip>Delete forever</template>
            </FloatingTooltipComponent>
            <FloatingTooltipComponent v-if="showArchiveActions" placement="top">
              <button
                type="button"
                class="clip-player__action"
                :class="{ 'clip-player__action--active': clip.isFavorite }"
                @click="emit('toggleFavorite')"
              >
                <FontAwesomeIcon :icon="clip.isFavorite ? ['fas', 'star'] : ['far', 'star']" />
              </button>
              <template #tooltip>Toggle favourite</template>
            </FloatingTooltipComponent>
            <FloatingTooltipComponent v-if="showArchiveActions" placement="top">
              <button
                type="button"
                class="clip-player__action"
                @click="emit('archive')"
              >
                <FontAwesomeIcon :icon="['fas', 'box-archive']" />
              </button>
              <template #tooltip>Archive</template>
            </FloatingTooltipComponent>
            <ExportProgressButton
              v-if="hasVideos && !showRestoreAction"
              :exporting="isCurrentClipExporting"
              :progress="exportProgress"
              :blocked="isBlockedByOtherExport"
              blocked-title="Another event is being exported"
              :disabled="!canExport && !isCurrentClipExporting"
              @click="startExport()"
              @cancel="cancelExport()"
            />
          </div>
          <p v-if="!showRestoreAction && shouldShowExportError(clip?.id)" class="clip-player__export-error">
            {{ exportError }}
          </p>
        </div>
      </header>

      <ExportChoiceDialog
        v-if="showExportDialog"
        :file-name="exportDialogFileName"
        :phase="exportDialogPhase"
        :action-progress="exportActionProgress"
        :reveal-label="revealLabel"
        @save="savePreparedExport()"
        @copy="copyPreparedExport()"
        @reveal="revealSavedExport()"
        @close="closeExportDialog()"
      />

      <div v-if="!hasVideos" class="clip-player__no-video">
        No video files found in this event folder.
      </div>

      <div v-else-if="cameraTracks.length === 0" class="clip-player__no-video">
        Could not parse camera tracks from video files.
      </div>

      <div v-else class="clip-player__stage">
        <CameraLayoutComponent
          :tracks="cameraTracks"
          :focused-camera-id="focusedCameraId"
          :global-time="currentTime"
          :is-playing="isPlaying"
          :playback-rate="playbackRate"
          @focus-camera="focusCamera"
        />
      </div>

      <footer v-if="hasVideos && cameraTracks.length > 0" class="clip-player__controls">
        <div class="clip-player__transport">
          <FloatingTooltipComponent placement="top">
            <button type="button" class="clip-player__button" @click="emit('selectPrevious')">
              <FontAwesomeIcon :icon="['fas', 'chevron-up']" />
            </button>
            <template #tooltip>Previous clip (↑)</template>
          </FloatingTooltipComponent>
          <button type="button" class="clip-player__button clip-player__button--primary" @click="togglePlay">
            <FontAwesomeIcon :icon="['fas', isPlaying ? 'pause' : 'play']" />
          </button>
          <FloatingTooltipComponent placement="top">
            <button type="button" class="clip-player__button" @click="emit('selectNext')">
              <FontAwesomeIcon :icon="['fas', 'chevron-down']" />
            </button>
            <template #tooltip>Next clip (↓)</template>
          </FloatingTooltipComponent>

          <div class="clip-player__speed">
            <span class="clip-player__speed-label">Speed</span>
            <div class="clip-player__speed-list" role="group" aria-label="Playback speed">
              <button
                v-for="speed in playbackSpeeds"
                :key="speed"
                type="button"
                class="clip-player__speed-option"
                :class="{ 'clip-player__speed-option--active': playbackRate === speed }"
                @click="setPlaybackRate(speed)"
              >
                {{ speed }}x
              </button>
            </div>
          </div>
        </div>

        <PlaybackProgressBarComponent
          :current-time="currentTime"
          :duration-seconds="durationSeconds"
          :event-marker-percent="eventMarkerPercent"
          :in-offset-seconds="displayInOffsetSeconds"
          :out-offset-seconds="displayOutOffsetSeconds"
          @seek="seekTo"
          @preview-seek="onPreviewSeek"
          @update-in="onUpdateIn"
          @update-out="onUpdateOut"
          @marker-drag-end="onMarkerDragEnd"
        />

        <div class="clip-player__hints">
          <div class="clip-player__hint">
            <kbd><FontAwesomeIcon :icon="['fas', 'chevron-left']" /></kbd>
            <kbd><FontAwesomeIcon :icon="['fas', 'chevron-right']" /></kbd>
            <span>Seek 3s</span>
          </div>
          <div class="clip-player__hint">
            <kbd><FontAwesomeIcon :icon="['fas', 'chevron-up']" /></kbd>
            <kbd><FontAwesomeIcon :icon="['fas', 'chevron-down']" /></kbd>
            <span>Change clip</span>
          </div>
          <div class="clip-player__hint">
            <kbd>Space</kbd>
            <span>Play / pause</span>
          </div>
          <div class="clip-player__hint">
            <kbd>I</kbd>
            <span>Set IN</span>
          </div>
          <div class="clip-player__hint">
            <kbd>O</kbd>
            <span>Set OUT</span>
          </div>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped lang="scss">
.clip-player {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: transparent;
  outline: none;
}

.clip-player__empty,
.clip-player__no-video {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  padding: 24px;
  text-align: center;

  h2 {
    margin: 0 0 8px;
    color: var(--color-text-strong);
  }
}

.clip-player__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;

  h2 {
    margin: 0 0 6px;
    font-size: 18px;
    color: var(--color-text-strong);
  }
}

.clip-player__title-row {
  position: relative;
  display: inline-block;
  max-width: 100%;
  margin-bottom: 6px;
  vertical-align: top;
}

.clip-player__title-sizer {
  display: block;
  visibility: hidden;
  white-space: pre;
  font-family: inherit;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  min-width: 1ch;
}

.clip-player__title-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text-strong);
  box-sizing: border-box;
  outline: none;
  appearance: none;
  min-width: 0;

  &--readonly {
    cursor: text;
  }

  &:focus {
    outline: none;
  }
}

.clip-player__title-row:has(.clip-player__title-input--readonly:hover) {
  background: var(--color-bg-soft);
  border-radius: 6px;
}

.clip-player__header-main {
  min-width: 0;
}

.clip-player__meta-separator {
  user-select: none;
}

.clip-player__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.clip-player__reason {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text);
}

.clip-player__header-side {
  flex-shrink: 0;
}

.clip-player__actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.clip-player__export-error {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-danger);
  text-align: right;
  max-width: 220px;
}

.clip-player__action {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-strong);
  }

  &--active {
    border-color: var(--color-border-strong);
    color: #ca8a04;
  }

  &--labeled {
    width: auto;
    gap: 6px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
  }

  &--danger {
    color: var(--color-danger);

    &:hover {
      border-color: var(--color-danger);
      background: #fef2f2;
      color: var(--color-danger);
    }
  }
}

.clip-player__stage {
  flex: 1;
  min-height: 0;
  padding: 16px 22px 18px;
  overflow: hidden;
}

.clip-player__controls {
  flex-shrink: 0;
  padding: 14px 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--color-border);
}

.clip-player__transport {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clip-player__button {
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-strong);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: var(--color-border-strong);
  }

  &--primary {
    width: 42px;
    height: 42px;
    border-color: var(--color-border-strong);
    background: var(--color-accent);
    color: #ffffff;

    &:hover {
      background: var(--color-accent-strong);
    }
  }
}

.clip-player__speed {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.clip-player__speed-label {
  flex-shrink: 0;
}

.clip-player__speed-list {
  display: flex;
  align-items: center;
  gap: 4px;
}

.clip-player__speed-option {
  min-width: 36px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-strong);
  }

  &--active {
    border-color: var(--color-border-strong);
    background: var(--color-accent);
    color: #ffffff;

    &:hover {
      background: var(--color-accent-strong);
      color: #ffffff;
    }
  }
}

.clip-player__hints {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.clip-player__hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--color-text-muted);

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    background: var(--color-bg-soft);
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-strong);
    line-height: 1;
    box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04);

    svg {
      width: 8px;
      height: 8px;
    }
  }
}
</style>
