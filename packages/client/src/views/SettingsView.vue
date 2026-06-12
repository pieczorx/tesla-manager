<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import ScanProgressComponent from '@/components/ScanProgressComponent.vue'
import { useDashcamStore, useSettingsStore } from '@/stores'

const settingsStore = useSettingsStore()
const dashcamStore = useDashcamStore()
const { scanFolders, isLoading, playbackSettings } = storeToRefs(settingsStore)
const { clips, lastScanAt, scanProgress } = storeToRefs(dashcamStore)


const lastScanLabel = computed(() => {

  if (!lastScanAt.value) {

    return 'Never scanned'

  }

  return new Intl.DateTimeFormat('pl-PL', {

    dateStyle: 'medium',

    timeStyle: 'short',

  }).format(new Date(lastScanAt.value))

})



const isScanning = computed(() => scanProgress.value.status === 'scanning')

const showScanProgress = computed(() => scanProgress.value.status !== 'idle')



async function addFolder() {

  const addedPath = await settingsStore.pickAndAddFolder()

  if (addedPath) {

    await dashcamStore.startScan()

  }

}



async function removeFolder(id: string) {

  await settingsStore.removeFolder(id)

}



async function rescan() {
  await dashcamStore.startScan()
}

async function saveInLeadSeconds(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isNaN(value)) {
    return
  }
  await settingsStore.setPlaybackSettings({
    ...playbackSettings.value,
    inLeadSeconds: value,
  })
}

async function saveOutTrailSeconds(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isNaN(value)) {
    return
  }
  await settingsStore.setPlaybackSettings({
    ...playbackSettings.value,
    outTrailSeconds: value,
  })
}

onMounted(async () => {
  await Promise.all([
    settingsStore.loadScanFolders(),
    settingsStore.loadPlaybackSettings(),
    dashcamStore.loadClips(),
    dashcamStore.loadScanProgress(),
  ])
})
</script>



<template>

  <div class="settings-view">

    <header class="settings-view__header">

      <h1>Settings</h1>

      <p>
        Add folders with TeslaCam recordings and rescan your library. You can choose a specific
        subfolder or a parent folder - scanning always walks subfolders recursively.
      </p>

    </header>



    <section class="settings-view__section">

      <div class="settings-view__section-header">

        <div>

          <h2>Library</h2>

          <p class="settings-view__library-meta">

            {{ clips.length }} clip(s) · Last scan: {{ lastScanLabel }}

          </p>

          <p class="settings-view__section-description">
            Pick any folder that contains TeslaCam event folders (each with an
            <code>event.json</code>). Choose a specific subfolder such as SavedClips, SentryClips, or
            RecentClips, or select a parent folder like the TeslaCam root on your USB drive - all
            matching subfolders are scanned recursively.
          </p>

        </div>

        <div class="settings-view__section-actions">

          <button type="button" class="settings-view__add-button" @click="addFolder">

            <FontAwesomeIcon :icon="['fas', 'folder-plus']" />

            Add folder

          </button>

          <button

            type="button"

            class="settings-view__scan-button"

            :disabled="isScanning"

            @click="rescan"

          >

            <FontAwesomeIcon :icon="['fas', 'arrow-rotate-right']" />

            {{ isScanning ? 'Scanning...' : 'Rescan folders' }}

          </button>

        </div>

      </div>



      <ScanProgressComponent
        v-if="showScanProgress"
        class="settings-view__scan-progress"
        :progress="scanProgress"
      />



      <div v-if="isLoading" class="settings-view__empty">Loading...</div>

      <div v-else-if="scanFolders.length === 0" class="settings-view__empty">

        No folders configured yet. Add a folder with TeslaCam recordings - a specific subfolder or a
        parent folder that contains them.

      </div>

      <ul v-else class="settings-view__list">

        <li v-for="folder in scanFolders" :key="folder.id" class="settings-view__item">

          <div>

            <div class="settings-view__item-label">{{ folder.label }}</div>

            <div class="settings-view__item-path">{{ folder.path }}</div>

          </div>

          <button type="button" class="settings-view__remove-button" @click="removeFolder(folder.id)">

            Remove

          </button>

        </li>

      </ul>

    </section>

    <section class="settings-view__section">
      <div class="settings-view__section-header">
        <div>
          <h2>Playback</h2>
          <p class="settings-view__section-description">
            Control the default in and out points used when reviewing clips. Each clip loops within
            this window around the event timestamp until you override it manually with
            <kbd>I</kbd> and <kbd>O</kbd>.
          </p>
        </div>
      </div>

      <div class="settings-view__fields">
        <label class="settings-view__field">
          <span class="settings-view__field-label">Seconds before event (IN)</span>
          <span class="settings-view__field-help">
            Places the default IN marker this many seconds before the event moment.
          </span>
          <input
            type="number"
            min="0"
            max="600"
            step="1"
            class="settings-view__number-input"
            :value="playbackSettings.inLeadSeconds"
            @change="saveInLeadSeconds"
          />
        </label>

        <label class="settings-view__field">
          <span class="settings-view__field-label">Seconds after event (OUT)</span>
          <span class="settings-view__field-help">
            Places the default OUT marker this many seconds after the event moment.
          </span>
          <input
            type="number"
            min="0"
            max="600"
            step="1"
            class="settings-view__number-input"
            :value="playbackSettings.outTrailSeconds"
            @change="saveOutTrailSeconds"
          />
        </label>
      </div>
    </section>

  </div>

</template>



<style scoped lang="scss">

.settings-view {

  height: 100%;

  overflow: auto;

  padding: 24px;

  display: flex;

  flex-direction: column;

  gap: 20px;

}



.settings-view__header {

  h1 {

    margin: 0 0 8px;

    color: var(--color-text-strong);

  }



  p {

    margin: 0;

    color: var(--color-text-muted);

    max-width: 640px;

    line-height: 1.5;

  }

}



.settings-view__section {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
}



.settings-view__section-header {

  display: flex;

  align-items: flex-start;

  justify-content: space-between;

  gap: 16px;

  margin-bottom: 16px;



  h2 {

    margin: 0 0 4px;

    font-size: 18px;

    color: var(--color-text-strong);

  }

}



.settings-view__library-meta {

  margin: 0 0 8px;

  color: var(--color-text-muted);

  font-size: 13px;

}



.settings-view__section-actions {

  display: flex;

  flex-direction: row;

  flex-wrap: wrap;

  gap: 8px;

  flex-shrink: 0;

}

.settings-view__section-description {
  margin: 0;
  max-width: 640px;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;

  code {
    font-family: inherit;
    font-size: 12px;
    color: var(--color-text-strong);
  }

  kbd {
    display: inline-block;
    padding: 1px 6px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    font-family: inherit;
    font-size: 12px;
    color: var(--color-text-strong);
  }
}

.settings-view__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.settings-view__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-view__field-label {
  font-weight: 600;
  color: var(--color-text-strong);
  font-size: 14px;
}

.settings-view__field-help {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.settings-view__number-input {
  width: 100%;
  max-width: 160px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-strong);
  padding: 8px 12px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;

  &:focus {
    outline: none;
    border-color: var(--color-border-strong);
  }
}



.settings-view__add-button,

.settings-view__remove-button,

.settings-view__scan-button {

  border: none;

  border-radius: 10px;

  padding: 8px 14px;

  cursor: pointer;

  font-weight: 600;

  flex-shrink: 0;

}



.settings-view__scan-button,
.settings-view__add-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-accent);
  color: #ffffff;

  svg {
    font-size: 14px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.settings-view__remove-button {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-strong);

  &:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
}



.settings-view__scan-progress {

  margin-bottom: 16px;

}



.settings-view__empty {

  color: var(--color-text-muted);

  line-height: 1.5;

}



.settings-view__list {

  list-style: none;

  margin: 0;

  padding: 0;

  display: flex;

  flex-direction: column;

  gap: 12px;

}



.settings-view__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}



.settings-view__item-label {

  font-weight: 600;

  color: var(--color-text-strong);

  margin-bottom: 4px;

}



.settings-view__item-path {

  color: var(--color-text-muted);

  font-size: 13px;

  word-break: break-all;

}

</style>


