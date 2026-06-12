import { computed, ref } from 'vue'
import type { ExportDialogPhase } from '@/components/player/ExportChoiceDialog.vue'
import type { ExportPreparedResult } from '@/types/electron'

function getApi() {
  if (!window.teslaManager) {
    throw new Error('Tesla Manager API is unavailable outside Electron')
  }
  return window.teslaManager
}

const exportingClipId = ref<string | null>(null)
const exportProgress = ref(0)
const exportError = ref<string | null>(null)
const preparedExport = ref<ExportPreparedResult | null>(null)
const showExportDialog = ref(false)
const exportDialogPhase = ref<ExportDialogPhase>('choose')
const exportActionProgress = ref(0)
const savedExportPath = ref<string | null>(null)
const exportDialogFileName = ref('')

let unsubscribeExportProgress: (() => void) | null = null

function stopExportProgressListener() {
  unsubscribeExportProgress?.()
  unsubscribeExportProgress = null
}

function startExportProgressListener(onProgress: (progress: number) => void) {
  stopExportProgressListener()
  unsubscribeExportProgress = getApi().dashcam.onExportProgress((payload) => {
    onProgress(payload.progress)
  })
}

function resetExportDialog() {
  showExportDialog.value = false
  exportDialogPhase.value = 'choose'
  exportActionProgress.value = 0
  savedExportPath.value = null
  exportDialogFileName.value = ''
}

function clearPreparedExport() {
  if (preparedExport.value) {
    void getApi().dashcam.discardExport(preparedExport.value.sessionId)
    preparedExport.value = null
  }
}

function finishExportRun() {
  stopExportProgressListener()
  exportingClipId.value = null
  exportProgress.value = 0
}

export function useClipExport() {
  const revealLabel = computed(() => {
    const platform = window.teslaManager?.platform
    if (platform === 'darwin') {
      return 'Show in Finder'
    }
    if (platform === 'win32') {
      return 'Show in Explorer'
    }
    return 'Show in file manager'
  })

  function isClipExporting(clipId: string | null | undefined): boolean {
    return exportingClipId.value !== null && exportingClipId.value === clipId
  }

  function isAnotherClipExporting(clipId: string | null | undefined): boolean {
    return exportingClipId.value !== null && exportingClipId.value !== clipId
  }

  function shouldShowExportError(clipId: string | null | undefined): boolean {
    if (!exportError.value) {
      return false
    }
    return isClipExporting(clipId) || showExportDialog.value
  }

  async function startExport(options: {
    clipId: string
    cameraId: string | null
    inOffsetSeconds: number
    outOffsetSeconds: number
    playbackRate: number
  }) {
    if (exportingClipId.value !== null) {
      return
    }

    exportError.value = null
    clearPreparedExport()
    exportingClipId.value = options.clipId
    exportProgress.value = 0

    startExportProgressListener((progress) => {
      exportProgress.value = progress
    })

    try {
      const result = await getApi().dashcam.prepareExport(options)
      if ('cancelled' in result) {
        return
      }
      preparedExport.value = result
      exportDialogFileName.value = result.suggestedFileName
      exportDialogPhase.value = 'choose'
      exportActionProgress.value = 0
      showExportDialog.value = true
    } catch (error) {
      exportError.value = error instanceof Error ? error.message : 'Export failed'
    } finally {
      finishExportRun()
    }
  }

  async function cancelExport(clipId: string) {
    if (!isClipExporting(clipId)) {
      return
    }

    exportError.value = null
    await getApi().dashcam.cancelExport(clipId)
  }

  function closeExportDialog() {
    if (exportDialogPhase.value === 'choose') {
      clearPreparedExport()
    }
    resetExportDialog()
  }

  async function savePreparedExport() {
    if (!preparedExport.value) {
      return
    }

    const payload = preparedExport.value
    exportDialogPhase.value = 'saving'
    exportActionProgress.value = 0
    exportError.value = null
    startExportProgressListener((progress) => {
      exportActionProgress.value = progress
    })

    try {
      const result = await getApi().dashcam.saveExport({
        tempFilePath: payload.tempFilePath,
        suggestedFileName: payload.suggestedFileName,
        sessionId: payload.sessionId,
      })
      if (result.saved && result.filePath) {
        preparedExport.value = null
        savedExportPath.value = result.filePath
        exportDialogPhase.value = 'saved'
      } else {
        exportDialogPhase.value = 'choose'
      }
    } catch (error) {
      exportError.value = error instanceof Error ? error.message : 'Save failed'
      exportDialogPhase.value = 'choose'
    } finally {
      stopExportProgressListener()
    }
  }

  async function copyPreparedExport() {
    if (!preparedExport.value) {
      return
    }

    const payload = preparedExport.value
    exportDialogPhase.value = 'copying'
    exportActionProgress.value = 0
    exportError.value = null
    startExportProgressListener((progress) => {
      exportActionProgress.value = progress
    })

    try {
      await getApi().dashcam.copyExportToClipboard({
        tempFilePath: payload.tempFilePath,
        suggestedFileName: payload.suggestedFileName,
        sessionId: payload.sessionId,
      })
      preparedExport.value = null
      resetExportDialog()
    } catch (error) {
      exportError.value = error instanceof Error ? error.message : 'Clipboard copy failed'
      exportDialogPhase.value = 'choose'
    } finally {
      stopExportProgressListener()
    }
  }

  function revealSavedExport() {
    if (!savedExportPath.value) {
      return
    }
    void getApi().dashcam.revealExportedFile(savedExportPath.value)
  }

  return {
    exportingClipId,
    exportProgress,
    exportError,
    showExportDialog,
    exportDialogPhase,
    exportActionProgress,
    exportDialogFileName,
    revealLabel,
    isClipExporting,
    isAnotherClipExporting,
    shouldShowExportError,
    startExport,
    cancelExport,
    closeExportDialog,
    savePreparedExport,
    copyPreparedExport,
    revealSavedExport,
  }
}
