<template>
  <BaseDialog
    :open="visible"
    title="Delete Provider"
    :description="`Are you sure you want to delete &quot;${providerName}&quot;? This action cannot be undone.`"
    @update:open="val => { if (!val) $emit('cancel') }"
  >
    <template #icon>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        <line x1="10" y1="11" x2="10" y2="17"/>
        <line x1="14" y1="11" x2="14" y2="17"/>
      </svg>
    </template>

    <template #actions>
      <button class="btn secondary" @click="$emit('cancel')">Cancel</button>
      <button class="btn danger" @click="$emit('confirm')">Delete</button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import BaseDialog from '@/components/common/BaseDialog.vue'

defineProps<{
  visible: boolean
  providerName: string
}>()

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn.secondary {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.danger {
  background: #ef4444;
  color: white;
}

.btn.danger:hover {
  background: #dc2626;
}
</style>
