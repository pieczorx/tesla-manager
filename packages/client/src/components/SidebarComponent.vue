<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import { RouteName } from '@/router/routeName'

const route = useRoute()
const router = useRouter()

const items = [
  {
    name: RouteName.Dashcam,
    icon: ['fas', 'video'],
    label: 'Dashcam',
  },
  {
    name: RouteName.Settings,
    icon: ['fas', 'gear'],
    label: 'Settings',
  },
] as const

const activeRoute = computed(() => route.name)

function navigate(name: RouteName) {
  router.push({ name })
}
</script>

<template>
  <aside class="sidebar">
    <nav class="sidebar__nav">
      <FloatingTooltipComponent
        v-for="item in items"
        :key="item.name"
        placement="right"
      >
        <button
          type="button"
          class="sidebar__button"
          :class="{ 'sidebar__button--active': activeRoute === item.name }"
          @click="navigate(item.name)"
        >
          <FontAwesomeIcon :icon="item.icon" />
        </button>
        <template #tooltip>{{ item.label }}</template>
      </FloatingTooltipComponent>
    </nav>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  width: 72px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar__button {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--color-text-subtle);
  cursor: pointer;
  font-size: 18px;
  transition: color 0.15s ease;

  &:hover {
    color: var(--color-text-strong);
  }

  &--active {
    color: var(--color-text-strong);
  }
}
</style>
