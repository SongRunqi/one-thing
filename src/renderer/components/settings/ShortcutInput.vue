<template>
  <div
    class="shortcut-input"
    :class="{ recording: isRecording, empty: !hasShortcut }"
    tabindex="0"
    @click="startRecording"
    @keydown="handleKeyDown"
    @keyup="handleKeyUp"
    @blur="stopRecording"
  >
    <span
      v-if="!isRecording"
      class="shortcut-display"
    >
      {{ displayText }}
    </span>
    <span
      v-else
      class="recording-hint"
    >Press keys...</span>
    <button
      v-if="hasShortcut && !isRecording"
      class="clear-btn"
      title="Clear shortcut"
      @click.stop="clearShortcut"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line
          x1="18"
          y1="6"
          x2="6"
          y2="18"
        />
        <line
          x1="6"
          y1="6"
          x2="18"
          y2="18"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KeyboardShortcut } from '../../../shared/ipc'

interface Props {
  modelValue?: KeyboardShortcut
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: KeyboardShortcut | undefined]
}>()

const isRecording = ref(false)
const lastShiftUp = ref(0)

const hasShortcut = computed(() => {
  return props.modelValue && props.modelValue.key
})

const displayText = computed(() => {
  if (!props.modelValue || !props.modelValue.key) {
    return 'Click to set'
  }
  if (props.modelValue.sequence === 'double-shift') {
    return 'Double Shift'
  }

  const parts: string[] = []

  if (props.modelValue.ctrlKey) parts.push('Ctrl')
  if (props.modelValue.altKey) parts.push('Alt')
  if (props.modelValue.shiftKey) parts.push('Shift')
  if (props.modelValue.metaKey) parts.push('Cmd')

  // Format the key nicely
  let key = props.modelValue.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)

  return parts.join(' + ')
})

function startRecording() {
  isRecording.value = true
  lastShiftUp.value = 0
}

function stopRecording() {
  isRecording.value = false
  lastShiftUp.value = 0
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isRecording.value) return

  e.preventDefault()
  e.stopPropagation()

  // Ignore modifier-only presses. Double Shift is handled on keyup so it can
  // be recorded as a deliberate sequence instead of a single modifier.
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return
  }

  // Escape cancels recording
  if (e.key === 'Escape') {
    stopRecording()
    return
  }

  const shortcut: KeyboardShortcut = {
    key: e.key,
    ctrlKey: e.ctrlKey || undefined,
    altKey: e.altKey || undefined,
    shiftKey: e.shiftKey || undefined,
    metaKey: e.metaKey || undefined,
  }

  emit('update:modelValue', shortcut)
  stopRecording()
}

function handleKeyUp(e: KeyboardEvent) {
  if (!isRecording.value || e.key !== 'Shift' || e.ctrlKey || e.altKey || e.metaKey) return

  e.preventDefault()
  e.stopPropagation()

  const now = Date.now()
  if (now - lastShiftUp.value < 500) {
    emit('update:modelValue', { key: 'Shift', sequence: 'double-shift' })
    stopRecording()
    return
  }

  lastShiftUp.value = now
}

function clearShortcut() {
  emit('update:modelValue', undefined)
}
</script>

<style scoped>
.shortcut-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 140px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
  gap: 8px;
}

.shortcut-input:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.shortcut-input:focus {
  outline: none;
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 20%, transparent);
}

.shortcut-input.recording {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
}

.shortcut-input.empty .shortcut-display {
  color: var(--ui-text-muted-fg, var(--text-muted));
  font-style: italic;
}

.shortcut-display {
  color: var(--ui-text-primary-fg, var(--text-primary));
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-weight: 500;
}

.recording-hint {
  color: var(--ui-accent-primary-fg, var(--accent));
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.clear-btn:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: rgba(255, 255, 255, 0.1);
}

/* Light theme */
html[data-theme='light'] .shortcut-input {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
}

html[data-theme='light'] .shortcut-input:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
}

html[data-theme='light'] .clear-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
</style>
