<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { CLIP_LIBRARY_FILTER_OPTIONS, type ClipLibraryFilter } from '@/utils/clipFilters'

defineProps<{
  modelValue: ClipLibraryFilter
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ClipLibraryFilter]
}>()
</script>

<template>
  <nav class="clip-library-filter" aria-label="Clip library">
    <button
      v-for="option in CLIP_LIBRARY_FILTER_OPTIONS"
      :key="option.value"
      type="button"
      class="clip-library-filter__button"
      :class="{ 'clip-library-filter__button--active': modelValue === option.value }"
      @click="emit('update:modelValue', option.value)"
    >
      <FontAwesomeIcon :icon="option.icon" class="clip-library-filter__icon" />
      <span>{{ option.label }}</span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
.clip-library-filter {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.clip-library-filter__button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 64px;
  border: none;
  background: transparent;
  color: var(--color-text-subtle);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.12s ease;

  &:hover {
    color: var(--color-text-strong);
  }

  &--active {
    color: var(--color-text-strong);
  }
}

.clip-library-filter__icon {
  font-size: 18px;
}
</style>
