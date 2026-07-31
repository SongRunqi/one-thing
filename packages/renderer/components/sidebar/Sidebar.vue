<template>
  <aside
    :class="['sidebar', { collapsed, floating, 'floating-closing': floatingClosing }]"
    :style="sidebarStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <Space
      as="div"
      direction="vertical"
      size="none"
      align="stretch"
      class="sidebar-content"
      :class="{ 'content-hidden': collapsed && !floating }"
      :aria-hidden="collapsed && !floating"
    >
      <!-- Sidebar Header: traffic lights space + 操作按钮(展开态的宿主) -->
      <SidebarHeader>
        <SidebarActionGroup
          :sidebar-visible="!collapsed || floating"
          variant="sidebar"
          @toggle-sidebar="$emit('toggleCollapse')"
          @open-search="$emit('open-search')"
          @create-new-chat="$emit('create-new-chat')"
        />
      </SidebarHeader>

      <!-- 方案六 · 顶部「＋ 新会话」：固定在滚动区之外的文本入口 -->
      <button
        type="button"
        class="sidebar-newchat"
        @click="$emit('create-new-chat')"
      >
        ＋ 新会话
      </button>

      <!-- 「进行中」活卡片区 — docs/design/im-workbench-layout.md §3 W1(C1)。
           左栏的第一区是**活**不是对话:名字 + 负责人 + 状态标 + 进度。
           两道门:
            - `isWorkbenchShell` —— classic 是逐像素回滚闸,这一区连挂都不挂
              (顺序重排走文件末尾的 `data-shell-mode` CSS 门,同样不碰 classic);
            - `roomsEnabled` —— 看板是房的附属,web 端没有 rooms 协调器,
              否则那儿会常驻一行永远为空的「没有在跑的活」。 -->
      <ActiveWorkSection
        v-if="isWorkbenchShell && roomsEnabled"
        @open="openActiveWorkCard"
      />

      <!-- 联系人(通讯录)分区 — docs/design/agent-im-dm.md §4.1 D1。
           一个 agent 一行,点开就是和 TA 的托管式私聊(单成员 dm 房,惰性建房)。
           数据源是名册而不是会话列表:没聊过的同事也该在通讯录里站着,否则
           「第一次找小李」这件事就没有入口。desktop-only —— 私聊是房,rooms
           在 web 端没有协调器(§7 开放问题),所以与群聊同一道能力门。
           行样式沿用群聊/Agent 组那一族,不另起一套画线风。 -->
      <div
        v-if="roomsEnabled && contacts.length > 0"
        class="sidebar-rooms sidebar-contacts"
      >
        <div class="sidebar-rooms-header">
          <span class="sidebar-rooms-label">联系人</span>
        </div>
        <button
          v-for="contact in contacts"
          :key="contact.id"
          type="button"
          class="sidebar-room-item sidebar-agent-item sidebar-contact-item"
          :class="{ 'is-active': isContactActive(contact), 'has-unread': isContactUnread(contact) }"
          :title="contactTitle(contact)"
          @click="openContact(contact)"
          @contextmenu.prevent="openContactMenu($event, contact)"
        >
          <AgentAvatar
            class="sidebar-agent-avatar"
            aria-hidden="true"
            :avatar="contact.avatar"
            :avatar-image="contact.avatarImage"
            :size="18"
          />
          <span class="sidebar-room-name">{{ contact.name }}</span>
          <span
            v-if="contact.title"
            class="sidebar-contact-title"
          >{{ contact.title }}</span>
          <!-- 未读墨点(agent-im-dm.md P4)。一枚点,不摆数字:系统只知道"有没有
               新话",不知道"几条" —— 编一个计数出来比不显示更糟。 -->
          <span
            v-if="isContactUnread(contact)"
            class="sidebar-unread-dot"
            aria-label="有新消息"
          />
        </button>
        <!-- 失败一行墨(RoomMemberStrip 同款):建房被拒(退休/service/查无此人)
             或 web 端不支持,都必须看得见,绝不静默无反应。 -->
        <span
          v-if="contactError"
          class="sidebar-contacts-error"
          :title="contactError"
        >{{ contactError }}</span>
      </div>

      <!-- 群聊(多 Agent 房间)分区 — docs/design/multi-agent-collab.md。
           吃的是 groupRoomSessions:私聊房不在这里出现,联系人行是它唯一的
           侧栏入口(agent-im-dm.md §4.1),否则一间房会在侧栏出现两次。 -->
      <div
        v-if="roomSessions.length > 0 || roomsEnabled"
        class="sidebar-rooms"
      >
        <div class="sidebar-rooms-header">
          <span class="sidebar-rooms-label">群聊</span>
          <button
            v-if="roomsEnabled"
            type="button"
            class="sidebar-rooms-add"
            title="新建群聊"
            aria-label="新建群聊"
            @click="showRoomDialog = true"
          >
            ＋
          </button>
        </div>
        <button
          v-for="room in roomSessions"
          :key="room.id"
          type="button"
          class="sidebar-room-item"
          :class="{
            'is-active': sessionsStore.currentSessionId === room.id,
            'has-unread': sessionsStore.isUnreadSession(room.id),
          }"
          @click="openRoom(room.id)"
          @contextmenu.prevent="openRoomContextMenu($event, room)"
        >
          <span class="sidebar-room-name">{{ room.name }}</span>
          <span
            v-if="sessionsStore.isUnreadSession(room.id)"
            class="sidebar-unread-dot"
            aria-label="有新消息"
          />
        </button>

        <!-- 「私下」= 双成员 dm 房(agent 互聊,agent-im-dm.md §4.1/D4)。
             群聊区**里**的折叠子分组,不是与它并列的第四段:agent 之间的私聊是
             群聊的旁支,而透明制要求它在侧栏看得见 —— 看得见,但默认收起,不占
             视线。房名「A ⇄ B」由引擎现算,这里只显示。 -->
        <template v-if="pairDmRooms.length > 0">
          <button
            type="button"
            class="sidebar-subgroup"
            :aria-expanded="pairDmOpen"
            @click="pairDmOpen = !pairDmOpen"
          >
            <span
              class="sidebar-subgroup-caret"
              :class="{ open: pairDmOpen }"
              aria-hidden="true"
            >›</span>
            <span class="sidebar-subgroup-label">私下</span>
            <span class="sidebar-subgroup-count">{{ pairDmRooms.length }}</span>
            <!-- 收起时组头替组内那些看不见的行说话;展开了就各说各的,组头闭嘴。 -->
            <span
              v-if="!pairDmOpen && pairDmUnread"
              class="sidebar-unread-dot"
              aria-label="有新消息"
            />
          </button>
          <template v-if="pairDmOpen">
            <button
              v-for="room in pairDmRooms"
              :key="room.id"
              type="button"
              class="sidebar-room-item sidebar-subgroup-item"
              :class="{
                'is-active': sessionsStore.currentSessionId === room.id,
                'has-unread': sessionsStore.isUnreadSession(room.id),
              }"
              @click="openRoom(room.id)"
              @contextmenu.prevent="openRoomContextMenu($event, room)"
            >
              <span class="sidebar-room-name">{{ room.name }}</span>
              <span
                v-if="sessionsStore.isUnreadSession(room.id)"
                class="sidebar-unread-dot"
                aria-label="有新消息"
              />
            </button>
          </template>
        </template>
      </div>

      <!-- 「Agent 组」已退役(agent-im-dm.md §4.1)。它唯一的能力 —— 各群执行
           会话的只读转录入口 —— 迁进了 Agents 面板的履历页「群聊」栏:基础设施
           转录放在通讯录层级是错位的,而履历页本来就是"这个人干过什么"的家。
           侧栏这一层从此只剩 联系人 / 群聊 / 会话 三段 IM 结构。 -->

      <!-- Session List: workspace actions live inside the same scroll panel -->
      <SessionList
        :groups="groupedSessions"
        :active-index="activeSidebarIndex"
        :current-session-id="sessionsStore.currentSessionId"
        :is-session-generating="chatStore.isSessionGenerating"
        :editing-session-id="editingSessionId"
        :editing-name="editingName"
        @menu-select="handleSidebarMenuSelect"
        @context-menu="openContextMenu"
        @toggle-collapse="sessionOrganizer.toggleCollapse"
        @start-rename="startInlineRename"
        @confirm-rename="confirmInlineRename"
        @cancel-rename="cancelInlineRename"
        @overflow-change="handleOverflowChange"
      />

      <!-- Bottom dock (方案二/v7 原样): 裸 16px 线性图标浮在白胶囊里，
           单色墨系（rest 灰 → hover/active 墨），设置在分隔线右侧。 -->
      <div class="sidebar-dock">
        <div class="sidebar-dock-pill">
          <button
            v-for="action in workspaceActions"
            :key="action.id"
            type="button"
            class="sidebar-dock-icon"
            :class="{ 'is-active': activeWorkspacePanel === action.id }"
            :title="action.label"
            :aria-label="action.label"
            @click="$emit('open-workspace-panel', action.id)"
          >
            <component
              :is="action.icon"
              :size="16"
              :stroke-width="1.7"
            />
          </button>
          <span
            class="sidebar-dock-divider"
            aria-hidden="true"
          />
          <button
            type="button"
            class="sidebar-dock-icon"
            title="Settings"
            aria-label="Settings"
            @click="$emit('open-settings')"
          >
            <Settings
              :size="16"
              :stroke-width="1.7"
            />
          </button>
        </div>
      </div>

      <RoomCreateDialog
        :visible="showRoomDialog"
        @close="showRoomDialog = false"
      />

      <!-- Context Menu -->
      <SessionContextMenu
        :show="contextMenu.show"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :session="contextMenu.session"
        @close="closeContextMenu"
        @rename="handleContextRename"
        @pin="handleContextPin"
        @delete="handleContextDelete"
      />

      <!-- 联系人右键:「打开空间」(= 点头像同一处)与「配置 Agent」。两条都走
           `openAgentSpace`,差别只是停在哪一面。 -->
      <ContextMenu
        :show="contactMenu !== null"
        :x="contactMenu?.x ?? 0"
        :y="contactMenu?.y ?? 0"
        :items="CONTACT_MENU_ITEMS"
        @select="onContactMenuSelect"
        @close="contactMenu = null"
      />
    </Space>
  </aside>
</template>

<script setup lang="ts">
import Space from '@/components/common/Space.vue'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import type { ContextMenuItem } from '@/components/common/context-menu'
import { DEFAULT_AGENT_ID, useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { Bot, Brain, CalendarClock, Images, Radio, Settings } from 'lucide-vue-next'
import SidebarHeader from './SidebarHeader.vue'
import SidebarActionGroup from './SidebarActionGroup.vue'
import SessionList from './SessionList.vue'
import SessionContextMenu from './SessionContextMenu.vue'
import RoomCreateDialog from './RoomCreateDialog.vue'
import ActiveWorkSection from './ActiveWorkSection.vue'
import type { ActiveWorkCardModel } from './active-work'
import { platformApi } from '@/platform'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import { resolveShellMode } from '@/composables/useShellMode'
import { useSessionOrganizer, type SessionWithBranches } from './useSessionOrganizer'

interface Props {
  collapsed?: boolean
  floating?: boolean
  floatingClosing?: boolean
  noTransition?: boolean
  mediaPanelOpen?: boolean
  activeWorkspacePanel?: 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice' | null
  width?: number
}

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice'

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
  floating: false,
  floatingClosing: false,
  noTransition: false,
  activeWorkspacePanel: null,
  width: 300,
})

const emit = defineEmits<{
  toggleCollapse: []
  'toggle-media-panel': []
  'open-workspace-panel': [panel: WorkspacePanel]
  'select-session': [sessionId: string]
  'create-new-chat': []
  'open-search': []
  'open-settings': []
  'request-floating-keep-open': []
  'request-floating-close': []
}>()

// Stores
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()

// 群聊(多 Agent 房间) — desktop only in P0: the web host has no
// RoomCoordinator and its server silently ignores kind='room' creates.
const showRoomDialog = ref(false)
const roomsEnabled = computed(() => platformApi.capabilities.collabRooms)
// 群聊区 = 普通群。私聊房(单成员 dm)由 store 的 selector 摘走 —— 这里不写
// 第二份过滤,判定只有 sessions store 那一处(agent-im-dm.md §4.1)。
const roomSessions = computed(() => sessionsStore.groupRoomSessions)
// 「私下」子分组(§4.1):双成员 dm 房。同样只读 store 的 selector,不在这里
// 写第二份形态判定。默认收起 —— 它是旁支,不是主线。
const pairDmRooms = computed(() => sessionsStore.agentPairDmRoomSessions)
const pairDmOpen = ref(false)
// 收起的「私下」组头替组内的行说话。判定仍然是 store 那一个 `isUnreadSession`,
// 这里只做"有没有任意一间"的聚合(agent-im-dm.md P4)。
const pairDmUnread = computed(() =>
  pairDmRooms.value.some(room => sessionsStore.isUnreadSession(room.id)),
)

function openRoom(sessionId: string): void {
  workspaceStore.openSession(sessionId)
}

// ── 外壳形态门(C0 的 useShellMode)────────────────────────────────────────
// 「进行中」区是**结构**差异不是视觉差异(它带着一次取数),CSS 门关不掉一次
// IPC,所以这一处必须是 JS 判定。视觉上的四区重排仍然走 `data-shell-mode`。
// 没挂 pinia 的老单测取不到设置 store —— 退到 classic,也就是"什么都不变",
// 这是测试兜底,不是产品默认(产品默认见 resolveShellMode)。
let settingsStore: ReturnType<typeof useSettingsStore> | null = null
try {
  settingsStore = useSettingsStore()
} catch {
  settingsStore = null
}
const isWorkbenchShell = computed(
  () => !!settingsStore && resolveShellMode(settingsStore.settings) === 'workbench',
)

/**
 * 点一张活卡片 = 打开这张卡所在的房(与群聊行同一条 `openSession` 链路)
 * + 右栏切到这张卡的线程(C3,§3 W1「卡片点击 = 打开该卡对应的房 + 右栏切到
 * 该卡的线程」)。
 *
 * 线程走 window 事件而不是 emit 上去:侧栏离右栏隔着 App 的整棵布局,中栏活动线
 * 的「展开 →」派的也是同一个事件同一个形状,两个入口共用一条线路才只有一份契约。
 * `workSessionId`(尾条工作台会话 = 当前那次执行)为空就只开房 —— 活刚领下来还
 * 没开过工作台,派一个空事件只会在右栏开出一个读不到东西的 tab。
 */
function openActiveWorkCard(card: ActiveWorkCardModel): void {
  if (!card.roomSessionId) return
  openRoom(card.roomSessionId)
  if (!card.workSessionId) return
  window.dispatchEvent(new CustomEvent('onething:open-thread', {
    detail: { workSessionId: card.workSessionId, title: card.title, taskId: card.taskId },
  }))
}

/** 群聊行右键 = 复用会话上下文菜单(改名/删除;删除会级联清掉工作会话)。 */
function openRoomContextMenu(event: MouseEvent, room: { id: string }): void {
  openContextMenu(event, room as unknown as SessionWithBranches)
}

const agentsStore = useAgentsStore()

// ── 联系人区(agent-im-dm.md §4.1)────────────────────────────────────────
// 通讯录取社交面名册(域模型 M2 的 `colleagues`:colleague && active),不是
// 会话列表 —— 没聊过的同事也得在这儿站着,不然"第一次找小李"没有入口。
// 名册得先加载:群聊区靠执行会话触发那条 watch,通讯录一间房都还没有的时候
// 也要有人,所以这里自己拉一次(store 自带去重,全 app 仍是一次拉取)。
watch(roomsEnabled, (enabled) => {
  if (enabled && !agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
}, { immediate: true })

interface SidebarContact {
  id: string
  name: string
  title?: string
  avatar?: string
  avatarImage?: string
}

/** 主助理置顶(D1/M5:default 是第一位联系人),其余保持名册顺序。 */
const contacts = computed<SidebarContact[]>(() => {
  const roster = agentsStore.colleagues
  const head = roster.filter(agent => agent.id === DEFAULT_AGENT_ID)
  const rest = roster.filter(agent => agent.id !== DEFAULT_AGENT_ID)
  return [...head, ...rest].map(agent => ({
    id: agent.id,
    name: agent.name,
    title: agent.title,
    avatar: agent.avatar,
    avatarImage: agent.avatarImage,
  }))
})

const CONTACT_MENU_SPACE = 'agent-space'
const CONTACT_MENU_CONFIGURE = 'configure-agent'
const CONTACT_MENU_ITEMS: ContextMenuItem[] = [
  { id: CONTACT_MENU_SPACE, label: '打开空间' },
  { id: CONTACT_MENU_CONFIGURE, label: '配置 Agent' },
]
const CONTACT_ERROR_LINGER_MS = 4000

const contactMenu = ref<{ x: number; y: number; agentId: string } | null>(null)
const contactError = ref('')
const openingContactId = ref('')
let contactErrorTimer: ReturnType<typeof setTimeout> | null = null

function showContactError(message: string): void {
  contactError.value = message
  if (contactErrorTimer) clearTimeout(contactErrorTimer)
  contactErrorTimer = null
  if (!message) return
  contactErrorTimer = setTimeout(() => { contactError.value = '' }, CONTACT_ERROR_LINGER_MS)
}

/** 已经聊过就点亮 —— 房是惰性建的,没建过的联系人当然不该有高亮。 */
function isContactActive(contact: SidebarContact): boolean {
  const room = sessionsStore.findUserDmRoom(contact.id)
  return !!room && sessionsStore.currentSessionId === room.id
}

/**
 * 联系人行的未读 = TA 的私聊房未读。没建过房的联系人当然不会有未读 ——
 * 判定本身只有 store 那一处,这里只是把 agent 翻译成 房。
 */
function isContactUnread(contact: SidebarContact): boolean {
  const room = sessionsStore.findUserDmRoom(contact.id)
  return !!room && sessionsStore.isUnreadSession(room.id)
}

function contactTitle(contact: SidebarContact): string {
  return contact.title ? `${contact.name} · ${contact.title}` : contact.name
}

/**
 * 点联系人 = 打开和 TA 的私聊。建房幂等(同一个 agent 永远同一间房),所以
 * "打开"和"创建"是同一个调用;新建的房要先进列表 openSession 才认得,这跟
 * RoomCreateDialog 同一条动线。
 */
async function openContact(contact: SidebarContact): Promise<void> {
  if (openingContactId.value) return
  openingContactId.value = contact.id
  showContactError('')
  try {
    const response = await platformApi.ensureCollabDmRoom(contact.id)
    if (!response?.success || !response.roomSessionId) {
      showContactError(response?.error || '打不开私聊')
      return
    }
    await sessionsStore.loadSessions()
    workspaceStore.openSession(response.roomSessionId)
  } catch (cause) {
    showContactError(cause instanceof Error ? cause.message : String(cause))
  } finally {
    openingContactId.value = ''
  }
}

function openContactMenu(event: MouseEvent, contact: SidebarContact): void {
  showContactError('')
  contactMenu.value = { x: event.clientX, y: event.clientY, agentId: contact.id }
}

function onContactMenuSelect(id: string): void {
  const agentId = contactMenu.value?.agentId
  contactMenu.value = null
  if (!agentId) return
  if (id !== CONTACT_MENU_CONFIGURE && id !== CONTACT_MENU_SPACE) return
  // 三处入口同归一个 `openAgentSpace`(agent-im-chat-ui.md C3):寄存要看的
  // agent + 停在哪一面,再请 App 开面板 —— 面板懒挂载,直接派事件会打空。
  agentsStore.openAgentSpace(agentId, id === CONTACT_MENU_SPACE ? 'sessions' : 'config')
}

onUnmounted(() => {
  if (contactErrorTimer) clearTimeout(contactErrorTimer)
})

const workspaceActions = [
  { id: 'memory' as const, label: 'Memory', icon: Brain },
  { id: 'media' as const, label: 'Media', icon: Images },
  { id: 'agents' as const, label: 'Agents', icon: Bot },
  { id: 'tasks' as const, label: 'Tasks', icon: CalendarClock },
  { id: 'music' as const, label: 'Music', icon: Radio },
]

// Composable
const sessionOrganizer = useSessionOrganizer()

// Make props available in template
const collapsed = computed(() => props.collapsed)
const floating = computed(() => props.floating)
const floatingClosing = computed(() => props.floatingClosing)

// Local state
const localSearchQuery = ref('')
const hasContentBelow = ref(false)

// Inline editing state
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  session: null as SessionWithBranches | null,
})

// Computed sidebar style
const sidebarStyle = computed(() => {
  const baseStyle = {
    '--sidebar-docked-width': `${props.width}px`,
  }

  if (floating.value || floatingClosing.value) {
    return {
      ...baseStyle,
      transition: 'none'
    }
  }

  return {
    ...baseStyle,
    transition: props.noTransition ? 'none' : undefined
  }
})

// Filtered and flat sessions
const filteredSessions = computed(() => {
  const sessions = sessionsStore.sidebarSessions
  if (!localSearchQuery.value.trim()) {
    return sessions
  }
  const query = localSearchQuery.value.toLowerCase()
  return sessions.filter(s =>
    (s.name || '').toLowerCase().includes(query)
  )
})

/**
 * The radio DJ's curation sessions as a sidebar group of their own —
 * filtered out of the public list (they drive themselves and would read as
 * ghosts there), but one expand away. Clicking opens in the main chat like
 * any session. Synthesizing a SessionGroup buys SubMenu's collapse, the
 * 5-visible/show-more limit and the context menu for free.
 */
const musicGroup = computed(() => {
  const radioSessions = sessionsStore.radioSessions
  if (radioSessions.length === 0) return null
  return {
    key: 'music',
    label: 'Music · 电台',
    sessions: radioSessions.map((session): SessionWithBranches => ({
      ...session,
      branches: [],
      depth: 0,
      hasBranches: false,
      isCollapsed: false,
      isLastChild: false,
      branchCount: 0,
      isHidden: false,
      lastBranchUpdate: session.updatedAt,
      ancestorsLastChild: [],
    })),
  }
})

const groupedSessions = computed(() => {
  const groups = sessionOrganizer.getProjectGroupedSessions(filteredSessions.value)
  const music = musicGroup.value
  // Music rides on top: the station is a live thing, not an archive.
  return music ? [music, ...groups] : groups
})

const activeSidebarIndex = computed(() => {
  if (sessionsStore.currentSessionId) return sessionMenuIndex(sessionsStore.currentSessionId)
  return ''
})

function sessionMenuIndex(sessionId: string): string {
  return `session:${sessionId}`
}

function handleSidebarMenuSelect(index: string) {
  if (index.startsWith('session:')) {
    if (editingSessionId.value) return
    emit('select-session', index.slice('session:'.length))
  }
}

function handleMouseEnter() {
  if (!props.floating && !props.floatingClosing) return
  emit('request-floating-keep-open')
}

function handleMouseLeave() {
  if (!props.floating || props.floatingClosing) return
  emit('request-floating-close')
}

// Overflow change handler
function handleOverflowChange(_isOverflowing: boolean, hasBelow: boolean) {
  hasContentBelow.value = hasBelow
}

// Context menu handlers
function openContextMenu(event: MouseEvent, session: SessionWithBranches) {
  if (sessionsStore.isNewChatDraftId(session.id)) return
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    session,
  }
}

function closeContextMenu() {
  contextMenu.value.show = false
}

function handleContextRename() {
  if (contextMenu.value.session) {
    startInlineRename(contextMenu.value.session)
  }
}

async function handleContextPin() {
  if (contextMenu.value.session) {
    await sessionsStore.updateSessionPin(
      contextMenu.value.session.id,
      !contextMenu.value.session.isPinned
    )
  }
}

async function handleContextDelete() {
  if (contextMenu.value.session) {
    await sessionsStore.deleteSession(contextMenu.value.session.id)
  }
}

// Inline rename handlers
function startInlineRename(session: SessionWithBranches) {
  if (sessionsStore.isNewChatDraftId(session.id)) return
  editingSessionId.value = session.id
  editingName.value = session.name || ''
}

function cancelInlineRename() {
  editingSessionId.value = null
  editingName.value = ''
}

async function confirmInlineRename(sessionId: string, newName: string) {
  const session = sessionsStore.filteredSessions.find(s => s.id === sessionId)
  const originalName = session?.name || ''
  const trimmedName = newName.trim()

  // Clear editing state first
  editingSessionId.value = null
  editingName.value = ''

  // Only call rename if name actually changed
  if (trimmedName && trimmedName !== originalName) {
    await sessionsStore.renameSession(sessionId, trimmedName)
  }
}

// Window resize handler
function handleWindowResize() {
  if (window.innerWidth < 768) {
    if (!props.collapsed) {
      emit('toggleCollapse')
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<style scoped>
.sidebar {
  --sidebar-docked-width: 300px;
  --sidebar-floating-gutter: 6px;
  --sidebar-floating-safe-zone: 36px;
  --sidebar-bg: var(
    --ui-sidebar-surface-bg,
    var(--ui-surface-app-bg, var(--bg-app, var(--bg)))
  );
  /* 行层级从墨色按比例派生，保证任何主题下 分组头(全墨) > 行文(72% 墨) >
     active(14%) > hover(8%) 的对比关系都成立——直接引各主题 token 时
     对比度不可控（用户实测过分组头/行文一个色、hover 看不见）。
     整棵 sidebar（新会话/列表/SessionItem）共用这条派生链。 */
  --sidebar-row-ink: var(--ui-text-primary-fg, var(--text-primary, var(--text)));
  --sidebar-row-fg: color-mix(in srgb, var(--sidebar-row-ink) 72%, transparent);
  --sidebar-row-hover-fill: color-mix(in srgb, var(--sidebar-row-ink) 8%, transparent);
  --sidebar-row-active-fill: color-mix(in srgb, var(--sidebar-row-ink) 14%, transparent);
  position: relative;
  flex: 1 1 auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  transition: opacity 0.2s ease;
  overflow: hidden;
  background: var(--sidebar-bg);
  padding: 0;
  contain: layout style;
}

/* Floating sidebar mode */
.sidebar.floating {
  position: fixed;
  left: 0;
  top: 0;
  width: calc(
    var(--sidebar-docked-width)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-safe-zone)
  ) !important;
  max-width: calc(
    var(--sidebar-docked-width)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-safe-zone)
  ) !important;
  height: 100%;
  z-index: 650;
  background: transparent;
  animation: slideInLeft 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  overflow: visible;
  transition: none;
  pointer-events: auto;
}

/* Floating card clears the fixed window-controls strip (traffic lights +
   sidebar actions, top 12px + 24px) instead of sliding beneath it — list
   content must never show through that transparent strip. */
.sidebar.floating .sidebar-content {
  width: var(--sidebar-docked-width);
  min-width: var(--sidebar-docked-width);
  max-width: var(--sidebar-docked-width);
  height: calc(100% - 44px - var(--sidebar-floating-gutter));
  margin: 44px var(--sidebar-floating-gutter) var(--sidebar-floating-gutter);
  padding-bottom: 0;
  background: var(--sidebar-bg);
  border: 1px solid color-mix(in srgb, var(--ui-sidebar-border-border, var(--ui-border-subtle-border, var(--border-subtle, var(--border)))) 72%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  will-change: transform, opacity;
  pointer-events: auto;
}

/* The in-card traffic-lights spacer is meaningless when the card already
   starts below the window controls. */
.sidebar.floating .sidebar-content :deep(.sidebar-header) {
  display: none;
}

.sidebar.floating.floating-closing {
  animation: slideOutLeft 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

/* Sidebar content panel */
.sidebar-content {
  flex: 1;
  align-self: flex-start;
  width: var(--sidebar-docked-width);
  min-width: var(--sidebar-docked-width);
  max-width: var(--sidebar-docked-width);
  min-height: 0;
  margin-top: 12px;
  background: transparent;
  overflow: hidden;
  contain: layout style paint;
  transition: opacity 0.15s ease;
}

/* Content fades out faster than width shrinks */
.sidebar-content.content-hidden {
  opacity: 0;
  pointer-events: none;
}

/* 方案六 · 顶部「＋ 新会话」：文本行不进滚动区，hover 只由灰转墨（无填充），
   ＋ 号与分组行 chevron 同起笔线（x=24 = 列表容器 12 + 抽屉头起点 12）。
   上内边距 12px 让文字躲开 SidebarHeader 底部同高的淡出渐变。 */
.sidebar-newchat {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 16px 10px 24px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  /* v7：与行文同 13px */
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.15s ease;
}

.sidebar-newchat:hover,
.sidebar-newchat:focus-visible {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

/* 联系人 / 群聊两组——同一套画线风,共用一条规则而不是各画一份,免得两组
   日后长歪成两种样子。 */
.sidebar-contacts,
.sidebar-rooms {
  flex-shrink: 0;
  padding: 2px 12px 6px 24px;
  display: flex;
  flex-direction: column;
}

.sidebar-rooms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 2px 0;
}

.sidebar-rooms-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  user-select: none;
}

.sidebar-rooms-add {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 2px 6px;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
}

.sidebar-rooms-add:hover {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.sidebar-room-item {
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 4px 8px 4px 0;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-room-item:hover,
.sidebar-room-item.is-active {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

/* 未读:一枚墨点靠右,行文顺手提到满墨(IM 的老规矩——未读那行更"实")。
   群聊/私下行原本不是 flex(省一层盒子,省略号画在按钮本体上),只有带点的那行
   才切成 flex 并把省略号交给名字 span —— 不改无点行的既有排版。 */
.sidebar-room-item.has-unread {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.sidebar-room-item.has-unread .sidebar-room-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 5px 一点墨,不描边不发光;靠 margin-left:auto 贴住行尾,名字永远先保住。 */
.sidebar-unread-dot {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
  opacity: 0.6;
}

/* 「私下」折叠头:比群聊行更轻一档(11px、字距同分区标签),它是分区里的分区。
   一枚发丝 caret + 计数,没有填充也没有边框 —— 画线风里"可折叠"由 caret 说。 */
.sidebar-subgroup {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.08em;
  padding: 4px 8px 2px 0;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
}

.sidebar-subgroup:hover {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.sidebar-subgroup-caret {
  display: inline-block;
  font-size: 12px;
  line-height: 1;
  transition: transform 0.12s ease;
}

.sidebar-subgroup-caret.open {
  transform: rotate(90deg);
}

.sidebar-subgroup-count {
  font-size: 10px;
  opacity: 0.7;
}

/* 子项缩进对齐折叠头的文字,而不是 caret —— 缩进是从属关系的唯一标记。 */
.sidebar-subgroup-item {
  padding-left: 17px;
}

/* 联系人行 = 群聊行 + 一枚头像章。行本身沿用 .sidebar-room-item,这里只把
   文字挪开给章让位。(类名保留 agent- 前缀:章 + 名字这套排版本来就是身份行的
   通用形,「Agent 组」退役并不改变它属于谁。) */
.sidebar-agent-item {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 auto;
  min-width: 0;
}

.sidebar-agent-item .sidebar-room-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
}

/* 联系人行是竖列里的一行:`.sidebar-agent-item` 的 flex:1 是为行内布局写的,
   在这里会让行去抢竖直方向的空间。 */
.sidebar-contact-item {
  flex: 0 0 auto;
}

/* 联系人行 = Agent 行的排版(头像章 + 名字)再挂一枚职位。职位是补语不是
   标签:淡一档、可被压缩,名字永远先保住。 */
.sidebar-contact-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  opacity: 0.75;
}

/* 建房被拒的一行墨(RoomMemberStrip 的 .member-error 同款语气)。 */
.sidebar-contacts-error {
  padding: 2px 8px 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* 画线圆章:一圈发丝线,emoji 即身份 —— 与房间成员章同一句法,尺寸按侧栏
   行高收到 18px。无填充、无阴影。 */
.sidebar-agent-avatar {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 30%, transparent);
  border-radius: 50%;
  font-size: 10px;
  line-height: 1;
}

.sidebar.collapsed {
  padding: 0;
  overflow: hidden;
  border: none;
  box-shadow: none;
}

/* 方案二 · 底部悬浮胶囊 dock —— v7 原样：白胶囊、9/15 内边距、裸 16px
   线性图标、图标间距 15、细分隔线、无边框，阴影同设计稿。 */
.sidebar-dock {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  min-width: 0;
  padding: 10px 8px 14px;
}

/* 自然宽 = 图标 6×16 + 分隔线 1 + 内边距 30 + 间距 6×15 = 217px。
   space-between 让间距在足宽时恰为 15px（=设计稿 gap），sidebar 收窄时
   间距均匀压缩、图标不缩，200px 也不溢出。 */
.sidebar-dock-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(217px, 100%);
  min-width: 0;
  padding: 9px 15px;
  border-radius: 999px;
  /* 主题色：用主题自己的最亮面（主界面纸色），与 sidebar 同色相、亮一档，
     浮起感靠阴影——与设计稿"纯白对米白"的微差关系一致。
     fx-base-50 是 flexoki 静态阶，色相与自定义主题会打架，不能用。 */
  background: var(--ui-surface-app-bg, var(--bg-app, #fff));
  box-shadow: var(--shadow-md, 0 3px 12px rgba(30, 26, 16, 0.13));
}

/* 暗色（html[data-theme='dark']）：flexoki 色阶翻转后 fx-base-50 变最深，
   胶囊改用主题的浮起面（比 sidebar 底亮一档，与弹层一致） */
:global(html[data-theme='dark']) .sidebar-dock-pill {
  background: var(--ui-surface-floating-bg, var(--bg-floating, var(--fx-base-300)));
}

.sidebar-dock-divider {
  width: 1px;
  height: 15px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 12%, transparent);
}

/* 裸图标即入口（v7）：无按钮盒、无填充。padding+负 margin 只扩点击热区，
   不改变 16px 的排版占位。 */
.sidebar-dock-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px;
  margin: -4px;
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 56%, transparent);
  cursor: pointer;
  transition: color 0.15s ease;
}

.sidebar-dock-icon:hover,
.sidebar-dock-icon:focus-visible,
.sidebar-dock-icon.is-active {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.sidebar-dock-icon:focus-visible {
  outline: none;
  border-radius: 6px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 36%, transparent);
}

/* ── 工作台外壳:左栏四区重排(im-workbench-layout.md §3 W1)──────────────
   顺序即优先级:进行中 → 群聊 → 同事 → 直聊。

   重排走 `order` 而不是两份模板:三区的实现一个字节没动(本期不重写它们),
   只是换了坐次。整段挂在 `data-shell-mode='workbench'` 门里 —— classic 下这些
   声明一条都不生效,DOM 顺序与从前逐像素一致(C0 纪律 3)。
   注:`.sidebar-contacts` 同时带着 `.sidebar-rooms`,所以群聊那条必须排除它,
   否则同事区会被判成群聊区。 */
:global(html[data-shell-mode='workbench']) .sidebar-content > .sidebar-active-work {
  order: 1;
}

:global(html[data-shell-mode='workbench']) .sidebar-content > .sidebar-rooms:not(.sidebar-contacts) {
  order: 2;
}

:global(html[data-shell-mode='workbench']) .sidebar-content > .sidebar-contacts {
  order: 3;
}

:global(html[data-shell-mode='workbench']) .sidebar-content > .session-list-wrapper {
  order: 4;
}

:global(html[data-shell-mode='workbench']) .sidebar-content > .sidebar-dock {
  order: 5;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    z-index: 1000;
  }
}
</style>
