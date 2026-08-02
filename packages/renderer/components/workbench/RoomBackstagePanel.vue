<template>
  <section class="room-backstage">
    <!-- 分段器:固定几格,等宽,无 ✕、无 ＋、不可滚、**标题永不改变**。
         下钻不动它 —— 「在看哪一个」由内容头部去说,那儿有整行宽度。 -->
    <nav
      class="backstage-seg"
      role="tablist"
      aria-label="房间背台"
    >
      <button
        v-for="segment in segments"
        :key="segment.key"
        type="button"
        role="tab"
        class="seg-cell"
        :class="{ 'is-on': segment.key === activeSegment }"
        :aria-selected="segment.key === activeSegment"
        :title="segment.label"
        @click="activeSegment = segment.key"
      >
        <span class="seg-label">{{ segment.label }}</span>
        <i
          v-if="segment.dot"
          class="seg-dot"
          :class="`is-${segment.dot}`"
          aria-hidden="true"
        />
      </button>
    </nav>

    <!-- 三格都常驻挂着(v-show 不是 v-if):换格不该把你在另一格里下钻到的位置
         抹掉,那正是页签形态最恼人的一点。 -->
    <div class="backstage-body">
      <RoomThreadsWorkbench
        v-show="activeSegment === 'threads'"
        :key="`threads-${roomSessionId}`"
        class="backstage-view"
        grouped
        back-to="线程"
        :room-session-id="roomSessionId"
        :focus-session-id="threadFocus"
        @focus="onThreadFocus"
        @open-file="(filePath: string) => emit('openFile', filePath)"
      />

      <!-- 群房的「成员」/ 私聊房的「空间」是同一个组件的两种落点:
           群房停在列表层,私聊房直接停在那一个人的空间页(一对一没有成员表)。 -->
      <MembersWorkbench
        v-show="activeSegment === 'members' || activeSegment === 'space'"
        :key="`members-${roomSessionId}`"
        class="backstage-view"
        :session-id="roomSessionId"
        :focus-agent-id="memberFocus"
        @focus="(agentId: string) => { memberFocus = agentId }"
        @open-session="(id: string) => emit('openSession', id)"
        @open-file="(filePath: string) => emit('openFile', filePath)"
        @open-thread="(workSessionId: string) => landOnThread(workSessionId)"
      />

      <RoomBoardWorkbench
        v-if="!isDm"
        v-show="activeSegment === 'board'"
        :key="`board-${roomSessionId}`"
        class="backstage-view"
        :room-session-id="roomSessionId"
        @open-thread="landOnThread"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 右栏在**房/私聊**下的形态:**房间背台**(样板
 * `docs/design/im-redesign/right-panel.html`)。
 *
 * 线程 / 成员 / 看板不是三个页签,是**同一件东西的三个视图** —— 这间房的背台。
 * 页签形态在真机上接连崩了四次,四个症状同源(按需才开 → 看不到线程;按靶子开
 * → 换房攒页签;要给 ✕ 让位 → 中文被截成「成..」;标题跟内容变长 → 下钻后把
 * 自己挤出可视区)。固定格的分段器让这四个从结构上不可能再发生。
 *
 * 这一层只负责**哪几格 / 在哪一格 / 状态点亮不亮**,三件的判定全在
 * `room-backstage.ts` 的纯函数里。每一格的内容原样复用既有组件:
 *  - 线程 = `RoomThreadsWorkbench`(列表两层壳)+ `ThreadChatDetail`(详情 = 既有聊天 UI);
 *  - 成员 / 空间 = `MembersWorkbench` + `AgentSpace`;
 *  - 看板 = `RoomBoardWorkbench`(窄栏行式,吃的仍是 `CollabTask` 那一份)。
 *
 * 数据一个字段都不新增:在跑读 `isSessionGenerating`,待你读 `hasPendingAsk`,
 * 新消息读 `isUnreadSession`。
 */
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import RoomThreadsWorkbench from './RoomThreadsWorkbench.vue'
import MembersWorkbench from './MembersWorkbench.vue'
import RoomBoardWorkbench from './RoomBoardWorkbench.vue'
import { hasRunningRoomThread } from './room-threads'
import { hasRoomBoardAwaiting } from './room-board'
import {
  buildRoomBackstageSegments,
  fallbackRoomBackstageSegment,
  pickRoomBackstageSegment,
  type RoomBackstageLanding,
  type RoomBackstageSegmentKey,
} from './room-backstage'

const props = withDefaults(defineProps<{
  /** 这间房。 */
  roomSessionId: string
  /** 私聊房(单成员 dm 房):两格「线程 / 空间」。 */
  isDm?: boolean
  /** 私聊房的那一个人 —— 「空间」格默认就停在 TA 的空间页。 */
  dmAgentId?: string
  landing?: RoomBackstageLanding | null
}>(), {
  isDm: false,
  dmAgentId: '',
  landing: null,
})

const emit = defineEmits<{
  /** 空间页里的会话行:宿主在主区开页签。 */
  openSession: [sessionId: string]
  /** 文件行:宿主落地。 */
  openFile: [filePath: string]
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const collabBoardStore = useCollabBoardStore()
collabBoardStore.ensureSubscribed()

// ── 状态点(有没有,不是几个)──────────────────────────────────────────────

const threadsRunning = computed(() => hasRunningRoomThread({
  roomSessionId: props.roomSessionId,
  sessions: sessionsStore.sessions,
  isRunning: sessionId => chatStore.isSessionGenerating(sessionId),
}))

const board = computed(() => (props.roomSessionId ? collabBoardStore.boardFor(props.roomSessionId) : null))

const boardAwaiting = computed(() => hasRoomBoardAwaiting({
  tasks: board.value?.tasks ?? [],
  awaitingPermission: workSessionId => collabBoardStore.hasPendingAsk(workSessionId),
}))

/**
 * 成员格的墨点 = 有成员的私聊未读。
 *
 * 翻译只有一步(agent → TA 的私聊房),未读判定仍是 store 那一处
 * `isUnreadSession` —— 与侧栏联系人行同一条链路。
 */
const membersUnread = computed(() => {
  const room = sessionsStore.sessions.find(item => item.id === props.roomSessionId)?.room
  const memberIds = room?.memberAgentIds ?? []
  return memberIds.some(agentId => {
    const dmRoom = sessionsStore.findUserDmRoom(agentId)
    return !!dmRoom && sessionsStore.isUnreadSession(dmRoom.id)
  })
})

const segments = computed(() => buildRoomBackstageSegments({
  isDm: props.isDm,
  signals: {
    threadsRunning: threadsRunning.value,
    boardAwaiting: boardAwaiting.value,
    membersUnread: membersUnread.value,
  },
}))

// ── 在哪一格 / 每格下钻到哪儿 ──────────────────────────────────────────────

const activeSegment = ref<RoomBackstageSegmentKey>('threads')
/** 线程格的下钻靶子('' = 列表层)。子组件下钻/返回时回报,两边永远同步。 */
const threadFocus = ref('')
/** 成员/空间格的下钻靶子('' = 成员表)。私聊房恒是那一个人。 */
const memberFocus = ref('')

/** 形态变了(群 ↔ 私聊)当前格可能已经不存在 —— 兜回第一格,不留死格。 */
watch(segments, list => {
  activeSegment.value = fallbackRoomBackstageSegment(activeSegment.value, list)
})

/**
 * 换房 = 重新落座:回线程格的**列表层**。
 *
 * 自动备齐时系统并不知道你想看哪一次执行,替你挑一条塞满整面等于替你做了选择。
 * 私聊房的「空间」格例外:那一格天然就是对方的空间页,没有列表可言。
 */
watch(() => [props.roomSessionId, props.isDm, props.dmAgentId] as const, () => {
  activeSegment.value = 'threads'
  threadFocus.value = ''
  memberFocus.value = props.isDm ? props.dmAgentId : ''
}, { immediate: true })

/**
 * 外部入口的落座。请求的格不在(私聊房请求看板)就**原地不动**。
 *
 * `immediate` 是必需的:背台可能是**带着落座指令挂载**的(切进房的同一拍里,
 * 房头的「看板」/ 左栏活卡片就把靶子递过来了)。不立刻应用,那一次点击就白点。
 * 它声明在换房那条 watch 之后 —— 同一拍里换房先归位、落座后落,顺序即优先级。
 */
watch(() => props.landing?.nonce, () => {
  const landing = props.landing
  if (!landing) return

  if (landing.threadSessionId !== undefined) threadFocus.value = landing.threadSessionId
  if (landing.agentId !== undefined) memberFocus.value = landing.agentId

  const target = pickRoomBackstageSegment(landing.segment, segments.value)
  if (target) activeSegment.value = target
}, { immediate: true })

function onThreadFocus(payload: { sessionId: string; roomSessionId: string }): void {
  threadFocus.value = payload.sessionId || ''
}

/** 看板行 / 空间页的「打开线程」:切到线程格并下钻到那一次执行。 */
function landOnThread(workSessionId: string): void {
  if (!workSessionId) return
  threadFocus.value = workSessionId
  activeSegment.value = 'threads'
}

defineExpose({ segments, activeSegment })
</script>

<style scoped>
.room-backstage {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

/* ── 分段器 ──────────────────────────────────────────────────────────────
   `flex: 1 1 0` + `min-width: 0` = 严格等分。250px 的右栏里三格各 ~83px,
   中文两字(约 25px)+ 状态点(5px)+ 间距(5px)绰绰有余。
   **没有 ✕、没有 ＋、没有横向滚动、没有可变标题** —— 页签形态那四个症状
   (截断 / 压扁 / 累积 / 自己挤出可视区)在这一条规则下不可能发生。 */
.backstage-seg {
  flex: 0 0 auto;
  display: flex;
  min-width: 0;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.seg-cell {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
}

.seg-cell:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.seg-cell.is-on {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: var(--font-weight-semibold, 600);
}

/* 当前格的下划线压在分隔线上(bottom: -1px),两条线不叠成 2px。 */
.seg-cell.is-on::after {
  content: "";
  position: absolute;
  right: 10px;
  bottom: -1px;
  left: 10px;
  height: 1.5px;
  background: var(--ui-text-primary-fg, var(--text));
}

/* 标题不截断:它是两个字的固定文案,一旦允许收缩就会变成「成..」。 */
.seg-label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seg-dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.seg-dot.is-run {
  background: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.seg-dot.is-wait {
  background: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.seg-dot.is-new {
  background: var(--ui-text-primary-fg, var(--text));
}

.backstage-body {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.backstage-view {
  height: 100%;
  min-width: 0;
  min-height: 0;
}
</style>
