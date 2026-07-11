<template>
  <div class="attachment-frame">
    <span
      class="dock-frame-label"
      aria-hidden="true"
    >FILES · {{ files.length }}</span>
    <div
      ref="trayRef"
      class="attachment-tray"
      @wheel="handleWheel"
    >
      <template
        v-for="file in files"
        :key="file.id"
      >
        <AttachmentThumb
          v-if="file.mediaType === 'image' && file.preview"
          size="sm"
          :src="file.preview"
          :alt="file.fileName"
          :title="`${file.fileName} (${formatFileSize(file.size)})`"
          removable
          @remove="emit('remove', file.id)"
        />
        <FileChip
          v-else
          size="sm"
          :file-name="file.fileName"
          :size-bytes="file.size"
          removable
          @remove="emit('remove', file.id)"
        />
      </template>
      <div
        v-if="processing"
        class="attachment-loading"
      >
        <Loader2
          class="attachment-spinner"
          :size="14"
        />
        <span>Reading files...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import AttachmentThumb from '@/components/common/AttachmentThumb.vue'
import FileChip from '@/components/common/FileChip.vue'
import { formatFileSize } from '@/utils/format'
import type { AttachedFile } from '@/composables/useAttachments'

defineProps<{
  files: AttachedFile[]
  processing: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', id: string): void
}>()

const trayRef = ref<HTMLElement | null>(null)

/**
 * The tray is a fixed-height single row that scrolls horizontally; translate
 * vertical wheel gestures so a mouse wheel can move through the chips too.
 */
function handleWheel(event: WheelEvent) {
  const tray = trayRef.value
  if (!tray || tray.scrollWidth <= tray.clientWidth) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  tray.scrollLeft += event.deltaY
  event.preventDefault()
}
</script>

<style scoped>
/* Blueprint frame: outlined strip with a floating title tag. */
.attachment-frame {
  position: relative;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
}

.dock-frame-label {
  position: absolute;
  top: -7px;
  left: 10px;
  z-index: 1;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  pointer-events: none;
  user-select: none;
}

.attachment-tray {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 56px;
  /* Extra top padding keeps the floating remove badges (top: -6px on the
     40px thumbs) inside this overflow-hidden scroller. */
  padding: 10px 12px 6px;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  white-space: nowrap;
  scrollbar-width: thin;
  border-radius: inherit;
}

.attachment-tray::-webkit-scrollbar {
  height: 4px;
}

.attachment-tray::-webkit-scrollbar-track {
  background: transparent;
}

.attachment-tray::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.attachment-loading {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border: 1px dashed color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
  border-radius: 3px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}

.attachment-spinner {
  animation: attachment-spin 0.8s linear infinite;
}

@keyframes attachment-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
