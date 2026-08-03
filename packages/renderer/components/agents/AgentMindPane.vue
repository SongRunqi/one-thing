<template>
  <section class="agent-mind">
    <p
      v-if="view.missing"
      class="am-empty"
    >
      {{ view.missing }}
    </p>

    <!-- 大字:这个人此刻在干嘛。三态各画各的样子。 -->
    <div
      class="am-hero"
      :class="`is-${view.headline.state}`"
    >
      <b class="am-headline">{{ view.headline.text }}</b>
      <span
        v-if="view.headline.since"
        class="am-elapsed"
      >{{ formatCoordinatorElapsed(view.headline.since, now) }}</span>
    </div>
    <p
      v-if="view.lastSpokeAt"
      class="am-lastspoke"
    >
      上一次开口 {{ formatCoordinatorAgo(view.lastSpokeAt, now) }}前
    </p>

    <!-- 持牌清单:哪几间房、多久了、真在生成吗。 -->
    <div class="am-sec">
      <span>持牌</span>
      <i class="am-count">{{ view.leases.length }}</i>
    </div>
    <p
      v-if="!view.leases.length"
      class="am-empty"
    >
      手上没有牌。
    </p>
    <button
      v-for="lease in view.leases"
      :key="lease.key"
      type="button"
      class="am-row"
      :class="{ 'is-run': lease.executing }"
      :title="`去「${lease.roomName}」`"
      @click="emit('open-session', lease.roomSessionId)"
    >
      <span class="am-row-name">{{ lease.roomName }}</span>
      <span class="am-row-state">{{ lease.stateText }}</span>
      <span class="am-row-at">{{ formatCoordinatorElapsed(lease.since, now) }}</span>
    </button>

    <!-- 邮箱:深度 + 最旧 + 那句「不含正文」。 -->
    <div class="am-sec">
      <span>邮箱</span>
    </div>
    <div class="am-row is-flat">
      <span class="am-row-name">积压 {{ view.inbox.depth }}</span>
      <span
        v-if="view.inbox.oldestAt"
        class="am-row-state"
      >最旧 {{ formatCoordinatorAgo(view.inbox.oldestAt, now) }}前</span>
    </div>
    <p class="am-note">
      {{ view.inbox.note }}
    </p>

    <!-- 工作卡:running / done / interrupted 各自的状态与时长。 -->
    <div class="am-sec">
      <span>工作卡</span>
      <i class="am-count">{{ view.workers.length }}</i>
    </div>
    <p
      v-if="!view.workers.length"
      class="am-empty"
    >
      手上没有卡。
    </p>
    <button
      v-for="worker in view.workers"
      :key="worker.key"
      type="button"
      class="am-row"
      :class="{ 'is-run': worker.status === 'running' }"
      :title="`卡 ${worker.cardId} · ${worker.roomName}`"
      @click="emit('open-card', worker.cardId)"
    >
      <span class="am-row-name">{{ worker.shortId }}</span>
      <span class="am-row-state">{{ worker.statusText }}</span>
      <span class="am-row-meta">{{ worker.roomName }}</span>
      <span class="am-row-at">{{ formatCoordinatorElapsed(worker.since, now) }}</span>
    </button>

    <!-- 死信:一封信炸了,循环继续跑而系统静默变哑。 -->
    <div
      v-if="view.deadLetterCount > 0"
      class="am-dead"
    >
      {{ view.deadLetterCount }} 封事件处理失败 —— 详情在房间背台的「调度」时间轴上
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Agent 空间的「大脑」面 —— D8 观测体系 §4.3。
 *
 * 四个必答问题里的第二个。这一面**只画像素**:三态怎么说、时长的基准挂在哪一格、
 * 卡号怎么截,全在 `agent-mind.ts`。
 *
 * 数据只有一个来源:collabBoard 的 agents 账(§4.6 的第二本快照账)。房名经
 * sessions store 翻译,身份走 `displayAgent`(墓碑不冒充 default,域模型 M4)——
 * 一个已退休的同事照样看得见 TA 最后一次的样子,而不是一个 404。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'
import {
  formatCoordinatorAgo,
  formatCoordinatorElapsed,
} from '@/components/workbench/coordinator-status'
import { buildAgentMindView } from './agent-mind'

const props = defineProps<{ agentId: string }>()

const emit = defineEmits<{
  /** 点持牌那一行 → 去那间房。 */
  'open-session': [sessionId: string]
  /** 点工作卡 → 去看板定位那张卡。 */
  'open-card': [cardId: string]
}>()

const collabBoardStore = useCollabBoardStore()
const sessionsStore = useSessionsStore()

/** 房名翻不出来就退回 id —— 一个查得动的 id 好过一片空白。 */
const resolveRoomName = (roomSessionId: string): string =>
  sessionsStore.sessions.find(item => item.id === roomSessionId)?.name || roomSessionId

/** 秒针:这一面全是"想了多久 / 等了多久",1s 一跳。 */
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, 1_000)
onUnmounted(() => { clearInterval(timer) })

// 换人 = 换一份快照。补水每人一次,之后跟着 `collab:agent-changed` 走。
watch(() => props.agentId, agentId => {
  if (agentId) collabBoardStore.ensureAgentActivity([agentId])
}, { immediate: true })

const view = computed(() => buildAgentMindView({
  activity: collabBoardStore.agentActivityFor(props.agentId),
  resolveRoomName,
}))
</script>

<style scoped>
.agent-mind {
  display: flex;
  flex-direction: column;
  padding-bottom: 14px;
}

/* 大字:这一面唯一一处放大的地方 —— 「TA 现在在干嘛」是来这儿的全部理由。 */
.am-hero {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 16px 16px 4px;
}

.am-headline {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 17px;
  font-weight: var(--font-weight-semibold, 600);
}

.am-hero.is-idle .am-headline {
  color: var(--ui-text-muted-fg, var(--muted));
  font-weight: 400;
}

/* 持牌等待:v3 特有的第三种状态,给它一个自己的颜色 —— 它既不是"在跑"
   也不是"闲着",而在 D8 之前每一个界面都把它画成前者。 */
.am-hero.is-holding .am-headline {
  color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.am-hero.is-thinking .am-headline {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.am-elapsed {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.am-lastspoke {
  margin: 0;
  padding: 0 16px 6px;
  color: var(--ui-text-faint-fg, var(--muted));
  font-size: 11px;
}

.am-sec {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 12px 16px 3px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.am-count {
  font-family: var(--font-mono, monospace);
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.am-empty,
.am-note {
  margin: 0;
  padding: 2px 16px 4px;
  color: var(--ui-text-faint-fg, var(--muted));
  font-size: 11.5px;
}

.am-note {
  font-size: 11px;
}

/* 行:与账页系其余的行式表同一条骨架(左名、中态、右时,行宽不跳)。 */
.am-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  width: 100%;
  padding: 4px 16px;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.am-row.is-flat {
  cursor: default;
}

.am-row:hover:not(.is-flat) {
  background: var(--ui-state-hover-bg, var(--hover));
}

.am-row-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-row-state {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.am-row.is-run .am-row-state {
  color: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.am-row-meta {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-faint-fg, var(--muted));
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.am-row-at {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.am-dead {
  margin: 12px 16px 0;
  padding: 6px 0 6px 9px;
  border-left: 1.5px solid var(--ui-status-danger-fg, var(--color-danger, #a33));
  color: var(--ui-status-danger-fg, var(--color-danger, #a33));
  font-size: 11.5px;
  line-height: 1.6;
}
</style>
