<template>
  <ErrorBoundary>
    <div class="app-shell">
    <!-- Unified Header -->
    <!-- Unified Sidebar-Transferred Header -->
    <header class="app-header">
      <!-- Left: Sidebar Toggle, New Chat, Search -->
      <div class="header-left">
        <button 
          class="sidebar-toggle-btn" 
          @click="sidebarCollapsed = !sidebarCollapsed"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
        <button
          class="header-action-btn"
          @click="createNewChat"
          title="New chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <button 
          class="header-action-btn" 
          @click="openSearch"
          title="Search chats"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
      </div>

      <!-- Center: Title Bar (Safari-Style) -->
      <div
        class="chat-title-bar"
        @click="startEditTitle"
      >
        <div class="title-content">
          <!-- Show agent avatar as icon if session has agent, otherwise show chat icon -->
          <template v-if="sessionAgent && !isEditingTitle">
            <span v-if="sessionAgent.avatar.type === 'emoji'" class="chat-title-agent-avatar">
              {{ sessionAgent.avatar.value }}
            </span>
            <img
              v-else
              :src="'file://' + sessionAgent.avatar.value"
              class="chat-title-agent-img"
              alt=""
            />
          </template>
          <svg v-else class="chat-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <input
            v-if="isEditingTitle"
            ref="titleInput"
            v-model="editingTitleValue"
            class="chat-title-input"
            @blur="saveTitle"
            @keydown.enter="saveTitle"
            @keydown.escape="cancelEditTitle"
            @click.stop
          />
          <span v-else class="chat-title-text">{{ currentSession?.name || 'New chat' }}</span>
        </div>
      </div>

      <!-- Right: Action buttons (Theme, Settings, Meta) -->
      <div class="header-right">

        <button
          v-if="isBranchSession"
          class="back-to-parent-btn"
          title="Back to parent chat"
          @click="goToParentSession"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>Back</span>
        </button>

        <div class="header-meta">
          <span class="message-count">{{ messageCount }} msg</span>
        </div>

        <button class="header-action-btn" @click="toggleTheme" :title="isDark ? 'Light Mode' : 'Dark Mode'">
          <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M17.66 6.34l1.42-1.42"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
        </button>

        <button class="header-action-btn" @click="showSettings = true" title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="app-content">
      <!-- Media Panel (left side) -->
      <MediaPanel
        :visible="showMediaPanel"
        @close="showMediaPanel = false"
      />

      <Sidebar
        :collapsed="sidebarCollapsed"
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
      />
      <ChatWindow
        ref="chatWindowRef"
        :show-settings="showSettings"
        :show-agent-settings="showAgentSettings"
        @close-settings="showSettings = false"
        @open-settings="showSettings = true"
        @close-agent-settings="showAgentSettings = false"
        @open-agent-settings="showAgentSettings = true"
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
import ChatWindow from '@/components/chat/ChatWindow.vue'
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
const chatWindowRef = ref<InstanceType<typeof ChatWindow> | null>(null)

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
    chatWindowRef.value?.focusInput()
  },
})

// Persist sidebar collapsed state
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
watch(sidebarCollapsed, (collapsed) => {
  localStorage.setItem('sidebarCollapsed', String(collapsed))
})

// Current session
const currentSession = computed(() => sessionsStore.currentSession)

// Get the agent for current session (if session was created with an agent)
const sessionAgent = computed(() => {
  const agentId = currentSession.value?.agentId
  if (!agentId) return null
  return agentsStore.agents.find(a => a.id === agentId) || null
})

// Message count
const messageCount = computed(() => chatStore.messages.length)

// Check if current session is a branch
const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

// Go back to parent session
async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// Title editing state
const isEditingTitle = ref(false)
const editingTitleValue = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

function startEditTitle() {
  if (!currentSession.value) return
  editingTitleValue.value = currentSession.value.name || ''
  isEditingTitle.value = true
  nextTick(() => {
    titleInput.value?.focus()
    titleInput.value?.select()
  })
}

async function saveTitle() {
  if (!currentSession.value || !isEditingTitle.value) return
  const newName = editingTitleValue.value.trim()
  if (newName && newName !== currentSession.value.name) {
    await sessionsStore.renameSession(currentSession.value.id, newName)
  }
  isEditingTitle.value = false
}

const isDark = computed(() => settingsStore.effectiveTheme === 'dark')

function toggleTheme() {
  const newTheme = isDark.value ? 'light' : 'dark'
  settingsStore.updateTheme(newTheme)
}

function cancelEditTitle() {
  isEditingTitle.value = false
  editingTitleValue.value = ''
}

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
  flex-direction: column;
}

/* Unified Header (Safari-Style) */
.app-header {
  height: 52px;
  display: grid;
  grid-template-columns: minmax(200px, 1fr) auto minmax(200px, 1fr);
  align-items: center;
  padding: 0 16px;
  -webkit-app-region: drag;
  flex-shrink: 0;
  position: relative;
  background: rgba(var(--bg-rgb), 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 80px; /* Offset for traffic lights in macOS */
  -webkit-app-region: no-drag;
  min-width: 0;
  justify-self: start;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
  justify-self: end;
  min-width: 0;
}

.sidebar-toggle-btn,
.header-action-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-toggle-btn:hover,
.header-action-btn:hover {
  background: var(--hover);
  color: var(--text);
  transform: translateY(-1px);
}

.sidebar-toggle-btn:active,
.header-action-btn:active {
  transform: scale(0.95);
}

.chat-title-bar {
  grid-column: 2;
  width: min(520px, 100%);
  min-width: 120px;
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 4px 0 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: text;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;
  margin: 0 auto;
}


.title-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.chat-title-icon {
  color: var(--muted);
  opacity: 0.6;
}

.chat-title-agent-avatar {
  font-size: 14px;
  line-height: 1;
}

.chat-title-agent-img {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: cover;
}

.chat-title-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-title-input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  outline: none;
  text-align: center;
}

.header-meta {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.message-count {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.8;
  white-space: nowrap;
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.back-to-parent-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-to-parent-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  transform: translateY(-1px);
}

/* Main Content */
.app-content {
  flex: 1;
  display: flex;
  min-height: 0;
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
  .app-header {
    padding-left: 100px; /* Space for traffic lights */
  }
  
  .chat-title-bar {
    width: 200px;
    max-width: 35%;
  }

  .chat-title-bar.expanded {
    left: 50%;
  }
}

  .chat-title-text {
    font-size: 12px;
  }

  .chat-title-icon {
    display: none;
  }

  .message-count {
    font-size: 11px;
  }

  .back-to-parent-btn {
    padding: 4px 8px;
    font-size: 12px;
  }

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
</style>
