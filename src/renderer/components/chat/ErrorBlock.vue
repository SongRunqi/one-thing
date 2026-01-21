<template>
  <div class="error-block">
    <div class="error-header">
      <svg
        class="error-icon"
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
          x1="15"
          y1="9"
          x2="9"
          y2="15"
        />
        <line
          x1="9"
          y1="9"
          x2="15"
          y2="15"
        />
      </svg>
      <span class="error-label">Error</span>
      <button
        class="copy-btn"
        :title="copied ? 'Copied' : 'Copy'"
        @click="copyError"
      >
        <svg
          v-if="!copied"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect
            x="9"
            y="9"
            width="13"
            height="13"
            rx="2"
            ry="2"
          />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <svg
          v-else
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </div>
    <div class="error-content">
      <pre>{{ error }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  error: string
}>()

const copied = ref(false)

async function copyError() {
  try {
    await navigator.clipboard.writeText(props.error)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<style scoped>
.error-block {
  margin-top: 8px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  overflow: hidden;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(239, 68, 68, 0.05);
  border-bottom: 1px solid rgba(239, 68, 68, 0.15);
}

.error-icon {
  color: rgb(239, 68, 68);
  flex-shrink: 0;
}

.error-label {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: rgb(239, 68, 68);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: rgba(239, 68, 68, 0.7);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
}

.error-content {
  padding: 10px 12px;
  max-height: 150px;
  overflow-y: auto;
}

.error-content pre {
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: rgb(239, 68, 68);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Light theme */
html[data-theme='light'] .error-block {
  background: rgba(239, 68, 68, 0.06);
}

html[data-theme='light'] .error-header {
  background: rgba(239, 68, 68, 0.04);
}

/* Scrollbar styling */
.error-content::-webkit-scrollbar {
  width: 6px;
}

.error-content::-webkit-scrollbar-track {
  background: transparent;
}

.error-content::-webkit-scrollbar-thumb {
  background: rgba(239, 68, 68, 0.3);
  border-radius: 3px;
}

.error-content::-webkit-scrollbar-thumb:hover {
  background: rgba(239, 68, 68, 0.5);
}
</style>
