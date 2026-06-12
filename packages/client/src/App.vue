<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import SidebarComponent from '@/components/SidebarComponent.vue'
import NativeWindowHeaderComponent from '@/components/NativeWindowHeaderComponent.vue'
import { useDashcamStore, useSettingsStore } from '@/stores'
import { useNativeWindowStore } from '@/stores/nativeWindow'
import { useAppUpdateStore } from '@/stores/appUpdate'

const dashcamStore = useDashcamStore()
const settingsStore = useSettingsStore()
const nativeWindowStore = useNativeWindowStore()
const appUpdateStore = useAppUpdateStore()

const isNativeApp = computed(() => !!window.teslaManager)

onMounted(() => {
  dashcamStore.bindIpcListeners()
  void nativeWindowStore.initialize()
  void appUpdateStore.initialize()
  void settingsStore.loadPlaybackSettings()
})

onUnmounted(() => {
  dashcamStore.unbindIpcListeners()
  nativeWindowStore.dispose()
  appUpdateStore.dispose()
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--native': isNativeApp }">
    <div class="floating-container" id="tooltip-divs" />
    <NativeWindowHeaderComponent v-if="isNativeApp" />
    <div class="app-shell__content">
      <SidebarComponent />
      <main class="app-shell__main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.floating-container {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.app-shell {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
}

.app-shell__content {
  flex: 1;
  min-height: 0;
  display: flex;
}

.app-shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
