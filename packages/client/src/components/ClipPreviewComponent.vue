<script setup lang="ts">
import { computed } from 'vue'
import type { DashcamClip } from '@/types/electron'

const props = defineProps<{
  clip: DashcamClip | null
  thumbnailUrl?: string | null
}>()

const formattedTimestamp = computed(() => {
  if (!props.clip) {
    return null
  }
  const date = new Date(props.clip.timestamp)
  if (Number.isNaN(date.getTime())) {
    return props.clip.timestamp
  }
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(date)
})
</script>

<template>
  <section class="preview">
    <div v-if="!clip" class="preview__empty">
      <h2>Select a clip</h2>
      <p>Choose an event from the list to see details.</p>
    </div>

    <template v-else>
      <div class="preview__hero">
        <img v-if="thumbnailUrl" :src="thumbnailUrl" alt="" class="preview__thumb" />
        <div v-else class="preview__thumb preview__thumb--placeholder">No thumbnail</div>
      </div>

      <div class="preview__details">
        <h2>{{ clip.folderName }}</h2>
        <dl>
          <div>
            <dt>Timestamp</dt>
            <dd>{{ formattedTimestamp }}</dd>
          </div>
          <div v-if="clip.city">
            <dt>City</dt>
            <dd>{{ clip.city }}</dd>
          </div>
          <div v-if="clip.latitude !== null && clip.longitude !== null">
            <dt>Coordinates</dt>
            <dd>{{ clip.latitude }}, {{ clip.longitude }}</dd>
          </div>
          <div v-if="clip.reason">
            <dt>Reason</dt>
            <dd>{{ clip.reason }}</dd>
          </div>
          <div v-if="clip.clipCategory">
            <dt>Category</dt>
            <dd>{{ clip.clipCategory }}</dd>
          </div>
          <div>
            <dt>Folder</dt>
            <dd class="preview__path">{{ clip.folderPath }}</dd>
          </div>
          <div>
            <dt>Video files</dt>
            <dd>
              <ul>
                <li v-for="file in clip.videoFiles" :key="file">{{ file.split(/[\\/]/).pop() }}</li>
              </ul>
            </dd>
          </div>
        </dl>

        <div class="preview__player-placeholder">
          Video player will be added here.
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.preview {
  height: 100%;
  overflow: auto;
  padding: 24px;
}

.preview__empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);

  h2 {
    margin: 0 0 8px;
    color: var(--color-text-strong);
  }
}

.preview__hero {
  margin-bottom: 20px;
}

.preview__thumb {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-media-bg);
  display: block;

  &--placeholder {
    height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-subtle);
  }
}

.preview__details {
  h2 {
    margin: 0 0 16px;
    color: var(--color-text-strong);
  }

  dl {
    margin: 0 0 24px;
    display: grid;
    gap: 12px;
  }

  dt {
    font-size: 12px;
    color: var(--color-text-subtle);
    margin-bottom: 4px;
  }

  dd {
    margin: 0;
    color: var(--color-text);
    font-size: 14px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }
}

.preview__path {
  word-break: break-all;
}

.preview__player-placeholder {
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-muted);
}
</style>
