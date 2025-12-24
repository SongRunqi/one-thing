<template>
  <ErrorBoundary>
    <div class="app-shell">
    <!-- Main Content - No Header -->
    <div class="app-content">
      <!-- Media Panel (left side) -->
      <MediaPanel
        :visible="showMediaPanel"
        @close="showMediaPanel = false"
      />

      <Sidebar
        :collapsed="sidebarCollapsed"
        :width="sidebarWidth"
        :media-panel-open="showMediaPanel"
        @open-settings="showSettings = true"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @open-search="openSearch"
        @create-new-chat="createNewChat"
        @toggle-media-panel="toggleMediaPanel"
        @open-workspace-dialog="openWorkspaceDialog()"
        @edit-workspace="openWorkspaceDialog"
        @open-agent-dialog="openAgentDialog()"
        @edit-agent="openAgentDialog"
        @select-agent="handleSelectAgent"
        @resize="handleSidebarResize"
      />
      <ChatContainer
        ref="chatContainerRef"
        :show-settings="showSettings"
        :show-agent-settings="showAgentSettings"
        :sidebar-collapsed="sidebarCollapsed"
        @close-settings="showSettings = false"
        @open-settings="showSettings = true"
        @close-agent-settings="showAgentSettings = false"
        @open-agent-settings="showAgentSettings = true"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      />
    </div>

    <!-- Workspace Dialog -->
    <WorkspaceDialog
      :visible="showWorkspaceDialog"
      :workspace="editingWorkspace"
      @close="closeWorkspaceDialog"
    />

    <!-- Agent Dialog -->
    <AgentDialog
      :visible="showAgentDialog"
      :agent="editingAgent"
      @close="closeAgentDialog"
    />

    <!-- Search Overlay (teleported to body) -->
    <Teleport to="body">
      <div v-if="showSearchOverlay" class="search-overlay" @click.self="showSearchOverlay = false">
        <div class="search-modal">
          <div class="search-input-wrapper">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="Search chats..."
              @keydown.escape="showSearchOverlay = false"
              @keydown.enter="selectFirstResult"
            />
          </div>
          <div class="search-results">
            <div
              v-for="session in filteredSessions"
              :key="session.id"
              class="search-result-item"
              :class="{ active: session.id === currentSession?.id }"
              @click="selectSession(session.id)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="result-name">{{ session.name || 'New chat' }}</span>
            </div>
            <div v-if="filteredSessions.length === 0" class="no-results">
              No chats found
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import { onMounted, watchEffect, ref, computed, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useAgentsStore } from '@/stores/agents'
import { useShortcuts } from '@/composables/useShortcuts'
import Sidebar from '@/components/Sidebar.vue'
import ChatContainer from '@/components/ChatContainer.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import WorkspaceDialog from '@/components/WorkspaceDialog.vue'
import AgentDialog from '@/components/AgentDialog.vue'
import MediaPanel from '@/components/MediaPanel.vue'
import type { Workspace, Agent } from '@/types'

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const workspacesStore = useWorkspacesStore()
const agentsStore = useAgentsStore()

const showSettings = ref(false)
const chatContainerRef = ref<InstanceType<typeof ChatContainer> | null>(null)

// Sidebar width (persisted)
const sidebarWidth = ref(parseInt(localStorage.getItem('sidebarWidth') || '300', 10))
function handleSidebarResize(width: number) {
  sidebarWidth.value = width
  localStorage.setItem('sidebarWidth', String(width))
}

// Workspace and Media Panel state
const showWorkspaceDialog = ref(false)
const editingWorkspace = ref<Workspace | null>(null)
const showMediaPanel = ref(false)
const sidebarStateBeforeMediaPanel = ref<boolean | null>(null)

// Agent state
const showAgentDialog = ref(false)
const editingAgent = ref<Agent | null>(null)
const showAgentSettings = ref(false)

function openWorkspaceDialog(workspace?: Workspace) {
  editingWorkspace.value = workspace || null
  showWorkspaceDialog.value = true
}

function closeWorkspaceDialog() {
  showWorkspaceDialog.value = false
  editingWorkspace.value = null
}

function openAgentDialog(agent?: Agent) {
  editingAgent.value = agent || null
  showAgentDialog.value = true
}

function closeAgentDialog() {
  showAgentDialog.value = false
  editingAgent.value = null
}

async function handleSelectAgent(agent: Agent) {
  // If current session has messages, create a new empty session first
  // so the agent welcome page can be displayed
  if (chatStore.messages.length > 0) {
    await sessionsStore.createSession('')
  }
  // Select this agent to show the welcome page
  agentsStore.selectAgent(agent.id)
}

function toggleMediaPanel() {
  showMediaPanel.value = !showMediaPanel.value
}

// Auto-collapse sidebar when MediaPanel opens, restore when it closes
watch(showMediaPanel, (isOpen) => {
  if (isOpen) {
    // Save current sidebar state and collapse it
    sidebarStateBeforeMediaPanel.value = sidebarCollapsed.value
    sidebarCollapsed.value = true
  } else {
    // Restore sidebar to previous state
    if (sidebarStateBeforeMediaPanel.value !== null) {
      sidebarCollapsed.value = sidebarStateBeforeMediaPanel.value
      sidebarStateBeforeMediaPanel.value = null
    }
  }
})

// Setup global keyboard shortcuts
useShortcuts({
  onNewChat: async () => {
    await sessionsStore.createSession('')
  },
  onToggleSidebar: () => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  },
  onFocusInput: () => {
    chatContainerRef.value?.focusInput()
  },
  onOpenSettings: () => {
    showSettings.value = true
  },
})

// Persist sidebar collapsed state and control traffic lights visibility
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
watch(sidebarCollapsed, (collapsed) => {
  localStorage.setItem('sidebarCollapsed', String(collapsed))
  // Hide/show traffic lights when sidebar collapses/expands (macOS only)
  window.electronAPI?.setWindowButtonVisibility?.(!collapsed)
}, { immediate: true })


// Search overlay state
const showSearchOverlay = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

// Filtered sessions based on search query
const filteredSessions = computed(() => {
  const sessions = sessionsStore.sessions
  if (!searchQuery.value.trim()) {
    return sessions.slice(0, 15)
  }
  const query = searchQuery.value.toLowerCase()
  return sessions.filter(s =>
    (s.name || '').toLowerCase().includes(query)
  ).slice(0, 15)
})

// Open search overlay
function openSearch() {
  showSearchOverlay.value = true
}

// Select a session from search results
async function selectSession(sessionId: string) {
  await sessionsStore.switchSession(sessionId)
  showSearchOverlay.value = false
  searchQuery.value = ''
}

// Select first result on Enter
function selectFirstResult() {
  if (filteredSessions.value.length > 0) {
    selectSession(filteredSessions.value[0].id)
  }
}

// Auto focus search input when overlay opens
watch(showSearchOverlay, (val) => {
  if (val) {
    nextTick(() => searchInput.value?.focus())
  }
})

// Create new chat
async function createNewChat() {
  await sessionsStore.createSession('')
}

onMounted(async () => {
  // Load initial data
  await workspacesStore.loadWorkspaces()
  await agentsStore.loadAgents()
  await sessionsStore.loadSessions()
  await settingsStore.loadSettings()

  // Create a default session if none exist
  if (sessionsStore.sessionCount === 0) {
    await sessionsStore.createSession('New Chat')
  }
})

watchEffect(() => {
  const theme = settingsStore.settings.theme || 'dark'
  document.documentElement.dataset.theme = theme
})
</script>

<style scoped>
.app-shell {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: row;
  background: var(--bg);
}

/* Main Content - Full height, horizontal layout */
.app-content {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
}

/* Search Overlay */
.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  padding-top: 100px;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

html[data-theme='light'] .search-overlay {
  background: rgba(0, 0, 0, 0.4);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.search-modal {
  width: 520px;
  max-height: 450px;
  background: var(--panel);
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideDown 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.search-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--text);
  outline: none;
}

.search-input::placeholder {
  color: var(--muted);
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text);
  transition: all 0.12s ease;
}

.search-result-item:hover {
  background: var(--hover);
}

.search-result-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.search-result-item svg {
  color: var(--muted);
  flex-shrink: 0;
}

.search-result-item.active svg {
  color: var(--accent);
}

.result-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}

/* Responsive styles */
@media (max-width: 768px) {
  .search-overlay {
    padding-top: 60px;
  }

  .search-modal {
    width: 95%;
    max-height: 70vh;
  }

  .search-input {
    font-size: 14px;
  }
}
</style>
