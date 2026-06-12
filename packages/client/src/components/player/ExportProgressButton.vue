<script setup lang="ts">
import { computed, ref } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'

const props = defineProps<{
  progress: number
  exporting: boolean
  disabled?: boolean
  blocked?: boolean
  blockedTitle?: string
}>()

const emit = defineEmits<{
  click: []
  cancel: []
}>()

const isHovered = ref(false)

const RADIUS = 14
const STROKE = 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, props.progress))))
const percentLabel = computed(() => `${(Math.max(0, Math.min(1, props.progress)) * 100).toFixed(1)}%`)
const showStopIcon = computed(() => props.exporting && isHovered.value)
const buttonTitle = computed(() => {
  if (props.blocked && props.blockedTitle) {
    return props.blockedTitle
  }
  if (props.exporting) {
    return showStopIcon.value ? 'Cancel export' : 'Exporting…'
  }
  return 'Export'
})

function onClick() {
  if (props.exporting) {
    emit('cancel')
    return
  }
  emit('click')
}
</script>

<template>
  <FloatingTooltipComponent placement="top">
    <button
      type="button"
      class="export-progress-button"
      :class="{
        'export-progress-button--exporting': exporting,
        'export-progress-button--cancellable': exporting,
        'export-progress-button--blocked': blocked,
      }"
      :disabled="blocked || (disabled && !exporting)"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      @click="onClick"
    >
    <template v-if="exporting">
      <template v-if="showStopIcon">
        <FontAwesomeIcon class="export-progress-button__stop" :icon="['fas', 'stop']" />
      </template>
      <template v-else>
        <svg
          class="export-progress-button__ring"
          viewBox="0 0 36 36"
          aria-hidden="true"
        >
          <circle
            class="export-progress-button__track"
            cx="18"
            cy="18"
            :r="RADIUS"
            :stroke-width="STROKE"
            fill="none"
          />
          <circle
            class="export-progress-button__progress"
            cx="18"
            cy="18"
            :r="RADIUS"
            :stroke-width="STROKE"
            fill="none"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="dashOffset"
          />
        </svg>
        <span class="export-progress-button__percent">{{ percentLabel }}</span>
      </template>
    </template>
    <FontAwesomeIcon
      v-else
      class="export-progress-button__icon"
      :icon="['fas', 'file-export']"
    />
    </button>
    <template #tooltip>{{ buttonTitle }}</template>
  </FloatingTooltipComponent>
</template>

<style scoped lang="scss">
.export-progress-button {
  position: relative;
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

  &:hover:not(:disabled) {
    border-color: var(--color-border-strong);
    color: var(--color-text-strong);
  }

  &:disabled {
    cursor: default;
    opacity: 0.75;
  }

  &--exporting {
    color: var(--color-text-strong);
  }

  &--cancellable:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }

  &--blocked {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.export-progress-button__ring {
  position: absolute;
  inset: 2px;
  width: calc(100% - 4px);
  height: calc(100% - 4px);
  transform: rotate(-90deg);
}

.export-progress-button__track {
  stroke: var(--color-border);
}

.export-progress-button__progress {
  stroke: var(--color-accent);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.15s ease;
}

.export-progress-button__percent {
  position: relative;
  z-index: 1;
  font-size: 7px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-variant: all-small-caps;
  letter-spacing: 0.04em;
  line-height: 1;
  color: var(--color-text-strong);
}

.export-progress-button__icon,
.export-progress-button__stop {
  font-size: 14px;
}

.export-progress-button__stop {
  position: relative;
  z-index: 1;
}
</style>
