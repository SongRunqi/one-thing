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
    <div
      v-if="sidebarFloating || sidebarFloatingClosing"
      class="app-floating-sidebar-host"
    >
      <!-- Floating sidebar overlay backdrop -->
      <!--      <div-->
      <!--        v-if="sidebarFloating"-->
      <!--        :class="['sidebar-floating-backdrop', { closing: sidebarFloatingClosing }]"-->
      <!--        @click="closeFloatingSidebar"-->
      <!--      ></div>-->

      <Sidebar
        :collapsed="false"
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
        @select-session="selectSidebarSession"
        @request-floating-keep-open="keepFloatingSidebarOpen"
        @request-floating-close="closeFloatingSidebar"
      />
    </div>

    <Splitter
      class="app-shell"
      :class="{ 'is-sidebar-resizing': sidebarResizing }"
      :gap="0"
      :resizer-size="1"
      :resizer-hit-size="12"
      @resize-start="handleSidebarResizeStart"
      @resize-end="handleSidebarResizeEnd"
    >
      <SplitterPanel
        v-if="sidebarDockedVisible"
        v-model:size="sidebarWidth"
        as="aside"
        class="app-left-sidebar-region"
        size-unit="px"
        :min="MIN_SIDEBAR_WIDTH"
        :max="MAX_SIDEBAR_WIDTH"
      >
        <Sidebar
          :collapsed="false"
          :floating="false"
          :floating-closing="false"
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
          @select-session="selectSidebarSession"
        />
      </SplitterPanel>

      <!-- Main Content - No Header -->
      <SplitterPanel
        flex
        class="app-shell-main-region"
        :resizable="sidebarDockedVisible"
      >
        <div class="app-content">
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

        <Splitter
          class="app-content-splitter"
          :gap="0"
          :resizer-size="1"
          :resizer-hit-size="12"
          @resize-start="inspectorResizing = true"
          @resize-end="handleInspectorResizeEnd"
        >
          <SplitterPanel
            v-model:size="mainWorkspacePanelSize"
            :min="52"
            :resizable="inspectorVisible"
          >
            <Container
              as="div"
              main-as="div"
              class="app-main-region"
              body-class="app-main-body"
              main-class="app-main-content-region"
              full-height
              :main-flex="'1 1 0'"
              overflow="hidden"
              main-overflow="hidden"
            >
              <div
                class="workspace-view-stack"
                :data-active-workspace-view="activeWorkspaceView"
              >
                <ChatContainer
                  v-show="activeWorkspaceView === 'chat'"
                  ref="chatContainerRef"
                  class="workspace-view workspace-view-chat"
                  :show-settings="showSettings"
                  :sidebar-collapsed="sidebarCollapsed"
                  :sidebar-floating="sidebarFloating"
                  :show-hover-trigger="sidebarCollapsed && !sidebarFloating"
                  :media-panel-open="workspacePanelOpen"
                  :show-diff-overlay="showDiffOverlay"
                  :diff-overlay-data="diffOverlayData"
                  :is-inspector-open="inspectorOpen"
                  :reserve-sidebar-actions="reserveSidebarActions"
                  :layout-transitioning="sidebarActionAnimating"
                  @close-settings="showSettings = false"
                  @open-settings="showSettings = true"
                  @toggle-sidebar="handleSidebarToggle"
                  @open-search="openSearch"
                  @create-new-chat="createNewChat"
                  @show-floating-sidebar="handleTriggerEnter"
                  @hide-floating-sidebar="handleTriggerLeave"
                  @close-diff-overlay="closeDiffOverlay"
                  @toggle-inspector="inspectorOpen = !inspectorOpen"
                  @open-file="openFileInRightWorkbench"
                />

                <MediaPanel
                  v-show="workspacePanelOpen"
                  class="workspace-view workspace-view-panel"
                  mode="main"
                  :visible="workspacePanelOpen"
                  :active-tab="activeWorkspacePanel"
                  :reserve-sidebar-actions="reserveSidebarActions"
                  @close="closeWorkspacePanel"
                />
              </div>
            </Container>
          </SplitterPanel>

          <SplitterPanel
            v-if="inspectorVisible"
            v-model:size="inspectorPanelSize"
            as="aside"
            class="app-right-sidebar-region"
            :min="22"
            :max="48"
          >
            <RightWorkbenchPanel
              ref="rightWorkbenchRef"
              :session-id="sessionsStore.currentSessionId"
              :workspace-root="currentWorkspaceRoot"
              :workspace-roots="currentWorkspaceRoots"
              @close="inspectorOpen = false"
            />
          </SplitterPanel>
        </Splitter>

        <VoiceOverlay />
        </div>
      </SplitterPanel>

      <!-- Old search overlay removed — replaced by Search Everywhere window -->
    </Splitter>
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
import Container from '@/components/common/Container.vue'
import Splitter from '@/components/common/Splitter.vue'
import SplitterPanel from '@/components/common/SplitterPanel.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import MediaPanel from '@/components/MediaPanel.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import ImagePreviewWindow from '@/components/ImagePreviewWindow.vue'
import RightWorkbenchPanel from '@/components/workbench/RightWorkbenchPanel.vue'
import SearchWindow from '@/components/search/SearchWindow.vue'
import TodoPlanWindow from '@/components/TodoPlanWindow.vue'
import VoiceRuntimeWindow from '@/components/voice/VoiceRuntimeWindow.vue'
import VoiceOverlay from '@/components/voice/VoiceOverlay.vue'
import { useDoubleShift } from '@/composables/useDoubleShift'
import { ensureCacheReady as ensureMarkdownCacheReady } from '@/components/chat/message/markdownRenderCache'
import { platformApi } from '@/platform'


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
const rightWorkbenchRef = ref<InstanceType<typeof RightWorkbenchPanel> | null>(null)
const inspectorOpen = computed({
  get: () => chatStore.inspectorOpen,
  set: (val) => { chatStore.inspectorOpen = val }
})

// Sidebar width (persisted)
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return 300
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

const sidebarWidth = ref(clampSidebarWidth(parseInt(localStorage.getItem('sidebarWidth') || '300', 10)))
const sidebarResizing = ref(false)

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks'
type TodoPlanWebWindowActionDetail = {
  action?: 'open' | 'hide' | 'toggle' | 'pin'
}

const TODO_PLAN_WEB_WINDOW_EVENT = 'todo-plan:web-window-action'

// Main workspace panel state. These panels are launched from the sidebar
// actions area and occupy the main content region instead of expanding from
// the left edge.
const activeWorkspacePanel = ref<WorkspacePanel | null>(null)
const workspacePanelOpen = computed(() => activeWorkspacePanel.value !== null)
const activeWorkspaceView = computed(() => activeWorkspacePanel.value ?? 'chat')

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
  activeWorkspacePanel.value = panel
}

function closeWorkspacePanel() {
  activeWorkspacePanel.value = null
}

function handleTodoPlanWebWindowAction(event: Event) {
  if (isAuxiliaryWindow.value) return
  const detail = (event as CustomEvent<TodoPlanWebWindowActionDetail>).detail
  switch (detail?.action) {
    case 'open':
      openWorkspacePanel('tasks')
      break
    case 'hide':
      if (activeWorkspacePanel.value === 'tasks') {
        closeWorkspacePanel()
      }
      break
    case 'toggle':
      if (activeWorkspacePanel.value === 'tasks') {
        closeWorkspacePanel()
      } else {
        openWorkspacePanel('tasks')
      }
      break
    case 'pin':
      break
  }
}

async function selectSidebarSession(sessionId: string) {
  if (sidebarFloating.value) {
    closeFloatingSidebar()
  }
  activeWorkspacePanel.value = null
  await sessionsStore.switchSession(sessionId)
}

function openSettingsWindow() {
  platformApi.openSettingsWindow()
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
    platformApi.openSettingsWindow()
  },
  onSearchEverywhere: () => {
    if (isAuxiliaryWindow.value) return
    openSearch()
  },
  onToggleTodoPlanWindow: () => {
    platformApi?.toggleTodoPlanWindow?.({
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
const sidebarDockedVisible = computed(() =>
  !sidebarCollapsed.value && !sidebarFloating.value && !sidebarFloatingClosing.value
)
const reserveSidebarActions = ref(sidebarCollapsed.value)
const sidebarActionAnimating = ref(false)
const floatingCooldown = ref(false) // Prevent re-expansion after toggle
const floatingShowTimer = ref<ReturnType<typeof setTimeout> | null>(null) // Delay before showing floating sidebar
let sidebarToggleTimer: ReturnType<typeof setTimeout> | null = null
let floatingCloseTimer: ReturnType<typeof setTimeout> | null = null
let floatingCooldownTimer: ReturnType<typeof setTimeout> | null = null
const SIDEBAR_ACTION_GROUP_WIDTH = 80
const SIDEBAR_ACTION_COLLAPSED_LEFT = 84
const sidebarActionLeft = computed(() => {
  if (sidebarCollapsed.value) return SIDEBAR_ACTION_COLLAPSED_LEFT
  return Math.max(SIDEBAR_ACTION_COLLAPSED_LEFT, sidebarWidth.value - SIDEBAR_ACTION_GROUP_WIDTH)
})

function handleSidebarResizeStart() {
  sidebarResizing.value = true
}

function handleSidebarResizeEnd() {
  sidebarWidth.value = clampSidebarWidth(sidebarWidth.value)
  sidebarResizing.value = false
  localStorage.setItem('sidebarWidth', String(sidebarWidth.value))
}
const inspectorVisible = computed(() => inspectorOpen.value && Boolean(sessionsStore.currentSessionId))
function normalizeRootPath(root?: string | null): string {
  if (!root) return ''
  const trimmed = root.trim()
  if (trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '')
}

function uniqueRootPaths(roots: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const root of roots) {
    const normalized = normalizeRootPath(root)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

const currentWorkspaceRoots = computed(() => {
  const session = sessionsStore.currentSession
  return uniqueRootPaths([
    session?.workingDirectory,
    ...(session?.workingDirectoryRoots || []),
  ])
})
const currentWorkspaceRoot = computed(() => currentWorkspaceRoots.value[0] || '')
const MIN_INSPECTOR_PANEL_SIZE = 22
const MAX_INSPECTOR_PANEL_SIZE = 48
const DEFAULT_INSPECTOR_PANEL_SIZE = 32

function clampInspectorPanelSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_INSPECTOR_PANEL_SIZE
  return Math.min(MAX_INSPECTOR_PANEL_SIZE, Math.max(MIN_INSPECTOR_PANEL_SIZE, size))
}

const inspectorPanelSize = ref(clampInspectorPanelSize(
  Number.parseFloat(localStorage.getItem('inspectorPanelSize') || String(DEFAULT_INSPECTOR_PANEL_SIZE))
))
const inspectorResizing = ref(false)
const mainWorkspacePanelSize = computed({
  get: () => inspectorVisible.value ? 100 - inspectorPanelSize.value : 100,
  set: (size: number) => {
    if (!inspectorVisible.value) return
    inspectorPanelSize.value = clampInspectorPanelSize(100 - size)
  }
})

function handleInspectorResizeEnd() {
  inspectorResizing.value = false
  localStorage.setItem('inspectorPanelSize', String(inspectorPanelSize.value))
}

async function openFileInRightWorkbench(filePath: string) {
  if (!filePath) return
  inspectorOpen.value = true
  await nextTick()
  await rightWorkbenchRef.value?.openFile(filePath)
}

// Close floating sidebar with animation
function closeFloatingSidebar() {
  if (!sidebarFloating.value || sidebarFloatingClosing.value) return
  if (floatingCloseTimer) {
    clearTimeout(floatingCloseTimer)
    floatingCloseTimer = null
  }
  if (floatingCooldownTimer) {
    clearTimeout(floatingCooldownTimer)
    floatingCooldownTimer = null
  }
  sidebarFloatingClosing.value = true
  sidebarNoTransition.value = true
  floatingCooldown.value = true
  floatingCloseTimer = setTimeout(() => {
    sidebarFloating.value = false
    sidebarFloatingClosing.value = false
    floatingCloseTimer = null
    // Keep transition disabled a bit longer to prevent flash
    floatingCooldownTimer = setTimeout(() => {
      sidebarNoTransition.value = false
      floatingCooldown.value = false
      floatingCooldownTimer = null
    }, 300)
  }, 200) // Match animation duration
}

function keepFloatingSidebarOpen() {
  if (!sidebarFloating.value && !sidebarFloatingClosing.value) return
  if (floatingCloseTimer) {
    clearTimeout(floatingCloseTimer)
    floatingCloseTimer = null
  }
  if (floatingCooldownTimer) {
    clearTimeout(floatingCooldownTimer)
    floatingCooldownTimer = null
  }
  sidebarFloating.value = true
  sidebarFloatingClosing.value = false
  floatingCooldown.value = false
  sidebarNoTransition.value = false
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
  platformApi?.setWindowButtonVisibility?.(true).catch(() => {
    // Handler may not be registered yet during initial load
  })
}, { immediate: true })


// Search Everywhere — open via IPC (toolbar button + double shift)
function openSearch() {
  platformApi.toggleSearchWindow()
}

// Double Shift to open search (only in main window)
if (!isSettingsWindow.value && !isImagePreviewWindow.value && !isSearchWindow.value && !isVoiceRuntimeWindow.value) {
  useDoubleShift(() => openSearch())
}

// Open a temporary New Chat UI. A real session is created only when the user sends the first message.
async function createNewChat() {
  activeWorkspacePanel.value = null
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
  window.addEventListener(TODO_PLAN_WEB_WINDOW_EVENT, handleTodoPlanWebWindowAction)

  const markdownCacheReady = ensureMarkdownCacheReady().catch((e) => {
    console.warn('[App] markdown cache init failed', e)
  })
  const appStateReady = platformApi.getAppState().catch((e) => {
    console.warn('[App] Failed to restore app state:', e)
    return null
  })

  // Load independent startup data in parallel. Voice is intentionally
  // initialized in the background so microphone state never blocks first paint.
  await Promise.all([
    sessionsStore.loadSessions(),
    settingsStore.loadSettings(),
  ])
  void voiceStore.initialize().catch((e) => {
    console.warn('[App] voice init failed', e)
  })

  // Initialize theme system (must be after settings load)
  await themeStore.initialize()

  // Restore last session from saved app state
  const appState = await appStateReady
  if (appState) {
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
  }

  appReady.value = true
  void markdownCacheReady

  // Listen for settings changes from other windows (e.g., settings window)
  unsubscribeSettingsChanged = platformApi.onSettingsChanged((newSettings) => {
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
  unsubscribeMenuNewChat = platformApi.onMenuNewChat(() => {
    createNewChat()
  })

  unsubscribeMenuCloseChat = platformApi.onMenuCloseChat(async () => {
    const currentId = sessionsStore.currentSessionId
    if (currentId) {
      await sessionsStore.deleteSession(currentId)
    }
  })

  // Listen for search action execution from Search Everywhere window
  unsubscribeSearchAction = platformApi.onSearchAction(async (actionId: string) => {
    if (actionId.startsWith('insert-prompt:')) {
      const promptId = actionId.replace('insert-prompt:', '')
      chatContainerRef.value?.insertPromptReference?.(promptId)
      chatContainerRef.value?.focusInput?.()
      return
    }
    if (actionId.startsWith('switch-session:')) {
      const sessionId = actionId.replace('switch-session:', '')
      activeWorkspacePanel.value = null
      await sessionsStore.switchSession(sessionId)
      return
    }
    if (actionId.startsWith('open-file:')) {
      const filePath = actionId.replace('open-file:', '')
      await openFileInRightWorkbench(filePath)
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
  window.removeEventListener(TODO_PLAN_WEB_WINDOW_EVENT, handleTodoPlanWebWindowAction)

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
  if (floatingCloseTimer) {
    clearTimeout(floatingCloseTimer)
    floatingCloseTimer = null
  }
  if (floatingCooldownTimer) {
    clearTimeout(floatingCooldownTimer)
    floatingCooldownTimer = null
  }
})

// Theme is managed by settingsStore.applyTheme() which correctly resolves 'system' to 'light'/'dark'
// Do NOT directly set settings.theme to data-theme as 'system' is not a valid DOM value
</script>

<style scoped>
.app-shell {
  --app-sidebar-transition-duration: 0.3s;
  --app-sidebar-transition-ease: cubic-bezier(0.4, 0, 0.2, 1);

  height: 100%;
  width: 100%;
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
}

.app-shell :deep(.app-shell-body),
.app-shell :deep(.app-shell-main-region),
.app-shell :deep(.app-content-body),
.app-shell :deep(.app-content-main-region),
.app-shell :deep(.app-main-body),
.app-shell :deep(.app-main-content-region) {
  min-width: 0;
  min-height: 0;
}

.app-shell :deep(.app-shell-body),
.app-shell :deep(.app-shell-main-region),
.app-shell :deep(.app-content-body),
.app-shell :deep(.app-content-main-region),
.app-shell :deep(.app-main-body),
.app-shell :deep(.app-main-content-region) {
  height: 100%;
}

.app-shell :deep(.app-left-sidebar-region),
.app-shell :deep(.app-right-sidebar-region) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.app-shell :deep(.app-shell-main-region),
.app-shell :deep(.app-content-main-region),
.app-shell :deep(.app-main-content-region) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-shell :deep(.app-left-sidebar-region > .sidebar) {
  flex: 1 1 auto;
  height: 100%;
}

.app-shell :deep(.app-left-sidebar-region) {
  /* Keep layout width discrete; animating it relayouts the full message list every frame. */
  transition: none;
}

.app-shell.is-sidebar-resizing :deep(.app-left-sidebar-region) {
  transition: none;
}

/* Main Content - Full height, horizontal layout */
.app-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
}

.app-main-region {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
}

.app-content-splitter {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.app-right-sidebar-region {
  position: relative;
}

.workspace-view-stack {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-surface-app-bg, var(--bg-app, var(--bg)));
}

.workspace-view {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
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
  transition: none;
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
