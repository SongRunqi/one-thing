<template>
  <div v-if="files.length > 0" class="attachments-preview">
    <div
      v-for="file in files"
      :key="file.id"
      class="attachment-item"
      :class="{ 'is-image': file.mediaType === 'image' }"
    >
      <img v-if="file.preview" :src="file.preview" :alt="file.fileName" class="attachment-thumb" />
      <div v-else class="attachment-icon">
        <FileText :size="20" :stroke-width="2" />
      </div>
      <span class="attachment-name">{{ file.fileName }}</span>
      <button class="attachment-remove" @click="emit('remove', file.id)" title="Remove">
        <X :size="14" :stroke-width="2.5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText, X } from 'lucide-vue-next'
import type { AttachedFile } from '@/composables/useAttachments'

defineProps<{
  files: AttachedFile[]
}>()

const emit = defineEmits<{
  (e: 'remove', id: string): void
}>()
</script>

<style scoped>
.attachments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border-radius: 8px;
  max-width: 200px;
  animation: slideInDown 0.2s ease-out;
}

.attachment-item.is-image {
  padding: 4px;
  background: var(--bg-hover);
}

.attachment-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}

.attachment-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.attachment-name {
  flex: 1;
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.attachment-remove {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.attachment-remove:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--text-error);
  opacity: 1;
}

@keyframes slideInDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
