<template>
  <header
    ref="headerRef"
    :class="['tab-bar', { 'with-traffic-lights': showSidebarToggle, 'media-panel-open': mediaPanelOpen }]"
  >
    <!-- Left: traffic lights reserved + tabs -->
    <div class="tab-bar-left">
      <!-- 侧栏收起时,三颗操作按钮住在这里 —— 是 .tab-bar(drag)的真实子孙,
           所以按钮自己的 no-drag 才挖得动洞,不再需要按坐标预留一块死区。
           左边这段只是给交通灯让位的普通盒子,不带 app-region,自然回退到 drag。 -->
      <div
        :class="[
          'topbar-sidebar-actions-slot',
          {
            reserved: showSidebarToggle || reserveSidebarActions,
            'media-panel-open': mediaPanelOpen,
          },
        ]"
      >
        <div
          class="topbar-traffic-lights-space"
          aria-hidden="true"
        />
        <SidebarActionGroup
          v-if="showSidebarToggle || reserveSidebarActions"
          :sidebar-visible="false"
          variant="topbar"
          @toggle-sidebar="emit('toggleSidebar')"
          @open-search="emit('openSearch')"
          @create-new-chat="emit('createNewChat')"
        />
      </div>
      <div class="tab-list-wrap">
        <div
          ref="tabListRef"
          :class="['tab-list', { 'fade-left': canScrollLeft, 'fade-right': canScrollRight }]"
          role="tablist"
          @scroll="onTabListScroll"
        >
          <TabItem
            v-for="(tab, index) in chatTabs"
            :key="tab.id"
            :data-tab-id="tab.id"
            :tab="tab"
            :active="tab.id === activeTabId"
            :closable="true"
            :is-first="index === 0"
            :hide-trailing-divider="shouldHideTrailingDivider(chatTabs, index)"
            :session-name="tab.type === 'chat' ? (agentTabDisplays[tab.sessionId]?.name ?? chatSessionNames[tab.sessionId]) : undefined"
            :avatar="tab.type === 'chat' ? agentTabDisplays[tab.sessionId]?.avatar : undefined"
            :avatar-image="tab.type === 'chat' ? agentTabDisplays[tab.sessionId]?.avatarImage : undefined"
            :cached="tab.type === 'chat' && (cachedSessionIds === null || cachedSessionIds.has(tab.sessionId))"
            :panel-id="panelId"
            :renaming="renamingTabId === tab.id"
            @select="$emit('selectTab', tab.id)"
            @close="$emit('closeTab', tab.id)"
            @rename="(name) => tab.type === 'chat' && $emit('renameSession', tab.sessionId, name)"
            @rename-end="renamingTabId = null"
            @context-menu="openTabMenu"
            @drag-start="(id) => dragFromId = id"
            @drop-on="(id) => { $emit('moveTab', dragFromId!, id); dragFromId = null }"
          />

          <div
            v-if="resourceTabs.length > 0"
            class="tab-group-divider"
            aria-hidden="true"
          />

          <TabItem
            v-for="(tab, index) in resourceTabs"
            :key="tab.id"
            :data-tab-id="tab.id"
            :tab="tab"
            :active="tab.id === activeTabId"
            :closable="true"
            :hide-trailing-divider="shouldHideTrailingDivider(resourceTabs, index)"
            :session-name="undefined"
            @select="$emit('selectTab', tab.id)"
            @close="$emit('closeTab', tab.id)"
            @context-menu="openTabMenu"
            @drag-start="(id) => dragFromId = id"
            @drop-on="(id) => { $emit('moveTab', dragFromId!, id); dragFromId = null }"
          />
        </div>
        <div
          :class="['tab-scrollbar', { visible: scrollbarVisible }]"
          aria-hidden="true"
        >
          <div
            class="tab-scroll-thumb"
            :style="{ width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` }"
          />
        </div>
      </div>
      <div
        class="tab-bar-drag-spacer"
        aria-hidden="true"
      />
    </div>

    <!-- Right: action buttons. Unfocused split panels collapse to just the
         tabs; clicking anywhere in a panel focuses it. Focused panels degrade
         by tier: full → mid (no agent selector) → slim (single ⋯ menu). -->
    <div class="tab-bar-right">
      <!-- 私聊房头(agent-im-dm.md §4.3):一对一没有"成员列",身份就是那一个人。
           占的是成员条的位置 —— 房头结构不变,换的是里面站着谁。 -->
      <div
        v-if="dmRoomAgent && activeTab?.type === 'chat'"
        class="dm-identity"
      >
        <!-- 点头像/名字进「我与 TA」的空间(agent-im-chat-ui.md C3)——
             与群聊署名头像、侧栏联系人行右键同归 `openAgentSpace`。 -->
        <button
          type="button"
          class="dm-identity-open"
          :title="`${dmRoomAgent.title ? `${dmRoomAgent.name} · ${dmRoomAgent.title}` : dmRoomAgent.name} · 打开空间`"
          @click="openDmAgentSpace"
        >
          <AgentAvatar
            class="dm-identity-avatar"
            aria-hidden="true"
            :avatar="dmRoomAgent.avatar"
            :avatar-image="dmRoomAgent.avatarImage"
            :size="22"
          />
          <span class="dm-identity-name">{{ dmRoomAgent.name }}</span>
          <span
            v-if="dmRoomAgent.title"
            class="dm-identity-title"
          >{{ dmRoomAgent.title }}</span>
        </button>
        <!-- 工作状态透出(§4.3):有活跃工作台才画。「想看过程点进去看,不看
             就等 say」—— 点一下开那张卡最新的工作台会话(只读转录)。 -->
        <button
          v-if="dmWorkBadge"
          type="button"
          class="dm-work-badge"
          :title="`正在干活 · ${dmWorkBadge.title} —— 点开工作过程(只读)`"
          @click="openDmWorkSession"
        >
          正在干活 · {{ dmWorkBadge.shortId }}
        </button>
      </div>

      <!-- 成员头像列(W7 §3.5 C):房间头部常驻,紧邻看板/⚙ —— 群成员是身份,
           按钮是动作,所以身份在前。私聊房不挂:上面那块替了它。 -->
      <RoomMemberStrip
        v-if="isRoomSession && !dmRoomAgent && activeTab?.type === 'chat' && sessionId"
        :session-id="sessionId"
      />

      <!-- 看板入口对双成员 dm 房隐藏(agent-im-dm.md §4.3):agent 互聊是沟通场,
           不是干活现场,正经活回大群立卡。看板本身没有被拿掉(卡都在大群那一间
           房上),这里拿掉的只是一个在这间房里没有意义的入口。 -->
      <Button
        v-if="isRoomSession && !isPairDmSession && activeTab?.type === 'chat'"
        unstyled
        class="header-btn board-btn"
        title="打开看板"
        @click="openBoardPanel"
      >
        <ClipboardList
          :size="15"
          :stroke-width="1.7"
        />
        <span class="board-btn-label">看板</span>
      </Button>

      <Button
        v-if="isRoomSession && activeTab?.type === 'chat'"
        unstyled
        class="header-btn"
        title="房间设置"
        @click="roomSettingsOpen = true"
      >
        <Settings
          :size="15"
          :stroke-width="1.7"
        />
      </Button>

      <AgentSelector
        v-if="showAgentSelector && activeTab?.type === 'chat' && sessionId"
        :session-id="sessionId"
      />
      <span
        v-if="showAgentSelector && activeTab?.type === 'chat' && sessionId"
        class="header-tick"
        aria-hidden="true"
      />

      <Button
        v-if="showActionButtons && isBranchSession"
        unstyled
        class="header-btn back-btn"
        title="Back to parent chat"
        @click="$emit('goToParent')"
      >
        <ArrowLeft
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showActionButtons && showSplitButton"
        unstyled
        class="header-btn"
        title="Split view"
        @click="$emit('split')"
      >
        <Columns2
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showActionButtons && canClose"
        unstyled
        class="header-btn"
        title="Equalize panels"
        @click="$emit('equalize')"
      >
        <Equal
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showActionButtons"
        unstyled
        class="header-btn side-panel-toggle"
        :title="sidePanelCollapsed ? 'Expand side panel' : 'Collapse side panel'"
        @click="$emit('toggleSidePanel')"
      >
        <ListTree
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showActionButtons"
        unstyled
        :class="['header-btn', 'inspector-toggle', { hidden: isInspectorOpen }]"
        title="Show workbench"
        @click="$emit('toggleInspector')"
      >
        <PanelRightOpen
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <div
        v-if="showOverflowMenu"
        ref="moreRef"
        class="header-more"
      >
        <Button
          unstyled
          class="header-btn"
          title="More actions"
          @click="toggleMoreMenu"
        >
          <Ellipsis
            :size="14"
            :stroke-width="2"
          />
        </Button>
      </div>
    </div>

    <!-- 页签菜单:双击 / 右键页签弹出。动作按处境增减(左右无签就不出该行)。 -->
    <ContextMenu
      :show="!!tabMenu"
      :x="tabMenu?.x ?? 0"
      :y="tabMenu?.y ?? 0"
      :items="tabMenuItems"
      @select="onTabMenuSelect"
      @close="tabMenu = null"
    />

    <!-- slim 档的 ⋯ 菜单:与页签菜单同一实现,只是锚在按钮下方 -->
    <ContextMenu
      :show="moreOpen"
      :x="moreAnchor.x"
      :y="moreAnchor.y"
      :items="overflowItems"
      @select="onOverflowSelect"
      @close="moreOpen = false"
    />

    <!-- 房间设置浮层(W6):只在打开时实例化(TabBar 单测无 pinia 也不会碰 store) -->
    <RoomSettingsDialog
      v-if="roomSettingsOpen && sessionId"
      :visible="roomSettingsOpen"
      :session-id="sessionId"
      @close="roomSettingsOpen = false"
    />
  </header>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRightToLine,
  ClipboardList,
  Columns2,
  Ellipsis,
  Equal,
  ListTree,
  ListX,
  PanelRightOpen,
  Pencil,
  Settings,
  X,
} from 'lucide-vue-next'
import TabItem from './TabItem.vue'
import AgentSelector from './AgentSelector.vue'
import RoomMemberStrip from './RoomMemberStrip.vue'
import RoomSettingsDialog from './RoomSettingsDialog.vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import SidebarActionGroup from '@/components/sidebar/SidebarActionGroup.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import type { ContextMenuItem } from '@/components/common/context-menu'
import type { Tab } from '@/types/tabs'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useWorkspaceStore } from '@/stores/workspace'
import { isAgentExecutionSession, resolveAgentSessionDisplay } from '@/utils/agent-sessions'
import { isAgentPairDmRoom, isUserDmRoom } from '@onething/runtime/collab'

const props = defineProps<{
  tabs: Tab[]
  activeTabId: string
  sessionId?: string
  panelId?: string
  chatSessionNames: Record<string, string>
  /** null = cache membership unknown (no marking); Set = evicted sessions get the cold mark. */
  cachedSessionIds: Set<string> | null
  isBranchSession: boolean
  showSidebarToggle: boolean
  mediaPanelOpen?: boolean
  showSplitButton: boolean
  canClose: boolean
  isInspectorOpen?: boolean
  reserveSidebarActions?: boolean
  sidePanelAvailable?: boolean
  sidePanelCollapsed?: boolean
  /** False for split panels that don't own focus: only the tabs stay. */
  panelFocused?: boolean
}>()


const emit = defineEmits<{
  selectTab: [id: string]
  closeTab: [id: string]
  /** Batch close (menu actions), in the order they should be closed. */
  closeTabs: [ids: string[]]
  renameSession: [sessionId: string, name: string]
  moveTab: [fromId: string, toId: string]
  toggleSidebar: []
  openSearch: []
  createNewChat: []
  goToParent: []
  split: []
  equalize: []
  toggleInspector: []
  toggleSidePanel: []
}>()

const dragFromId = ref<string | null>(null)

// ── 浮层滚动条:标签溢出时可横向滚动,滚动条不占布局、滚动时才显现 ──
const tabListRef = ref<HTMLElement | null>(null)
const scrollbarVisible = ref(false)
const thumb = ref({ width: 0, left: 0 })
// 溢出提示:某侧还有没露出的页签时,该侧边缘渐隐,暗示"没完"
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null
let tabListResizeObserver: ResizeObserver | null = null

function measureThumb() {
  const el = tabListRef.value
  if (!el) return
  const { scrollWidth, clientWidth, scrollLeft } = el
  const scrollable = scrollWidth - clientWidth > 1
  if (!scrollable) {
    thumb.value = { width: 0, left: 0 }
    scrollbarVisible.value = false
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  const ratio = clientWidth / scrollWidth
  thumb.value = {
    width: Math.max(clientWidth * ratio, 24),
    left: scrollLeft * ratio,
  }
  // 亚像素滚动位置带小数,留 1px 容差免得两端渐隐擦不干净
  canScrollLeft.value = scrollLeft > 1
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 1
}

function flashScrollbar() {
  if (thumb.value.width === 0) return
  scrollbarVisible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    scrollbarVisible.value = false
  }, 900)
}

function onTabListScroll() {
  measureThumb()
  flashScrollbar()
}

// 激活签在视野外时(侧栏点会话、新开签追加到末尾)把它滚进来。
// 留一点余量让邻签露个角,暗示两侧还有内容。
const SCROLL_INTO_VIEW_PAD = 16

function scrollActiveTabIntoView() {
  const list = tabListRef.value
  if (!list || !props.activeTabId) return
  if (list.scrollWidth - list.clientWidth <= 1) return
  const el = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(props.activeTabId)}"]`)
  if (!el) return
  // 用 rect 差值而非 offsetLeft:不依赖 tab-list 是否为 offsetParent
  const listRect = list.getBoundingClientRect()
  const tabRect = el.getBoundingClientRect()
  const overLeft = tabRect.left - listRect.left - SCROLL_INTO_VIEW_PAD
  const overRight = tabRect.right - listRect.right + SCROLL_INTO_VIEW_PAD
  const delta = overLeft < 0 ? overLeft : overRight > 0 ? overRight : 0
  if (delta === 0) return
  if (typeof list.scrollBy === 'function') list.scrollBy({ left: delta, behavior: 'smooth' })
  else list.scrollLeft += delta
}

// 阶梯降级:full(全签+全按钮)→ mid(非激活签缩成图标,收起 agent 选择器)
// → slim(动作组折进一粒 ⋯ 菜单)。tab 本身是 flex 1 1 0 弹性等分,
// 所以阈值只需要兜住「按钮组 + 图标签」的底线,不再整条塌缩。
const MID_WIDTH = 560
const SLIM_WIDTH = 400
const RESERVED_EXTRA = 160

const headerRef = ref<HTMLElement | null>(null)
const headerWidth = ref(Number.POSITIVE_INFINITY)
let headerResizeObserver: ResizeObserver | null = null

onMounted(() => {
  // 恢复布局/新建分栏时激活签可能已在视野外
  void nextTick(scrollActiveTabIntoView)
  if (typeof ResizeObserver === 'undefined') return
  if (headerRef.value) {
    headerResizeObserver = new ResizeObserver((entries) => {
      headerWidth.value = entries[0]?.contentRect.width ?? Number.POSITIVE_INFINITY
    })
    headerResizeObserver.observe(headerRef.value)
  }
  if (tabListRef.value) {
    tabListResizeObserver = new ResizeObserver(() => measureThumb())
    tabListResizeObserver.observe(tabListRef.value)
  }
})

onBeforeUnmount(() => {
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
  tabListResizeObserver?.disconnect()
  tabListResizeObserver = null
  if (hideTimer) clearTimeout(hideTimer)
})

const tier = computed<'full' | 'mid' | 'slim'>(() => {
  const extra = props.showSidebarToggle || props.reserveSidebarActions ? RESERVED_EXTRA : 0
  if (headerWidth.value < SLIM_WIDTH + extra) return 'slim'
  if (headerWidth.value < MID_WIDTH + extra) return 'mid'
  return 'full'
})

const focused = computed(() => props.panelFocused !== false)
// Rooms hide the agent selector entirely: the coordinator flips the session's
// agent per activation, and a user flip would desync its speaker assumption
// (docs/design/multi-agent-collab.md D7 — the main process refuses it too).
const isRoomSession = computed(() => {
  if (!props.sessionId) return false
  // Lazy store access: TabBar unit tests mount without an active pinia.
  try {
    return useSessionsStore().sessions.find(s => s.id === props.sessionId)?.kind === 'room'
  } catch {
    return false
  }
})
const showAgentSelector = computed(() => focused.value && tier.value === 'full' && !isRoomSession.value)

/** 双成员 dm 房(agent 互聊,§4.3):房头照旧是群聊那一套,只有看板入口收掉。 */
const isPairDmSession = computed(() => {
  if (!props.sessionId) return false
  try {
    const session = useSessionsStore().sessions.find(s => s.id === props.sessionId)
    return isAgentPairDmRoom(session?.room)
  } catch {
    return false
  }
})

/**
 * 托管私聊房(agent-im-dm.md §4.3):房头不是"一群人",而是"这一个人"——
 * 成员条换成 TA 的大头像 + 名字 + 职位。AgentSelector 本就被 isRoomSession
 * 关掉了(私聊的身份即房间,不是可切的 persona),这里不必再关一次。
 */
const dmRoomAgent = computed<{
  id: string
  name: string
  title?: string
  avatar?: string
  avatarImage?: string
} | null>(() => {
  if (!props.sessionId) return null
  try {
    const session = useSessionsStore().sessions.find(s => s.id === props.sessionId)
    if (!isUserDmRoom(session?.room)) return null
    // 成员表是归属的结构化真源(禁反解 id,agents/identity.ts 纪律)。
    const agentId = session?.room?.memberAgentIds?.[0] || ''
    const identity = useAgentsStore().displayAgent(agentId)
    return {
      id: agentId,
      name: identity.name,
      title: identity.title,
      avatar: identity.avatar,
      avatarImage: identity.avatarImage,
    }
  } catch {
    return null
  }
})

/** 房头身份 → 空间页(agent-im-chat-ui.md C3 的入口①)。 */
function openDmAgentSpace(): void {
  const agentId = dmRoomAgent.value?.id
  if (!agentId) return
  try {
    useAgentsStore().openAgentSpace(agentId)
  } catch {
    // 没挂 pinia(TabBar 单测):房头照常渲染,只是点不开空间页。
  }
}

/**
 * 工作状态徽标(agent-im-dm.md §4.3)。
 *
 * 私聊的本义是"工具流水不进对话面",代价是用户看不见 agent 在忙什么。徽标是
 * 那道缝:看板上这个人名下有一张 doing 且真开过工作台的卡,就在房头挂一行,
 * 点开是那张卡**最新**的工作台会话(尾条 = 当前那次执行)的只读转录。
 *
 * 判定读看板 store 的既有数据面(doing + assignee + workSessionIds),不新增
 * 任何账;没有活跃工作台就不渲染 —— 空徽标是一个没有内容的承诺。
 */
const dmWorkBadge = computed<{ title: string; shortId: string; sessionId: string } | null>(() => {
  const agentId = dmRoomAgent.value?.id
  if (!agentId || !props.sessionId) return null
  try {
    const board = useCollabBoardStore().boardFor(props.sessionId)
    if (!board) return null
    const task = [...board.tasks]
      .filter(candidate =>
        candidate.status === 'doing' &&
        candidate.assigneeAgentId === agentId &&
        candidate.workSessionIds.length > 0)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
    if (!task) return null
    const sessionId = task.workSessionIds[task.workSessionIds.length - 1]
    if (!sessionId) return null
    return {
      title: (task.title || '').trim() || `#${task.id.slice(0, 8)}`,
      shortId: `#${task.id.slice(0, 8)}`,
      sessionId,
    }
  } catch {
    return null
  }
})

/* 看板只在打开过看板面板的房间里是热的,而私聊房的看板默认收起 —— 徽标要
   自己补一次拉取(store 之后靠 collab:board-changed 事件保持新鲜)。 */
watch(() => (dmRoomAgent.value ? props.sessionId : ''), (roomSessionId) => {
  if (!roomSessionId) return
  try {
    void useCollabBoardStore().load(roomSessionId)
  } catch {
    // 没挂 pinia(TabBar 单测):徽标不渲染,房头照旧。
  }
}, { immediate: true })

function openDmWorkSession(): void {
  const sessionId = dmWorkBadge.value?.sessionId
  if (!sessionId) return
  try {
    useWorkspaceStore().openSession(sessionId)
  } catch {
    // 同上:没有 store 就没有跳转,不炸。
  }
}

// Agent 执行会话的页签(W20):agent 头像章 + agent 现名(而不是会话文件里
// 冻结的「[执行] 小李」)。只为 kind='agent' 的签建条目,普通签一个都不进这个
// map,所以下游的 `?? chatSessionNames[...]` 就是"没有 agent 的一切照旧"。
// 同 isRoomSession 的懒取:TabBar 单测不挂 pinia。
const agentTabDisplays = computed<Record<string, { name: string; avatar: string; avatarImage?: string }>>(() => {
  const chatSessionIds = props.tabs.filter(tab => tab.type === 'chat').map(tab => tab.sessionId)
  if (chatSessionIds.length === 0) return {}
  try {
    const sessions = useSessionsStore().sessions
    const agents = useAgentsStore().agents
    const displays: Record<string, { name: string; avatar: string; avatarImage?: string }> = {}
    for (const sessionId of chatSessionIds) {
      const session = sessions.find(item => item.id === sessionId)
      if (!isAgentExecutionSession(session)) continue
      displays[sessionId] = resolveAgentSessionDisplay(session!, agents)
    }
    return displays
  } catch {
    return {}
  }
})

/** 看板直达:window 事件解耦到 App(App 展开工作台并打开 board 页签)。 */
function openBoardPanel(): void {
  window.dispatchEvent(new CustomEvent('onething:collab-open-board'))
}

// Team 设置浮层(W6):就地开在本面板,分屏时只有被点的那个面板开。
const roomSettingsOpen = ref(false)
const showActionButtons = computed(() => focused.value && tier.value !== 'slim')
const showOverflowMenu = computed(() => focused.value && tier.value === 'slim')

const chatTabs = computed(() => props.tabs.filter(t => t.type === 'chat'))
const resourceTabs = computed(() => props.tabs.filter(t => t.type !== 'chat'))
const activeTab = computed(() => props.tabs.find(tab => tab.id === props.activeTabId))

function shouldHideTrailingDivider(group: Tab[], index: number): boolean {
  return group[index]?.id === props.activeTabId || group[index + 1]?.id === props.activeTabId
}

// ── 页签菜单(双击 / 右键)────────────────────────────────────────────
// 「左侧/右侧」按看到的顺序算,而不是 props.tabs 的存储顺序 —— 渲染时
// chat 组与资源组是分开铺的,两者可以不同。
const visualTabs = computed(() => [...chatTabs.value, ...resourceTabs.value])

const tabMenu = ref<{ tabId: string; x: number; y: number } | null>(null)
const renamingTabId = ref<string | null>(null)

function openTabMenu(payload: { tabId: string; x: number; y: number }) {
  renamingTabId.value = null
  tabMenu.value = payload
}

const menuTabIndex = computed(() =>
  tabMenu.value ? visualTabs.value.findIndex(tab => tab.id === tabMenu.value!.tabId) : -1,
)

const tabMenuItems = computed<ContextMenuItem[]>(() => {
  const index = menuTabIndex.value
  if (index === -1) return []
  const list = visualTabs.value
  const tab = list[index]
  const items: ContextMenuItem[] = []

  // 只有会话签有名字可改;资源签的标题来自文件/工作台本身。
  if (tab.type === 'chat') items.push({ id: 'rename', label: 'Rename', icon: Pencil })

  items.push({ id: 'close', label: 'Close', icon: X, separatorBefore: items.length > 0 })
  if (list.length > 1) items.push({ id: 'close-others', label: 'Close Others', icon: ListX })
  if (index > 0) items.push({ id: 'close-left', label: 'Close Tabs to the Left', icon: ArrowLeftToLine })
  if (index < list.length - 1) {
    items.push({ id: 'close-right', label: 'Close Tabs to the Right', icon: ArrowRightToLine })
  }
  if (list.length > 1) items.push({ id: 'close-all', label: 'Close All', icon: X, danger: true })

  return items
})

function onTabMenuSelect(action: string) {
  const index = menuTabIndex.value
  const tabId = tabMenu.value?.tabId
  if (index === -1 || !tabId) return
  const list = visualTabs.value
  const idsOf = (group: Tab[]) => group.map(tab => tab.id)

  switch (action) {
    case 'rename':
      renamingTabId.value = tabId
      break
    case 'close':
      emit('closeTab', tabId)
      break
    case 'close-others':
      emit('closeTabs', idsOf(list.filter(tab => tab.id !== tabId)))
      break
    case 'close-left':
      emit('closeTabs', idsOf(list.slice(0, index)))
      break
    case 'close-right':
      emit('closeTabs', idsOf(list.slice(index + 1)))
      break
    case 'close-all':
      // 目标签放最后关:前面的都关掉后,它才是那个「最后一张」。
      emit('closeTabs', [...idsOf(list.filter(tab => tab.id !== tabId)), tabId])
      break
  }
}

// 页签被关掉 / 换面板焦点时,菜单不该悬在半空指着一个不存在的签
watch(() => props.tabs.map(tab => tab.id).join('|'), () => {
  if (tabMenu.value && menuTabIndex.value === -1) tabMenu.value = null
  if (renamingTabId.value && !props.tabs.some(tab => tab.id === renamingTabId.value)) {
    renamingTabId.value = null
  }
})

// 标签增删后内容宽度变化,ResizeObserver 观察不到,需主动重测
watch(() => props.tabs.length, () => nextTick(measureThumb))
// 切换激活标签滚动使其可见,重测让滚动条跟上
watch(() => props.activeTabId, () => nextTick(() => {
  measureThumb()
  scrollActiveTabIntoView()
}))

// slim 档的 ⋯ 菜单:与页签菜单共用 ContextMenu(点外/Esc 由它自己收),
// 只是锚点从指针位置换成按钮下沿。
const moreRef = ref<HTMLElement | null>(null)
const moreOpen = ref(false)
const moreAnchor = ref({ x: 0, y: 0 })

function toggleMoreMenu() {
  if (moreOpen.value) {
    moreOpen.value = false
    return
  }
  const rect = moreRef.value?.getBoundingClientRect()
  if (rect) moreAnchor.value = { x: rect.left, y: rect.bottom + 6 }
  moreOpen.value = true
}

const overflowItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = []
  if (props.isBranchSession) items.push({ id: 'parent', label: 'Back to parent chat', icon: ArrowLeft })
  if (props.showSplitButton) items.push({ id: 'split', label: 'Split view', icon: Columns2 })
  if (props.canClose) items.push({ id: 'equalize', label: 'Equalize panels', icon: Equal })
  items.push({
    id: 'side-panel',
    label: props.sidePanelCollapsed ? 'Expand side panel' : 'Collapse side panel',
    icon: ListTree,
  })
  if (!props.isInspectorOpen) items.push({ id: 'inspector', label: 'Show workbench', icon: PanelRightOpen })
  return items
})

function onOverflowSelect(action: string) {
  switch (action) {
    case 'parent': emit('goToParent'); break
    case 'split': emit('split'); break
    case 'equalize': emit('equalize'); break
    case 'side-panel': emit('toggleSidePanel'); break
    case 'inspector': emit('toggleInspector'); break
  }
}

watch(showOverflowMenu, (shown) => {
  if (!shown) moreOpen.value = false
})
</script>

<style scoped>
.tab-bar {
  --ot-active-bg: var(--ui-tab-bar-item-active-bg, color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 58%, transparent));
  --ot-active-text: var(--ui-tab-bar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
  --ot-hover-bg: var(--ui-tab-bar-item-hover-bg, color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4.5%, transparent));
  --ot-divider: var(--ui-tab-bar-divider-border, color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 70%, var(--ui-text-muted-fg, var(--muted))));

  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 10px 0 0;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  background: var(--ui-tab-bar-surface-bg, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel))));
  box-shadow: var(--ui-tab-bar-surface-shadow, none);
  /* 整条顶栏打底可拖窗:tab / 按钮 / agent 选择器各自 no-drag 盖回。
     app-region 只算 content box,所以这些控件的间隙与内边距会回退到这层 drag,
     无需逐块补 spacer —— 空白处皆可拖。 */
  -webkit-app-region: drag;
}

/* 基线:页签底标(墨线)落在这条线上 */
.tab-bar::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: color-mix(in srgb, var(--ui-tab-bar-divider-border, var(--ui-border-subtle-border, var(--border-subtle))) 32%, transparent);
  pointer-events: none;
  z-index: 0;
}

/*
  Layout-bound sidebar action reservation.
  This slot is always mounted so Chat/Project/File tabs reserve titlebar action
  space after the app layout has settled. Width changes stay discrete to avoid
  relayouting the message list on every sidebar toggle frame.
  Expanded sidebar: slot width 0, panel is pushed by sidebar width.
  Collapsed sidebar: slot reserves titlebar/traffic-light + action-group space.
*/
/* 按钮的宿主。整块不带 app-region:里面只有按钮自己 no-drag,交通灯让位区和
   按钮之间的缝隙都回退到 .tab-bar 的 drag —— 顶栏空白处处可拖。 */
.topbar-sidebar-actions-slot {
  display: flex;
  align-items: center;
  align-self: stretch;
  flex-shrink: 0;
  transition: none;
}

/* 交通灯让位:收起态下顶栏顶到窗口左缘,红绿灯就压在这一段上。 */
.topbar-traffic-lights-space {
  width: 0;
  flex: 0 0 auto;
  align-self: stretch;
}

.topbar-sidebar-actions-slot.reserved .topbar-traffic-lights-space {
  width: 84px;
}

/* 媒体面板打开时顶栏不再顶到窗口左缘,红绿灯压在面板上,这里只留一点呼吸。 */
.topbar-sidebar-actions-slot.reserved.media-panel-open .topbar-traffic-lights-space {
  width: 10px;
}

/* ── Left: tabs ──────────────────── */
.tab-bar-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  position: relative;
  z-index: 1;
}

/* 包裹层承担弹性收缩,内层负责滚动,浮层滚动条锚在此层顶边 */
.tab-list-wrap {
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  align-self: stretch;
  display: flex;
}

.tab-list {
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: 5px;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  padding: 0 10px 0 12px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tab-list::-webkit-scrollbar {
  display: none;
}

/*
  溢出提示:哪侧还有没露出的页签,哪侧边缘就渐隐。
  用 mask 而非叠一层渐变色块 —— mask 裁的是元素盒子(不随内容滚动),
  且不必去猜背景色,任何主题/纸墨底下都干净。
*/
.tab-list.fade-right {
  --tab-fade: 28px;
  mask-image: linear-gradient(to right, #000 calc(100% - var(--tab-fade)), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--tab-fade)), transparent 100%);
}

.tab-list.fade-left {
  --tab-fade: 28px;
  mask-image: linear-gradient(to right, transparent 0, #000 var(--tab-fade));
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--tab-fade));
}

.tab-list.fade-left.fade-right {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade),
    #000 calc(100% - var(--tab-fade)),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade),
    #000 calc(100% - var(--tab-fade)),
    transparent 100%
  );
}

/* 浮层横向滚动条:绝对定位不占布局,默认隐形,滚动时淡入;锚在顶边 */
.tab-scrollbar {
  position: absolute;
  right: 0;
  top: 1px;
  left: 0;
  height: 3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--duration-fast, 0.15s) var(--ease-default, ease);
  z-index: 2;
}

.tab-scrollbar.visible {
  opacity: 1;
}

.tab-scroll-thumb {
  height: 100%;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 55%, transparent);
  will-change: transform, width;
}

/* 竖刻:chat 组与资源组之间,与右侧 header-tick 同款 */
.tab-group-divider {
  width: 1px;
  height: 14px;
  margin: 0 6px;
  flex: 0 0 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 85%, transparent);
}

.tab-bar-drag-spacer {
  flex: 1;
  min-width: 24px;
  align-self: stretch;
  -webkit-app-region: drag;
}

/* ── Right: action buttons ───────── */
.tab-bar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 60px;
  flex-shrink: 0;
  gap: 8px;
  padding-left: 14px;
  position: relative;
  z-index: 1;
  /* 不整块 no-drag:否则按钮之间的 gap/内边距也被盖成不可拖。
     交由内部 .header-btn / AgentSelector 各自 no-drag,空隙回退到 .tab-bar 的 drag。 */
}

/* 私聊房头(agent-im-dm.md §4.3):一枚 24px 发丝圆章 + 名字 + 职位。
   与成员章同一句法(无填充、无阴影),只是站着的是唯一那个人,所以名字
   跟着章一起出来。窄面板时职位先让位,名字最后才截。 */
.dm-identity {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

/* 身份本身就是入口(C3):按钮不带皮,视觉与原来那块一模一样,只是可点。 */
.dm-identity-open {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.dm-identity-open:hover .dm-identity-name,
.dm-identity-open:focus-visible .dm-identity-name {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.dm-identity-avatar {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 35%, transparent);
  border-radius: 50%;
  font-size: 13px;
  line-height: 1;
}

.dm-identity-avatar.agent-avatar-image {
  border-radius: 50%;
}

.dm-identity-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text));
}

.dm-identity-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

/* 工作状态徽标(§4.3):一段虚线下划的小字,不是填充胶囊 —— 它是状态旁白,
   不该在房头抢过名字。窄面板时它先于名字被截。 */
.dm-work-badge {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ui-text-muted-fg, var(--muted));
  border-bottom: 1px dotted color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 60%, transparent);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.dm-work-badge:hover,
.dm-work-badge:focus-visible {
  color: var(--ui-accent-primary-fg, var(--accent));
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

/* 座标底线(案 A):按钮无底色,悬停变墨并在基线上落一小段点线 */
/* 看板直达按钮:带文字,宽度自适应 */
.board-btn {
  width: auto !important;
  padding: 0 8px;
  gap: 4px;
}

.board-btn-label {
  font-size: 12px;
  line-height: 1;
}

.header-btn {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  border-radius: 0;
  color: var(--ui-tab-bar-action-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    color var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.header-btn::after {
  content: '';
  position: absolute;
  right: 7px;
  bottom: -6px;
  left: 7px;
  height: 0;
  border-bottom: 1.5px dotted transparent;
  transition: border-color var(--duration-fast) var(--ease-default);
  pointer-events: none;
}

.header-btn:hover {
  color: var(--ui-tab-bar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.header-btn:hover::after {
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 75%, transparent);
}

.header-btn:active {
  transform: translateY(1px);
}

/* 竖刻:agent 与按钮组之间的分隔 */
.header-tick {
  flex: 0 0 auto;
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 85%, transparent);
}

.header-btn.back-btn {
  color: var(--ui-tab-bar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
}

.header-btn.inspector-toggle {
  transition: background 0.15s ease, color 0.15s ease,
              opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              margin-left 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.inspector-toggle.hidden {
  width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

/* ── slim 档:⋯ 溢出菜单 ─────────── */
.header-more {
  position: relative;
}

</style>
