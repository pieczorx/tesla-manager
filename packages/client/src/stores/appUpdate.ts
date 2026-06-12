import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { UpdateStatus, UpdateStatusPayload } from '@/types/electron'

function getUpdateApi() {
  return window.teslaManager?.update ?? null
}

export const useAppUpdateStore = defineStore('appUpdate', () => {
  const status = ref<UpdateStatus>('idle')
  const version = ref<string | null>(null)
  const progress = ref<number | null>(null)

  let unsubscribe: (() => void) | null = null

  function applyStatus(payload: UpdateStatusPayload) {
    status.value = payload.status
    version.value = payload.version
    progress.value = payload.progress
  }

  async function initialize() {
    const api = getUpdateApi()
    if (!api) {
      return
    }

    unsubscribe?.()
    unsubscribe = api.onStatusChange(applyStatus)
    applyStatus(await api.getStatus())
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
  }

  async function restartToUpdate() {
    await getUpdateApi()?.quitAndInstall()
  }

  const isUpdateReady = computed(() => status.value === 'ready')
  const isDownloadingUpdate = computed(() => status.value === 'downloading')

  const updateLabel = computed(() => {
    if (isUpdateReady.value && version.value) {
      return `v${version.value} available`
    }

    if (isDownloadingUpdate.value && version.value) {
      return `Downloading v${version.value}…`
    }

    return null
  })

  return {
    status,
    version,
    progress,
    isUpdateReady,
    isDownloadingUpdate,
    updateLabel,
    initialize,
    dispose,
    restartToUpdate,
  }
})
