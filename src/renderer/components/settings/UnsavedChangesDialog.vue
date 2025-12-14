<template>
  <div v-if="visible" class="dialog-overlay" @click.self="$emit('cancel')">
    <div class="dialog">
      <div class="dialog-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <h3>Unsaved Changes</h3>
      </div>
      <p class="dialog-message">You have unsaved changes. What would you like to do?</p>
      <div class="dialog-actions">
        <button class="btn secondary" @click="$emit('discard')">Discard</button>
        <button class="btn secondary" @click="$emit('cancel')">Cancel</button>
        <button class="btn primary" @click="$emit('save')">Save & Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean
}

defineProps<Props>()

defineEmits<{
  discard: []
  cancel: []
  save: []
}>()
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  width: 90%;
  max-width: 400px;
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
  color: var(--muted);
  margin: 0;
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
  background: #0d8a6a;
}

.btn.secondary {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover {
  background: var(--hover);
}
</style>
