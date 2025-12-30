<template>
  <div
    v-if="visible"
    class="selection-toolbar"
    :style="{ top: position.top + 'px', left: position.left + 'px' }"
  >
    <button class="toolbar-btn" @click="handleCopy" title="Copy selected text">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      <span>{{ copied ? 'Copied!' : 'Copy' }}</span>
    </button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn" @click="handleQuote" title="Quote in current chat">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
        <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
      </svg>
      <span>Quote</span>
    </button>
    <div class="toolbar-divider"></div>
    <button class="toolbar-btn" @click="handleBranch" title="Create branch with this text">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
      <span>Branch</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  visible: boolean
  position: { top: number; left: number }
  selectedText: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  copy: []
  quote: [text: string]
  branch: [text: string]
  close: []
}>()

const copied = ref(false)

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.selectedText)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy selection:', err)
  }
}

function handleQuote() {
  emit('quote', props.selectedText)
  emit('close')
  window.getSelection()?.removeAllRanges()
}

function handleBranch() {
  emit('branch', props.selectedText)
  emit('close')
  window.getSelection()?.removeAllRanges()
}
</script>

<style scoped>
.selection-toolbar {
  position: fixed;
  z-index: 9999;
  background: var(--bg-floating);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 4px;
  box-shadow: var(--shadow-floating);
  display: flex;
  align-items: center;
  gap: 2px;
  animation: toolbarSlideIn 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

html[data-theme='light'] .selection-toolbar {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 12px 24px -4px rgba(0, 0, 0, 0.15),
    0 0 40px rgba(59, 130, 246, 0.06);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 2px;
}

html[data-theme='light'] .toolbar-divider {
  background: rgba(0, 0, 0, 0.1);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.32, 0.72, 0, 1);
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  transform: translateY(-1px);
}

.toolbar-btn:active {
  transform: translateY(0) scale(0.98);
}

.toolbar-btn svg {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.toolbar-btn:hover svg {
  transform: scale(1.1);
}

@keyframes toolbarSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
