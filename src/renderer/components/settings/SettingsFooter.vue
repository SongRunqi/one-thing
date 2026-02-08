<template>
  <footer class="settings-footer">
    <div
      v-if="hasUnsavedChanges"
      class="unsaved-indicator"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
        />
        <line
          x1="12"
          y1="8"
          x2="12"
          y2="12"
        />
        <line
          x1="12"
          y1="16"
          x2="12.01"
          y2="16"
        />
      </svg>
      <span>Unsaved changes</span>
    </div>
    <div class="footer-actions">
      <button
        class="btn secondary"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
      <button
        :class="['btn', hasUnsavedChanges ? 'primary highlight' : 'primary']"
        :disabled="isSaving"
        @click="$emit('save')"
      >
        <span v-if="isSaving">Saving...</span>
        <span v-else>{{ hasUnsavedChanges ? 'Save Changes' : 'Save' }}</span>
      </button>
    </div>
  </footer>

  <!-- Save Success Toast -->
  <Transition name="toast">
    <div
      v-if="showSaveSuccess"
      class="save-toast"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>Settings saved</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  hasUnsavedChanges: boolean
  isSaving: boolean
  showSaveSuccess: boolean
}>()

defineEmits<{
  save: []
  cancel: []
}>()
</script>

<style scoped>
.settings-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

.unsaved-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #f59e0b;
  margin-right: auto;
}

.unsaved-indicator svg {
  color: #f59e0b;
}

.footer-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.primary {
  background: var(--accent);
  border: none;
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.primary.highlight {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
}

.save-toast {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--accent);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
  z-index: 100;
}

.save-toast svg {
  flex-shrink: 0;
}

/* Toast transition */
.toast-enter-active {
  animation: toast-in 0.3s ease;
}

.toast-leave-active {
  animation: toast-out 0.3s ease;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  to {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
}
</style>
