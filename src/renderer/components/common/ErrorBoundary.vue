<template>
  <div v-if="error" class="error-boundary">
    <div class="error-container">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h2>Something went wrong</h2>
      <p class="error-msg">{{ error }}</p>
      <div class="actions">
        <button class="retry-btn" @click="handleRetry">Retry</button>
        <button class="refresh-btn" @click="handleRefresh">Refresh Page</button>
      </div>
    </div>
  </div>
  <slot v-else></slot>
</template>

<script setup lang="ts">
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
  background: var(--bg);
  color: var(--text);
  padding: 20px;
  text-align: center;
}

.error-container {
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.error-boundary svg {
  color: var(--danger);
  margin-bottom: 8px;
}

.error-msg {
  color: var(--muted);
  font-size: 14px;
  word-break: break-all;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

button {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

button:hover {
  background: var(--hover);
  border-color: var(--accent);
}

.retry-btn {
  background: var(--accent);
  color: white;
  border: none;
}

.retry-btn:hover {
  opacity: 0.9;
}
</style>
