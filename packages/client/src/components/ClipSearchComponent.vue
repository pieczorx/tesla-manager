<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="clip-search">
    <FontAwesomeIcon :icon="['fas', 'magnifying-glass']" class="clip-search__icon" />
    <input
      type="search"
      class="clip-search__input"
      placeholder="Search by date or location…"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped lang="scss">
.clip-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  transition: border-color 0.12s ease;

  &:focus-within {
    border-color: var(--color-border-strong);
  }
}

.clip-search__icon {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-text-subtle);
}

.clip-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text-strong);
  font-size: 13px;
  padding: 9px 0;

  &::placeholder {
    color: var(--color-text-subtle);
  }

  &:focus {
    outline: none;
  }

  &::-webkit-search-cancel-button {
    cursor: pointer;
  }
}
</style>
