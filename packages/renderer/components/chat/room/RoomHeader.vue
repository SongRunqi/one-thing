<template>
  <header class="room-header">
    <!-- 侧栏藏起来时,换房的唯一入口就是它 —— 房面没有 TabBar,这颗不能丢。 -->
    <button
      v-if="showSidebarToggle"
      type="button"
      class="room-head-icon room-head-sidebar"
      title="显示侧栏"
      aria-label="显示侧栏"
      @click="emit('toggleSidebar')"
    >
      <PanelLeft
        :size="15"
        :stroke-width="1.7"
      />
    </button>

    <!-- 私聊态:头像 + 名字 + 「在忙 · 正在做什么」(样板 三 · 私聊)。 -->
    <div
      v-if="head.mode === 'dm'"
      class="room-solo"
    >
      <button
        type="button"
        class="room-solo-open"
        :title="`${head.agent?.title ? `${head.name} · ${head.agent.title}` : head.name} · 打开空间`"
        @click="openAgentSpace"
      >
        <!-- 环画在外层 span 上,不画在头像本身:图片头像是 <img>,
             ::after 在替换元素上不渲染。 -->
        <span class="room-solo-avatar-wrap">
          <AgentAvatar
            class="room-solo-avatar"
            aria-hidden="true"
            :avatar="head.agent?.avatar"
            :avatar-image="head.agent?.avatarImage"
            :size="28"
          />
        </span>
        <span class="room-solo-text">
          <b class="room-solo-name">{{ head.name }}</b>
          <i
            class="room-solo-presence"
            :class="{ 'is-busy': !!head.work }"
          >{{ head.subtitle }}</i>
        </span>
      </button>
      <!-- 在忙时点一下 = 打开这条线程(右栏),不再另开一个页签。 -->
      <button
        v-if="head.work"
        type="button"
        class="room-head-work"
        :title="`正在干活 · ${head.work.title} —— 打开线程`"
        @click="openWorkThread"
      >
        {{ head.work.shortId }}
      </button>
    </div>

    <!-- 群聊态:`# 房名` + 主题(样板 一 · 群聊)。 -->
    <template v-else>
      <span class="room-hash">#</span>
      <b
        class="room-name"
        :title="head.name"
      >{{ head.name }}</b>
      <span
        v-if="head.subtitle"
        class="room-topic"
        :title="head.subtitle"
      >{{ head.subtitle }}</span>
    </template>

    <div class="room-head-right">
      <!-- 成员头像堆:复用房间既有的成员条(身份是同一份数据,不另画一套)。
           R2:左键下钻右栏空间页,名册管理退到右键(旧壳 TabBar 不受影响)。 -->
      <RoomMemberStrip
        v-if="head.mode === 'group' && sessionId"
        :session-id="sessionId"
        open-space-on-click
      />

      <button
        type="button"
        class="room-head-icon"
        title="搜索"
        aria-label="搜索"
        @click="emit('openSearch')"
      >
        <Search
          :size="16"
          :stroke-width="1.7"
        />
      </button>

      <button
        type="button"
        class="room-head-icon"
        :class="{ 'is-on': isInspectorOpen }"
        :title="isInspectorOpen ? '收起线程栏' : '打开线程栏'"
        :aria-pressed="isInspectorOpen"
        aria-label="线程栏"
        @click="emit('toggleInspector')"
      >
        <PanelRight
          :size="16"
          :stroke-width="1.7"
        />
      </button>

      <button
        ref="moreButtonRef"
        type="button"
        class="room-head-icon"
        title="更多"
        aria-label="更多"
        @click="openMoreMenu"
      >
        <MoreVertical
          :size="16"
          :stroke-width="1.7"
        />
      </button>
    </div>

    <ContextMenu
      :show="moreMenuOpen"
      :x="moreMenuAt.x"
      :y="moreMenuAt.y"
      :items="moreMenuItems"
      @select="handleMoreSelect"
      @close="moreMenuOpen = false"
    />

    <RoomSettingsDialog
      v-if="roomSettingsOpen && sessionId"
      :visible="roomSettingsOpen"
      :session-id="sessionId"
      @close="roomSettingsOpen = false"
    />
  </header>
</template>

<script setup lang="ts">
/**
 * 房头 —— 取代 TabBar 的那一条(去复用重构 R1,§8.2「这一面上被拿掉的东西」)。
 *
 * 两态一个组件:群聊 `# 房名 + 主题 + 成员堆`,私聊 `头像 + 名字 + 在忙什么`。
 * 形态判定与数据全部走既有链路 —— `isUserDmRoom`(人数即形态)、
 * `displayAgent`(身份解析)、看板(在忙什么)、`RoomMemberStrip`(成员堆)。
 * 这里不新增任何一份状态。
 *
 * 拿掉的东西不在这里补:页签、AgentSelector、模型/think 档、ctx 量尺一概没有。
 * 留下的三颗动作是换房之外真正还需要的:搜索、线程栏开合、⋯(看板 / 房间设置)。
 */
import { computed, ref } from 'vue'
import { ClipboardList, MoreVertical, PanelLeft, PanelRight, Search, Settings, Users } from 'lucide-vue-next'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import type { ContextMenuItem } from '@/components/common/context-menu'
import RoomMemberStrip from '../RoomMemberStrip.vue'
import RoomSettingsDialog from '../RoomSettingsDialog.vue'
import { useSessionsStore } from '@/stores/sessions'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { isAgentPairDmRoom, isUserDmRoom } from '@onething/runtime/collab'
import { buildRoomHead, type RoomHeadAgent } from './room-head'
import { OPEN_MEMBERS_EVENT, type OpenMembersDetail } from '@/components/workbench/room-members'

const props = defineProps<{
  sessionId?: string
  showSidebarToggle?: boolean
  isInspectorOpen?: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
  openSearch: []
  toggleInspector: []
}>()

const sessionsStore = useSessionsStore()
const agentsStore = useAgentsStore()
const collabBoardStore = useCollabBoardStore()
collabBoardStore.ensureSubscribed()

const session = computed(() => {
  if (!props.sessionId) return null
  return sessionsStore.sessions.find(item => item.id === props.sessionId) || null
})

/** 双成员 dm(agent 互聊)照群聊走:两个人**要**署名,房头也是群头。 */
const dmAgent = computed<RoomHeadAgent | null>(() => {
  const room = session.value?.room
  if (!isUserDmRoom(room)) return null
  // 成员表是归属的结构化真源(禁反解 id,agents/identity.ts 纪律)。
  const agentId = room?.memberAgentIds?.[0] || ''
  if (!agentId) return null
  const identity = agentsStore.displayAgent(agentId)
  return {
    id: agentId,
    name: identity.name,
    title: identity.title,
    avatar: identity.avatar,
    avatarImage: identity.avatarImage,
  }
})

const head = computed(() => buildRoomHead({
  sessionName: session.value?.name,
  dmAgent: dmAgent.value,
  board: props.sessionId ? collabBoardStore.boardFor(props.sessionId) : null,
}))

/**
 * 私聊房头的头像/名字 → **右栏空间页下钻**(R3 口径归一)。
 *
 * 归一的理由:中栏 say 署名头像点一下是下钻(`SayMessageRow.openAgentSpace`),
 * 房头头像点一下却开全屏 —— 同一个动作两种结果。右栏关着也不构成保留全屏的
 * 理由:`App.vue` 的 `openMembersInRightWorkbench` 自己会把 `inspectorOpen`
 * 置真(与自动落座那条"不许顶开"的纪律不冲突,那条只管**没人点**的默认行为)。
 *
 * 降级规则与 say 行逐字一致:**拿不到房 id 时退回全屏空间页** —— 宁可换个地方
 * 打开,也不吞掉这次点击。(在这条壳上它其实够不着:私聊态由 `session` 推出,
 * 而 `session` 又要 `props.sessionId`。留着是因为 say 行那边够得着,两处口径
 * 必须一致。)
 */
function openAgentSpace(): void {
  const agentId = head.value.agent?.id
  if (!agentId) return
  if (props.sessionId) {
    window.dispatchEvent(new CustomEvent<OpenMembersDetail>(OPEN_MEMBERS_EVENT, {
      detail: { sessionId: props.sessionId, agentId },
    }))
    return
  }
  agentsStore.openAgentSpace(agentId)
}

/** ⋯ 菜单的「成员」:开(或聚焦)右栏成员 tab,停在列表层。 */
function openMembersPanel(): void {
  if (!props.sessionId) return
  window.dispatchEvent(new CustomEvent<OpenMembersDetail>(OPEN_MEMBERS_EVENT, {
    detail: { sessionId: props.sessionId },
  }))
}

/**
 * C3 契约(左栏活卡片 / say 流的「展开执行 →」共用,形状不许改):
 *   CustomEvent<{ workSessionId: string; title?: string; taskId?: string }>
 */
function openWorkThread(): void {
  const work = head.value.work
  if (!work?.sessionId) return
  window.dispatchEvent(new CustomEvent('onething:open-thread', {
    detail: { workSessionId: work.sessionId, title: work.title, taskId: work.taskId },
  }))
}

const moreMenuOpen = ref(false)
const moreMenuAt = ref({ x: 0, y: 0 })
const moreButtonRef = ref<HTMLElement | null>(null)
const roomSettingsOpen = ref(false)

/** 看板入口对双成员 dm 房隐藏(agent 互聊是沟通场,不是干活现场)。 */
const showBoardEntry = computed(() => !isAgentPairDmRoom(session.value?.room))

const moreMenuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = []
  // 成员表是群的东西:私聊房里"成员"只有一个人,那一面直接就是空间页。
  if (head.value.mode === 'group') {
    items.push({ id: 'members', label: '成员', icon: Users })
  }
  if (showBoardEntry.value) {
    items.push({ id: 'board', label: '看板', icon: ClipboardList })
  }
  items.push({ id: 'settings', label: '房间设置', icon: Settings })
  return items
})

function openMoreMenu(): void {
  const rect = moreButtonRef.value?.getBoundingClientRect()
  moreMenuAt.value = { x: rect ? rect.right : 0, y: rect ? rect.bottom + 4 : 0 }
  moreMenuOpen.value = true
}

function handleMoreSelect(id: string): void {
  moreMenuOpen.value = false
  if (id === 'members') {
    openMembersPanel()
    return
  }
  if (id === 'board') {
    window.dispatchEvent(new CustomEvent('onething:collab-open-board'))
    return
  }
  if (id === 'settings') roomSettingsOpen.value = true
}
</script>

<style scoped>
.room-header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  flex-shrink: 0;
  /* 左缩进要给交通灯让位:侧栏收起(或收成 46px 的 rail)时,macOS 那三颗灯会探进
     聊天区,房头内容不让就直接压在灯下面 —— 真机走查发现,旧壳(TabBar)一直有
     一块 70px 保留位,R1 新写房头时漏了。
     这里不抄那个死数:`--shell-lights-overhang` 由 App 按侧栏**当前实际宽度**
     算出灯到底探出多少(展开时是 0,rail 态是 24px,全隐时是 70px),所以不会平白
     多缩进一截。 */
  padding: 0 16px 0 calc(16px + var(--shell-lights-overhang, 0px));
  min-width: 0;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  -webkit-app-region: drag;
}

.room-header button,
.room-header :deep(.room-members) {
  -webkit-app-region: no-drag;
}

.room-hash {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
}

.room-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  max-width: 40%;
}

.room-topic {
  min-width: 0;
  padding-left: 10px;
  margin-left: 2px;
  border-left: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 私聊态 ── */
.room-solo {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.room-solo-open {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.room-solo-open:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

/* 「可点」提示(agent-space-workbench.md P3):整块起底之外,头像上再长一圈
   3px 外扩细环 —— 与 say 行头像、群头成员堆同一句法。 */
.room-solo-avatar-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

/* hover 只垫一层软阴影的立体感 —— 不描色、不缩放。四处头像同一句法。 */
.room-solo-avatar-wrap {
  border-radius: 50%;
  transition: box-shadow 0.16s ease;
}

.room-solo-open:hover .room-solo-avatar-wrap,
.room-solo-open:focus-visible .room-solo-avatar-wrap {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 22%, transparent);
}

.room-solo-open:active .room-solo-avatar-wrap {
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 18%, transparent);
}

.room-solo-text {
  display: block;
  min-width: 0;
  line-height: 1.25;
}

.room-solo-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-solo-presence {
  display: block;
  font-style: normal;
  font-size: 10.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-solo-presence.is-busy {
  color: var(--ui-status-success-fg, var(--text-success));
}

.room-head-work {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.room-head-work:hover {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

/* ── 动作 ── */
.room-head-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.room-head-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  cursor: pointer;
  color: var(--ui-text-muted-fg, var(--muted));
}

.room-head-icon:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.room-head-icon.is-on {
  color: var(--ui-text-primary-fg, var(--text));
}

.room-head-sidebar {
  margin-right: 2px;
}
</style>
