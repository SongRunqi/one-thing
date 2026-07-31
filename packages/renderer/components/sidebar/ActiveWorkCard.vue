<template>
  <button
    type="button"
    class="work-card"
    :class="[`tone-${card.tag.tone}`, { 'is-active': active, 'is-live': live }]"
    :title="hoverTitle"
    @click="$emit('open', card)"
  >
    <span class="work-card-head">
      <span class="work-card-title">{{ card.title }}</span>
      <AgentAvatar
        class="work-card-avatar"
        aria-hidden="true"
        :avatar="card.assigneeAvatar"
        :avatar-image="card.assigneeAvatarImage"
        :size="18"
      />
    </span>

    <span class="work-card-meta">
      <!-- 三档呈现由 `resolveActiveWorkTag` 一处决定,模板不做第二次判定 ——
           所以这里只有一个 span,不是三份复制。 -->
      <span class="work-card-state">{{ card.tag.label }}</span>
      <span class="work-card-note">{{ note }}</span>
      <!-- 「正在执行」的一点绿:房里有一轮在跑、或者负责人此刻正在这间房打字。
           两个信号都是既有的(场账 + typing),不新起第三本。 -->
      <span
        v-if="live"
        class="work-card-live"
        aria-label="正在执行"
      />
      <!-- 未读墨点:判定仍然只有 sessions store 那一处(经场账转发)。 -->
      <span
        v-if="unread"
        class="sidebar-unread-dot"
        aria-label="有新消息"
      />
    </span>

    <span
      class="work-card-bar"
      aria-hidden="true"
    ><i :style="{ width: `${Math.round(card.progress * 100)}%` }" /></span>
  </button>
</template>

<script setup lang="ts">
/**
 * 左栏「进行中」的一张活卡片(C1,im-workbench-layout.md §3 W1)。
 *
 * 一个组件画三种状态:标的颜色由根节点上的 `tone-*` 类切换,模板只有一份。
 * 卡上的每一格都来自 `ActiveWorkCardModel`(纯函数算好的),这里不从 task 上
 * 现算任何东西。
 */
import { computed } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { useCollabTypingAgents } from '@/composables/useCollabTyping'
import type { ActiveWorkCardModel } from './active-work'

const props = defineProps<{
  card: ActiveWorkCardModel
  /** 这张卡所属的房此刻有一轮在跑(场账的「在忙」)。 */
  busy?: boolean
  /** 这张卡所属的房有未读(场账转发 store 的唯一判定)。 */
  unread?: boolean
  /** 这间房正开着 —— 卡片跟着点亮,免得用户找不到自己刚点的那张。 */
  active?: boolean
}>()

defineEmits<{ open: [card: ActiveWorkCardModel] }>()

/**
 * 打字信号取自 `useCollabTypingAgents`(C0 取件),一张卡一记脉搏;安静的房间
 * 一个定时器都不跑。没挂 pinia(单测)就退成"没人在打字",卡照画。
 */
const typingAgents = (() => {
  try {
    return useCollabTypingAgents(computed(() => props.card.roomSessionId))
  } catch {
    return computed<string[]>(() => [])
  }
})()

/**
 * 「正在执行」= 负责人此刻在这间房打字,或者(房里确实有一轮在跑且)这张卡
 * 正是负责人当前那张。后半句是 `findAgentDoingTask` 的结论 —— 一个人名下压着
 * 三张 doing 卡时,只有最新那张该亮。
 */
const live = computed(() =>
  (!!props.card.assigneeAgentId && typingAgents.value.includes(props.card.assigneeAgentId))
  || (props.busy === true && props.card.isAssigneeCurrent))

/** 副文:说得出所以然就说(卡住的原因 / 等你放行),否则报负责人的名字。 */
const note = computed(() => props.card.tag.hint || props.card.assigneeName)

const hoverTitle = computed(() => {
  const parts = [props.card.title, props.card.assigneeName, props.card.tag.label]
  if (props.card.tag.hint) parts.push(props.card.tag.hint)
  return parts.filter(Boolean).join(' · ')
})
</script>

<style scoped>
/* 画线风:一圈发丝框,无填充。三档只换标的颜色,框与条子一律墨系 —— 侧栏不是
   仪表盘,颜色只用来说"要不要你动手"。 */
.work-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  flex-shrink: 0;
  margin: 0 0 6px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 14%, transparent);
  border-radius: 8px;
  background: transparent;
  font-family: inherit;
  text-align: left;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.work-card:hover,
.work-card:focus-visible {
  border-color: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 32%, transparent);
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.work-card.is-active {
  border-color: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 48%, transparent);
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

.work-card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.work-card-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--sidebar-row-fg, var(--text));
}

.work-card:hover .work-card-title,
.work-card.is-active .work-card-title {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
}

/* 画线圆章,与联系人行同一句法。 */
.work-card-avatar {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 30%, transparent);
  border-radius: 50%;
  font-size: 10px;
  line-height: 1;
}

.work-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 10.5px;
  line-height: 1.4;
}

/* 状态标:一枚描边小签,颜色即语义。 */
.work-card-state {
  flex: 0 0 auto;
  padding: 1px 5px;
  border: 1px solid currentColor;
  border-radius: 3px;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.tone-running .work-card-state {
  color: var(--ui-status-success-fg, var(--color-success, #4a7c3f));
}

.tone-awaiting .work-card-state {
  color: var(--ui-status-warning-fg, var(--color-warning, #b06c1f));
}

.tone-delivered .work-card-state {
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 60%, transparent);
}

.work-card-note {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

/* 一点绿的脉搏 —— 与状态标同色系但更小,它说的是"此刻",不是"这一档"。 */
.work-card-live {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--ui-status-success-fg, var(--color-success, #4a7c3f));
  animation: work-card-pulse 1.6s ease-in-out infinite;
}

/* 未读点:与侧栏别处同一枚(5px 墨点),类名也照搬,免得长出第二种未读。 */
.work-card .sidebar-unread-dot {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--text)));
  opacity: 0.6;
}

/* 两枚点同时在时,靠右的那枚才吃 auto —— 否则会被挤成两段。 */
.work-card-live + .sidebar-unread-dot {
  margin-left: 0;
}

@keyframes work-card-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 进度条 = 阶段刻度(四档),不是百分比。2px 一线墨,不描边不发光。 */
.work-card-bar {
  display: block;
  height: 2px;
  border-radius: 1px;
  overflow: hidden;
  background: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 10%, transparent);
}

.work-card-bar i {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--sidebar-row-ink, var(--text)) 45%, transparent);
  transition: width 0.25s ease;
}

@media (prefers-reduced-motion: reduce) {
  .work-card-live { animation: none; }
  .work-card-bar i { transition: none; }
}
</style>
