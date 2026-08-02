<template>
  <section
    class="cd"
    :class="{ 'is-open': open, 'is-frozen': state?.frozen }"
  >
    <!-- 常驻条:**永远在**。空闲也是状态 —— 「现在没人在动」正是用户来这一格
         要确认的事。撞闸与暂停把动作直接放在条上,不必展开。 -->
    <div
      class="cd-bar"
      role="button"
      tabindex="0"
      :aria-expanded="open"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <i
        class="cd-lamp"
        :class="`is-${bar.lamp}`"
        aria-hidden="true"
      />
      <span class="cd-who">{{ bar.text }}</span>
      <span class="cd-tail">
        <button
          v-if="bar.action === 'resume'"
          type="button"
          class="cd-resume"
          @click.stop="resume"
        >恢复</button>
        <template v-else>{{ bar.tail }}</template>
      </span>
      <i
        class="cd-chev"
        aria-hidden="true"
      />
    </div>

    <div
      v-if="open"
      class="cd-body"
    >
      <template v-if="nowRows.length">
        <div class="cd-sec">
          现在
        </div>
        <div
          v-for="row in nowRows"
          :key="row.key"
          class="cd-now"
          :class="{ 'is-run': row.running, 'is-flat': !row.agentSessionId && !row.activationId }"
          @click="row.agentSessionId && emit('openThread', row.agentSessionId)"
        >
          <i class="cd-glyph">{{ row.glyph }}</i>
          <span class="cd-name">{{ row.name }}</span>
          <span class="cd-reason">{{ row.reason }}</span>
          <span
            v-if="row.running"
            class="cd-elapsed"
          >{{ formatCoordinatorElapsed(row.startedAt, now) }}</span>
          <button
            v-if="row.running"
            type="button"
            class="cd-act"
            @click.stop="emit('stopTurn')"
          >
            停
          </button>
        </div>
      </template>

      <template v-if="plan">
        <div class="cd-sec">
          编排
        </div>
        <!-- 一批一行。单人批连起来看着仍然像一条环,而多人批(`阿般 · 小李`)是
             环画不出来的 —— 那正是编排比"模式"多出来的表达力。 -->
        <div class="cd-plan">
          <template
            v-for="(wave, index) in plan.waves"
            :key="index"
          >
            <span
              v-if="index > 0"
              class="cd-plan-sep"
              aria-hidden="true"
            >›</span>
            <b
              v-if="wave.current"
              class="cd-plan-on"
            >{{ wave.names.join(' · ') }}</b>
            <span v-else>{{ wave.names.join(' · ') }}</span>
          </template>
        </div>
        <div
          v-if="plan.why"
          class="cd-plan-why"
        >
          {{ plan.why }}
        </div>
        <div class="cd-plan-meta">
          <span>{{ plan.progress }}</span>
          <span>{{ plan.limit }}</span>
        </div>
      </template>

      <div class="cd-sec">
        闸
      </div>
      <div
        v-for="gate in gateRows"
        :key="gate.key"
        class="cd-gate"
        :class="{ 'is-warn': gate.warn }"
      >
        <span class="cd-gate-name">{{ gate.label }}</span>
        <span class="cd-gate-bar"><i :style="{ width: `${gate.percent}%` }" /></span>
        <span class="cd-gate-value">{{ gate.value }}</span>
      </div>

      <template v-if="logRows.length">
        <div class="cd-sec">
          刚才
        </div>
        <div
          v-for="entry in logRows"
          :key="entry.key"
          class="cd-log"
          :class="{ 'is-muted': entry.muted }"
        >
          <span class="cd-log-at">{{ formatCoordinatorAgo(entry.at, now) }}</span>
          <span class="cd-log-text">{{ entry.text }}</span>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 协调器状态条 —— docs/design/collab-coordinator-inspector.md。
 *
 * 挂在「线程」格列表层的顶部。放这儿不是随手选的位置:线程回答的是"这间房正在
 * 发生什么",而协调器是那件事的**发动机**。同处一面,「谁在说」到「他的执行会话」
 * 就是一次点击,而不是在两个视图之间来回对照。
 *
 * 这个组件只画像素:所有措辞、阈值、单位、排序都在 `coordinator-status.ts`
 * (纯逻辑,可判定)。数据一份都不新增 —— 快照由协调器现算,store 只做镜像。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { platformApi } from '@/platform'
import {
  buildCoordinatorBar,
  buildCoordinatorGateRows,
  buildCoordinatorLogRows,
  buildCoordinatorNowRows,
  buildCoordinatorPlan,
  formatCoordinatorAgo,
  formatCoordinatorElapsed,
} from './coordinator-status'

const props = defineProps<{ roomSessionId: string }>()

const emit = defineEmits<{
  /** 点「现在」里正在说的那一行 → 下钻到它的执行会话(与线程列表同一个靶子)。 */
  openThread: [sessionId: string]
  /** 悬停出现的「停」—— 复用房头那个停止入口,不另开一条中止路径。 */
  stopTurn: []
}>()

const agentsStore = useAgentsStore()
const collabBoardStore = useCollabBoardStore()

/**
 * 展开状态**存在组件里而不是 localStorage**:它是一次会话内的注意力,不是偏好。
 * 换房时保持不变 —— 关心调度的人换个房还是关心。
 */
const open = ref(false)

function toggle(): void {
  open.value = !open.value
}

watch(() => props.roomSessionId, id => {
  if (id) void collabBoardStore.loadCoordinator(id)
}, { immediate: true })

const state = computed(() => collabBoardStore.coordinatorFor(props.roomSessionId))

/**
 * 秒针。**只在展开且有东西在跑的时候走** —— 「跑了多久」是这一面唯一需要秒级
 * 刷新的东西,而一个恒定 1s 的定时器会让一间安静的房也每秒重算一遍整棵树。
 */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

function stopTicking(): void {
  if (timer) clearInterval(timer)
  timer = undefined
}

watch(
  () => open.value && (state.value?.turns.length ?? 0) > 0,
  ticking => {
    stopTicking()
    if (!ticking) return
    now.value = Date.now()
    timer = setInterval(() => { now.value = Date.now() }, 1_000)
  },
  { immediate: true },
)

// 快照到达时刷一次基准(2026-08-02 三审):秒针只在「展开 + 有回合在跑」时走
// (省电,刻意),但一间安静的房也会来新 log 行 —— 不刷的话 `now` 停在上次
// 走秒的时刻,新行恒显「0s」、旧行不再变老,直到下一个回合起跑才纠正。
watch(state, () => { now.value = Date.now() })

onUnmounted(stopTicking)

const resolveName = (agentId: string): string => agentsStore.displayAgent(agentId).name

const bar = computed(() => buildCoordinatorBar(state.value, resolveName))
const nowRows = computed(() => buildCoordinatorNowRows(state.value, resolveName))
const gateRows = computed(() => buildCoordinatorGateRows(state.value))
const plan = computed(() => buildCoordinatorPlan(state.value, resolveName))
const logRows = computed(() => buildCoordinatorLogRows(state.value, resolveName))

async function resume(): Promise<void> {
  if (!props.roomSessionId) return
  try {
    await platformApi.setCollabRoomFrozen(props.roomSessionId, false)
  } catch (error) {
    console.error('[coordinator] resume failed:', error)
  }
}
</script>

<style scoped>
.cd {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

/* ── 常驻条 ── */
.cd-bar {
  display: flex;
  gap: 7px;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  cursor: pointer;
  user-select: none;
}

.cd-bar:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.cd-lamp {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-text-muted-fg, var(--muted));
}

/* 在跑的灯外面那一圈:用 status **bg** token,不是从 fg 兑出来的 color-mix ——
   一个语义色族的表面色是设计系统给的,自己兑一个只是碰巧在当前主题下好看。 */
.cd-lamp.is-run {
  background: var(--ui-status-success-fg, var(--color-success, #4d6108));
  box-shadow: 0 0 0 3px var(--ui-status-success-bg, transparent);
}

.cd-lamp.is-wait {
  background: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

/* 空闲是一个**空心**点:有状态,但没在动。实心灰会读成"灭了"。 */
.cd-lamp.is-off {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--ui-text-muted-fg, var(--muted));
}

.cd-who {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd.is-frozen .cd-who {
  color: var(--ui-text-muted-fg, var(--muted));
}

.cd-tail {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cd-resume {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
}

.cd-chev {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-right: 1.4px solid var(--ui-text-muted-fg, var(--muted));
  border-bottom: 1.4px solid var(--ui-text-muted-fg, var(--muted));
  transform: rotate(45deg) translate(-2px, -2px);
  transition: transform 0.14s ease;
}

.cd.is-open .cd-chev {
  transform: rotate(-135deg) translate(-1px, -1px);
}

/* ── 展开体 ── */
.cd-body {
  padding: 2px 0 8px;
}

.cd-sec {
  padding: 9px 12px 2px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

/* 「现在」:左端是**状态字形**而不是头像 —— 头像在下面的线程列表里已经是主角,
   这一段要的是"谁处在什么阶段",字形比脸更快读。 */
.cd-now {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 12px;
  cursor: pointer;
}

.cd-now.is-flat {
  cursor: default;
}

.cd-now:hover:not(.is-flat) {
  background: var(--ui-state-hover-bg, var(--hover));
}

.cd-glyph {
  flex: 0 0 12px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-style: normal;
  line-height: 1;
  text-align: center;
}

.cd-now.is-run .cd-glyph {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.cd-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-reason {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.cd-elapsed {
  flex: 0 0 auto;
  width: 34px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* 动作只在悬停时顶掉计时 —— 一行里两样东西各占一次位置,行宽不跳。 */
.cd-act {
  display: none;
  flex: 0 0 34px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  text-align: right;
}

.cd-now:hover .cd-elapsed {
  display: none;
}

.cd-now:hover .cd-act {
  display: block;
}

/* 编排:一批一行,正在跑的那批上墨加粗 + 一道底线。 */
.cd-plan {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 3px 12px 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
}

.cd-plan-sep {
  opacity: 0.45;
}

.cd-plan-on {
  position: relative;
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 600;
}

.cd-plan-on::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -3px;
  left: 0;
  height: 1.5px;
  background: var(--ui-text-primary-fg, var(--text));
}

.cd-plan-why {
  padding: 0 12px 3px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.cd-plan-meta {
  display: flex;
  justify-content: space-between;
  padding: 0 12px 2px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* 闸:一条 3px 的量线,不是进度条控件。 */
.cd-gate {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 12px;
}

.cd-gate-name {
  flex: 0 0 52px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.cd-gate-bar {
  position: relative;
  flex: 1 1 auto;
  height: 3px;
  background: var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.cd-gate-bar i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ui-text-secondary-fg, var(--text));
  transition: width 0.2s ease;
}

.cd-gate.is-warn .cd-gate-bar i,
.cd-gate.is-warn .cd-gate-value {
  color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
  background: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.cd-gate.is-warn .cd-gate-value {
  background: none;
}

.cd-gate-value {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* 「刚才」:时间一列、事件一列。 */
.cd-log {
  display: flex;
  gap: 9px;
  padding: 3px 12px;
  font-size: 11.5px;
}

.cd-log-at {
  flex: 0 0 30px;
  padding-top: 1px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.cd-log-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ui-text-secondary-fg, var(--text));
}

.cd-log.is-muted .cd-log-text {
  color: var(--ui-text-muted-fg, var(--muted));
}
</style>
