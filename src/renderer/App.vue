<template>
  <!-- Settings Window Mode -->
  <SettingsPage v-if="isSettingsWindow" />

  <!-- Image Preview Window Mode -->
  <ImagePreviewWindow v-else-if="isImagePreviewWindow" />

  <!-- Main App Mode -->
  <ErrorBoundary v-else>
    <div class="app-shell">
    <!-- Main Content - No Header -->
    <div class="app-content">
      <!-- Media Panel (left side) -->
      <MediaPanel
        :visible="showMediaPanel"
        @close="closeMediaPanel"
        @create-agent="openAgentDialog()"
        @edit-agent="openAgentDialog"
        @open-memory-file="openMemoryFile"
      />

      <!-- Floating sidebar overlay backdrop -->
<!--      <div-->
<!--        v-if="sidebarFloating"-->
<!--        :class="['sidebar-floating-backdrop', { closing: sidebarFloatingClosing }]"-->
<!--        @click="closeFloatingSidebar"-->
<!--      ></div>-->

      <Sidebar
        :collapsed="sidebarCollapsed && !sidebarFloating"
        :floating="sidebarFloating"
        :floating-closing="sidebarFloatingClosing"
        :no-transition="sidebarNoTransition"
        :width="sidebarWidth"
        :media-panel-open="showMediaPanel"
        @open-settings="showSettings = true"
        @toggle-collapse="handleSidebarToggle"
        @open-search="openSearch"
        @create-new-chat="createNewChat"
        @toggle-media-panel="toggleMediaPanel"
        @open-workspace-dialog="openWorkspaceDialog()"
        @edit-workspace="openWorkspaceDialog"
        @open-agent-dialog="openAgentDialog()"
        @edit-agent="openAgentDialog"
        @resize="handleSidebarResize"
        @mouseleave="handleSidebarMouseLeave"
      />
      <ChatContainer
        ref="chatContainerRef"
        :show-settings="showSettings"
        :show-agent-settings="showAgentSettings"
        :sidebar-collapsed="sidebarCollapsed"
        :sidebar-floating="sidebarFloating"
        :show-hover-trigger="sidebarCollapsed && !sidebarFloating && !showMediaPanel"
        :media-panel-open="showMediaPanel"
        :show-agent-create="showAgentCreate"
        :editing-agent="editingAgent"
        :selected-memory-file-path="selectedMemoryFilePath"
        :show-diff-overlay="showDiffOverlay"
        :diff-overlay-data="diffOverlayData"
        @close-settings="showSettings = false"
        @open-settings="showSettings = true"
        @close-agent-settings="showAgentSettings = false"
        @open-agent-settings="showAgentSettings = true"
        @toggle-sidebar="handleSidebarToggle"
        @show-floating-sidebar="handleTriggerEnter"
        @hide-floating-sidebar="handleTriggerLeave"
        @close-agent-create="closeAgentCreate"
        @agent-created="handleAgentCreated"
        @agent-saved="handleAgentSaved"
        @close-memory-file="closeMemoryFile"
        @close-diff-overlay="closeDiffOverlay"
      />

      <!-- Right Panel (Sidebar + Preview) -->
      <RightPanel
        :session-id="sessionsStore.currentSessionId"
        :working-directory="sessionsStore.currentSession?.workingDirectory"
        @open-diff="openDiffOverlay"
        @open-commit-dialog="openCommitDialog"
      />

      <!-- Commit Dialog -->
      <CommitDialog
        :visible="showCommitDialog"
        :staged-count="stagedFilesCount"
        :working-directory="sessionsStore.currentSession?.workingDirectory || ''"
        :session-id="sessionsStore.currentSessionId || ''"
        @close="closeCommitDialog"
        @committed="handleCommitted"
      />
    </div>

    <!-- Workspace Dialog -->
    <WorkspaceDialog
      :visible="showWorkspaceDialog"
      :workspace="editingWorkspace"
      @close="closeWorkspaceDialog"
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
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useWorkspacesStore } from '@/stores/workspaces'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import { useThemeStore } from '@/stores/themes'
import { useShortcuts } from '@/composables/useShortcuts'
import { Sidebar } from '@/components/sidebar'
import { RightPanel } from '@/components/right-panel'
import { useRightSidebarStore } from '@/stores/right-sidebar'
import ChatContainer from '@/components/ChatContainer.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import WorkspaceDialog from '@/components/WorkspaceDialog.vue'
// CustomAgentDialog removed - now using full-page CreateAgentPage for both create and edit
import MediaPanel from '@/components/MediaPanel.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import ImagePreviewWindow from '@/components/ImagePreviewWindow.vue'
import CommitDialog from '@/components/git/CommitDialog.vue'
import type { Workspace, CustomAgent } from '@/types'

// Type for diff overlay data
interface DiffOverlayData {
  filePath: string
  workingDirectory: string
  sessionId: string
  isStaged: boolean
}

// Detect if this is the settings window or image preview window
const isSettingsWindow = window.location.hash.startsWith('#/settings')
const isImagePreviewWindow = window.location.hash.startsWith('#/image-preview')

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const workspacesStore = useWorkspacesStore()
const customAgentsStore = useCustomAgentsStore()
const themeStore = useThemeStore()
const rightSidebarStore = useRightSidebarStore()

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

// Agent state
const editingAgent = ref<CustomAgent | null>(null)
const showAgentSettings = ref(false)
const showAgentCreate = ref(false)

// Memory state
const selectedMemoryFilePath = ref<string | null>(null)

// Diff overlay state
const showDiffOverlay = ref(false)
const diffOverlayData = ref<DiffOverlayData | null>(null)

// Commit dialog state
const showCommitDialog = ref(false)
const stagedFilesCount = ref(0)

function openWorkspaceDialog(workspace?: Workspace) {
  editingWorkspace.value = workspace || null
  showWorkspaceDialog.value = true
}

function closeWorkspaceDialog() {
  showWorkspaceDialog.value = false
  editingWorkspace.value = null
}

function openAgentDialog(agent?: CustomAgent) {
  if (agent) {
    // Editing existing CustomAgent - use full-page editor
    editingAgent.value = agent
    showAgentCreate.value = false
  } else {
    // Creating new agent - use full-page editor
    editingAgent.value = null
    showAgentCreate.value = true
  }
}

function closeAgentCreate() {
  showAgentCreate.value = false
  editingAgent.value = null
}

function handleAgentCreated(_agent: CustomAgent) {
  showAgentCreate.value = false
  editingAgent.value = null
  // Agent is already created and pinned in the store by CreateAgentPage
}

function handleAgentSaved(_agent: CustomAgent) {
  editingAgent.value = null
  showAgentCreate.value = false
  // Agent is already updated in the store by CreateAgentPage
}

function openMemoryFile(filePath: string) {
  selectedMemoryFilePath.value = filePath
}

function closeMemoryFile() {
  selectedMemoryFilePath.value = null
}

// Diff overlay functions
function openDiffOverlay(data: DiffOverlayData) {
  diffOverlayData.value = data
  showDiffOverlay.value = true
}

function closeDiffOverlay() {
  showDiffOverlay.value = false
  diffOverlayData.value = null
}

// Commit dialog functions
function openCommitDialog(stagedCount: number) {
  stagedFilesCount.value = stagedCount
  showCommitDialog.value = true
}

function closeCommitDialog() {
  showCommitDialog.value = false
}

function handleCommitted() {
  // Refresh git status after commit
  // The GitTab will handle this via its own refresh mechanism
  closeCommitDialog()
}

function toggleMediaPanel() {
  if (showMediaPanel.value) {
    closeMediaPanel()
  } else {
    // 关闭 floating sidebar
    if (sidebarFloating.value) {
      sidebarFloating.value = false
    }
    showMediaPanel.value = true
    sidebarCollapsed.value = true
  }
}

function closeMediaPanel() {
  showMediaPanel.value = false
  floatingCooldown.value = true
  setTimeout(() => {
    floatingCooldown.value = false
  }, 400)
}


// Toggle right sidebar
function toggleRightSidebar() {
  rightSidebarStore.toggle()
}

// Setup global keyboard shortcuts
useShortcuts({
  onNewChat: createNewChat,
  onToggleSidebar: handleSidebarToggle,
  onFocusInput: () => {
    chatContainerRef.value?.focusInput()
  },
  onOpenSettings: () => {
    window.electronAPI.openSettingsWindow()
  },
})

// Additional keyboard shortcut for right sidebar (Cmd+Shift+E)
function handleRightSidebarShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
    event.preventDefault()
    toggleRightSidebar()
  }
}

// Persist sidebar collapsed state and control traffic lights visibility
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
const sidebarFloating = ref(false)
const sidebarFloatingClosing = ref(false)
const sidebarNoTransition = ref(false) // Disable transition during/after floating
const floatingCooldown = ref(false) // Prevent re-expansion after toggle
const floatingShowTimer = ref<ReturnType<typeof setTimeout> | null>(null) // Delay before showing floating sidebar

// Close floating sidebar with animation
function closeFloatingSidebar() {
  if (!sidebarFloating.value || sidebarFloatingClosing.value) return
  sidebarFloatingClosing.value = true
  sidebarNoTransition.value = true
  floatingCooldown.value = true
  setTimeout(() => {
    sidebarFloating.value = false
    sidebarFloatingClosing.value = false
    // Keep transition disabled a bit longer to prevent flash
    setTimeout(() => {
      sidebarNoTransition.value = false
      floatingCooldown.value = false
    }, 300)
  }, 200) // Match animation duration
}

// Handle sidebar toggle - if floating, just close floating mode
function handleSidebarToggle() {
  // If MediaPanel is open, close it instead of toggling sidebar
  if (showMediaPanel.value) {
    showMediaPanel.value = false
    return
  }
  if (sidebarFloating.value) {
    closeFloatingSidebar()
  } else {
    // Prevent floating from triggering during collapse animation
    floatingCooldown.value = true
    sidebarCollapsed.value = !sidebarCollapsed.value
    setTimeout(() => {
      floatingCooldown.value = false
    }, 400)
  }
}

// Handle hover trigger enter - with delay to avoid accidental triggers
function handleTriggerEnter() {
  // Don't expand if in cooldown period (after toggle or close)
  if (sidebarFloatingClosing.value || floatingCooldown.value) return

  // Clear any existing timer
  if (floatingShowTimer.value) {
    clearTimeout(floatingShowTimer.value)
  }

  // Add 200ms delay before showing floating sidebar
  floatingShowTimer.value = setTimeout(() => {
    sidebarNoTransition.value = true
    sidebarFloating.value = true
    floatingShowTimer.value = null
  }, 200)
}

// Handle hover trigger leave - cancel pending show
function handleTriggerLeave() {
  if (floatingShowTimer.value) {
    clearTimeout(floatingShowTimer.value)
    floatingShowTimer.value = null
  }
}

// Handle mouse leaving the floating sidebar
function handleSidebarMouseLeave(event: MouseEvent) {
  if (!sidebarFloating.value) return

  // Only close if mouse is leaving to the right (outside the sidebar)
  // Check if mouse is moving towards the content area
  const sidebarWidth = sidebarFloating.value ? 280 : 0
  if (event.clientX <= sidebarWidth + 10) {
    // Mouse is still near/inside the sidebar area, don't close
    return
  }

  closeFloatingSidebar()
}

// Close floating mode when sidebar is expanded permanently
watch(sidebarCollapsed, (collapsed) => {
  if (!collapsed) {
    sidebarFloating.value = false
  }
})

// Update traffic lights when sidebar state changes (main window only)
watch([sidebarCollapsed, sidebarFloating, showMediaPanel], ([collapsed, floating, mediaOpen]) => {
  localStorage.setItem('sidebarCollapsed', String(collapsed))
  // Skip traffic light control for settings/preview windows - always show there
  if (isSettingsWindow || isImagePreviewWindow) return
  // Show traffic lights when sidebar is visible (expanded or floating) or media panel is open
  const showTrafficLights = !collapsed || floating || mediaOpen
  window.electronAPI?.setWindowButtonVisibility?.(showTrafficLights).catch(() => {
    // Handler may not be registered yet during initial load
  })
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

// Re-apply theme when mode (light/dark) changes
watch(() => settingsStore.effectiveTheme, () => {
  themeStore.reapplyTheme()
})

// Create new chat (respects selected agent)
// If there's already an empty "New Chat", reuse it and update agent if needed
async function createNewChat() {
  const agentId = customAgentsStore.selectedAgentId || null

  // Check if there's an existing empty session in current workspace
  const existingEmptySession = sessionsStore.filteredSessions.find(
    s => (s.name === 'New Chat' || s.name === '') && (!s.messages || s.messages.length === 0)
  )

  if (existingEmptySession) {
    // Switch to existing empty session
    await sessionsStore.switchSession(existingEmptySession.id)
    // Update agent if different
    if (existingEmptySession.agentId !== agentId) {
      await window.electronAPI.updateSessionAgent(existingEmptySession.id, agentId)
      existingEmptySession.agentId = agentId || undefined
    }
  } else {
    // Create a new session with the selected agent
    await sessionsStore.createSession('New Chat', agentId || undefined)
  }
  // Keep agent selected for future chats
}

let unsubscribeSettingsChanged: (() => void) | null = null
let unsubscribeMenuNewChat: (() => void) | null = null
let unsubscribeMenuCloseChat: (() => void) | null = null

onMounted(async () => {
  // Load initial data
  await workspacesStore.loadWorkspaces()
  await customAgentsStore.loadCustomAgents()
  await sessionsStore.loadSessions()
  await settingsStore.loadSettings()

  // Initialize theme system (must be after settings load)
  await themeStore.initialize()

  // Don't auto-create new chat - let user choose from existing sessions or create manually

  // Listen for settings changes from other windows (e.g., settings window)
  unsubscribeSettingsChanged = window.electronAPI.onSettingsChanged((newSettings) => {
    console.log('[App] Settings changed from another window')

    // Update settings store
    settingsStore.settings = newSettings

    // Apply light/dark mode theme
    settingsStore.applyTheme()

    // For cross-window sync: explicitly update theme refs from the received settings
    // Since reapplyTheme() no longer syncs from settings (to prevent race conditions),
    // we must manually update refs here for cross-window synchronization
    const general = newSettings.general
    if (general?.darkThemeId) {
      themeStore.darkThemeId = general.darkThemeId
    }
    if (general?.lightThemeId) {
      themeStore.lightThemeId = general.lightThemeId
    }

    // Now reapply theme with updated refs
    themeStore.reapplyTheme()
  })

  // Listen for menu shortcuts
  unsubscribeMenuNewChat = window.electronAPI.onMenuNewChat(() => {
    createNewChat()
  })

  unsubscribeMenuCloseChat = window.electronAPI.onMenuCloseChat(async () => {
    const currentId = sessionsStore.currentSessionId
    if (currentId) {
      await sessionsStore.deleteSession(currentId)
    }
  })

  // Right sidebar keyboard shortcut (Cmd+Shift+E)
  window.addEventListener('keydown', handleRightSidebarShortcut)
})

onUnmounted(() => {
  if (unsubscribeSettingsChanged) {
    unsubscribeSettingsChanged()
  }
  if (unsubscribeMenuNewChat) {
    unsubscribeMenuNewChat()
  }
  if (unsubscribeMenuCloseChat) {
    unsubscribeMenuCloseChat()
  }
  // Clean up right sidebar shortcut
  window.removeEventListener('keydown', handleRightSidebarShortcut)
})

// Theme is managed by settingsStore.applyTheme() which correctly resolves 'system' to 'light'/'dark'
// Do NOT directly set settings.theme to data-theme as 'system' is not a valid DOM value
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
  position: relative;
}

/* Floating sidebar backdrop */
.sidebar-floating-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 499; /* Just below floating sidebar (500) */
  animation: fadeIn 0.2s ease forwards;
  /* Optimize rendering */
  contain: strict;
  will-change: opacity;
}

.sidebar-floating-backdrop.closing {
  animation: fadeOut 0.2s ease forwards;
}

html[data-theme='light'] .sidebar-floating-backdrop {
  background: rgba(0, 0, 0, 0.15);
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
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

/* Agent Dialog Overlay */
.agent-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.agent-dialog-container {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  background: var(--bg);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
</style>
