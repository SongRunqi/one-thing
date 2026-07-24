<template>
  <div
    v-if="error"
    class="error-boundary"
  >
    <div class="error-container">
      <ErrorNote
        variant="block"
        label="应用出错"
        :message="error"
      >
        <template #actions>
          <Button
            unstyled
            class="error-btn primary"
            @click="handleRetry"
          >
            Retry
          </Button>
          <Button
            unstyled
            class="error-btn"
            @click="handleRefresh"
          >
            Refresh Page
          </Button>
        </template>
      </ErrorNote>
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { ref, onErrorCaptured } from 'vue'

const error = ref<string | null>(null)

onErrorCaptured((err: any) => {
  error.value = err.message || 'An unexpected error occurred'
  console.error('Captured by ErrorBoundary:', err)
  return false // Prevent further propagation
})

function handleRetry() {
  error.value = null
}

function handleRefresh() {
  window.location.reload()
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  padding: 20px;
}

/* A crash screen still centres in the viewport, but the note inside it is the
   same ink rule used everywhere else — left-aligned against its own stroke. */
.error-container {
  width: 100%;
  max-width: 400px;
  text-align: left;
}

/* Ghost/outline mono buttons — matches .error-btn in chat/message/MessageError.vue. */
.error-btn {
  padding: 2px 10px;
  border: 1px solid var(--ui-border-default-border, var(--border-color));
  border-radius: 2px;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color var(--transition-fast, 0.15s) ease,
    border-color var(--transition-fast, 0.15s) ease;
}

.error-btn:hover {
  border-color: currentcolor;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.error-btn.primary {
  border-color: var(--ui-status-danger-border, var(--border-error));
  color: var(--ui-status-danger-fg, var(--text-error, rgb(220, 68, 68)));
}

.error-btn.primary:hover {
  border-color: currentcolor;
}
</style>
