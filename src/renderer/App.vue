<template>
  <ErrorBoundary>
    <div class="app-shell">
    <!-- Unified Header -->
    <header class="app-header">
      <!-- Sidebar Header Section -->
      <div :class="['header-sidebar', { collapsed: sidebarCollapsed }]">
        <div class="header-controls">
          <button class="icon-btn" @click="sidebarCollapsed = !sidebarCollapsed" title="Toggle sidebar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          <button class="icon-btn" @click="openSearch" title="Search chats">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
          <button class="icon-btn" @click="createNewChat" title="New chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- ChatWindow Header Section -->
      <div class="header-chat">
        <!-- Left: Back button (if branch) -->
        <div class="header-chat-left">
          <button
            v-if="isBranchSession"
            class="back-to-parent-btn"
            title="Back to parent chat"
            @click="goToParentSession"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
        </div>

        <!-- Right: Message count -->
        <div class="header-chat-right">
          <span class="message-count">{{ messageCount }} messages</span>
        </div>
      </div>

      <!-- Center: Editable title bar (positioned relative to app-header, centered over ChatWindow) -->
      <div :class="['chat-title-bar', { expanded: !sidebarCollapsed }]" @click="startEditTitle">
        <svg class="chat-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
    </header>

    <!-- Main Content -->
    <div class="app-content">
      <Sidebar
        :collapsed="sidebarCollapsed"
        @open-settings="showSettings = true"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
      />
      <ChatWindow
        :show-settings="showSettings"
        @close-settings="showSettings = false"
        @open-settings="showSettings = true"
      />
    </div>

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
import Sidebar from '@/components/Sidebar.vue'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()

const showSettings = ref(false)
const sidebarCollapsed = ref(false)

// Current session
const currentSession = computed(() => sessionsStore.currentSession)

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

/* Unified Header */
.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  flex-shrink: 0;
  position: relative; /* For absolute positioning of title bar */
}

/* Sidebar Header Section */
.header-sidebar {
  width: 300px;
  height: 100%;
  padding: 0 14px;
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: flex-end; /* 展开时按钮在右侧 */
  background: var(--panel);
  flex-shrink: 0;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
  position: relative;
  z-index: 10;
}

.header-sidebar.collapsed {
  width: 220px; /* 固定宽度让动画更平滑，留足间距避免重合 */
  padding: 0 14px 0 100px; /* 收起时保留 traffic lights 空间 + 间距 */
  background: rgba(0, 0, 0, 0.08); /* 和 chat header 背景一致 */
  box-shadow: none;
}

html[data-theme='light'] .header-sidebar.collapsed {
  background: rgba(0, 0, 0, 0.02);
}

html[data-theme='light'] .header-sidebar {
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.06);
}

/* Chat Header Section */
.header-chat {
  flex: 1;
  height: 100%;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.08);
  min-width: 0;
}

html[data-theme='light'] .header-chat {
  background: rgba(0, 0, 0, 0.02);
}

.header-chat-left {
  display: flex;
  align-items: center;
}

.header-chat-right {
  margin-left: auto;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.back-to-parent-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.back-to-parent-btn:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--accent);
}

.back-to-parent-btn:active {
  transform: scale(0.98);
}

html[data-theme='light'] .back-to-parent-btn {
  background: rgba(0, 0, 0, 0.03);
}

html[data-theme='light'] .back-to-parent-btn:hover {
  background: rgba(59, 130, 246, 0.08);
}

/* Browser-style title bar - centered over ChatWindow area */
.chat-title-bar {
  position: absolute;
  left: 50%;  /* Centered on full screen = centered over ChatWindow when sidebar collapsed */
  top: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  max-width: 40%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 18px;
  cursor: text;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;
  z-index: 5;
}

/* When sidebar is expanded, offset title to center over chat area */
.chat-title-bar.expanded {
  left: calc(50% + 150px);  /* 150px = half of sidebar width (300px) */
}

.chat-title-bar:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

html[data-theme='light'] .chat-title-bar:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

.chat-title-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.chat-title-text {
  flex: 1;
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.chat-title-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  outline: none;
  text-align: center;
}

.chat-title-input::placeholder {
  color: var(--muted);
}

.message-count {
  font-size: 12px;
  color: var(--muted);
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
  .header-sidebar {
    width: auto !important;
    padding: 0 10px 0 80px !important; /* Reduced traffic lights space */
  }

  .header-sidebar.collapsed {
    padding: 0 10px 0 80px !important;
  }

  .chat-title-bar {
    width: 200px;
    max-width: 35%;
  }

  .chat-title-bar.expanded {
    left: 50%; /* Center on screen when sidebar is expanded */
  }

  .search-modal {
    width: 90%;
    max-width: 400px;
  }
}

@media (max-width: 480px) {
  .app-header {
    height: 50px;
  }

  .header-sidebar {
    padding: 0 8px 0 70px !important;
  }

  .header-controls {
    gap: 2px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
  }

  .chat-title-bar {
    width: 140px;
    max-width: 30%;
    height: 32px;
    padding: 0 10px;
    border-radius: 14px;
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
}
</style>
