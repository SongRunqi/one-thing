<template>
  <div
    v-if="visible"
    class="dialog-overlay"
    @click.self="$emit('cancel')"
  >
    <div class="dialog">
      <div class="dialog-header">
        <AlertTriangle :size="20" />
        <h3>Unsaved File</h3>
      </div>
      <p class="dialog-message">
        Save changes to {{ fileName }} before closing?
      </p>
      <div class="dialog-actions">
        <button
          class="btn secondary"
          @click="$emit('discard')"
        >
          Discard
        </button>
        <button
          class="btn secondary"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="btn primary"
          @click="$emit('save')"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  filePath?: string
}>()

defineEmits<{
  discard: []
  cancel: []
  save: []
}>()

const fileName = computed(() => props.filePath?.split('/').pop() || 'this file')
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  width: 90%;
  max-width: 420px;
  box-shadow: var(--shadow);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.dialog-header svg {
  color: #f59e0b;
  flex-shrink: 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.dialog-message {
  padding: 20px 24px;
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
  word-break: break-word;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

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

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover {
  background: #2563eb;
}

.btn.secondary {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--hover);
}
</style>
