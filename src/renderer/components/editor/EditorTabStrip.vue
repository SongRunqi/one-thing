<template>
  <div class="editor-tab-strip">
    <button
      v-for="path in openEditors"
      :key="path"
      :class="['editor-tab', { active: path === activePath }]"
      @click="$emit('select', path)"
      @mousedown.middle.prevent="$emit('close', path)"
    >
      <span
        v-if="buffers.get(path)?.dirty"
        class="dirty-dot"
      />
      <span class="tab-title">{{ buffers.get(path)?.title || path }}</span>
      <X
        :size="12"
        class="tab-close"
        @click.stop="$emit('close', path)"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { EditorBuffer } from '@/composables/useEditorWorkspace'

defineProps<{
  openEditors: string[]
  activePath: string
  buffers: Map<string, EditorBuffer>
}>()

defineEmits<{
  select: [path: string]
  close: [path: string]
}>()
</script>

<style scoped>
.editor-tab-strip {
  height: 34px;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  flex-shrink: 0;
  scrollbar-width: none;
}

.editor-tab-strip::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.editor-tab {
  min-width: 120px;
  max-width: 220px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.editor-tab.active {
  background: var(--bg-elevated);
  color: var(--text);
}

.dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-size: 12px;
}

.tab-close {
  flex-shrink: 0;
}
</style>
