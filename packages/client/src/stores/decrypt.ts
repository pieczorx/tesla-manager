import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  ConnectionTestResult,
  DecryptAnalysis,
  DecryptJobProgress,
  TeslaAuthStatus,
} from '@/types/electron'

function getApi() {
  if (!window.teslaManager) {
    throw new Error('Tesla Manager API is unavailable outside Electron')
  }
  return window.teslaManager
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  // Electron prefixes IPC errors with "Error invoking remote method '...': Error: "
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export const useDecryptStore = defineStore('decrypt', () => {
  const selectedSources = ref<string[]>([])
  const extraSources = ref<string[]>([])
  const analysis = ref<DecryptAnalysis | null>(null)
  const auth = ref<TeslaAuthStatus>({
    connected: false,
    source: null,
    connectedAt: null,
    loginWindowOpen: false,
    sampleState: 'idle',
  })
  const progress = ref<DecryptJobProgress | null>(null)
  const outputFolder = ref<string | null>(null)
  const copyUnencrypted = ref(true)
  const skipExisting = ref(true)
  const addToLibrary = ref(true)
  const connectionTest = ref<ConnectionTestResult | null>(null)
  const isTestingConnection = ref(false)
  const lastError = ref<string | null>(null)

  let unsubscribeAuth: (() => void) | null = null
  let unsubscribeProgress: (() => void) | null = null
  let initialized = false

  const isAnalyzing = computed(() => progress.value?.status === 'analyzing')
  const isRunning = computed(() => progress.value?.status === 'running')
  const isPausedForAuth = computed(() => progress.value?.status === 'paused-auth')
  const canStart = computed(
    () =>
      !!analysis.value &&
      analysis.value.encryptedFiles > 0 &&
      auth.value.connected &&
      !!outputFolder.value &&
      !isRunning.value &&
      !isAnalyzing.value,
  )

  async function initialize() {
    const api = getApi()
    if (!initialized) {
      initialized = true
      unsubscribeAuth = api.decrypt.onAuthStatus((status) => {
        const wasConnected = auth.value.connected
        auth.value = status
        if (!status.connected) {
          connectionTest.value = null
        } else if (!wasConnected && analysis.value?.encryptedFiles) {
          void testConnection()
        }
      })
      unsubscribeProgress = api.decrypt.onProgress((next) => {
        progress.value = next
      })
    }
    const [authStatus, currentProgress, currentAnalysis, savedOutput] = await Promise.all([
      api.decrypt.getAuthStatus(),
      api.decrypt.getProgress(),
      api.decrypt.getAnalysis(),
      api.decrypt.getOutputFolder(),
    ])
    auth.value = authStatus
    progress.value = currentProgress
    analysis.value = currentAnalysis
    outputFolder.value = outputFolder.value ?? savedOutput
  }

  function dispose() {
    unsubscribeAuth?.()
    unsubscribeProgress?.()
    unsubscribeAuth = null
    unsubscribeProgress = null
    initialized = false
  }

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    lastError.value = null
    try {
      return await action()
    } catch (error) {
      lastError.value = errorMessage(error)
      return null
    }
  }

  async function addExtraSource() {
    const picked = await run(() => getApi().decrypt.pickSourceFolder())
    if (picked && !extraSources.value.includes(picked)) {
      extraSources.value.push(picked)
      selectedSources.value.push(picked)
    }
  }

  function removeExtraSource(folderPath: string) {
    extraSources.value = extraSources.value.filter((item) => item !== folderPath)
    selectedSources.value = selectedSources.value.filter((item) => item !== folderPath)
  }

  async function analyze() {
    connectionTest.value = null
    const result = await run(() => getApi().decrypt.analyze([...selectedSources.value]))
    if (result) {
      analysis.value = result
      if (auth.value.connected && result.encryptedFiles > 0) {
        void testConnection()
      }
    }
  }

  async function openLogin() {
    const status = await run(() => getApi().decrypt.openLogin())
    if (status) {
      auth.value = status
    }
  }

  async function setManualToken(token: string) {
    const status = await run(() => getApi().decrypt.setManualToken(token))
    if (status) {
      auth.value = status
    }
    return !!status
  }

  async function signOut() {
    const status = await run(() => getApi().decrypt.signOut())
    if (status) {
      auth.value = status
    }
  }

  async function testConnection() {
    isTestingConnection.value = true
    try {
      connectionTest.value = await run(() => getApi().decrypt.testConnection())
    } finally {
      isTestingConnection.value = false
    }
  }

  async function pickOutputFolder() {
    const picked = await run(() => getApi().decrypt.pickOutputFolder())
    if (picked) {
      outputFolder.value = picked
    }
  }

  async function start() {
    if (!outputFolder.value) {
      return
    }
    await run(() =>
      getApi().decrypt.start({
        outputFolder: outputFolder.value!,
        copyUnencrypted: copyUnencrypted.value,
        skipExisting: skipExisting.value,
        addToLibrary: addToLibrary.value,
      }),
    )
  }

  async function resume() {
    await run(() => getApi().decrypt.resume())
  }

  async function cancel() {
    await run(() => getApi().decrypt.cancel())
  }

  async function revealOutput(folderPath: string) {
    await run(() => getApi().decrypt.revealOutput(folderPath))
  }

  async function replaceSourcesInLibrary() {
    if (!analysis.value) {
      return
    }
    await run(() => getApi().decrypt.replaceSourcesInLibrary(analysis.value!.sourcePaths))
  }

  return {
    selectedSources,
    extraSources,
    analysis,
    auth,
    progress,
    outputFolder,
    copyUnencrypted,
    skipExisting,
    addToLibrary,
    connectionTest,
    isTestingConnection,
    lastError,
    isAnalyzing,
    isRunning,
    isPausedForAuth,
    canStart,
    initialize,
    dispose,
    addExtraSource,
    removeExtraSource,
    analyze,
    openLogin,
    setManualToken,
    signOut,
    testConnection,
    pickOutputFolder,
    start,
    resume,
    cancel,
    revealOutput,
    replaceSourcesInLibrary,
  }
})
