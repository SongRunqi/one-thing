<template>
  <div
    v-if="visible"
    class="dialog-overlay"
    @click.self="handleDismiss"
  >
    <div class="dialog">
      <div class="dialog-header">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <h3>🎉 New Version Available</h3>
      </div>

      <div class="dialog-content">
        <div class="version-info">
          <span class="version-label">Version {{ version }}</span>
        </div>

        <div
          v-if="releaseNotes"
          class="release-notes"
        >
          <h4>What's New:</h4>
          <div
            class="notes-content"
            v-html="formattedReleaseNotes"
          />
        </div>

        <p class="download-hint">
          Click "Download" to open the GitHub Releases page in your browser.
        </p>
      </div>

      <div class="dialog-actions">
        <button
          class="btn secondary"
          @click="handleDismiss"
        >
          Remind Me Later
        </button>
        <button
          class="btn primary"
          @click="handleDownload"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line
              x1="12"
              y1="15"
              x2="12"
              y2="3"
            />
          </svg>
          Download
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  visible: boolean
  version: string
  releaseNotes?: string
  releaseUrl?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  dismiss: []
  download: []
}>()

const formattedReleaseNotes = computed(() => {
  if (!props.releaseNotes) return ''
  
  // Basic markdown-like formatting
  let formatted = props.releaseNotes
    // Convert markdown lists to HTML
    .replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>')
    // Convert headers
    .replace(/^###\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^##\s+(.+)$/gm, '<h4>$1</h4>')
    // Convert bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Convert italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Convert line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  // Wrap lists
  formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
  
  // Wrap in paragraph if no other block elements
  if (!formatted.includes('<h') && !formatted.includes('<ul>')) {
    formatted = `<p>${formatted}</p>`
  }

  return formatted
})

function handleDismiss() {
  emit('dismiss')
}

function handleDownload() {
  emit('download')
}
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
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.dialog-header svg {
  color: #10b981;
  flex-shrink: 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.dialog-content {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.version-info {
  margin-bottom: 16px;
}

.version-label {
  display: inline-block;
  padding: 4px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.release-notes {
  margin-bottom: 16px;
}

.release-notes h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

.notes-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
}

.notes-content :deep(ul) {
  margin: 8px 0;
  padding-left: 20px;
}

.notes-content :deep(li) {
  margin: 4px 0;
}

.notes-content :deep(h4),
.notes-content :deep(h5) {
  margin: 12px 0 8px 0;
  font-weight: 600;
  color: var(--text-primary);
}

.notes-content :deep(h4) {
  font-size: 14px;
}

.notes-content :deep(h5) {
  font-size: 13px;
}

.notes-content :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.notes-content :deep(p) {
  margin: 8px 0;
}

.download-hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  padding: 12px;
  background: var(--panel);
  border-radius: var(--radius-sm);
  border-left: 3px solid #10b981;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
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

.btn.secondary {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.primary {
  background: #10b981;
  color: white;
}

.btn.primary:hover {
  background: #059669;
}

.btn svg {
  flex-shrink: 0;
}
</style>
