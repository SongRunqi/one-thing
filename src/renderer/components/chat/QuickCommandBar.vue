<template>
  <div
    v-if="enabledCommands.length > 0"
    class="quick-command-bar"
  >
    <button
      v-for="cmd in enabledCommands"
      :key="cmd.id"
      class="quick-cmd-btn"
      :title="cmd.description"
      @click="executeQuickCommand(cmd.id)"
    >
      <span class="cmd-name">{{ cmd.id }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { getCommands, executeCommand } from '@/services/commands'
import type { CommandDefinition } from '@/types/commands'

interface Props {
  sessionId: string
}

interface Emits {
  (e: 'executed', result: { commandId: string; success: boolean; message?: string; error?: string }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const settingsStore = useSettingsStore()

// Get enabled commands from settings, filtered by available commands
const enabledCommands = computed(() => {
  const quickCommands = settingsStore.settings.general?.quickCommands || []
  const availableCommands = getCommands()

  // Filter to only show enabled commands that actually exist
  const enabledIds = quickCommands
    .filter(qc => qc.enabled)
    .map(qc => qc.commandId)

  return availableCommands.filter(cmd => enabledIds.includes(cmd.id))
})

// Execute a command directly
async function executeQuickCommand(commandId: string) {
  const result = await executeCommand(commandId, {
    sessionId: props.sessionId,
    args: '',  // Quick commands execute without args (will open dialog if needed)
  })

  emit('executed', {
    commandId,
    success: result.success,
    message: result.message,
    error: result.error,
  })
}
</script>

<style scoped>
.quick-command-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-command-bar::-webkit-scrollbar {
  display: none;
}

.quick-cmd-btn {
  padding: 4px 12px;
  border-radius: 12px;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
  /* 毛玻璃效果 */
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.5);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.quick-cmd-btn:hover {
  background: var(--hover);
  border-color: var(--accent);
  color: var(--accent);
}

.quick-cmd-btn:active {
  transform: scale(0.96);
}

.cmd-name {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-weight: 500;
}
</style>
