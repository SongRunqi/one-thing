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

      <!-- 折叠 = 整条侧栏卸下来(classic 与 workbench 同一套语义)。
           方案三曾在 workbench 下把折叠画成一条 46px 的 rail,2026-07-31 撤掉:
           macOS 的三颗交通灯横跨到窗口左起 ~70px,比 rail 还宽,于是黄绿两颗
           压在聊天区上、横跨那条竖分隔线;顶栏又按"顶到窗口左缘"死留 84px,
           没扣掉左边这 46px,标题被平白推远一截。左上角因此永远对不齐。
           五个类别入口在收起态由顶栏那组按钮 + 浮层侧栏(hover 左缘)承接。 -->

      <!-- Main Content - No Header -->
      <SplitterPanel
        flex
        class="app-shell-main-region"
        :resizable="sidebarDockedVisible"
      >
        <div
          ref="appContentRef"
          class="app-content"
        >
          <Splitter
            ref="contentSplitterRef"
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
                    :sidebar-collapsed="sidebarCollapsed"
                    :sidebar-floating="sidebarFloating"
                    :show-hover-trigger="sidebarCollapsed && !sidebarFloating"
                    :media-panel-open="workspacePanelOpen"
                    :is-inspector-open="inspectorOpen"
                    :reserve-sidebar-actions="reserveSidebarActions"
                    :layout-transitioning="sidebarActionAnimating"
                    @toggle-sidebar="handleSidebarToggle"
                    @open-search="openSearch"
                    @create-new-chat="createNewChat"
                    @show-floating-sidebar="handleTriggerEnter"
                    @hide-floating-sidebar="handleTriggerLeave"
                    @toggle-inspector="inspectorOpen = !inspectorOpen"
                    @open-file="openFileInRightWorkbench"
                    @review-goal="openGoalReviewInRightWorkbench"
                  />

                  <MediaPanel
                    v-show="workspacePanelOpen"
                    class="workspace-view workspace-view-panel"
                    mode="main"
                    :visible="workspacePanelOpen"
                    :active-tab="activeWorkspacePanel"
                    :reserve-sidebar-actions="reserveSidebarActions"
                    @close="closeWorkspacePanel"
                    @toggle-sidebar="handleSidebarToggle"
                    @open-search="openSearch"
                    @create-new-chat="createNewChat"
                  />
                </div>
              </Container>
            </SplitterPanel>

            <!-- Collapsed (not unmounted) when hidden: the panel slides shut
                 symmetrically and workbench tab state survives toggles. The
                 slide wrapper freezes content at the expanded width so the
                 panel edge clips it instead of reflowing tabs every frame. -->
            <SplitterPanel
              v-if="workbenchMounted"
              as="aside"
              class="app-right-sidebar-region"
              :size="inspectorPanelSize"
              :min="inspectorMinPanelSize"
              :max="48"
              :collapsed="!workbenchRevealed"
              @update:size="handleInspectorPanelSizeUpdate"
            >
              <div
                class="workbench-slide"
                :style="workbenchSlideStyle"
              >
                <RightWorkbenchPanel
                  ref="rightWorkbenchRef"
                  :session-id="sessionsStore.currentSessionId"
                  :workspace-root="currentWorkspaceRoot"
                  :workspace-roots="currentWorkspaceRoots"
                  :revealed="workbenchRevealed"
                  :shell-mode="shellMode"
                  @close="inspectorOpen = false"
                />
              </div>
            </SplitterPanel>
          </Splitter>

          <VoiceOverlay />
          <VoiceCallPanel />
        </div>
      </SplitterPanel>

      <!-- Old search overlay removed — replaced by Search Everywhere window -->
    </Splitter>
  </ErrorBoundary>

  <!-- Evals incident workbench (full-screen overlay). Rendered OUTSIDE the
       window-mode branches: the entry button lives in the Settings window,
       which renders the SettingsPage branch — an overlay confined to the
       main-app branch would never appear there. -->
  <EvalsWorkbench v-if="evalsWorkbenchStore.open" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useThemeStore } from '@/stores/themes'
import { useVoiceStore } from '@/stores/voice'
import { useShortcuts } from '@/composables/useShortcuts'
import { resolveInspectorDefaultOpen, resolveShellMode } from '@/composables/useShellMode'
import { Sidebar } from '@/components/sidebar'
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
import VoiceCallPanel from '@/components/voice/VoiceCallPanel.vue'
import EvalsWorkbench from '@/components/evals/EvalsWorkbench.vue'
import { useEvalsWorkbenchStore } from '@/stores/evalsWorkbench'
import { useOverlayPresenceStore } from '@/stores/overlayPresence'
import { useBrowserStore } from '@/stores/browser'
import { useDoubleShift } from '@/composables/useDoubleShift'
import { ensureCacheReady as ensureMarkdownCacheReady } from '@/components/chat/message/markdownRenderCache'
import { platformApi } from '@/platform'
import { useCollabBoardStore } from '@/stores/collabBoard'
import {
  AGENT_OPEN_WORKSPACE_EVENT,
  AGENT_OPEN_SPACE_EVENT,
  useAgentsStore,
  type AgentOpenSpaceDetail,
} from '@/stores/agents'
import {
  COLLAB_TAG_OPEN_AGENT_EVENT,
  COLLAB_TAG_OPEN_CARD_EVENT,
  COLLAB_TAG_OPEN_FILE_EVENT,
  registerCollabMentionResolver,
  registerCollabTagVerifier,
} from '@/composables/collabInlineTags'
import { resolveDeliverablePath } from '@/components/workbench/collab-board-card'
import { OPEN_MEMBERS_EVENT, type OpenMembersDetail } from '@/components/workbench/room-members'

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
const workspaceStore = useWorkspaceStore()
const collabBoardStore = useCollabBoardStore()
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const themeStore = useThemeStore()
const voiceStore = useVoiceStore()

const appReady = ref(false)
const evalsWorkbenchStore = useEvalsWorkbenchStore()
const overlayPresenceStore = useOverlayPresenceStore()
// ⌘T/⌘W 路由要问它：面板自己的 DOM 是不是当前操作的那块（见 stores/browser.ts）。
const browserStore = useBrowserStore()
// Full-screen modal overlays float above the embedded browser's native view;
// register them so BrowserPanel hides the view while they're open (§8.2).
watch(() => evalsWorkbenchStore.open, open => overlayPresenceStore.setOverlay('evals', open))
const chatContainerRef = ref<InstanceType<typeof ChatContainer> | null>(null)
const appContentRef = ref<HTMLElement | null>(null)
const rightWorkbenchRef = ref<InstanceType<typeof RightWorkbenchPanel> | null>(null)
const inspectorOpen = computed({
  get: () => chatStore.inspectorOpen,
  set: (val) => { chatStore.inspectorOpen = val }
})

/* ─── 工作台式外壳(im-workbench-layout.md §5 C0)─────────────────────────
   workbench(默认)= 常驻左栏以活为脊 + 账页流 + 常驻右栏;
   classic         = 改造前的外壳,逐像素不变(§6 回滚闸)。
   形态推导全部走 useShellMode 的纯函数,两种模式的分野在那里有测试钉着。 */
const shellMode = computed(() => resolveShellMode(settingsStore.settings))
const isWorkbenchShell = computed(() => shellMode.value === 'workbench')

/* `data-shell-mode` 是外壳形态的**唯一** CSS 门。C1–C4 的视觉差异一律写成
   `:root[data-shell-mode='workbench'] …`,于是不需要每个组件各自 import 一次
   判定、也不需要往下透传 prop —— 一个属性管住整棵树;classic 下属性值是
   'classic',所有 workbench 规则一条都不命中,像素与改造前一致。
   辅助窗也写:形态是全 app 的事实。 */
watch(shellMode, (mode) => {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-shell-mode', mode)
}, { immediate: true })

/* 右栏开合的持久化(W-Q2)。沿用右栏自己既有的那套 —— `inspectorPanelSize`
   就住在 localStorage —— 而不是另开一条 appState 字段。 */
const INSPECTOR_OPEN_STORAGE_KEY = 'inspectorOpen'

function readStoredInspectorOpen(): boolean | null {
  try {
    const raw = localStorage.getItem(INSPECTOR_OPEN_STORAGE_KEY)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // localStorage 不可用(隐私模式 / 测试夹具):当作没存过,走窗宽默认值。
  }
  return null
}

function writeStoredInspectorOpen(open: boolean): void {
  try {
    localStorage.setItem(INSPECTOR_OPEN_STORAGE_KEY, String(open))
  } catch {
    // 存不下就算了:下次启动退回按窗宽的默认值,不影响本次使用。
  }
}

/**
 * 右栏初值(W-Q2:≥1400px 默认展开,否则默认收起但入口保留)。
 *
 * 只在设置真的加载完之后跑一次 —— 在那之前 `settingsStore.settings` 还是内置
 * 默认值(shellMode = 'workbench'),照它去开右栏会把 classic 用户也弹开。
 * 「默认」不是「强制」:存过的用户选择永远胜出,手动收起的人不会每次被弹开。
 */
let inspectorDefaultApplied = false
function applyInspectorDefaultOnce() {
  if (inspectorDefaultApplied) return
  inspectorDefaultApplied = true
  if (isAuxiliaryWindow.value) return
  inspectorOpen.value = resolveInspectorDefaultOpen({
    shellMode: shellMode.value,
    viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
    stored: readStoredInspectorOpen(),
  })
}

/* 之后的每一次开合(手动点、⌘ 面板、代码里打开某个文件)都记账:下次启动
   照用户上次留下的样子,而不是把窗宽默认值再算一遍。 */
watch(inspectorOpen, open => {
  if (!inspectorDefaultApplied || isAuxiliaryWindow.value) return
  if (!isWorkbenchShell.value) return
  writeStoredInspectorOpen(open)
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

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice'
type TodoPlanWebWindowActionDetail = {
  action?: 'open' | 'hide' | 'toggle' | 'pin'
}

const TODO_PLAN_WEB_WINDOW_EVENT = 'todo-plan:web-window-action'
// Fired by PracticeStrip's menu (「参数与账页」/「查看进度」) — same pattern as
// the todo-plan window event: deep components reach App through a window event.
const PRACTICE_OPEN_WORKSPACE_EVENT = 'practice:open-workspace'

// Main workspace panel state. These panels are launched from the sidebar
// actions area and occupy the main content region instead of expanding from
// the left edge.
const activeWorkspacePanel = ref<WorkspacePanel | null>(null)
const workspacePanelOpen = computed(() => activeWorkspacePanel.value !== null)
const activeWorkspaceView = computed(() => activeWorkspacePanel.value ?? 'chat')

function openWorkspacePanel(panel: WorkspacePanel) {
  if (sidebarFloating.value) {
    closeFloatingSidebar()
  }
  activeWorkspacePanel.value = panel
}

function closeWorkspacePanel() {
  activeWorkspacePanel.value = null
}

function handlePracticeOpenWorkspace() {
  if (isAuxiliaryWindow.value) return
  openWorkspacePanel('practice')
}

/* Agent 空间页(agent-im-chat-ui.md C3):群聊气泡、dm 房头深在组件树里,够不到
   openWorkspacePanel 的 emit 链,所以走与 practice 同款的 window 事件。要看的
   agent 与 tab 意图已经由 store 的 `openAgentSpace` 寄存好,这里只管展开面板。 */

function handleAgentOpenWorkspace() {
  if (isAuxiliaryWindow.value) return
  openWorkspacePanel('agents')
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
  onSelectTabByIndex: (digit) => {
    if (isAuxiliaryWindow.value) return
    chatContainerRef.value?.selectFocusedPanelTabByIndex?.(digit)
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

/**
 * 交通灯探出侧栏多少 —— 房头(RoomHeader)据此缩进,免得内容压在灯下面。
 *
 * macOS 的三颗灯横跨到窗口左起约 70px。旧壳(TabBar)一直有一块死板的 70px
 * 保留位;房面是 R1 新写的,漏了这块 —— 侧栏一收,房头就顶到窗口左上角
 * (真机走查发现)。这里仍然按侧栏**当前实际宽度**算而不是抄那个死数:折叠时
 * 侧栏整条卸下(占 0,灯全探出来),展开时灯完全落在侧栏内(探出 0)。
 *
 * 写成根变量而不是逐层透传 prop:App 是唯一知道侧栏当前实际宽度的人,而
 * 需要它的 RoomHeader 在三层之下。
 */
const TRAFFIC_LIGHTS_SPAN = 70
const sidebarOccupiedWidth = computed(
  () => sidebarDockedVisible.value ? sidebarWidth.value : 0,
)
const trafficLightsOverhang = computed(
  () => Math.max(0, TRAFFIC_LIGHTS_SPAN - sidebarOccupiedWidth.value),
)

watch(trafficLightsOverhang, (px) => {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--shell-lights-overhang', `${px}px`)
}, { immediate: true })

const reserveSidebarActions = ref(sidebarCollapsed.value)
const sidebarActionAnimating = ref(false)
const floatingCooldown = ref(false) // Prevent re-expansion after toggle
const floatingShowTimer = ref<ReturnType<typeof setTimeout> | null>(null) // Delay before showing floating sidebar
let sidebarToggleTimer: ReturnType<typeof setTimeout> | null = null
let floatingCloseTimer: ReturnType<typeof setTimeout> | null = null
let floatingCooldownTimer: ReturnType<typeof setTimeout> | null = null
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

/**
 * 右栏的**像素**下限(设计稿 `right-panel.html`:最窄 250px 是硬指标)。
 *
 * 原来的下限只有百分比 22% —— 窗口一小就破线:620px 的窗口里右栏只剩 136px,
 * 分段器还撑得住,但行被压成「I..」「服...」,信息全没了(真机走查看到的正是这个)。
 * 所以下限改成「22% 与 250px 取大」,再让 max 48% 兜底(极窄窗口下 250px 可能
 * 超过 48%,那时以 48% 为准 —— 中栏也有自己的下限,不能为了右栏把它挤没)。
 */
/* 提前声明:`clampInspectorPanelSize` 在 setup 期就被调用(初始化存档值),
   它经 `inspectorMinPanelSize` 读到这里 —— 声明晚了会 TDZ,整个 App 白屏。 */
const contentSplitterWidth = ref(0)

const MIN_INSPECTOR_PANEL_PX = 250

/* 换算基数必须是**分栏容器**的宽度,不是窗口宽度 —— 这里的百分比是相对
   `contentSplitterRef` 的(窗口还要扣掉左栏)。拿 window.innerWidth 换算会
   算出一个偏小的百分比,地板照样破(真机实测:面板仍只有 203.8px)。
   `contentSplitterWidth` 由 ResizeObserver 维护,天然跟着窗口与左栏变。 */
const inspectorMinPanelSize = computed(() => {
  const base = contentSplitterWidth.value
  const pct = base > 0 ? (MIN_INSPECTOR_PANEL_PX / base) * 100 : MIN_INSPECTOR_PANEL_SIZE
  return Math.min(MAX_INSPECTOR_PANEL_SIZE, Math.max(MIN_INSPECTOR_PANEL_SIZE, pct))
})

function clampInspectorPanelSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_INSPECTOR_PANEL_SIZE
  return Math.min(MAX_INSPECTOR_PANEL_SIZE, Math.max(inspectorMinPanelSize.value, size))
}

const storedInspectorPanelSize = ref(clampInspectorPanelSize(
  Number.parseFloat(localStorage.getItem('inspectorPanelSize') || String(DEFAULT_INSPECTOR_PANEL_SIZE))
))

/**
 * 存的是百分比,而地板是像素 —— 所以**每次读都要重新收敛**,不能只在写入时 clamp。
 * 否则窗口一变窄,存着的 25.5% 在 800px 窗口里就是 204px,250px 的地板形同虚设
 * (真机走查抓到:面板 203.82px,行被压得没法看)。
 */
const inspectorPanelSize = computed({
  get: () => Math.min(
    MAX_INSPECTOR_PANEL_SIZE,
    Math.max(inspectorMinPanelSize.value, storedInspectorPanelSize.value),
  ),
  set: (value: number) => { storedInspectorPanelSize.value = clampInspectorPanelSize(value) },
})
const inspectorResizing = ref(false)

// Mount the workbench panel on first open, then keep it mounted so closing
// only collapses it (animated) and its tab/terminal state is preserved.
// First open mounts collapsed and expands a frame later so the slide-in
// transition runs from width 0.
const workbenchMounted = ref(false)
const workbenchRevealed = ref(false)
watch(inspectorVisible, async visible => {
  if (visible && !workbenchMounted.value) {
    workbenchMounted.value = true
    await nextTick()
    // Flush layout so the collapsed style is committed as the transition's
    // starting state; otherwise the panel pops in at partial width.
    void (contentSplitterRef.value?.$el as HTMLElement | undefined)?.offsetWidth
    workbenchRevealed.value = inspectorVisible.value
    return
  }
  workbenchRevealed.value = visible
}, { immediate: true })

// The splitter reports size 0 for the collapsed panel; ignore it so the
// stored width survives close/reopen.
function handleInspectorPanelSizeUpdate(size: number) {
  if (!inspectorVisible.value) return
  inspectorPanelSize.value = clampInspectorPanelSize(size)
}

const contentSplitterRef = ref<InstanceType<typeof Splitter> | null>(null)
let contentSplitterObserver: ResizeObserver | null = null

watch(contentSplitterRef, splitter => {
  contentSplitterObserver?.disconnect()
  const el = splitter?.$el as HTMLElement | undefined
  if (!el || typeof ResizeObserver === 'undefined') return
  contentSplitterObserver ??= new ResizeObserver(entries => {
    contentSplitterWidth.value = entries[0]?.contentRect.width ?? 0
  })
  contentSplitterObserver.observe(el)
}, { flush: 'post' })

onUnmounted(() => {
  contentSplitterObserver?.disconnect()
  contentSplitterObserver = null
})

// Expanded pixel width of the workbench. While the panel collapses/expands,
// this stays constant (inspectorPanelSize is not written during the
// animation), so the content is clipped by the sliding edge instead of
// being reflowed at every frame.
const workbenchSlideStyle = computed(() => {
  if (!contentSplitterWidth.value) return undefined
  const width = Math.ceil(contentSplitterWidth.value * inspectorPanelSize.value / 100)
  return { width: `${width}px` }
})
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

async function openGoalReviewInRightWorkbench(sessionId: string) {
  if (!sessionId) return
  inspectorOpen.value = true
  await nextTick()
  rightWorkbenchRef.value?.openGoalReview(sessionId)
}

/**
 * 右栏线程直达入口(工作台式外壳 C3,docs/design/im-workbench-layout.md §3 W4)。
 *
 * 与看板/文件夹入口同一条 window 事件解耦线路:派事件的地方(左栏活卡片、中栏
 * 活动线的「展开 →」)离右栏都隔着好几层,不该为了开一个 tab 一路透传 ref。
 */
async function openThreadInRightWorkbench(workSessionId: string, title?: string) {
  if (!workSessionId) return
  inspectorOpen.value = true
  await nextTick()
  rightWorkbenchRef.value?.openThread(workSessionId, title)
}

/**
 * 右栏「成员」/ 空间页入口(R2)。三处派发共用这一条:房头成员堆、say 署名
 * 头像、私聊房面的默认落座。`agentId` 非空就直接停在空间页(下钻层,不占 tab 位)。
 */
async function openMembersInRightWorkbench(detail: OpenMembersDetail) {
  if (!detail.sessionId) return
  inspectorOpen.value = true
  await nextTick()
  rightWorkbenchRef.value?.openMembers(detail.sessionId, detail.agentId, detail.title)
}

/**
 * 「打开这个人的空间」的唯一落点(agent-space-workbench.md P1)。
 *
 * 分流一句话:**够得着房就在房里下钻,够不着才单开一个页签**。
 *  - 当前会话所属的房里有这个人 → 成员 tab 内下钻(空间页不占 tab 位,样板铁律);
 *  - 直聊里的助理、已退休的同事、房外的人 → 以 TA 命名的 `agent` 页签。
 *
 * 两条都不再展开全屏 Agents 管理页 —— 点一下头像不该把正在看的会话面顶掉。
 */
async function openAgentSpaceInRightWorkbench(detail: AgentOpenSpaceDetail) {
  const agentId = detail?.agentId
  if (!agentId) return

  const active = sessionsStore.sessions.find(session => session.id === workspaceStore.activeSessionId)
  const roomSessionId = active?.kind === 'room' ? active.id : active?.collab?.roomSessionId || ''
  const room = roomSessionId
    ? sessionsStore.sessions.find(session => session.id === roomSessionId)?.room
    : undefined
  const isMember = !!room && (room.memberAgentIds?.includes(agentId) || room.pmAgentId === agentId)

  inspectorOpen.value = true
  await nextTick()
  if (isMember && roomSessionId) {
    // 单成员房(私聊)没有"成员"这回事 —— 那一格就叫「空间」。
    const title = (room?.memberAgentIds?.length ?? 0) > 1 ? '成员' : '空间'
    rightWorkbenchRef.value?.openMembers(roomSessionId, agentId, title)
    return
  }
  rightWorkbenchRef.value?.openAgentTab(agentId, detail.tab ?? null)
}

// 群聊房间头部的看板直达入口(window 事件解耦:TabBar 深处 → 这里)
/**
 * 房面进房 → 右栏备齐三 tab(线程 / 成员 / 看板)并落在线程上。
 *
 * 样板 final.html 的右栏是三 tab 常驻;实施时为了不出现两条右栏,复用了这根
 * App 级的 workbench,代价是那三条一条都不常驻 —— 真机上"看不到线程"。
 * 这里补齐:进房就把它们开好。右栏本身也一并打开(否则备齐了也看不见)。
 */
/* 具名 handler + onUnmounted 清理:匿名箭头既取不下来,HMR 一热更就重复注册,
   一条事件会开出两个线程页签(真机走查抓到)。 */
function handleRoomWorkbench(event: Event) {
  void openRoomWorkbench((event as CustomEvent).detail)
}

async function openRoomWorkbench(detail: { roomSessionId: string; workSessionId?: string; dmAgentId?: string }) {
  if (!detail?.roomSessionId) return
  inspectorOpen.value = true
  await nextTick()
  rightWorkbenchRef.value?.openRoomTabs(detail.roomSessionId, detail.workSessionId, { dmAgentId: detail.dmAgentId })
}

async function openBoardInRightWorkbench() {
  inspectorOpen.value = true
  await nextTick()
  rightWorkbenchRef.value?.openBoard()
}

/**
 * 行内 `<card>` / `<file>` 标签的验真与点击(collab-team-v2 §6.1)。
 *
 * 验真器在这里注册,是因为只有 App 层同时够得着看板镜像、会话表和 platformApi;
 * 渲染那一侧(composables/collabInlineTags)对这三样一无所知,没人注册时所有
 * 标签停在纯文本态 —— 验真链路挂掉的后果是"点不动",不是"点了跳错地方"。
 */
function roomWorkingDirectoryForTags(): string | undefined {
  const active = sessionsStore.sessions.find(session => session.id === workspaceStore.activeSessionId)
  if (!active) return undefined
  const roomId = active.kind === 'room' ? active.id : active.collab?.roomSessionId
  if (!roomId) return active.workingDirectory
  return sessionsStore.sessions.find(session => session.id === roomId)?.workingDirectory
}

function registerCollabTags() {
  // @提及 pill 的第二拍(im-message §A):只回答"这位同事现在什么颜色"。
  // 查无此人返回 null —— 那一枚就停在中性文字上,点不动。
  registerCollabMentionResolver({
    resolveAgent(agentId) {
      const found = agentsStore.agents.find(agent => agent.id === agentId)
      return found ? { color: found.color } : null
    },
  })
  registerCollabTagVerifier({
    verifyCard(id) {
      const found = collabBoardStore.findTask(id)
      return found ? { id: found.task.id, title: found.task.title, status: found.task.status } : null
    },
    async verifyFile(path) {
      const absolute = resolveDeliverablePath(path, roomWorkingDirectoryForTags())
      if (!absolute) return null
      try {
        const stat = await platformApi.statPath(absolute)
        return stat?.success && stat.type === 'file' ? { absolutePath: absolute } : null
      } catch {
        return null
      }
    },
  })
}

/** 群 folder 的文件树入口(collab-team-v2 §7):走既有 files 页签,换个根。 */
async function openFolderInRightWorkbench(root: string) {
  inspectorOpen.value = true
  await nextTick()
  await rightWorkbenchRef.value?.openFolder(root)
}

async function focusCardInRightWorkbench(taskId: string) {
  if (!collabBoardStore.focusTask(taskId)) return
  inspectorOpen.value = true
  await nextTick()
  rightWorkbenchRef.value?.openBoard()
}

onMounted(() => {
  window.addEventListener('onething:collab-open-board', () => { void openBoardInRightWorkbench() })
  window.addEventListener('onething:room-workbench', handleRoomWorkbench)
  window.addEventListener('onething:collab-open-folder', event => {
    const root = (event as CustomEvent<{ root?: string }>).detail?.root
    if (root) void openFolderInRightWorkbench(root)
  })
  // C3 契约(左栏活卡片 / 中栏活动线共用,形状不许改):
  //   CustomEvent<{ workSessionId: string; title?: string; taskId?: string }>
  window.addEventListener('onething:open-thread', event => {
    const detail = (event as CustomEvent<{ workSessionId?: string; title?: string }>).detail
    if (detail?.workSessionId) void openThreadInRightWorkbench(detail.workSessionId, detail.title)
  })
  window.addEventListener(OPEN_MEMBERS_EVENT, event => {
    const detail = (event as CustomEvent<OpenMembersDetail>).detail
    if (detail?.sessionId) void openMembersInRightWorkbench(detail)
  })
  window.addEventListener(COLLAB_TAG_OPEN_CARD_EVENT, event => {
    const taskId = (event as CustomEvent<{ taskId?: string }>).detail?.taskId
    if (taskId) void focusCardInRightWorkbench(taskId)
  })
  window.addEventListener(COLLAB_TAG_OPEN_FILE_EVENT, event => {
    const filePath = (event as CustomEvent<{ filePath?: string }>).detail?.filePath
    if (filePath) void openFileInRightWorkbench(filePath)
  })
  // 点 @提及 pill → 那位同事的空间(与头像/署名同一个落点)。
  window.addEventListener(COLLAB_TAG_OPEN_AGENT_EVENT, event => {
    const agentId = (event as CustomEvent<{ agentId?: string }>).detail?.agentId
    if (agentId) void openAgentSpaceInRightWorkbench({ agentId })
  })
  // 点头像 → 右栏(P1)。三处头像与侧栏右键「打开空间」都派这一条。
  window.addEventListener(AGENT_OPEN_SPACE_EVENT, event => {
    const detail = (event as CustomEvent<AgentOpenSpaceDetail>).detail
    if (detail?.agentId) void openAgentSpaceInRightWorkbench(detail)
  })
  registerCollabTags()
})

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


// Search Everywhere — open via IPC (toolbar button + double shift). Hosts
// without desktop windows (web) have no search surface; the toolbar button is
// hidden there and the shortcut must not fire a silent no-op.
function openSearch() {
  if (!platformApi.capabilities.desktopWindows) return
  platformApi.toggleSearchWindow()
}

// Report the content area rect (sidebar excluded) so the main process can
// center the Search Everywhere window on the chat area instead of the full
// window width.
let searchAnchorObserver: ResizeObserver | null = null
let searchAnchorReportTimer: ReturnType<typeof setTimeout> | null = null

function reportSearchAnchor() {
  const el = appContentRef.value
  if (!el || typeof platformApi.setSearchWindowAnchor !== 'function') return
  const rect = el.getBoundingClientRect()
  void platformApi
    .setSearchWindowAnchor({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    .catch(() => {})
}

function scheduleSearchAnchorReport() {
  if (searchAnchorReportTimer) clearTimeout(searchAnchorReportTimer)
  searchAnchorReportTimer = setTimeout(() => {
    searchAnchorReportTimer = null
    reportSearchAnchor()
  }, 150)
}

function setupSearchAnchorObserver() {
  const el = appContentRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  searchAnchorObserver = new ResizeObserver(() => scheduleSearchAnchorReport())
  searchAnchorObserver.observe(el)
  reportSearchAnchor()
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

// 已读水位的"人在不在场"信号(agent-im-dm.md P4)。在场 = 屏幕上的会话算读过;
// 离场时来的消息照常攒成未读,回来那一刻一次性清掉。判定本身在 sessions store,
// 这里只负责把宿主的前后台事实喂进去。
function handleWindowFocused() {
  sessionsStore.setWindowFocused(true)
}

function handleWindowBlurred() {
  sessionsStore.setWindowFocused(false)
}

function handleVisibilityChange() {
  sessionsStore.setWindowFocused(document.visibilityState === 'visible')
}

/**
 * 通知点击 → 打开那间房(agent-dm-user.md §4.3)。
 *
 * 落焦之后水位会自然转已读(`markVisibleSessionsRead` 挂在 focus 上),所以
 * 这里只负责把页签打开,一个字的水位逻辑都不写。
 */
async function openSessionFromNotification(sessionId: string): Promise<void> {
  if (!sessionId) return
  activeWorkspacePanel.value = null
  workspaceStore.openSession(sessionId)
  await sessionsStore.switchSession(sessionId)
}

let unsubscribeNotifyActivate: (() => void) | null = null
let unsubscribeSettingsChanged: (() => void) | null = null
let unsubscribeMenuNewChat: (() => void) | null = null
let unsubscribeMenuCloseChat: (() => void) | null = null
let unsubscribeMenuNewBrowserTab: (() => void) | null = null
let unsubscribeSearchAction: (() => void) | null = null

onMounted(async () => {
  console.info(`[Perf][Startup] renderer-mounted +${Math.round(performance.now())}ms since page load`)
  window.addEventListener('hashchange', syncCurrentHash)
  window.addEventListener('focus', handleWindowFocused)
  window.addEventListener('blur', handleWindowBlurred)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener(TODO_PLAN_WEB_WINDOW_EVENT, handleTodoPlanWebWindowAction)
  window.addEventListener(PRACTICE_OPEN_WORKSPACE_EVENT, handlePracticeOpenWorkspace)
  window.addEventListener(AGENT_OPEN_WORKSPACE_EVENT, handleAgentOpenWorkspace)

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
  // 右栏初值必须等真设置落地(在此之前 shellMode 读到的是内置默认值)。
  applyInspectorDefaultOnce()
  void voiceStore.initialize().catch((e) => {
    console.warn('[App] voice init failed', e)
  })

  // Initialize theme system (must be after settings load)
  await themeStore.initialize()

  // Restore the workspace (tabs + split layout + focus) from saved app state.
  // Must run after loadSessions: hydration validates every tab against the
  // session list. The initial session activation follows from the restored
  // active tab.
  const appState = await appStateReady
  workspaceStore.hydrate(appState)
  const restoredSessionId = workspaceStore.activeSessionId
  if (restoredSessionId) {
    await sessionsStore.switchSession(restoredSessionId)
  }
  if (appState?.sidebarCollapsed !== undefined) {
    sidebarCollapsed.value = appState.sidebarCollapsed
    reserveSidebarActions.value = appState.sidebarCollapsed
  }

  // 已读水位(docs/design/agent-im-dm.md P4)。必须排在工作区恢复之后:剪枝要对着
  // 会话列表,而"屏幕上是哪几个会话"要等分栏树立起来才有答案 —— 恢复出来的那个
  // 页签用户正看着,不该带着上次的红点回来。
  //
  // 只有主窗口灌水位,因此也只有主窗口落盘(未灌 = 不写)。设置/搜索这些副窗口
  // 同样收得到全量 session 事件,却一个会话都"看不见" —— 让它们跟着写,就是拿一份
  // 只涨不消的 inbound 去盖掉主窗口刚推进的 readAt,红点会诈尸。
  if (!isAuxiliaryWindow.value) {
    sessionsStore.hydrateReadMarks(appState?.sessionReadMarks)
    // dock 墨点与通知点击同样只由主窗口驱动 —— 与水位「只主窗口 hydrate/落盘」
    // 同一条纪律:副窗口收得到全量事件却看不见任何会话,让它们也画徽标就是
    // 两扇窗抢着写同一个 dock。
    unsubscribeNotifyActivate = platformApi.notify?.onActivate(({ sessionId }) => {
      void openSessionFromNotification(sessionId)
    }) ?? null
    watch(
      () => sessionsStore.unreadSessionIds.size > 0,
      hasUnread => { void platformApi.notify?.setBadge(hasUnread) },
      { immediate: true },
    )
  }

  appReady.value = true
  console.info(`[Perf][Startup] session-interactive +${Math.round(performance.now())}ms since page load`)
  void markdownCacheReady

  // Anchor element mounts with the main-app branch after appReady flips.
  await nextTick()
  setupSearchAnchorObserver()

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
      // is local to each renderer. Drop it so the next model picker open
      // re-fetches — main has a disk cache, so the round-trip is cheap.
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

  // Cmd+W closes the focused tab; the panel asks the host to close the window
  // only once nothing is left to fall back to. The browser panel gets first
  // refusal when it is the focused surface — the main process already handled
  // the case where the embedded PAGE has focus, so reaching here means focus is
  // in our own DOM (omnibox / start page / tab drawer).
  unsubscribeMenuCloseChat = platformApi.onMenuCloseChat(() => {
    if (browserStore.panelFocused) {
      void browserStore.closeActiveTab()
      return
    }
    chatContainerRef.value?.closeFocusedPanelActiveTab?.()
  })

  // Cmd+T is the browser's alone: outside the browser panel it does nothing
  // rather than quietly duplicating New Chat (⌘N).
  unsubscribeMenuNewBrowserTab = platformApi.onMenuNewBrowserTab?.(() => {
    if (browserStore.panelFocused) void browserStore.newTab()
  }) ?? null

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
    if (actionId.startsWith('split-panel:')) {
      const payload = actionId.slice('split-panel:'.length)
      const separatorIndex = payload.indexOf(':')
      if (separatorIndex > 0) {
        const panelId = payload.slice(0, separatorIndex)
        const sessionId = payload.slice(separatorIndex + 1)
        activeWorkspacePanel.value = null
        chatContainerRef.value?.splitPanel?.(panelId, sessionId)
      }
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
  window.removeEventListener('onething:room-workbench', handleRoomWorkbench)
  window.removeEventListener('hashchange', syncCurrentHash)
  window.removeEventListener('focus', handleWindowFocused)
  window.removeEventListener('blur', handleWindowBlurred)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener(TODO_PLAN_WEB_WINDOW_EVENT, handleTodoPlanWebWindowAction)
  window.removeEventListener(PRACTICE_OPEN_WORKSPACE_EVENT, handlePracticeOpenWorkspace)
  window.removeEventListener(AGENT_OPEN_WORKSPACE_EVENT, handleAgentOpenWorkspace)

  if (unsubscribeNotifyActivate) {
    unsubscribeNotifyActivate()
    unsubscribeNotifyActivate = null
  }
  if (unsubscribeSettingsChanged) {
    unsubscribeSettingsChanged()
  }
  if (unsubscribeMenuNewChat) {
    unsubscribeMenuNewChat()
  }
  if (unsubscribeMenuCloseChat) {
    unsubscribeMenuCloseChat()
  }
  if (unsubscribeMenuNewBrowserTab) {
    unsubscribeMenuNewBrowserTab()
  }
  if (unsubscribeSearchAction) {
    unsubscribeSearchAction()
  }
  if (searchAnchorObserver) {
    searchAnchorObserver.disconnect()
    searchAnchorObserver = null
  }
  if (searchAnchorReportTimer) {
    clearTimeout(searchAnchorReportTimer)
    searchAnchorReportTimer = null
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

.workbench-slide {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

/* Hide only after the slide-out finishes; reappear instantly on expand. */
.app-right-sidebar-region.is-collapsed .workbench-slide {
  visibility: hidden;
  transition: visibility 0s linear 0.2s;
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

/* Floating sidebar backdrop */
.sidebar-floating-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: calc(var(--z-sidebar) - 1); /* just below the floating sidebar itself */
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

/* `.agent-dialog-overlay` / `.agent-dialog-container` were removed in P2: the
   markup they styled (CustomAgentDialog) had already been deleted, leaving a
   hand-rolled modal skeleton with no modal. New dialogs use
   `components/common/Dialog.vue`. */
</style>
