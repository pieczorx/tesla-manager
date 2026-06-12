import { defineStore } from 'pinia'
import { ref } from 'vue'

function getWindowApi() {
  return window.teslaManager?.window ?? null
}

export const useNativeWindowStore = defineStore('nativeWindow', () => {
  const isMaximized = ref(false)
  const isFullscreen = ref(false)

  let unsubscribeMaximize: (() => void) | null = null
  let unsubscribeFullscreen: (() => void) | null = null

  async function initialize() {
    const api = getWindowApi()
    if (!api) {
      return
    }

    unsubscribeMaximize?.()
    unsubscribeFullscreen?.()

    unsubscribeMaximize = api.onMaximizeChange((state) => {
      isMaximized.value = state
    })
    unsubscribeFullscreen = api.onFullscreenChange((state) => {
      isFullscreen.value = state
    })

    isMaximized.value = await api.getMaximized()
    isFullscreen.value = await api.getFullscreen()
  }

  function dispose() {
    unsubscribeMaximize?.()
    unsubscribeFullscreen?.()
    unsubscribeMaximize = null
    unsubscribeFullscreen = null
  }

  async function minimize() {
    await getWindowApi()?.minimize()
  }

  async function close() {
    await getWindowApi()?.close()
  }

  async function toggleMaximizeOrExitFullscreen() {
    const api = getWindowApi()
    if (!api) {
      return
    }

    if (isFullscreen.value) {
      await api.toggleFullscreen(false)
      isFullscreen.value = await api.getFullscreen()
      return
    }

    const nextState = !isMaximized.value
    await api.toggleMaximize(nextState)
    isMaximized.value = await api.getMaximized()
  }

  return {
    isMaximized,
    isFullscreen,
    initialize,
    dispose,
    minimize,
    close,
    toggleMaximizeOrExitFullscreen,
  }
})
