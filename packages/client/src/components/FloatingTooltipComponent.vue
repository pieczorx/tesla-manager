<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  trigger?: 'hover' | 'click' | 'manual'
  visible?: boolean
  isDisabled?: boolean
}>(), {
  trigger: 'hover',
  visible: undefined,
  isDisabled: false,
})

const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <VTooltip
    v-if="isMounted"
    v-bind="$attrs"
    container="#tooltip-divs"
    :trigger="props.trigger"
    :shown="props.visible"
    :disabled="props.isDisabled"
  >
    <slot />
    <template #popper>
      <div class="tooltip-text-wrapper">
        <slot name="tooltip" />
      </div>
    </template>
  </VTooltip>
</template>

<style scoped>
.tooltip-text-wrapper {
  display: -webkit-box;
  -webkit-line-clamp: 20;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
  max-height: 500px;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
