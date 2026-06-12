<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

export type ExportDialogPhase = 'choose' | 'saving' | 'copying' | 'saved'

const props = defineProps<{
  fileName: string
  phase: ExportDialogPhase
  actionProgress: number
  revealLabel: string
}>()

const emit = defineEmits<{
  save: []
  copy: []
  reveal: []
  close: []
}>()

const isBusy = computed(() => props.phase === 'saving' || props.phase === 'copying')
const progressPercent = computed(() => `${(Math.max(0, Math.min(1, props.actionProgress)) * 100).toFixed(1)}%`)
const busyLabel = computed(() => (props.phase === 'saving' ? 'Saving to disk…' : 'Copying to clipboard…'))
</script>

<template>
  <div class="export-dialog-backdrop" @click.self="!isBusy && emit('close')">
    <div class="export-dialog" role="dialog" aria-labelledby="export-dialog-title">
      <template v-if="phase === 'saved'">
        <h3 id="export-dialog-title" class="export-dialog__title">Export saved</h3>
        <p class="export-dialog__subtitle">{{ fileName }} was saved successfully.</p>
        <button type="button" class="export-dialog__reveal" @click="emit('reveal')">
          <FontAwesomeIcon :icon="['fas', 'folder-open']" />
          {{ revealLabel }}
        </button>
        <button type="button" class="export-dialog__cancel" @click="emit('close')">
          Close
        </button>
      </template>

      <template v-else-if="isBusy">
        <h3 id="export-dialog-title" class="export-dialog__title">{{ busyLabel }}</h3>
        <p class="export-dialog__subtitle">{{ fileName }}</p>
        <div class="export-dialog__progress">
          <div class="export-dialog__progress-track">
            <div
              class="export-dialog__progress-fill"
              :style="{ width: `${Math.max(0, Math.min(1, actionProgress)) * 100}%` }"
            />
          </div>
          <span class="export-dialog__progress-label">{{ progressPercent }}</span>
        </div>
      </template>

      <template v-else>
        <h3 id="export-dialog-title" class="export-dialog__title">Export ready</h3>
        <p class="export-dialog__subtitle">{{ fileName }}</p>

        <div class="export-dialog__tiles">
          <button type="button" class="export-dialog__tile" @click="emit('save')">
            <span class="export-dialog__tile-icon">
              <FontAwesomeIcon :icon="['fas', 'folder-open']" />
            </span>
            <span class="export-dialog__tile-content">
              <span class="export-dialog__tile-title">Save locally</span>
              <span class="export-dialog__tile-description">
                Save the MP4 to your export folder on disk.
              </span>
            </span>
          </button>

          <button type="button" class="export-dialog__tile" @click="emit('copy')">
            <span class="export-dialog__tile-icon">
              <FontAwesomeIcon :icon="['fas', 'clipboard']" />
            </span>
            <span class="export-dialog__tile-content">
              <span class="export-dialog__tile-title">Copy to clipboard</span>
              <span class="export-dialog__tile-description">
                Copy the MP4 file so you can paste it elsewhere.
              </span>
            </span>
          </button>
        </div>

        <button type="button" class="export-dialog__cancel" @click="emit('close')">
          Cancel
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.export-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.45);
  padding: 24px;
}

.export-dialog {
  width: min(100%, 440px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-elevated);
  padding: 22px;
  box-shadow: 0 18px 40px rgba(17, 24, 39, 0.18);
}

.export-dialog__title {
  margin: 0 0 6px;
  font-size: 18px;
  color: var(--color-text-strong);
}

.export-dialog__subtitle {
  margin: 0 0 18px;
  font-size: 12px;
  color: var(--color-text-muted);
  word-break: break-all;
}

.export-dialog__tiles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.export-dialog__tile {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-soft);
  color: var(--color-text-strong);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: var(--color-border-strong);
    background: var(--color-surface-hover);
  }
}

.export-dialog__tile-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--color-text);
}

.export-dialog__tile-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.export-dialog__tile-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-strong);
}

.export-dialog__tile-description {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-muted);
}

.export-dialog__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-dialog__progress-track {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--color-bg-soft);
  overflow: hidden;
}

.export-dialog__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width 0.15s ease;
}

.export-dialog__progress-label {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  text-align: right;
}

.export-dialog__reveal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  background: var(--color-accent);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--color-accent-strong);
  }
}

.export-dialog__cancel {
  margin-top: 12px;
  width: 100%;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    color: var(--color-text-strong);
  }
}
</style>
