<script setup lang="ts">
import { computed } from 'vue'
import type { ScanProgress } from '@/types/electron'

const props = defineProps<{
  progress: ScanProgress
}>()

const progressLabel = computed(() => {
  if (props.progress.status === 'scanning') {
    return `Scanning... ${props.progress.scannedDirectories} directories, ${props.progress.foundEvents} events found`
  }
  if (props.progress.status === 'complete') {
    return props.progress.message ?? 'Scan complete'
  }
  if (props.progress.status === 'error') {
    return props.progress.message ?? 'Scan failed'
  }
  return 'Ready to scan'
})

const currentPath = computed(() => props.progress.currentPath)
</script>

<template>
  <div v-if="progress.status !== 'idle'" class="scan-progress" :class="`scan-progress--${progress.status}`">
    <div class="scan-progress__label">{{ progressLabel }}</div>
    <div v-if="currentPath" class="scan-progress__path">{{ currentPath }}</div>
  </div>
</template>

<style scoped lang="scss">
.scan-progress {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;

  &--scanning {
    .scan-progress__label {
      color: var(--color-warning);
    }
  }

  &--complete {
    .scan-progress__label {
      color: var(--color-success);
    }
  }

  &--error {
    .scan-progress__label {
      color: var(--color-danger);
    }
  }
}

.scan-progress__label {
  font-size: 13px;
  color: var(--color-text-muted);
}

.scan-progress__path {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
