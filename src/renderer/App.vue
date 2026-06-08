<template>
  <!-- Settings Window Mode -->
  <SettingsPage v-if="isSettingsWindow" />

  <!-- Image Preview Window Mode -->
  <ImagePreviewWindow v-else-if="isImagePreviewWindow" />

  <!-- Search Everywhere Window Mode -->
  <SearchWindow v-else-if="isSearchWindow" />

  <!-- Todo / Plan Window Mode -->
  <TodoPlanWindow v-else-if="isTodoPlanWindow" />

  <!-- Hidden Voice Runtime Window Mode -->
  <VoiceRuntimeWindow v-else-if="isVoiceRuntimeWindow" />

  <!-- Main App Mode -->
  <ErrorBoundary v-else-if="appReady">
    <div class="app-shell">
      <!-- Main Content - No Header -->
      <div class="app-content">
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
          :media-panel-open="workspacePanelOpen"
          :active-workspace-panel="activeWorkspacePanel"
          @open-settings="openSettingsWindow"
          @toggle-collapse="handleSidebarToggle"
          @open-search="openSearch"
          @create-new-chat="createNewChat"
          @toggle-media-panel="openWorkspacePanel('media')"
          @open-workspace-panel="openWorkspacePanel"
          @resize="handleSidebarResize"
          @mouseleave="handleSidebarMouseLeave"
        />

        <div
          class="app-sidebar-actions"
          :class="{ transitioning: sidebarActionAnimating }"
          :style="{ left: sidebarActionLeft + 'px' }"
        >
          <SidebarActionGroup
            :sidebar-visible="!sidebarCollapsed || sidebarFloating"
            variant="docked"
            @toggle-sidebar="handleSidebarToggle"
            @open-search="openSearch"
            @create-new-chat="createNewChat"
          />
        </div>

        <MediaPanel
          v-if="activeWorkspacePanel"
          mode="main"
          :visible="true"
          :initial-tab="activeWorkspacePanel"
          @close="closeWorkspacePanel"
        />

        <ChatContainer
          v-show="!activeWorkspacePanel"
          ref="chatContainerRef"
          :show-settings="showSettings"
          :sidebar-collapsed="sidebarCollapsed"
          :sidebar-floating="sidebarFloating"
          :show-hover-trigger="sidebarCollapsed && !sidebarFloating"
          :media-panel-open="workspacePanelOpen"
          :show-diff-overlay="showDiffOverlay"
          :diff-overlay-data="diffOverlayData"
          :is-inspector-open="inspectorOpen"
          :reserve-sidebar-actions="reserveSidebarActions"
          @close-settings="showSettings = false"
          @open-settings="showSettings = true"
          @toggle-sidebar="handleSidebarToggle"
          @open-search="openSearch"
          @create-new-chat="createNewChat"
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

        <VoiceOverlay />
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
import { useVoiceStore } from '@/stores/voice'
import { useShortcuts } from '@/composables/useShortcuts'
import { Sidebar } from '@/components/sidebar'
import SidebarActionGroup from '@/components/sidebar/SidebarActionGroup.vue'
import ChatContainer from '@/components/ChatContainer.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import MediaPanel from '@/components/MediaPanel.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import ImagePreviewWindow from '@/components/ImagePreviewWindow.vue'
import ChatInspectorPanel from '@/components/chat/ChatInspectorPanel.vue'
import SearchWindow from '@/components/search/SearchWindow.vue'
import TodoPlanWindow from '@/components/TodoPlanWindow.vue'
import VoiceRuntimeWindow from '@/components/voice/VoiceRuntimeWindow.vue'
import VoiceOverlay from '@/components/voice/VoiceOverlay.vue'
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
const isVoiceRuntimeWindow = computed(() => currentHash.value.startsWith('#/voice-runtime'))
const isAuxiliaryWindow = computed(() =>
  isSettingsWindow.value ||
  isImagePreviewWindow.value ||
  isSearchWindow.value ||
  isTodoPlanWindow.value ||
  isVoiceRuntimeWindow.value
)

function syncCurrentHash() {
  currentHash.value = window.location.hash
}

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const themeStore = useThemeStore()
const voiceStore = useVoiceStore()

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

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks'

// Main workspace panel state. These panels are launched from the sidebar
// actions area and occupy the main content region instead of expanding from
// the left edge.
const activeWorkspacePanel = ref<WorkspacePanel | null>(null)
const workspacePanelOpen = computed(() => activeWorkspacePanel.value !== null)

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


function openWorkspacePanel(panel: WorkspacePanel) {
  if (sidebarFloating.value) {
    closeFloatingSidebar()
  }
  activeWorkspacePanel.value = activeWorkspacePanel.value === panel ? null : panel
}

function closeWorkspacePanel() {
  activeWorkspacePanel.value = null
}

function openSettingsWindow() {
  window.electronAPI.openSettingsWindow()
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
const reserveSidebarActions = ref(sidebarCollapsed.value)
const sidebarActionAnimating = ref(false)
const floatingCooldown = ref(false) // Prevent re-expansion after toggle
const floatingShowTimer = ref<ReturnType<typeof setTimeout> | null>(null) // Delay before showing floating sidebar
let sidebarToggleTimer: ReturnType<typeof setTimeout> | null = null
const SIDEBAR_ACTION_GROUP_WIDTH = 80
const SIDEBAR_ACTION_COLLAPSED_LEFT = 84
const sidebarActionLeft = computed(() => {
  if (sidebarCollapsed.value) return SIDEBAR_ACTION_COLLAPSED_LEFT
  return Math.max(SIDEBAR_ACTION_COLLAPSED_LEFT, sidebarWidth.value - SIDEBAR_ACTION_GROUP_WIDTH)
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
  if (sidebarFloating.value) {
    closeFloatingSidebar()
  } else {
    const nextCollapsed = !sidebarCollapsed.value

    // Animate sidebar width and top-bar reservation as complementary offsets.
    // This keeps the tab strip from being pushed twice during expand.
    floatingCooldown.value = true
    sidebarActionAnimating.value = true
    reserveSidebarActions.value = nextCollapsed
    sidebarCollapsed.value = nextCollapsed

    if (sidebarToggleTimer) {
      clearTimeout(sidebarToggleTimer)
    }
    sidebarToggleTimer = setTimeout(() => {
      sidebarActionAnimating.value = false
      floatingCooldown.value = false
      sidebarToggleTimer = null
    }, 340)
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
  if (!sidebarActionAnimating.value) {
    reserveSidebarActions.value = collapsed
  }
  if (!collapsed) {
    sidebarFloating.value = false
  }
})

// Persist sidebar collapsed state and always show traffic lights
watch([sidebarCollapsed, sidebarFloating, activeWorkspacePanel], ([collapsed]) => {
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
if (!isSettingsWindow.value && !isImagePreviewWindow.value && !isSearchWindow.value && !isVoiceRuntimeWindow.value) {
  useDoubleShift(() => openSearch())
}

// Open a temporary New Chat UI. A real session is created only when the user sends the first message.
async function createNewChat() {
  sessionsStore.openNewChatDraft('New Chat')
  await nextTick()
  chatContainerRef.value?.focusInput?.()
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
  await voiceStore.initialize()

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
      reserveSidebarActions.value = appState.sidebarCollapsed
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

    void (async () => {
      // Update settings and apply appearance through the same path used by
      // local saves and system theme changes.
      await settingsStore.applyAppearanceFromSettings(newSettings, {
        refreshSystemTheme: newSettings.theme === 'system',
      })

      // Per-window model metadata cache: the Settings window may have just
      // refreshed or added models. `settings.selectedModels` is synced via
      // this broadcast, but `providerModels` (the capabilities/metadata Map)
      // is local to each renderer. Drop it so the next ModelSelectorPanel
      // open re-fetches — main has a disk cache, so the round-trip is cheap.
      settingsStore.clearModelsCache()

      // Re-build `availableProviders` from the new settings so custom providers
      // added in the Settings window appear in the main window immediately.
      settingsStore.loadProviders().catch((err) => {
        console.warn('[App] Failed to refresh providers after settings change:', err)
      })
    })().catch((err) => {
      console.warn('[App] Failed to apply settings change:', err)
    })
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
    if (actionId.startsWith('insert-prompt:')) {
      const promptId = actionId.replace('insert-prompt:', '')
      chatContainerRef.value?.insertPromptReference?.(promptId)
      chatContainerRef.value?.focusInput?.()
      return
    }
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
  if (floatingShowTimer.value) {
    clearTimeout(floatingShowTimer.value)
    floatingShowTimer.value = null
  }
  if (sidebarToggleTimer) {
    clearTimeout(sidebarToggleTimer)
    sidebarToggleTimer = null
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
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
}

/* Main Content - Full height, horizontal layout */
.app-content {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
}

.app-sidebar-actions {
  position: fixed;
  top: 12px;
  height: 24px;
  display: flex;
  align-items: center;
  z-index: 700;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.app-sidebar-actions.transitioning {
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
