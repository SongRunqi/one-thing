<template>
  <div
    class="mode-toggle"
    :class="{ 'is-ask': currentMode === 'ask' }"
  >
    <button
      class="mode-btn"
      :class="{ active: currentMode === 'build' }"
      title="Build mode - Full editing capabilities"
      @click="setMode('build')"
    >
      <Hammer
        :size="14"
        :stroke-width="2"
      />
      <span class="mode-label">Build</span>
    </button>
    <button
      class="mode-btn"
      :class="{ active: currentMode === 'ask' }"
      title="Ask mode - Read-only exploration"
      @click="setMode('ask')"
    >
      <MessageCircleQuestion
        :size="14"
        :stroke-width="2"
      />
      <span class="mode-label">Ask</span>
    </button>
    <div
      class="mode-indicator"
      :class="currentMode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Hammer, MessageCircleQuestion } from 'lucide-vue-next'
import type { BuiltinAgentMode } from '@/types'

interface Props {
  sessionId?: string
}

interface Emits {
  (e: 'modeChange', mode: BuiltinAgentMode): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const currentMode = ref<BuiltinAgentMode>('build')

async function loadMode() {
  if (!props.sessionId) return
  try {
    const result = await window.electronAPI.getSessionBuiltinMode(props.sessionId)
    if (result.success) {
      currentMode.value = result.mode || 'build'
    }
  } catch (error) {
    console.error('Failed to load builtin mode:', error)
  }
}

async function setMode(mode: BuiltinAgentMode) {
  if (!props.sessionId || currentMode.value === mode) return

  try {
    const result = await window.electronAPI.setSessionBuiltinMode(props.sessionId, mode)
    if (result.success) {
      currentMode.value = mode
      emit('modeChange', mode)
    }
  } catch (error) {
    console.error('Failed to set builtin mode:', error)
  }
}

// Toggle mode (for keyboard shortcut)
function toggleMode() {
  const newMode = currentMode.value === 'build' ? 'ask' : 'build'
  setMode(newMode)
}

// Reload mode when session changes
watch(() => props.sessionId, () => {
  loadMode()
}, { immediate: false })

onMounted(() => {
  loadMode()
})

defineExpose({
  toggleMode,
  currentMode,
})
</script>

<style scoped>
.mode-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--hover, rgba(120, 120, 128, 0.08));
  border-radius: 8px;
  position: relative;
  height: 28px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: color 0.2s ease;
  z-index: 1;
  white-space: nowrap;
}

.mode-btn:hover:not(.active) {
  color: var(--text);
}

.mode-btn.active {
  color: var(--text);
}

.mode-label {
  display: none;
}

@media (min-width: 640px) {
  .mode-label {
    display: inline;
  }
}

/* Sliding indicator */
.mode-indicator {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: calc(50% - 2px);
  background: var(--active, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.mode-indicator.build {
  transform: translateX(0);
  left: 2px;
}

.mode-indicator.ask {
  transform: translateX(100%);
  left: 2px;
}

/* Ask mode accent color - uses theme accent */
.mode-toggle.is-ask .mode-btn.active {
  color: var(--accent);
}

.mode-toggle.is-ask .mode-indicator {
  background: rgba(var(--accent-rgb), 0.15);
}
</style>
