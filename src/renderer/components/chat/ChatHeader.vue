<template>
  <header class="chat-header">
    <div class="chat-header-left">
      <!-- Sidebar toggle button (when sidebar is hidden) -->
      <button
        v-if="showSidebarToggle"
        class="chat-header-btn sidebar-toggle-btn"
        title="Show sidebar"
        @click="$emit('toggleSidebar')"
      >
        <PanelLeft
          :size="16"
          :stroke-width="2"
        />
      </button>
    </div>

    <!-- Agent Dropdown -->
    <AgentDropdown
      :visible="showAgentDropdown"
      :dropdown-style="agentDropdownStyle"
      :agents="agents"
      :current-agent-id="sessionAgent?.id || null"
      @close="showAgentDropdown = false"
      @select="handleSelectAgent"
    />

    <!-- Address Bar -->
    <AddressBar
      :title="sessionName"
      :working-directory="workingDirectory"
      :agent="sessionAgent"
      @open-directory-picker="$emit('openDirectoryPicker')"
      @update-title="(title) => $emit('updateTitle', title)"
      @toggle-agent-dropdown="toggleAgentDropdown"
    />

    <div class="chat-header-right">
      <!-- Back to parent (for branch sessions) -->
      <button
        v-if="isBranchSession"
        class="chat-header-btn back-btn"
        title="Back to parent chat"
        @click="$emit('goToParent')"
      >
        <ArrowLeft
          :size="14"
          :stroke-width="2"
        />
      </button>

      <!-- Split button -->
      <button
        v-if="showSplitButton"
        class="chat-header-btn"
        title="Split view"
        @click="$emit('split')"
      >
        <Columns2
          :size="14"
          :stroke-width="2"
        />
      </button>

      <!-- Flow / Right sidebar toggle -->
      <button
        class="chat-header-btn flow-btn"
        :class="{ active: isRightSidebarOpen }"
        :title="isRightSidebarOpen ? 'Hide Files (⌘⇧E)' : 'Show Files (⌘⇧E)'"
        @click="$emit('toggleRightSidebar')"
      >
        <PanelRight
          :size="14"
          :stroke-width="2"
        />
      </button>

      <!-- Equalize panels button -->
      <button
        v-if="canClose"
        class="chat-header-btn"
        title="Equalize panels"
        @click="$emit('equalize')"
      >
        <Equal
          :size="14"
          :stroke-width="2"
        />
      </button>

      <!-- Close button (for multi-panel) -->
      <button
        v-if="canClose"
        class="chat-header-btn close-btn"
        title="Close panel"
        @click="$emit('close')"
      >
        <X
          :size="14"
          :stroke-width="2"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PanelLeft, PanelRight, ArrowLeft, Columns2, Equal, X } from 'lucide-vue-next'
import AgentDropdown from './AgentDropdown.vue'
import AddressBar from './AddressBar.vue'
import type { Agent } from '@/types'

defineProps<{
  sessionName: string
  workingDirectory: string | null
  sessionAgent: Agent | null
  agents: Agent[]
  isBranchSession: boolean
  showSidebarToggle: boolean
  showSplitButton: boolean
  canClose: boolean
  isRightSidebarOpen?: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
  toggleRightSidebar: []
  openDirectoryPicker: []
  updateTitle: [title: string]
  selectAgent: [agentId: string | null]
  goToParent: []
  split: []
  equalize: []
  close: []
}>()

// Agent dropdown state
const showAgentDropdown = ref(false)
const agentDropdownStyle = ref<Record<string, string>>({})

function toggleAgentDropdown(event: MouseEvent) {
  showAgentDropdown.value = !showAgentDropdown.value
  if (showAgentDropdown.value) {
    const btn = event.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    agentDropdownStyle.value = {
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      minWidth: `${Math.max(rect.width, 180)}px`
    }
  }
}

function handleSelectAgent(agentId: string | null) {
  emit('selectAgent', agentId)
  showAgentDropdown.value = false
}
</script>

<style scoped>
/* Chat Header / Title Bar */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  user-select: none;
  background: rgba(var(--bg-rgb, 40, 39, 38), 0.5);
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.05));
  flex-shrink: 0;
  -webkit-app-region: drag;
}

html[data-theme='light'] .chat-header {
  border-bottom-color: var(--border, rgba(0, 0, 0, 0.05));
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 60px;
  flex-shrink: 0;
}

.chat-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 60px;
  flex-shrink: 0;
}

.chat-header-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.chat-header-btn:hover {
  background: var(--hover, rgba(255, 255, 255, 0.08));
  color: var(--text);
}

.chat-header-btn.back-btn {
  color: var(--accent);
}

.chat-header-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.chat-header-btn.sidebar-toggle-btn {
  color: var(--accent);
}

.chat-header-btn.flow-btn.active {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
}
</style>
