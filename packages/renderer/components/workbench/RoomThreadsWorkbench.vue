<template>
  <section class="room-threads-workbench">
    <!-- 详情层:选中的那条执行会话,用**既有的聊天 UI** 渲染
         (`ThreadChatDetail` = `MessageList` + 一只轻量回复框)。这一层不重写
         任何渲染:工具卡 / StepsPanel / 真 diff / 附件都由 `MessageItem` 那棵树出。 -->
    <template v-if="activeSessionId">
      <button
        v-if="canGoBack"
        type="button"
        class="thread-back"
        @click="closeThread"
      >
        <ChevronLeft
          :size="13"
          :stroke-width="2"
          aria-hidden="true"
        />
        {{ backLabel }}
      </button>
      <ThreadChatDetail
        class="thread-detail"
        :session-id="activeSessionId"
        :tag="activeRow?.kind === 'dm' ? '私下' : 'THREAD'"
        @open-file="(filePath: string) => emit('openFile', filePath)"
        @title-resolved="(title: string) => emit('titleResolved', title)"
      />
    </template>

    <!-- 列表层。分段形态(房间背台)顶上多一条协调器状态条 —— 线程回答"这间房
         正在发生什么",而协调器是那件事的发动机,同处一面才能一步点进去。
         工具页签那一路不画:那一面是逐像素回滚闸,而且它没有"房间"这个概念。 -->
    <template v-else>
      <CoordinatorStatusBar
        v-if="grouped && roomId"
        :room-session-id="roomId"
        @open-thread="openThread"
        @stop-turn="stopRoomTurn"
      />

      <div
        v-if="rows.length"
        class="thread-list"
      >
        <template
          v-for="section in sections"
          :key="section.key"
        >
          <div
            v-if="section.label"
            class="thread-group-head"
          >
            {{ section.label }}
          </div>
          <button
            v-for="row in section.rows"
            :key="row.sessionId"
            type="button"
            class="thread-row"
            :class="{ 'is-off': row.isRetired, 'is-running': row.running }"
            :title="`${row.name} · ${row.detail}`"
            @click="openThread(row.sessionId)"
          >
            <!-- 私下行是**两个人**的对话:画两张脸(向左叠压),只画一张就是在
               骗人。执行行照旧一张 32px 头像,一个像素不变。 -->
            <span
              v-if="row.faces?.length"
              class="thread-mark thread-faces"
              aria-hidden="true"
            >
              <AgentAvatar
                v-for="face in row.faces"
                :key="face.agentId"
                class="thread-face"
                :class="{ 'is-retired': face.isRetired }"
                :avatar="face.avatar"
                :avatar-image="face.avatarImage"
                :size="22"
              />
            </span>
            <AgentAvatar
              v-else
              class="thread-mark"
              :avatar="row.avatar"
              :avatar-image="row.avatarImage"
              :size="32"
            />
            <span class="thread-text">
              <b class="thread-name">{{ row.name }}</b>
              <i class="thread-sub">{{ row.detail }}</i>
            </span>
            <span class="thread-meta">
              <i
                v-if="row.running"
                class="thread-dot"
                aria-hidden="true"
              />
              <time v-if="row.meta">{{ row.meta }}</time>
            </span>
          </button>
        </template>
      </div>

      <div
        v-else
        class="threads-empty"
      >
        <p class="threads-empty-title">
          {{ ROOM_THREAD_EMPTY_HINT }}
        </p>
        <p class="threads-empty-hint">
          {{ ROOM_THREAD_EMPTY_SUBHINT }}
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * 右栏「线程」tab 的**两层壳**:这间房的执行会话列表 → 选中 → 该会话详情。
 *
 * 形态照 `MembersWorkbench` —— **同一个页签内下钻**,返回键在左上角,下钻不占
 * tab 位(样板 `docs/design/im-redesign/final.html` 的右栏只有常驻三条)。详情
 * 那一层是 `ThreadChatDetail` —— **既有的聊天 UI**(`MessageList` → `MessageItem`
 * → 工具卡 / StepsPanel / 真 diff / 附件)+ 一只轻量回复框,一行渲染都没重写。
 * 这个组件只负责"进得去哪一条"。
 *
 * 数据一律复用既有口径,本组件不新增任何一份账(纯逻辑在 `room-threads.ts`):
 *  - 花名册/署名 = `agentsStore.displayAgent`(域模型 M4,墓碑三态在它里面);
 *  - 卡标题 = 看板那份 `CollabTask.title`;
 *  - 在跑 = chat store 的 `isSessionGenerating`;
 *  - 行右端那一句 = 左栏活卡片同一处 `resolveActiveWorkRowMeta`。
 *
 * 房间归属只认 `session.collab.roomSessionId`(结构化字段),**不反解 id 字符串**。
 * 从「展开执行 →」/ 左栏活卡片进来时只给得到一条执行会话 id,房间就由它的
 * `collab.roomSessionId` 现查 —— 查到之后记在 `roomId` 上,回列表才有表可回。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import ThreadChatDetail from './ThreadChatDetail.vue'
import CoordinatorStatusBar from './CoordinatorStatusBar.vue'
import {
  buildRoomPairDmRows,
  buildRoomThreadRows,
  groupRoomThreadRows,
  ROOM_THREAD_EMPTY_HINT,
  ROOM_THREAD_EMPTY_SUBHINT,
} from './room-threads'

const props = withDefaults(defineProps<{
  /** 这间房。可为空 —— 只带着一条执行会话进来时由它的 collab 指针现查。 */
  roomSessionId?: string
  /** 直接下钻到这条执行会话('' = 停在列表层)。 */
  focusSessionId?: string
  /**
   * 列表层按「正在跑 / 今天 / 更早」分段(房间背台)。
   *
   * 默认 false:工具页签那一路(直聊/工程面下从 `onething:open-thread` 进来的
   * 线程页签)保持一张平表 —— 那一面是逐像素回滚闸,不跟着背台改形。
   */
  grouped?: boolean
  /** 返回键指向哪儿:`返回<backTo>(N)`。背台传「线程」,页签用默认的「列表」。 */
  backTo?: string
}>(), {
  roomSessionId: '',
  focusSessionId: '',
  grouped: false,
  backTo: '列表',
})

const emit = defineEmits<{
  /** 下钻/返回/房间解析出来时回报给 tab,让 tab 的记忆与面板里看到的一致。 */
  focus: [payload: { sessionId: string; roomSessionId: string }]
  openFile: [filePath: string]
  /** 详情层解析出会话名后让 tab 标题跟上去(转发 ThreadChatDetail 的那一条)。 */
  titleResolved: [title: string]
}>()

const agentsStore = useAgentsStore()
const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const collabBoardStore = useCollabBoardStore()

const activeSessionId = ref(props.focusSessionId || '')

watch(() => props.focusSessionId, id => {
  activeSessionId.value = id || ''
})

/**
 * 这一层看的是哪间房。
 *
 * 三个入口给的东西不一样:进房自动备齐给的是房 id;「展开执行 →」与左栏活卡片
 * 只给一条执行会话 id。后者由 `collab.roomSessionId` 现查,查到就记住 ——
 * 否则从详情返回列表时房间又变回未知,回去只剩一块空白。
 */
const roomId = ref('')

watch(
  [() => props.roomSessionId, activeSessionId, () => sessionsStore.sessions],
  () => {
    const fromProp = (props.roomSessionId || '').trim()
    if (fromProp) {
      roomId.value = fromProp
      return
    }
    const target = activeSessionId.value
    if (!target) return
    const found = sessionsStore.sessions.find(item => item.id === target)
    const room = (found?.collab?.roomSessionId || '').trim()
    if (room) roomId.value = room
  },
  { immediate: true },
)

// 花名册是名字与头像的来源;看板是卡标题的来源。两者都自带去重/自守,冷启动补一次就够。
watch(roomId, id => {
  if (!id) return
  if (!agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
  void Promise.resolve().then(() => collabBoardStore.load(id)).catch(() => {})
}, { immediate: true })

// `immediate` 是必需的:只带一条执行会话进来时房间是在**挂载那一刻**查出来的,
// 不立刻回报,tab 上就永远没有房 —— 从详情返回列表会落到一张空表上。
watch([activeSessionId, roomId], ([sessionId, room]) => {
  emit('focus', { sessionId, roomSessionId: room })
}, { immediate: true })

const board = computed(() => (roomId.value ? collabBoardStore.boardFor(roomId.value) : null))

const taskTitles = computed(() => {
  const titles = new Map<string, string>()
  for (const task of board.value?.tasks ?? []) titles.set(task.id, task.title)
  return titles
})

/**
 * 「跑了多久」那一格得自己走。**一处计时** —— 整张表一个定时器,不是每行各起
 * 一个(与左栏「进行中」同一手法)。
 */
const NOW_TICK_MS = 60_000
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, NOW_TICK_MS)
onUnmounted(() => clearInterval(timer))

const execRows = computed(() => buildRoomThreadRows({
  roomSessionId: roomId.value,
  sessions: sessionsStore.sessions,
  identity: agentId => agentsStore.displayAgent(agentId),
  taskTitle: taskId => taskTitles.value.get(taskId) || '',
  isRunning: sessionId => chatStore.isSessionGenerating(sessionId),
  now: now.value,
}))

/**
 * 这间房成员之间的私下房(2026-08-01 用户要求:「线程里面我最好能够看到他们的
 * 私聊的 session」)。
 *
 * 形态判定不在这里 —— `agentPairDmRoomSessions` 是"哪些房算私下房"的唯一一处
 * 答案(人数即形态);这一层只回答"这一对是不是这屋子里的人",靠名册。
 */
const memberAgentIds = computed(() =>
  sessionsStore.sessions.find(item => item.id === roomId.value)?.room?.memberAgentIds ?? [])

const pairDmRows = computed(() => buildRoomPairDmRows({
  memberAgentIds: memberAgentIds.value,
  pairDmRooms: sessionsStore.agentPairDmRoomSessions,
  identity: agentId => agentsStore.displayAgent(agentId),
  isRunning: sessionId => chatStore.isSessionGenerating(sessionId),
  now: now.value,
}))

/**
 * 两路合成一张表,私下**恒在执行之后**:分段形态下它自成一段(「私下」),
 * 平表形态下它接在末尾。它不是"一次执行",不该按时间挤进主线里。
 */
const rows = computed(() => [...execRows.value, ...pairDmRows.value])

const activeRow = computed(() =>
  rows.value.find(row => row.sessionId === activeSessionId.value) ?? null)

/**
 * 有表可回才画返回键 —— 一条都没有的时候(执行会话不在 store 里、房间也查不到)
 * 回去只会看见空态,那颗键把人带进死路。
 */
const canGoBack = computed(() => rows.value.length > 0)
const backLabel = computed(() => `返回${props.backTo}(${rows.value.length})`)

/**
 * 列表层的分段。不分段时是**一段无标题**的表 —— 这样两种形态共用同一段行渲染,
 * 不需要为「有没有组头」各写一遍行。
 */
const sections = computed(() => (props.grouped
  ? groupRoomThreadRows(rows.value, now.value)
  : [{ key: 'all', label: '', rows: rows.value }]))

function openThread(sessionId: string): void {
  if (!sessionId) return
  activeSessionId.value = sessionId
}

function closeThread(): void {
  activeSessionId.value = ''
}

/**
 * 状态条上那颗「停」。走的是房头停止按钮**同一个**入口(`command:abort` 到房间
 * 会话),不另开一条中止路径 —— 两条路一定会在某次改动后语义分家,而"停"这件事
 * 分家的后果是有一边停不干净。
 */
function stopRoomTurn(): void {
  if (!roomId.value) return
  void chatStore.stopGeneration(roomId.value)
}
</script>

<style scoped>
.room-threads-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

/* ── 返回键(与空间页那颗同一句法:同一个 tab 内换层,不新开页签)── */
.thread-back {
  flex: 0 0 auto;
  display: flex;
  gap: 7px;
  align-items: center;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  font-size: 11.5px;
  text-align: left;
}

.thread-back:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.thread-detail {
  flex: 1 1 auto;
  min-height: 0;
}

/* ── 列表层 ── */
.thread-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
  padding: 6px 0 10px;
}

/* 行三栏:头像(定宽)/ 文字(可缩,截断)/ 右端(定宽,不换行)。
   右栏最窄约 250px,所以文字那一栏必须 `min-width: 0` + 省略号,
   两侧则 `flex-shrink: 0` —— 不许出现"名字被挤没"的窄宽度。 */
.thread-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 7px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.thread-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.thread-row.is-off {
  opacity: 0.5;
}

.thread-mark {
  flex: 0 0 auto;
}

/* 私下行的两张脸:向左叠压 6px,叠压处描一圈底色留出呼吸缝(与侧栏群聊行的
   头像堆同一句法,尺寸按这一行的 32px 位收到 22px)。 */
.thread-faces {
  display: inline-flex;
  align-items: center;
}

.thread-face + .thread-face {
  margin-left: -6px;
  box-shadow: 0 0 0 1.5px var(--ui-surface-panel-bg, var(--bg-panel));
}

.thread-face.is-retired {
  opacity: 0.45;
}

.thread-text {
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.35;
}

.thread-name {
  display: block;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-sub {
  display: block;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-meta {
  flex: 0 0 auto;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.thread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.thread-row.is-running .thread-meta {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

/* 组头(仅分段形态):不带计数 —— 与状态点同一条纪律,只说有没有。 */
.thread-group-head {
  padding: 12px 12px 3px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

/* 空态:三格永远在,空的是内容不是入口 —— 所以这里给一句话 + 一句解释,
   而不是一块死白(样板 三 · 空态)。 */
.threads-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
}

.threads-empty-title {
  color: var(--ui-text-secondary-fg, var(--text));
  font-size: 12.5px;
}

.threads-empty-hint {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  line-height: 1.7;
}
</style>
