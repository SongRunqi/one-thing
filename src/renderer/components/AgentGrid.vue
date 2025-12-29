<template>
  <div class="agent-grid">
    <!-- Pinned Agents (max 3) -->
    <div
      v-for="agent in displayedAgents"
      :key="agent.id"
      class="agent-icon-wrapper"
    >
      <button
        class="agent-icon"
        :class="{ active: selectedAgentId === agent.id }"
        :title="agent.name"
        @click="handleAgentClick(agent)"
        @contextmenu.prevent="openContextMenu($event, agent)"
      >
        <span v-if="agent.avatar.type === 'emoji'" class="agent-emoji">
          {{ agent.avatar.value }}
        </span>
        <img
          v-else
          :src="getImageSrc(agent.avatar.value)"
          class="agent-image"
          alt=""
        />
      </button>
      <!-- Deselect button (shown on hover when selected) -->
      <button
        v-if="selectedAgentId === agent.id"
        class="deselect-btn"
        title="Deselect agent"
        @click.stop="deselectAgent"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button class="context-menu-item" @click="editAgent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>
        <button class="context-menu-item" @click="unpinAgent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v8M7 10h10M9 10v7l-2 3h10l-2-3v-7"/>
          </svg>
          Unpin
        </button>
        <div class="context-divider" />
        <button class="context-menu-item danger" @click="deleteAgent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, onMounted, onUnmounted } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import type { Agent } from '@/types'

const emit = defineEmits<{
  'select-agent': [agent: Agent]
  'edit-agent': [agent: Agent]
  'open-create-dialog': []
}>()

const agentsStore = useAgentsStore()

// Get selected agent ID from store
const selectedAgentId = computed(() => agentsStore.selectedAgentId)

// Limit to max 3 pinned agents
const displayedAgents = computed(() => agentsStore.pinnedAgents.slice(0, 3))

// Context menu state
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  agent: null as Agent | null
})

function getImageSrc(value: string): string {
  if (value.startsWith('data:')) {
    return value
  }
  return 'file://' + value
}

// Handle agent click - toggle selection
function handleAgentClick(agent: Agent) {
  if (selectedAgentId.value === agent.id) {
    // Already selected, deselect it
    agentsStore.selectAgent(null)
  } else {
    // Select this agent
    agentsStore.selectAgent(agent.id)
  }
}

// Deselect the current agent
function deselectAgent() {
  agentsStore.selectAgent(null)
}

function openContextMenu(event: MouseEvent, agent: Agent) {
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.agent = agent
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.agent = null
}

function editAgent() {
  if (contextMenu.agent) {
    emit('edit-agent', contextMenu.agent)
  }
  closeContextMenu()
}

async function unpinAgent() {
  if (contextMenu.agent) {
    await agentsStore.unpinAgent(contextMenu.agent.id)
  }
  closeContextMenu()
}

async function deleteAgent() {
  if (contextMenu.agent) {
    const confirmed = confirm(`Delete agent "${contextMenu.agent.name}"?`)
    if (confirmed) {
      await agentsStore.deleteAgent(contextMenu.agent.id)
    }
  }
  closeContextMenu()
}

function handleClickOutside() {
  if (contextMenu.visible) {
    closeContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.agent-grid {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  user-select: none;
}

.agent-icon-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

.agent-icon {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: var(--hover);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--muted);
}

.agent-icon:hover {
  background: var(--active);
  transform: translateY(-2px);
}

.agent-icon.active {
  background: rgba(var(--accent-rgb), 0.15);
  box-shadow: 0 0 0 2px var(--accent);
}

/* Deselect button */
.deselect-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.15s ease;
  z-index: 1;
}

.agent-icon-wrapper:hover .deselect-btn {
  opacity: 1;
  transform: scale(1);
}

.deselect-btn:hover {
  background: #ef4444;
}

.agent-emoji {
  font-size: 20px;
  line-height: 1;
}

.agent-image {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
}

.agent-icon.add-btn {
  background: transparent;
  border: 2px dashed var(--border);
}

.agent-icon.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.05);
}

/* Context Menu */
.context-menu {
  position: fixed;
  min-width: 140px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  box-shadow: var(--shadow);
  z-index: 1000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.context-menu-item:hover {
  background: var(--hover);
}

.context-menu-item.danger {
  color: #ef4444;
}

.context-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.context-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
</style>
