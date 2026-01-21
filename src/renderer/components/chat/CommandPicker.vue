<template>
  <div
    v-if="visible && filteredCommands.length > 0"
    class="command-picker"
  >
    <div class="command-picker-header">
      <span class="title">Commands</span>
      <span class="count">{{ filteredCommands.length }}</span>
    </div>
    <div class="command-list">
      <div
        v-for="(command, index) in filteredCommands"
        :key="command.id"
        :class="['command-item', { selected: index === selectedIndex }]"
        @click="selectCommand(command)"
        @mouseenter="selectedIndex = index"
      >
        <div class="command-icon">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="4 17 10 11 4 5" />
            <line
              x1="12"
              y1="19"
              x2="20"
              y2="19"
            />
          </svg>
        </div>
        <div class="command-info">
          <div class="command-name">
            /{{ command.id }}
          </div>
          <div class="command-description">
            {{ command.description }}
          </div>
        </div>
        <div class="command-usage">
          {{ command.usage }}
        </div>
      </div>
    </div>
    <div class="command-picker-hint">
      <span>Press <kbd>Enter</kbd> to select</span>
      <span><kbd>Esc</kbd> to close</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { CommandDefinition } from '@/types/commands'
import { filterCommands } from '@/services/commands'

interface Props {
  visible: boolean
  query: string
}

interface Emits {
  (e: 'select', command: CommandDefinition): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedIndex = ref(0)

// Filter commands by query
const filteredCommands = computed(() => {
  return filterCommands(props.query)
})

// Reset selected index when query changes
watch(
  () => props.query,
  () => {
    selectedIndex.value = 0
  }
)

// Handle keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (!props.visible) return

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = Math.max(0, selectedIndex.value - 1)
      break
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = Math.min(filteredCommands.value.length - 1, selectedIndex.value + 1)
      break
    case 'Tab':
    case 'Enter':
      if (filteredCommands.value.length > 0) {
        e.preventDefault()
        selectCommand(filteredCommands.value[selectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      emit('close')
      break
  }
}

function selectCommand(command: CommandDefinition) {
  emit('select', command)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.command-picker {
  margin-bottom: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 100;
  animation: slideUp 0.15s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.command-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.command-picker-header .title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.command-picker-header .count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 10px;
  color: var(--muted);
}

.command-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
}

.command-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.command-item:hover,
.command-item.selected {
  background: var(--hover);
}

.command-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.command-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover);
  border-radius: 6px;
  color: var(--muted);
  flex-shrink: 0;
  margin-top: 2px;
}

.command-item.selected .command-icon {
  background: rgba(59, 130, 246, 0.2);
  color: var(--accent);
}

.command-info {
  flex: 1;
  min-width: 0;
}

.command-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.command-description {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.4;
}

.command-usage {
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--muted);
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 2px;
}

.command-item.selected .command-usage {
  background: rgba(59, 130, 246, 0.2);
  color: var(--accent);
}

.command-picker-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.command-picker-hint kbd {
  display: inline-block;
  padding: 2px 5px;
  background: var(--hover);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 10px;
  margin: 0 2px;
}
</style>
