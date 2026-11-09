<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores'
import { useDecryptStore } from '@/stores/decrypt'
import { RouteName } from '@/router/routeName'

const router = useRouter()
const settingsStore = useSettingsStore()
const decryptStore = useDecryptStore()
const { scanFolders } = storeToRefs(settingsStore)
const {
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
} = storeToRefs(decryptStore)

const manualToken = ref('')
const showAllFailures = ref(false)
const sourcesReplaced = ref(false)

const sourceOptions = computed(() => [
  ...scanFolders.value.map((folder) => ({ path: folder.path, label: folder.label, isExtra: false })),
  ...extraSources.value.map((folderPath) => ({
    path: folderPath,
    label: folderPath.split(/[\\/]/).filter(Boolean).pop() ?? folderPath,
    isExtra: true,
  })),
])

const analysisIsStale = computed(() => {
  if (!analysis.value) {
    return false
  }
  const analyzed = [...analysis.value.sourcePaths].map((item) => item.toLowerCase()).sort().join('|')
  const selected = [...selectedSources.value].map((item) => item.toLowerCase()).sort().join('|')
  return analyzed !== selected
})

const progressPercent = computed(() => {
  const value = progress.value
  if (!value || value.bytesTotal === 0) {
    return 0
  }
  return Math.min(100, Math.round((value.bytesDone / value.bytesTotal) * 100))
})

const jobVisible = computed(() => {
  const status = progress.value?.status
  return status === 'running' || status === 'paused-auth' || status === 'complete' || status === 'cancelled' ||
    (status === 'error' && !!progress.value?.startedAt)
})

const visibleFailures = computed(() => {
  const failures = progress.value?.failures ?? []
  return showAllFailures.value ? failures : failures.slice(0, 5)
})

const authLabel = computed(() => {
  if (auth.value.connected) {
    const time = auth.value.connectedAt
      ? new Intl.DateTimeFormat('pl-PL', { timeStyle: 'short' }).format(new Date(auth.value.connectedAt))
      : ''
    return auth.value.source === 'manual' ? `Connected with a pasted token ${time}` : `Connected ${time}`
  }
  if (auth.value.loginWindowOpen) {
    return 'Waiting for you to sign in in the Tesla window...'
  }
  return 'Not connected'
})

const sampleHint = computed(() => {
  if (!auth.value.loginWindowOpen || auth.value.connected) {
    return null
  }
  switch (auth.value.sampleState) {
    case 'waiting':
      return 'After you sign in, Tesla Manager will open one of your encrypted clips in that window automatically.'
    case 'sent':
      return 'A sample clip was handed to the Tesla page. This window should connect within a few seconds.'
    case 'manual':
      return 'Drag any encrypted .mp4 from your recordings into the Tesla window to finish connecting.'
    default:
      return null
  }
})

const startBlockers = computed(() => {
  const blockers: string[] = []
  if (!analysis.value) {
    blockers.push('Analyze your recordings (step 1).')
  } else if (analysis.value.encryptedFiles === 0) {
    blockers.push('No encrypted recordings were found in the selected folders.')
  }
  if (!auth.value.connected) {
    blockers.push('Connect your Tesla account (step 2).')
  }
  if (!outputFolder.value) {
    blockers.push('Choose where to save the decrypted copy (step 3).')
  }
  return blockers
})

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function shortPath(filePath: string) {
  const parts = filePath.split(/[\\/]/)
  return parts.length > 3 ? `…\\${parts.slice(-3).join('\\')}` : filePath
}

function toggleSource(folderPath: string, checked: boolean) {
  if (checked) {
    if (!selectedSources.value.includes(folderPath)) {
      selectedSources.value = [...selectedSources.value, folderPath]
    }
  } else {
    selectedSources.value = selectedSources.value.filter((item) => item !== folderPath)
  }
}

async function saveManualToken() {
  if (await decryptStore.setManualToken(manualToken.value)) {
    manualToken.value = ''
  }
}

async function replaceSources() {
  await decryptStore.replaceSourcesInLibrary()
  await settingsStore.loadScanFolders()
  sourcesReplaced.value = true
}

watch(
  () => progress.value?.status,
  async (status) => {
    if (status === 'complete') {
      sourcesReplaced.value = false
      await settingsStore.loadScanFolders()
    }
  },
)

onMounted(async () => {
  await Promise.all([settingsStore.loadScanFolders(), decryptStore.initialize()])
  if (selectedSources.value.length === 0) {
    selectedSources.value = analysis.value?.sourcePaths.length
      ? [...analysis.value.sourcePaths]
      : scanFolders.value.map((folder) => folder.path)
  }
})
</script>

<template>
  <div class="decrypt-view">
    <header class="decrypt-view__header">
      <h1>Decrypt recordings</h1>
      <p>
        Since software update <strong>2026.20</strong>, Tesla encrypts Dashcam and Sentry Mode recordings on the USB
        drive by default. The files still end in <code>.mp4</code>, but no player can open them until they are
        decrypted. This screen turns them back into normal videos you can play, trim and export here.
      </p>
    </header>

    <section class="decrypt-view__info">
      <div class="decrypt-view__info-item">
        <FontAwesomeIcon :icon="['fas', 'shield-halved']" />
        <div>
          <strong>Your videos never leave this computer.</strong>
          Decryption runs locally. For each file only its small key header (file id, VIN, key id, timestamp and the
          wrapped key) is sent to Tesla to get that file's key - the same request
          <code>dashcam.tesla.com</code> makes in your browser.
        </div>
      </div>
      <div class="decrypt-view__info-item">
        <FontAwesomeIcon :icon="['fas', 'circle-info']" />
        <div>
          <strong>What you need:</strong> the Tesla account the car was linked to when the clips were recorded,
          an internet connection, and enough free disk space for a decrypted copy. The originals are never changed.
        </div>
      </div>
      <div class="decrypt-view__info-item">
        <FontAwesomeIcon :icon="['fas', 'lock-open']" />
        <div>
          <strong>Don't want new clips encrypted?</strong> In the car open
          <em>Controls › Safety › Encrypt Dashcam Recordings</em> and switch it off. Clips that are already on the
          drive stay encrypted and still need this screen.
        </div>
      </div>
    </section>

    <div v-if="lastError" class="decrypt-view__error">
      <FontAwesomeIcon :icon="['fas', 'triangle-exclamation']" />
      {{ lastError }}
    </div>

    <!-- Step 1 -->
    <section class="decrypt-view__step" :class="{ 'decrypt-view__step--done': analysis && !analysisIsStale && analysis.encryptedFiles > 0 }">
      <div class="decrypt-view__step-header">
        <span class="decrypt-view__step-number">1</span>
        <div>
          <h2>Choose the recordings</h2>
          <p>
            Plug in the USB drive from the car (or use a copy of it) and tick the folders to decrypt. Selecting the
            <code>TeslaCam</code> folder covers SavedClips, SentryClips and RecentClips at once. Then click
            <em>Analyze</em> - only file headers are read, so this is quick.
          </p>
        </div>
      </div>

      <div v-if="sourceOptions.length === 0" class="decrypt-view__muted">
        No library folders yet. Add the folder with your recordings below.
      </div>
      <ul v-else class="decrypt-view__sources">
        <li v-for="option in sourceOptions" :key="option.path" class="decrypt-view__source">
          <label>
            <input
              type="checkbox"
              :checked="selectedSources.includes(option.path)"
              :disabled="isRunning || isAnalyzing"
              @change="toggleSource(option.path, ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <span class="decrypt-view__source-label">{{ option.label }}</span>
              <span class="decrypt-view__source-path">{{ option.path }}</span>
            </span>
          </label>
          <button
            v-if="option.isExtra"
            type="button"
            class="decrypt-view__link-button"
            :disabled="isRunning"
            @click="decryptStore.removeExtraSource(option.path)"
          >
            Remove
          </button>
        </li>
      </ul>

      <div class="decrypt-view__actions">
        <button type="button" class="decrypt-view__secondary" :disabled="isRunning || isAnalyzing" @click="decryptStore.addExtraSource()">
          <FontAwesomeIcon :icon="['fas', 'folder-plus']" />
          Add another folder
        </button>
        <button
          type="button"
          class="decrypt-view__primary"
          :disabled="selectedSources.length === 0 || isRunning || isAnalyzing"
          @click="decryptStore.analyze()"
        >
          <FontAwesomeIcon :icon="['fas', isAnalyzing ? 'spinner' : 'magnifying-glass']" :spin="isAnalyzing" />
          {{ isAnalyzing ? 'Analyzing...' : analysis ? 'Analyze again' : 'Analyze' }}
        </button>
      </div>

      <div v-if="isAnalyzing && progress?.message" class="decrypt-view__muted decrypt-view__analyzing">
        {{ progress.message }}
        <span v-if="progress.currentFile" class="decrypt-view__source-path">{{ progress.currentFile }}</span>
      </div>

      <div v-if="analysis && !isAnalyzing" class="decrypt-view__summary">
        <div v-if="analysisIsStale" class="decrypt-view__warning">
          The folder selection changed since the last analysis - click <em>Analyze again</em>.
        </div>
        <div class="decrypt-view__stats">
          <div class="decrypt-view__stat">
            <span class="decrypt-view__stat-value">{{ analysis.encryptedFiles }}</span>
            <span class="decrypt-view__stat-label">encrypted files ({{ formatBytes(analysis.encryptedBytes) }})</span>
          </div>
          <div class="decrypt-view__stat">
            <span class="decrypt-view__stat-value">{{ analysis.plainVideoFiles }}</span>
            <span class="decrypt-view__stat-label">already playable videos</span>
          </div>
          <div class="decrypt-view__stat">
            <span class="decrypt-view__stat-value">{{ analysis.eventFolders }}</span>
            <span class="decrypt-view__stat-label">folders with recordings</span>
          </div>
          <div class="decrypt-view__stat">
            <span class="decrypt-view__stat-value">{{ analysis.invalidFiles.length }}</span>
            <span class="decrypt-view__stat-label">damaged files</span>
          </div>
        </div>
        <p v-if="analysis.vins.length" class="decrypt-view__muted">
          Recorded by {{ analysis.vins.length === 1 ? 'vehicle' : 'vehicles' }}
          <strong v-for="(vin, index) in analysis.vins" :key="vin">{{ vin }}{{ index < analysis.vins.length - 1 ? ', ' : '' }}</strong>.
          Sign in with the Tesla account that owned {{ analysis.vins.length === 1 ? 'this car' : 'these cars' }} when the clips were recorded.
        </p>
        <p v-if="analysis.keylessFiles" class="decrypt-view__muted">
          {{ analysis.keylessFiles }} small file(s) such as <code>event.json</code> and <code>thumb.png</code> are encrypted
          without key information, so Tesla can't provide a key for them. They are skipped - the clips still load and
          play, only without the saved location, trigger reason and thumbnail.
        </p>
        <p v-if="analysis.encryptedFiles === 0" class="decrypt-view__ok">
          <FontAwesomeIcon :icon="['fas', 'circle-check']" />
          Nothing to decrypt - all recordings in these folders are already playable.
        </p>
        <details v-if="analysis.invalidFiles.length" class="decrypt-view__details">
          <summary>Show damaged files</summary>
          <p class="decrypt-view__muted">
            These files were cut off while the car was writing them (for example when it went to sleep or the drive
            was removed). They cannot be decrypted and will be skipped.
          </p>
          <ul>
            <li v-for="issue in analysis.invalidFiles.slice(0, 50)" :key="issue.path">
              <span class="decrypt-view__source-path">{{ issue.path }}</span> - {{ issue.reason }}
            </li>
          </ul>
        </details>
      </div>
    </section>

    <!-- Step 2 -->
    <section class="decrypt-view__step" :class="{ 'decrypt-view__step--done': auth.connected }">
      <div class="decrypt-view__step-header">
        <span class="decrypt-view__step-number">2</span>
        <div>
          <h2>Connect your Tesla account</h2>
          <p>Tesla hands out decryption keys only to the car's owner, so you need to sign in once per session.</p>
        </div>
        <span class="decrypt-view__status" :class="{ 'decrypt-view__status--ok': auth.connected, 'decrypt-view__status--wait': auth.loginWindowOpen && !auth.connected }">
          {{ authLabel }}
        </span>
      </div>

      <ol class="decrypt-view__instructions">
        <li>Click <strong>Sign in with Tesla</strong>. A window with Tesla's official viewer, <code>dashcam.tesla.com</code>, opens.</li>
        <li>Sign in with your Tesla email and password, and enter the verification code if Tesla asks for one. Your password goes only to Tesla - this app never sees it.</li>
        <li>
          Tesla Manager then opens one of your encrypted clips in that window by itself, which lets it pick up the
          signed-in session. If nothing happens after about 10 seconds, drag any encrypted <code>.mp4</code> from your
          drive into the Tesla window.
        </li>
        <li>The window closes on its own and the status above turns to <em>Connected</em>.</li>
      </ol>

      <p v-if="sampleHint" class="decrypt-view__hint">
        <FontAwesomeIcon :icon="['fas', 'circle-info']" />
        {{ sampleHint }}
      </p>
      <p v-if="!analysis?.samplePath && !auth.connected" class="decrypt-view__muted">
        Tip: run step 1 first - then the app can hand Tesla a sample clip automatically and you won't have to drag one.
      </p>

      <div class="decrypt-view__actions">
        <button type="button" class="decrypt-view__primary" @click="decryptStore.openLogin()">
          <FontAwesomeIcon :icon="['fas', 'right-to-bracket']" />
          {{ auth.connected ? 'Reconnect' : auth.loginWindowOpen ? 'Show Tesla window' : 'Sign in with Tesla' }}
        </button>
        <button
          v-if="auth.connected && analysis?.encryptedFiles"
          type="button"
          class="decrypt-view__secondary"
          :disabled="isTestingConnection"
          @click="decryptStore.testConnection()"
        >
          <FontAwesomeIcon :icon="['fas', isTestingConnection ? 'spinner' : 'vial']" :spin="isTestingConnection" />
          Test with one of my clips
        </button>
        <button type="button" class="decrypt-view__link-button" @click="decryptStore.signOut()">
          Sign out of Tesla
        </button>
      </div>

      <p
        v-if="connectionTest"
        class="decrypt-view__test"
        :class="connectionTest.ok ? 'decrypt-view__test--ok' : 'decrypt-view__test--error'"
      >
        <FontAwesomeIcon :icon="['fas', connectionTest.ok ? 'circle-check' : 'triangle-exclamation']" />
        {{ connectionTest.message }}
      </p>

      <details class="decrypt-view__details">
        <summary>Advanced: paste an access token instead</summary>
        <p class="decrypt-view__muted">
          Use this only if the sign-in window does not work for you. In Chrome or Edge open
          <code>dashcam.tesla.com</code> and sign in, press <kbd>F12</kbd> and open the <em>Network</em> tab, drop any
          encrypted clip onto the page, click a request whose name contains <code>/api/1/</code>, and in
          <em>Request Headers</em> copy the value of <code>Authorization</code> (the long text after
          <code>Bearer</code>). Treat it like a password - it gives access to your Tesla dashcam keys until it
          expires. It is kept in memory only and forgotten when the app closes.
        </p>
        <div class="decrypt-view__token-row">
          <input
            v-model="manualToken"
            type="password"
            class="decrypt-view__input"
            placeholder="Paste the token (with or without 'Bearer')"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="decrypt-view__secondary" :disabled="!manualToken.trim()" @click="saveManualToken">
            Use token
          </button>
        </div>
      </details>
    </section>

    <!-- Step 3 -->
    <section class="decrypt-view__step" :class="{ 'decrypt-view__step--done': !!outputFolder }">
      <div class="decrypt-view__step-header">
        <span class="decrypt-view__step-number">3</span>
        <div>
          <h2>Choose where to save the decrypted copy</h2>
          <p>
            Pick a folder on your computer (not on the car's USB drive). The folder structure is kept, so
            <code>TeslaCam\SavedClips\…</code> ends up in the same place inside it. Expect it to need about
            {{ analysis ? formatBytes(analysis.encryptedBytes + (copyUnencrypted ? analysis.totalBytes - analysis.encryptedBytes : 0)) : 'as much space as the recordings' }}.
          </p>
        </div>
      </div>

      <div class="decrypt-view__output">
        <span v-if="outputFolder" class="decrypt-view__source-path">{{ outputFolder }}</span>
        <span v-else class="decrypt-view__muted">No folder chosen</span>
        <button type="button" class="decrypt-view__secondary" :disabled="isRunning" @click="decryptStore.pickOutputFolder()">
          <FontAwesomeIcon :icon="['fas', 'folder-open']" />
          {{ outputFolder ? 'Change' : 'Choose folder' }}
        </button>
      </div>

      <div class="decrypt-view__options">
        <label>
          <input v-model="copyUnencrypted" type="checkbox" :disabled="isRunning" />
          <span>
            Also copy recordings that are not encrypted
            <span class="decrypt-view__muted">so the new folder is a complete copy of the drive</span>
          </span>
        </label>
        <label>
          <input v-model="skipExisting" type="checkbox" :disabled="isRunning" />
          <span>
            Skip files that were already decrypted
            <span class="decrypt-view__muted">handy when you decrypt the same drive again after new recordings</span>
          </span>
        </label>
        <label>
          <input v-model="addToLibrary" type="checkbox" :disabled="isRunning" />
          <span>
            Add the decrypted folder to the library when finished
          </span>
        </label>
      </div>
    </section>

    <!-- Step 4 -->
    <section class="decrypt-view__step">
      <div class="decrypt-view__step-header">
        <span class="decrypt-view__step-number">4</span>
        <div>
          <h2>Decrypt</h2>
          <p>
            Keep the app open and the drive connected until it finishes. You can cancel at any time - files that are
            already done are kept, and running it again continues where it stopped.
          </p>
        </div>
      </div>

      <ul v-if="startBlockers.length && !jobVisible" class="decrypt-view__blockers">
        <li v-for="blocker in startBlockers" :key="blocker">{{ blocker }}</li>
      </ul>

      <div class="decrypt-view__actions">
        <button v-if="!isRunning && !isPausedForAuth" type="button" class="decrypt-view__primary" :disabled="!canStart" @click="decryptStore.start()">
          <FontAwesomeIcon :icon="['fas', 'unlock-keyhole']" />
          Start decrypting
        </button>
        <button v-if="isPausedForAuth || (progress?.status === 'error' && progress.startedAt)" type="button" class="decrypt-view__primary" :disabled="!auth.connected" @click="decryptStore.resume()">
          <FontAwesomeIcon :icon="['fas', 'play']" />
          Resume
        </button>
        <button v-if="isRunning || isPausedForAuth" type="button" class="decrypt-view__secondary" @click="decryptStore.cancel()">
          Cancel
        </button>
      </div>

      <div v-if="jobVisible && progress" class="decrypt-view__job" :class="`decrypt-view__job--${progress.status}`">
        <div class="decrypt-view__job-header">
          <span>{{ progress.message }}</span>
          <span class="decrypt-view__job-percent">{{ progressPercent }}%</span>
        </div>
        <div class="decrypt-view__bar"><div class="decrypt-view__bar-fill" :style="{ width: `${progressPercent}%` }" /></div>
        <div class="decrypt-view__job-counts">
          {{ progress.processedFiles }} / {{ progress.totalFiles }} files ·
          {{ progress.decrypted }} decrypted · {{ progress.copied }} copied · {{ progress.skipped }} skipped ·
          <span :class="{ 'decrypt-view__failed': progress.failed > 0 }">{{ progress.failed }} failed</span>
          <template v-if="progress.unavailable"> · {{ progress.unavailable }} without a key (event.json / thumb.png)</template>
          · {{ formatBytes(progress.bytesDone) }} of {{ formatBytes(progress.bytesTotal) }}
        </div>
        <div v-if="progress.currentFile && isRunning" class="decrypt-view__source-path">{{ shortPath(progress.currentFile) }}</div>

        <p v-if="isPausedForAuth" class="decrypt-view__warning">
          Tesla ended the session. Click <em>Reconnect</em> in step 2 (you will usually not need to type your
          password again), then click <em>Resume</em>.
        </p>

        <div v-if="progress.status === 'complete'" class="decrypt-view__done">
          <p class="decrypt-view__ok">
            <FontAwesomeIcon :icon="['fas', 'circle-check']" />
            Done. The decrypted recordings are in
            <template v-for="(root, index) in progress.outputRoots" :key="root">
              <code>{{ root }}</code>{{ index < progress.outputRoots.length - 1 ? ', ' : '' }}
            </template>.
          </p>
          <div class="decrypt-view__actions">
            <button type="button" class="decrypt-view__primary" @click="router.push({ name: RouteName.Dashcam })">
              <FontAwesomeIcon :icon="['fas', 'video']" />
              Open library
            </button>
            <button
              v-for="root in progress.outputRoots"
              :key="root"
              type="button"
              class="decrypt-view__secondary"
              @click="decryptStore.revealOutput(root)"
            >
              <FontAwesomeIcon :icon="['fas', 'folder-open']" />
              Show in Explorer
            </button>
            <button
              v-if="addToLibrary && !sourcesReplaced && analysis && scanFolders.some((folder) => analysis!.sourcePaths.some((source) => source.toLowerCase() === folder.path.toLowerCase()))"
              type="button"
              class="decrypt-view__secondary"
              @click="replaceSources"
            >
              Hide the encrypted originals from the library
            </button>
          </div>
          <p v-if="sourcesReplaced" class="decrypt-view__muted">
            The encrypted folders were removed from the library (nothing was deleted from disk).
          </p>
        </div>

        <details v-if="progress.failures.length" class="decrypt-view__details" open>
          <summary>{{ progress.failed }} file(s) could not be decrypted</summary>
          <ul>
            <li v-for="issue in visibleFailures" :key="issue.path">
              <span class="decrypt-view__source-path">{{ shortPath(issue.path) }}</span> - {{ issue.reason }}
            </li>
          </ul>
          <button
            v-if="progress.failures.length > 5"
            type="button"
            class="decrypt-view__link-button"
            @click="showAllFailures = !showAllFailures"
          >
            {{ showAllFailures ? 'Show fewer' : `Show all ${progress.failures.length}` }}
          </button>
        </details>
      </div>
    </section>

    <section class="decrypt-view__step decrypt-view__troubleshooting">
      <h2>Troubleshooting</h2>
      <dl>
        <dt>Tesla refuses the key for some or all files</dt>
        <dd>
          You are signed in with an account that did not own the car when those clips were recorded (for example a
          driver profile or a car you bought or sold). Sign out of Tesla in step 2 and sign in with the owner's account.
        </dd>
        <dt>"Decrypted data is not a video"</dt>
        <dd>The key did not match the file, usually because the file is damaged. Copy it from the drive again and retry.</dd>
        <dt>"File is truncated"</dt>
        <dd>The car stopped writing that file halfway (power-off, drive pulled out). Such files cannot be recovered.</dd>
        <dt>The Tesla window stays blank or keeps asking to sign in</dt>
        <dd>
          Check your internet connection, click <em>Sign out of Tesla</em> and try again. As a last resort, use the
          advanced token option in step 2.
        </dd>
        <dt>The session expired in the middle</dt>
        <dd>That's normal for long runs. Click <em>Reconnect</em>, then <em>Resume</em> - nothing is lost.</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped lang="scss">
.decrypt-view {
  height: 100%;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;

  code,
  kbd {
    font-family: inherit;
    font-size: 12px;
    color: var(--color-text-strong);
    background: var(--color-bg-soft);
    border-radius: 4px;
    padding: 0 4px;
  }

  kbd {
    border: 1px solid var(--color-border);
  }
}

.decrypt-view__header {
  h1 {
    margin: 0 0 8px;
    color: var(--color-text-strong);
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    max-width: 720px;
    line-height: 1.5;
  }
}

.decrypt-view__info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.decrypt-view__info-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--color-bg-soft);
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);

  svg {
    margin-top: 3px;
    color: var(--color-text-strong);
    flex-shrink: 0;
  }

  strong {
    color: var(--color-text-strong);
  }
}

.decrypt-view__error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  font-size: 14px;
}

.decrypt-view__step {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;

  h2 {
    margin: 0 0 4px;
    font-size: 18px;
    color: var(--color-text-strong);
  }

  &--done .decrypt-view__step-number {
    background: var(--color-success);
    border-color: var(--color-success);
    color: #ffffff;
  }
}

.decrypt-view__step-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;

  > div {
    flex: 1;
  }

  p {
    margin: 0;
    max-width: 720px;
    color: var(--color-text-muted);
    font-size: 13px;
    line-height: 1.5;
  }
}

.decrypt-view__step-number {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--color-border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text-strong);
}

.decrypt-view__status {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);

  &--ok {
    border-color: var(--color-success);
    color: var(--color-success);
  }

  &--wait {
    border-color: var(--color-warning);
    color: var(--color-warning);
  }
}

.decrypt-view__sources {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.decrypt-view__source {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);

  label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    min-width: 0;

    > span {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
  }

  input {
    margin-top: 3px;
  }
}

.decrypt-view__source-label {
  font-weight: 600;
  color: var(--color-text-strong);
}

.decrypt-view__source-path {
  color: var(--color-text-muted);
  font-size: 12px;
  word-break: break-all;
}

.decrypt-view__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.decrypt-view__primary,
.decrypt-view__secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 600;

  svg {
    font-size: 14px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.decrypt-view__primary {
  border: 1px solid var(--color-border-strong);
  background: var(--color-accent);
  color: #ffffff;
}

.decrypt-view__secondary {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-strong);

  &:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }
}

.decrypt-view__link-button {
  border: none;
  background: transparent;
  padding: 4px 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;

  &:hover:not(:disabled) {
    color: var(--color-text-strong);
  }
}

.decrypt-view__muted {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.decrypt-view__analyzing {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.decrypt-view__summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.decrypt-view__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.decrypt-view__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--color-bg-soft);
}

.decrypt-view__stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-strong);
  font-variant-numeric: tabular-nums;
}

.decrypt-view__stat-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.decrypt-view__ok,
.decrypt-view__hint,
.decrypt-view__test {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.decrypt-view__ok,
.decrypt-view__test--ok {
  color: var(--color-success);
}

.decrypt-view__test--error,
.decrypt-view__failed {
  color: var(--color-danger);
}

.decrypt-view__hint {
  color: var(--color-text);
}

.decrypt-view__warning {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-warning);
  color: var(--color-text-strong);
  font-size: 13px;
  line-height: 1.5;
}

.decrypt-view__instructions {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  max-width: 760px;
}

.decrypt-view__details {
  font-size: 13px;
  color: var(--color-text);

  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--color-text-strong);
  }

  p {
    margin: 8px 0;
    max-width: 760px;
  }

  ul {
    margin: 8px 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}

.decrypt-view__token-row {
  display: flex;
  gap: 8px;
}

.decrypt-view__input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-strong);
  padding: 8px 12px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: var(--color-border-strong);
  }
}

.decrypt-view__output {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.decrypt-view__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-strong);

  label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;

    > span {
      display: flex;
      flex-direction: column;
    }
  }

  input {
    margin-top: 4px;
  }

  .decrypt-view__muted {
    font-size: 12px;
  }
}

.decrypt-view__blockers {
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.decrypt-view__job {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border);

  &--complete {
    border-color: var(--color-success);
  }

  &--error {
    border-color: var(--color-danger);
  }

  &--paused-auth {
    border-color: var(--color-warning);
  }
}

.decrypt-view__job-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
  color: var(--color-text-strong);
  font-size: 14px;
}

.decrypt-view__job-percent {
  font-variant-numeric: tabular-nums;
}

.decrypt-view__bar {
  height: 8px;
  border-radius: 999px;
  background: var(--color-bg-soft);
  overflow: hidden;
}

.decrypt-view__bar-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.2s ease;
}

.decrypt-view__job-counts {
  font-size: 12px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.decrypt-view__done {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.decrypt-view__troubleshooting {
  dl {
    margin: 0;
    display: grid;
    gap: 4px 0;
    font-size: 13px;
    line-height: 1.5;
  }

  dt {
    margin-top: 8px;
    font-weight: 600;
    color: var(--color-text-strong);
  }

  dd {
    margin: 0;
    color: var(--color-text-muted);
    max-width: 760px;
  }
}
</style>
