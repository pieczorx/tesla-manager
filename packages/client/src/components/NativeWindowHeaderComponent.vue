<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import FloatingTooltipComponent from '@/components/FloatingTooltipComponent.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useNativeWindowStore } from '@/stores/nativeWindow'

const nativeWindowStore = useNativeWindowStore()
const appUpdateStore = useAppUpdateStore()

const maximizeIcon = computed(() =>
  nativeWindowStore.isFullscreen || nativeWindowStore.isMaximized
    ? (['fas', 'compress'] as const)
    : (['fas', 'expand'] as const),
)

const displayVersion = computed(() => __APP_VERSION__)
</script>

<template>
  <div
    class="native-window-header-wrapper"
    :class="{ 'native-window-header-wrapper--fullscreen': nativeWindowStore.isFullscreen }"
  >
    <div class="native-window-header" @dblclick="nativeWindowStore.toggleMaximizeOrExitFullscreen()">
      <div class="native-window-header__brand">
        <span class="native-window-header__title">Tesla Manager</span>
        <span class="native-window-header__version">{{ displayVersion }}</span>
      </div>

      <div v-if="appUpdateStore.updateLabel" class="native-window-header__update">
        <span
          class="native-window-header__update-label"
          :class="{ 'native-window-header__update-label--ready': appUpdateStore.isUpdateReady }"
        >
          {{ appUpdateStore.updateLabel }}
        </span>
        <button
          v-if="appUpdateStore.isUpdateReady"
          type="button"
          class="native-window-header__update-button"
          @click="appUpdateStore.restartToUpdate()"
        >
          Restart to update
        </button>
      </div>

      <div class="native-window-header__controls">
        <FloatingTooltipComponent placement="bottom">
          <button
            type="button"
            class="native-window-header__button"
            @click="nativeWindowStore.minimize()"
          >
            <FontAwesomeIcon :icon="['fas', 'minus']" />
          </button>
          <template #tooltip>Minimize</template>
        </FloatingTooltipComponent>
        <FloatingTooltipComponent placement="bottom">
          <button
            type="button"
            class="native-window-header__button"
            @click="nativeWindowStore.toggleMaximizeOrExitFullscreen()"
          >
            <FontAwesomeIcon :icon="maximizeIcon" />
          </button>
          <template #tooltip>
            {{ nativeWindowStore.isFullscreen || nativeWindowStore.isMaximized ? 'Restore' : 'Maximize' }}
          </template>
        </FloatingTooltipComponent>
        <FloatingTooltipComponent placement="bottom">
          <button
            type="button"
            class="native-window-header__button native-window-header__button--close"
            @click="nativeWindowStore.close()"
          >
            <FontAwesomeIcon :icon="['fas', 'xmark']" />
          </button>
          <template #tooltip>Close</template>
        </FloatingTooltipComponent>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.native-window-header-wrapper {
  position: relative;
  flex-shrink: 0;
  height: 2.25rem;
  z-index: 1000;

  &--fullscreen {
    height: 0.5rem;
    transition: height 0.2s cubic-bezier(0, 0.5, 0, 1);
  }
}

.native-window-header {
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 12px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  user-select: none;

  .native-window-header-wrapper--fullscreen & {
    -webkit-app-region: no-drag;
    transform: translateY(-2.25rem);
    opacity: 0;
    transition: transform 0.1s cubic-bezier(0, 0.5, 0, 1), opacity 0.1s cubic-bezier(0, 0.5, 0, 1);
  }

  .native-window-header-wrapper--fullscreen:hover & {
    transform: translateY(0);
    opacity: 1;
  }
}

.native-window-header__brand {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.native-window-header__title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--color-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.native-window-header__version {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.native-window-header__update {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  margin-right: 8px;
  -webkit-app-region: no-drag;
}

.native-window-header__update-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;

  &--ready {
    color: var(--color-success);
  }
}

.native-window-header__update-button {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--color-success);
  border-radius: 999px;
  background: #ecfdf3;
  color: var(--color-success);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;

  &:hover {
    background: var(--color-success);
    border-color: var(--color-success);
    color: #ffffff;
  }
}

.native-window-header__controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.native-window-header__button {
  width: 46px;
  height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: var(--color-bg-soft);
    color: var(--color-text-strong);
  }

  &--close:hover {
    background: #fee2e2;
    color: var(--color-danger);
  }
}
</style>
