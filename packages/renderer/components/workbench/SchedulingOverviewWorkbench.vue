<template>
  <section class="scheduling-overview">
    <!-- 顶部三数字 + 全局槽 + 死信。三色分开报,因为出事时要做的事完全不同。 -->
    <div class="so-totals">
      <div class="so-total">
        <b class="so-total-num is-conversation">{{ totals.conversations }}</b>
        <span class="so-total-label">在飞对话</span>
      </div>
      <div class="so-total">
        <b class="so-total-num is-judge">{{ totals.judgments }}</b>
        <span class="so-total-label">在飞裁决</span>
      </div>
      <div class="so-total">
        <b class="so-total-num is-worker">{{ totals.workers }}</b>
        <span class="so-total-label">在飞工作</span>
      </div>
      <div class="so-total">
        <b class="so-total-num">{{ totals.workerSlots.used }}/{{ totals.workerSlots.max }}</b>
        <span class="so-total-label">全局工作槽</span>
      </div>
      <div class="so-total">
        <b
          class="so-total-num"
          :class="{ 'is-fault': totals.deadLetters > 0 }"
        >{{ totals.deadLetters }}</b>
        <span class="so-total-label">死信</span>
      </div>
    </div>

    <div class="so-scroll">
      <!-- 上半:活跃房卡片。只画在动的房 —— 一屏全是 0 的清单等于没有这一面。 -->
      <div class="so-sec">
        <span>活跃房</span>
        <i class="so-count">{{ roomCards.length }}</i>
      </div>
      <p
        v-if="!roomCards.length"
        class="so-empty"
      >
        此刻没有房间在动。
      </p>
      <button
        v-for="card in roomCards"
        :key="card.key"
        type="button"
        class="so-room"
        :class="{ 'is-degraded': card.degraded, 'is-frozen': card.frozen }"
        :title="`去「${card.name}」`"
        @click="emit('open-session', card.roomSessionId)"
      >
        <div class="so-room-head">
          <span class="so-room-name">{{ card.name }}</span>
          <span
            v-if="card.judgmentText"
            class="so-room-judge"
          >{{ card.judgmentText }}</span>
          <span
            v-if="card.frozen"
            class="so-room-judge"
          >已暂停</span>
          <span
            v-if="card.deadLetters"
            class="so-room-dead"
          >死信 {{ card.deadLetters }}</span>
        </div>
        <div class="so-room-nums">
          <span>持牌 {{ card.holding }}</span>
          <span>生成中 {{ card.generating }}</span>
          <span>举手 {{ card.hands }}</span>
        </div>
        <!-- 三闸迷你条:一条 2px 的量线,不是进度条控件。 -->
        <div class="so-gates">
          <span
            v-for="gate in card.gates"
            :key="gate.key"
            class="so-gate"
            :class="{ 'is-warn': gate.warn }"
            :title="gate.label"
          ><i :style="{ width: `${gate.percent}%` }" /></span>
        </div>
      </button>

      <!-- 下半:agent 矩阵。出事的在最前,闲着的垫底。 -->
      <div class="so-sec">
        <span>同事</span>
        <i class="so-count">{{ agentRows.length }}</i>
      </div>
      <p
        v-if="!agentRows.length"
        class="so-empty"
      >
        还没收到任何一位同事的活动快照 —— 这台机器上的协作运行时可能没在跑。
      </p>
      <div class="so-matrix-head">
        <span class="so-cell-name">人</span>
        <span class="so-cell-mind">大脑</span>
        <span class="so-cell-num">牌</span>
        <span class="so-cell-num">箱</span>
        <span class="so-cell-num">卡</span>
        <span class="so-cell-num">死</span>
      </div>
      <button
        v-for="row in agentRows"
        :key="row.key"
        type="button"
        class="so-agent"
        :title="`打开 ${row.name} 的空间`"
        @click="emit('open-agent', row.agentId)"
      >
        <span class="so-cell-name">
          <i
            class="so-dot"
            :class="`is-${row.presence}`"
            aria-hidden="true"
          />
          {{ row.name }}
        </span>
        <span class="so-cell-mind">{{ row.mindText }}</span>
        <span class="so-cell-num">{{ row.leases || '' }}</span>
        <span class="so-cell-num">{{ row.inbox || '' }}</span>
        <span class="so-cell-num">{{ row.workers || '' }}</span>
        <span
          class="so-cell-num"
          :class="{ 'is-fault': row.deadLetters > 0 }"
        >{{ row.deadLetters || '' }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 「调度总览」—— D8 观测体系 §4.5,四个必答问题里的第三个:
 * **「整个系统在忙什么?」**
 *
 * 前两个问题各有各的面,但它们都只答一个对象。三间房同时在跑、五个人的大脑各在
 * 别处、全局工作槽满了 —— 这些事实分散在 N 份房间快照 × M 份 agent 快照里,谁都
 * 看不见全貌。这一面就是那一屏。
 *
 * 这一层只画像素;聚合规则(三个数字各自的出处、死信为什么取最大值而不是相加、
 * 什么房算"在动")全在 `scheduling-overview.ts`。
 *
 * ## 补水:这一面是**唯一**要"全都要"的地方
 *
 * 别的面都按需补水(这间房的成员、这个人)。总览按定义要全体,所以它开面时:
 *  - 对每一间房会话调一次 `ensureCoordinator`(每间房一次,之后跟着广播走);
 *  - 调一次不带 id 的 `ensureAgentActivity`(= 此刻开着心智循环的全部)。
 * 两者都自带去重,所以反复开面不会打出一串 IPC。
 */
import { computed, onMounted, watch } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'
import {
  buildSchedulingAgentRows,
  buildSchedulingRoomCards,
  buildSchedulingTotals,
} from './scheduling-overview'

const emit = defineEmits<{
  /** 点房卡片 → 去那间房。 */
  'open-session': [sessionId: string]
  /** 点 agent 行 → 打开 TA 的空间页。 */
  'open-agent': [agentId: string]
}>()

const agentsStore = useAgentsStore()
const collabBoardStore = useCollabBoardStore()
const sessionsStore = useSessionsStore()

const resolveName = (agentId: string): string => agentsStore.displayAgent(agentId).name
const resolveRoomName = (roomSessionId: string): string =>
  sessionsStore.sessions.find(item => item.id === roomSessionId)?.name || roomSessionId

/** 这台机器上的全部房间会话 —— 补水的靶子表。 */
const roomSessionIds = computed(() =>
  sessionsStore.sessions.filter(item => item.kind === 'room').map(item => item.id))

onMounted(() => {
  collabBoardStore.ensureSubscribed()
  if (!agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
  // 「全都要」那一档:不带 id = 此刻开着心智循环的全部同事。
  collabBoardStore.ensureAgentActivity()
})

// 房间清单会变(新建群、清历史);每间房只问一次,store 自己去重。
watch(roomSessionIds, ids => {
  for (const id of ids) collabBoardStore.ensureCoordinator(id)
}, { immediate: true })

const rooms = computed(() =>
  roomSessionIds.value
    .map(id => collabBoardStore.coordinatorFor(id))
    .filter((state): state is NonNullable<typeof state> => Boolean(state)))

/** 陈旧的一份读作没有(TTL 兜底挂在快照的 at 上,见 store)。 */
const agents = computed(() =>
  Object.keys(collabBoardStore.agents)
    .map(agentId => collabBoardStore.agentActivityFor(agentId))
    .filter((activity): activity is NonNullable<typeof activity> => Boolean(activity)))

const totals = computed(() => buildSchedulingTotals({ rooms: rooms.value, agents: agents.value }))
const roomCards = computed(() => buildSchedulingRoomCards({
  rooms: rooms.value,
  resolveRoomName,
}))
const agentRows = computed(() => buildSchedulingAgentRows({
  agents: agents.value,
  resolveName,
  resolveRoomName,
}))
</script>

<style scoped>
.scheduling-overview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

/* ── 顶部三数字 ──
   窄栏里换行而不是横向滚 —— 一屏诊断面不该要求横向操作。 */
.so-totals {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.so-total {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 46px;
}

.so-total-num {
  color: var(--ui-text-primary-fg, var(--text));
  font-family: var(--font-mono, monospace);
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

/* 三色:对话 / 裁决 / 工作。它们花的是同一份钱,但出事时要做的事完全不同。 */
.so-total-num.is-conversation {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.so-total-num.is-judge {
  color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.so-total-num.is-worker {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.so-total-num.is-fault {
  color: var(--ui-status-danger-fg, var(--color-danger, #a33));
}

.so-total-label {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  white-space: nowrap;
}

.so-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 12px;
}

.so-scroll:not(:hover)::-webkit-scrollbar-thumb {
  background: transparent;
}

.so-sec {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 11px 14px 3px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.so-count {
  font-family: var(--font-mono, monospace);
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.so-empty {
  margin: 0;
  padding: 2px 14px 6px;
  color: var(--ui-text-faint-fg, var(--muted));
  font-size: 11.5px;
  line-height: 1.6;
}

/* ── 房卡片:左侧一道墨线,与账页系其余的引用块同一句法 ── */
.so-room {
  display: block;
  width: 100%;
  padding: 6px 14px 7px;
  border: 0;
  border-left: 1.5px solid transparent;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.so-room:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.so-room.is-degraded {
  border-left-color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.so-room.is-frozen {
  opacity: 0.7;
}

.so-room-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.so-room-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.so-room-judge {
  flex: 0 0 auto;
  color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
  font-size: 10.5px;
}

.so-room-dead {
  flex: 0 0 auto;
  color: var(--ui-status-danger-fg, var(--color-danger, #a33));
  font-size: 10.5px;
}

.so-room-nums {
  display: flex;
  gap: 12px;
  margin-top: 2px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.so-gates {
  display: flex;
  gap: 4px;
  margin-top: 5px;
}

.so-gate {
  position: relative;
  flex: 1 1 0;
  height: 2px;
  background: var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.so-gate i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ui-text-secondary-fg, var(--text));
}

.so-gate.is-warn i {
  background: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

/* ── agent 矩阵:六列,行宽不跳 ── */
.so-matrix-head,
.so-agent {
  display: flex;
  gap: 8px;
  align-items: baseline;
  width: 100%;
  padding: 3px 14px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.so-matrix-head {
  color: var(--ui-text-faint-fg, var(--muted));
  font-size: 10px;
}

.so-agent {
  cursor: pointer;
  font-size: 12px;
}

.so-agent:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.so-cell-name {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.so-matrix-head .so-cell-name {
  color: inherit;
}

.so-cell-mind {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.so-cell-num {
  flex: 0 0 18px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.so-cell-num.is-fault {
  color: var(--ui-status-danger-fg, var(--color-danger, #a33));
}

/* 在场三色:与成员条那颗徽标同一套语义(D8 §4.4)。空闲不画。 */
.so-dot {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: transparent;
}

.so-dot.is-generating {
  background: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.so-dot.is-holding {
  background: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.so-dot.is-working {
  background: var(--ui-accent-primary-fg, var(--accent));
}
</style>
