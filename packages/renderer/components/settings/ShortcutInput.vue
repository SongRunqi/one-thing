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
    <Button
      v-if="hasShortcut && !isRecording"
      unstyled
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
    </Button>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed } from 'vue'
import type { KeyboardShortcut } from '@shared/ipc'

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
/*
 * Key capsule — 画线风: transparent, square 1px rule, mono.
 * State lives in the line: set = solid rule, empty = dashed faint,
 * recording = dashed accent.
 */
.shortcut-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: min(140px, 100%);
  max-width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;
  font-size: 12px;
  gap: 8px;
}

.shortcut-input:hover {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.shortcut-input:focus {
  outline: none;
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.shortcut-input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg)) 24%, transparent);
  outline-offset: 1px;
}

.shortcut-input.empty {
  border-style: dashed;
}

.shortcut-input.recording {
  border-style: dashed;
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.shortcut-input.empty .shortcut-display {
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
}

.shortcut-display {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.recording-hint {
  color: var(--settings-accent, var(--ui-accent-primary-fg));
  font-family: var(--font-mono, monospace);
  white-space: nowrap;
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
  flex-shrink: 0;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  cursor: pointer;
  transition: color 0.12s ease;
}

.clear-btn:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg));
}

@media (prefers-reduced-motion: reduce) {
  .recording-hint {
    animation: none;
  }
}
</style>
