<template>
  <footer class="editor-status-bar">
    <span class="path">{{ buffer?.filePath || 'No file' }}</span>
    <span v-if="buffer?.dirty">Modified</span>
    <span v-if="buffer?.saving">Saving...</span>
    <span v-if="buffer">{{ buffer.line }}:{{ buffer.column }}</span>
    <span v-if="buffer">{{ buffer.encoding }}</span>
    <span v-if="buffer">{{ sizeLabel }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EditorBuffer } from '@/composables/useEditorWorkspace'

const props = defineProps<{
  buffer: EditorBuffer | null
}>()

const sizeLabel = computed(() => {
  const size = props.buffer?.size || 0
  if (size < 1024) return `${size}B`
  if (size < 1048576) return `${Math.round(size / 1024)}KB`
  return `${(size / 1048576).toFixed(1)}MB`
})
</script>

<style scoped>
.editor-status-bar {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 10px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  flex-shrink: 0;
}

.path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
