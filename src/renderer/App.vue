<template>
  <!-- Settings Window Mode -->
  <SettingsPage v-if="isSettingsWindow" />

  <!-- Image Preview Window Mode -->
  <ImagePreviewWindow v-else-if="isImagePreviewWindow" />

  <!-- Search Everywhere Window Mode -->
  <SearchWindow v-else-if="isSearchWindow" />

  <!-- Todo / Plan Window Mode -->
  <TodoPlanWindow v-else-if="isTodoPlanWindow" />

  <!-- Main App Mode -->
  <ErrorBoundary v-else-if="appReady">
    <div class="app-shell">
      <!-- Main Content - No Header -->
      <div
        class="app-content"
        :style="{
          '--app-toolbar-left': toolbarLeft + 'px',
        }"
      >
        <!-- Media Panel (left side) -->
        <MediaPanel
          :visible="showMediaPanel"
          @close="closeMediaPanel"
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
          @open-settings="openSettingsWindow"
          @toggle-collapse="handleSidebarToggle"
          @open-search="openSearch"
          @create-new-chat="createNewChat"
          @toggle-media-panel="toggleMediaPanel"
          @resize="handleSidebarResize"
          @mouseleave="handleSidebarMouseLeave"
        />

        <!-- Toolbar buttons: animate between sidebar header (right) and traffic lights (left) -->
        <div
          v-show="!showMediaPanel"
          class="app-toolbar"
          :class="{ transitioning: toolbarAnimating }"
          :style="{ left: toolbarLeft + 'px' }"
        >
          <button
            class="app-toolbar-btn"
            title="Toggle sidebar"
            @click="handleSidebarToggle"
          >
            <PanelLeftClose
              v-if="!sidebarCollapsed || sidebarFloating"
              :size="14"
              :stroke-width="1.5"
            />
            <PanelLeftOpen
              v-else
              :size="14"
              :stroke-width="1.5"
            />
          </button>
          <button
            class="app-toolbar-btn"
            title="Search"
            @click="openSearch"
          >
            <Search
              :size="14"
              :stroke-width="1.5"
            />
          </button>
          <button
            class="app-toolbar-btn"
            title="New chat"
            @click="createNewChat"
          >
            <SquarePen
              :size="14"
              :stroke-width="1.5"
            />
          </button>
        </div>

        <ChatContainer
          ref="chatContainerRef"
          :show-settings="showSettings"
          :sidebar-collapsed="sidebarCollapsed"
          :sidebar-floating="sidebarFloating"
          :show-hover-trigger="sidebarCollapsed && !sidebarFloating && !showMediaPanel"
          :media-panel-open="showMediaPanel"
          :show-diff-overlay="showDiffOverlay"
          :diff-overlay-data="diffOverlayData"
          :is-inspector-open="inspectorOpen"
          @close-settings="showSettings = false"
          @open-settings="showSettings = true"
          @toggle-sidebar="handleSidebarToggle"
          @show-floating-sidebar="handleTriggerEnter"
          @hide-floating-sidebar="handleTriggerLeave"
          @close-diff-overlay="closeDiffOverlay"
          @toggle-inspector="inspectorOpen = !inspectorOpen"
        />

        <!-- Session Lens (app-level right sidebar) -->
        <Transition name="lens-pop">
          <ChatInspectorPanel
            v-if="inspectorOpen && sessionsStore.currentSessionId"
            :session-id="sessionsStore.currentSessionId"
            @close="inspectorOpen = false"
          />
        </Transition>
      </div>

      <!-- Old search overlay removed — replaced by Search Everywhere window -->
    </div>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useThemeStore } from '@/stores/themes'
import { useShortcuts } from '@/composables/useShortcuts'
import { Sidebar } from '@/components/sidebar'
import ChatContainer from '@/components/ChatContainer.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import MediaPanel from '@/components/MediaPanel.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import ImagePreviewWindow from '@/components/ImagePreviewWindow.vue'
import ChatInspectorPanel from '@/components/chat/ChatInspectorPanel.vue'
import SearchWindow from '@/components/search/SearchWindow.vue'
import TodoPlanWindow from '@/components/TodoPlanWindow.vue'
import { PanelLeftClose, PanelLeftOpen, Search, SquarePen } from 'lucide-vue-next'
import { useDoubleShift } from '@/composables/useDoubleShift'
import { ensureCacheReady as ensureMarkdownCacheReady } from '@/components/chat/message/markdownRenderCache'


// Type for diff overlay data
interface DiffOverlayData {
  filePath: string
  workingDirectory: string
  sessionId: string
  isStaged: boolean
}

// Detect auxiliary windows from the hash. Keep it reactive because dev HMR
// and BrowserWindow reuse can change the hash after App has already mounted.
const currentHash = ref(window.location.hash)
const isSettingsWindow = computed(() => currentHash.value.startsWith('#/settings'))
const isImagePreviewWindow = computed(() => currentHash.value.startsWith('#/image-preview'))
const isSearchWindow = computed(() => currentHash.value.startsWith('#/search'))
const isTodoPlanWindow = computed(() => currentHash.value.startsWith('#/todo-plan'))
const isAuxiliaryWindow = computed(() =>
  isSettingsWindow.value ||
  isImagePreviewWindow.value ||
  isSearchWindow.value ||
  isTodoPlanWindow.value
)

function syncCurrentHash() {
  currentHash.value = window.location.hash
}

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const themeStore = useThemeStore()

const appReady = ref(false)
const showSettings = ref(false)
const chatContainerRef = ref<InstanceType<typeof ChatContainer> | null>(null)
const inspectorOpen = ref(false)

// Sidebar width (persisted)
const sidebarWidth = ref(parseInt(localStorage.getItem('sidebarWidth') || '300', 10))
function handleSidebarResize(width: number) {
  sidebarWidth.value = width
  localStorage.setItem('sidebarWidth', String(width))
}

// Media Panel state
const showMediaPanel = ref(false)

// Diff overlay state
const showDiffOverlay = ref(false)
const diffOverlayData = ref<DiffOverlayData | null>(null)

// Diff overlay functions
function openDiffOverlay(data: DiffOverlayData) {
  diffOverlayData.value = data
  showDiffOverlay.value = true
}

function closeDiffOverlay() {
  showDiffOverlay.value = false
  diffOverlayData.value = null
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

function openSettingsWindow() {
  window.electronAPI.openSettingsWindow()
}

function closeMediaPanel() {
  showMediaPanel.value = false
  sidebarCollapsed.value = false
  floatingCooldown.value = true
  setTimeout(() => {
    floatingCooldown.value = false
  }, 400)
}


// Setup global keyboard shortcuts
useShortcuts({
  onNewChat: () => {
    if (isAuxiliaryWindow.value) return
    createNewChat()
  },
  onToggleSidebar: () => {
    if (isAuxiliaryWindow.value) return
    handleSidebarToggle()
  },
  onFocusInput: () => {
    if (isAuxiliaryWindow.value) return
    chatContainerRef.value?.focusInput()
  },
  onOpenSettings: () => {
    if (isAuxiliaryWindow.value) return
    window.electronAPI.openSettingsWindow()
  },
  onSearchEverywhere: () => {
    if (isAuxiliaryWindow.value) return
    openSearch()
  },
  onToggleTodoPlanWindow: () => {
    window.electronAPI?.toggleTodoPlanWindow?.({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })
  },
  onToggleTodoPlan: () => {
    if (isAuxiliaryWindow.value) return
    window.dispatchEvent(new CustomEvent('todo-plan:toggle-card'))
  },
})


// Persist sidebar collapsed state and control traffic lights visibility
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
const sidebarFloating = ref(false)
const sidebarFloatingClosing = ref(false)
const sidebarNoTransition = ref(false) // Disable transition during/after floating
const floatingCooldown = ref(false) // Prevent re-expansion after toggle
const floatingShowTimer = ref<ReturnType<typeof setTimeout> | null>(null) // Delay before showing floating sidebar
const TOOLBAR_SLOT_WIDTH = 80

// Toolbar position — single set of buttons, animated between sidebar right and traffic lights
const toolbarLeft = computed(() => {
  if (sidebarCollapsed.value && !sidebarFloating.value) return 84
  if (sidebarFloating.value) return 300 - TOOLBAR_SLOT_WIDTH
  return sidebarWidth.value - TOOLBAR_SLOT_WIDTH
})

const toolbarAnimating = ref(false)
watch([sidebarCollapsed, sidebarFloating], () => {
  toolbarAnimating.value = true
  setTimeout(() => toolbarAnimating.value = false, 350)
})

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

// Persist sidebar collapsed state and always show traffic lights
watch([sidebarCollapsed, sidebarFloating, showMediaPanel], ([collapsed]) => {
  localStorage.setItem('sidebarCollapsed', String(collapsed))
  // Auxiliary windows own their chrome behavior. Todo/Notes uses native hover-only buttons.
  if (isSettingsWindow.value || isImagePreviewWindow.value || isSearchWindow.value || isTodoPlanWindow.value) return
  // Always show traffic lights since sidebar strip is always visible
  window.electronAPI?.setWindowButtonVisibility?.(true).catch(() => {
    // Handler may not be registered yet during initial load
  })
}, { immediate: true })


// Search Everywhere — open via IPC (toolbar button + double shift)
function openSearch() {
  window.electronAPI.toggleSearchWindow()
}

// Double Shift to open search (only in main window)
if (!isSettingsWindow.value && !isImagePreviewWindow.value && !isSearchWindow.value) {
  useDoubleShift(() => openSearch())
}

// Re-apply theme when mode (light/dark) changes
watch(() => settingsStore.effectiveTheme, () => {
  themeStore.reapplyTheme()
})

// Create new chat, reusing an existing empty session if available
async function createNewChat() {
  // Check if there's an existing empty session
  const existingEmptySession = sessionsStore.filteredSessions.find(
    s => (s.name === 'New Chat' || s.name === '') && (!s.messages || s.messages.length === 0)
  )

  if (existingEmptySession) {
    await sessionsStore.switchSession(existingEmptySession.id)
  } else {
    await sessionsStore.createSession('New Chat')
  }
}

let unsubscribeSettingsChanged: (() => void) | null = null
let unsubscribeMenuNewChat: (() => void) | null = null
let unsubscribeMenuCloseChat: (() => void) | null = null
let unsubscribeSearchAction: (() => void) | null = null

onMounted(async () => {
  window.addEventListener('hashchange', syncCurrentHash)

  // Fonts are already preloaded in main.ts before mount, so the markdown cache
  // is the only async dep we still need to gate `appReady` on.
  const markdownCacheReady = ensureMarkdownCacheReady()

  // Load initial data
  await sessionsStore.loadSessions()
  await settingsStore.loadSettings()

  // Initialize theme system (must be after settings load)
  await themeStore.initialize()

  // Restore last session from saved app state
  try {
    const appState = await window.electronAPI.getAppState()
    if (appState.currentSessionId) {
      const sessionExists = sessionsStore.sessions.some(s => s.id === appState.currentSessionId)
      if (sessionExists) {
        await sessionsStore.switchSession(appState.currentSessionId)
      }
    }
    if (appState.sidebarCollapsed !== undefined) {
      sidebarCollapsed.value = appState.sidebarCollapsed
    }
  } catch (e) {
    console.warn('[App] Failed to restore app state:', e)
  }

  // Make sure the disk-restored markdown cache is in memory before MessageList
  // mounts; otherwise the first render misses every entry.
  try {
    await markdownCacheReady
  } catch (e) {
    console.warn('[App] markdown cache init failed', e)
  }

  appReady.value = true

  // Listen for settings changes from other windows (e.g., settings window)
  unsubscribeSettingsChanged = window.electronAPI.onSettingsChanged((newSettings) => {
    console.log('[App] Settings changed from another window')

    // Update settings store
    settingsStore.settings = newSettings

    // Per-window model metadata cache: the Settings window may have just
    // refreshed or added models. `settings.selectedModels` is synced via
    // this broadcast, but `providerModels` (the capabilities/metadata Map)
    // is local to each renderer. Drop it so the next ModelSelectorPanel
    // open re-fetches — main has a disk cache, so the round-trip is cheap.
    settingsStore.clearModelsCache()

    // Re-build `availableProviders` from the new settings — direct settings
    // assignment doesn't rebuild it, so a custom provider added in the
    // Settings window would otherwise stay invisible to the InputBox model
    // picker until restart. Fire-and-forget; the IPC round-trip just refetches
    // built-ins and merges current customProviders.
    settingsStore.loadProviders().catch((err) => {
      console.warn('[App] Failed to refresh providers after settings change:', err)
    })

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

  // Listen for search action execution from Search Everywhere window
  unsubscribeSearchAction = window.electronAPI.onSearchAction(async (actionId: string) => {
    if (actionId.startsWith('switch-session:')) {
      const sessionId = actionId.replace('switch-session:', '')
      await sessionsStore.switchSession(sessionId)
      return
    }
    if (actionId.startsWith('open-file:')) {
      const filePath = actionId.replace('open-file:', '')
      chatContainerRef.value?.openFileTab?.(filePath)
      return
    }
    if (actionId.startsWith('jump-message:')) {
      const payload = actionId.replace('jump-message:', '')
      const separatorIndex = payload.indexOf(':')
      if (separatorIndex >= 0) {
        const sessionId = payload.slice(0, separatorIndex)
        const messageId = payload.slice(separatorIndex + 1)
        await chatContainerRef.value?.jumpToMessage?.(sessionId, messageId)
      }
      return
    }
    switch (actionId) {
      case 'new-chat': await createNewChat(); break
      case 'open-settings': openSettingsWindow(); break
      case 'toggle-sidebar': handleSidebarToggle(); break
      case 'toggle-inspector': inspectorOpen.value = !inspectorOpen.value; break
      case 'close-chat': {
        const id = sessionsStore.currentSessionId
        if (id) await sessionsStore.deleteSession(id)
        break
      }
      case 'focus-input':
        chatContainerRef.value?.focusInput?.()
        break
    }
  })

})

onUnmounted(() => {
  window.removeEventListener('hashchange', syncCurrentHash)

  if (unsubscribeSettingsChanged) {
    unsubscribeSettingsChanged()
  }
  if (unsubscribeMenuNewChat) {
    unsubscribeMenuNewChat()
  }
  if (unsubscribeMenuCloseChat) {
    unsubscribeMenuCloseChat()
  }
  if (unsubscribeSearchAction) {
    unsubscribeSearchAction()
  }
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

/* Session Lens slide transition */
.lens-pop-enter-active,
.lens-pop-leave-active {
  transition: width 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.26s ease;
  overflow: hidden;
}

.lens-pop-enter-from,
.lens-pop-leave-to {
  width: 0 !important;
  opacity: 0;
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

/* App toolbar — single set of buttons that slides between sidebar right and traffic lights */
.app-toolbar {
  position: fixed;
  top: 12px;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 2px;
  z-index: 600;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.app-toolbar::before {
  content: '';
  position: absolute;
  inset: -3px -6px;
  border-radius: 8px;
  z-index: 0;
  -webkit-app-region: no-drag;
}

.app-toolbar.transitioning {
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-toolbar-btn {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 6px;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-toolbar-btn:hover {
  background: var(--hover);
  color: var(--text);
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
