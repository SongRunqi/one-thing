<template>
  <div
    class="say-flow"
    :style="layoutVars"
  >
    <template
      v-for="row in layout.rows"
      :key="messages[row.index]?.id || `say-${row.index}`"
    >
      <!-- 时间胶囊:复用房间既有口径(room-grouping.ts,10 分钟 / 跨天)与
           既有组件。它自己是一行,不包在消息行里 —— 一条消息始终是一个可测量行。 -->
      <RoomTimeCapsule
        v-if="layout.capsules.get(row.index)"
        :label="layout.capsules.get(row.index) || ''"
      />

      <!-- 系统行:居中细线(方案 A 的 `.sys`),复用房间既有的通告行组件。 -->
      <div
        v-if="row.kind === 'notice'"
        class="say-notice"
        :data-index="row.index"
        :data-message-id="messages[row.index]?.id"
      >
        <RoomNoticeLine :content="messages[row.index]?.content || ''" />
      </div>

      <!-- 错误:不吞。一次炸掉的回合在聊天面必须看得见,复用既有错误卡。 -->
      <div
        v-else-if="row.kind === 'error'"
        class="say-error"
        :data-index="row.index"
        :data-message-id="messages[row.index]?.id"
      >
        <MessageError
          :content="messages[row.index]?.content || ''"
          :error-details="messages[row.index]?.errorDetails"
          :timestamp="messages[row.index]?.timestamp"
          :session-id="messages[row.index]?.sessionId"
          :message-id="messages[row.index]?.id"
        />
      </div>

      <SayMessageRow
        v-else
        :message="messages[row.index]"
        :index="row.index"
        :head="row.head"
        :tail="row.tail"
        :addressed="row.addressed"
        :highlighted="Boolean(highlightedMessageId) && messages[row.index]?.id === highlightedMessageId"
        :dm-mode="dmMode"
        :pair-dm-mode="pairDmMode"
        :thread-entry="threadEntryFor(row)"
        :room-session-id="sessionId"
        :quote-suppressed="!row.showQuote"
        :unread-since="unreadSince"
        :quote-missing="isQuoteTargetMissing(messages[row.index])"
        @reply="replyTo => emit('replyTo', replyTo)"
        @react="(messageId, emoji) => emit('react', messageId, emoji)"
        @jump-to-message="messageId => emit('jumpToMessage', messageId)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 聊天面(say-only)的消息流 —— 工作台式外壳 C2′
 * (docs/design/im-workbench-layout.md §3 W2 / W3,W-Q4)。
 *
 * 覆盖范围:**群聊房 + 私聊房(单成员 dm)+ agent 互聊 pair 房**。
 * 直聊 / 普通会话 / 工作会话继续走既有 `MessageItem` 组件树 —— 那是工程驾驶舱,
 * 它需要工具卡、StepsPanel、diff。
 *
 * **唯一挂载点是 `room/RoomSurface.vue`**(分流门在 `ChatWindow` 的
 * `roomSurfaceActive`)。C2′ 时期那道挂在 `MessageList` 内部的旧门已随 R3 拆除:
 * workbench 下房会话根本到不了 `ChatPanel` → `MessageList`。
 *
 * **这一层只管画**:滚动跟随/锚定、分页、权限审批都是外壳(`RoomSurface`)的事,
 * 所以这里既不装 scroller 也不碰 `useFollowScroll` —— 复用的方式是**不再要一份**。
 * 行上的 `data-index` / `data-message-id` 与旧树逐字段一致,锚点与跳转照旧命中。
 */
import { computed } from 'vue'
import type { ChatMessage, ChatMessageReplyTo } from '@/types'
import RoomTimeCapsule from '../message/RoomTimeCapsule.vue'
import RoomNoticeLine from '../message/RoomNoticeLine.vue'
import MessageError from '../message/MessageError.vue'
import SayMessageRow from './SayMessageRow.vue'
import { buildSayLayout, type SayRow, type SayMessageLike } from './say-rows'
import { SAY_METRICS } from './say-typography'
import { findAgentDoingTask } from '../agent-activity'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'

const props = defineProps<{
  messages: ChatMessage[]
  sessionId?: string
  /** 单成员 dm 房。 */
  dmMode?: boolean
  /** agent ↔ agent 私聊房。 */
  pairDmMode?: boolean
  highlightedMessageId?: string | null
  /**
   * 这一屏是不是**完整的转录**(上游历史已经读到头)。
   *
   * 只有为真时,「引用的原文不在列表里」才等于「它被删了」;否则它多半只是
   * 还没翻到的那一页。默认 false —— 拿不准就不下断言。
   */
  historyComplete?: boolean
}>()

const emit = defineEmits<{
  replyTo: [replyTo: ChatMessageReplyTo]
  react: [messageId: string, emoji: string]
  jumpToMessage: [messageId: string]
}>()

const collabBoardStore = useCollabBoardStore()
const sessionsStore = useSessionsStore()

/**
 * 这一屏的已读水位,读**一次**交给所有行(im-message §A 修订)。
 *
 * 放在这里而不是行里:一屏几百行各自去问仓储,是几百次同答案的查询;而"读到
 * 哪儿了"整张列表只有一个答案。行只负责比自己的时间戳。
 */
const unreadSince = computed(() => {
  const sessionId = props.sessionId
  if (!sessionId) return 0
  return sessionsStore.readMarks?.get(sessionId)?.readAt ?? 0
})
collabBoardStore.ensureSubscribed()

const layout = computed(() => buildSayLayout(props.messages as unknown as SayMessageLike[]))

/** 当前这一屏认识的消息 id —— 引用落点在不在,只问它。 */
const loadedMessageIds = computed(() => new Set(props.messages.map(message => message.id)))

/**
 * 被引原文是不是真的没了(im-message §B 的降级态)。
 *
 * 两个条件缺一不可:历史已经读全 **且** 那个 id 不在列表里。少了前一个,
 * 一条还没翻到的旧消息会被冤枉成"已删除" —— 宁可少说,不可错说。
 */
function isQuoteTargetMissing(message: ChatMessage | undefined): boolean {
  const targetId = message?.replyTo?.messageId
  if (!targetId || !props.historyComplete) return false
  return !loadedMessageIds.value.has(targetId)
}

/** 栏位尺寸的唯一真源是 SAY_METRICS;CSS 只消费这几枚变量。 */
const layoutVars = computed(() => ({
  '--say-avatar-size': `${SAY_METRICS.avatarSizePx}px`,
  '--say-gutter-gap': `${SAY_METRICS.gutterGapPx}px`,
  '--say-row-padding-block': `${SAY_METRICS.rowPaddingBlockPx}px`,
  '--say-row-padding-inline': `${SAY_METRICS.rowPaddingInlinePx}px`,
  '--say-signature-size': `${SAY_METRICS.signatureSizePx}px`,
}))

/**
 * 「展开执行 →」的落点(W3:中栏只留这一个执行入口)。
 *
 * `workSessionId` 从看板现算 —— 复用 `agent-activity.ts` 的
 * `findAgentDoingTask(board, agentId, { requireWorkSession: true })`,与 TabBar
 * 私聊房头徽标、C1 左栏活卡片同一份判定,**不新增第四套**。
 *
 * 降级:看板没加载、这个 agent 名下没有 doing 卡、或那张卡还没开过工作台
 * (`workSessionIds` 空)—— 一律返回 null,按钮整个不渲染。空事件绝不派出去:
 * `onething:open-thread` 收到空 workSessionId 只会打开一个没有内容的线程。
 */
function threadEntryFor(row: SayRow): { workSessionId: string; title: string; taskId?: string } | null {
  if (row.kind !== 'speech' || !row.tail) return null
  const agentId = props.messages[row.index]?.agentId
  if (!agentId || !props.sessionId) return null
  // 每个 agent 只在他**最后一段发言**的末行上挂入口。
  if (layout.value.threadAnchorByAgent.get(agentId) !== row.index) return null
  const task = findAgentDoingTask(
    collabBoardStore.boardFor(props.sessionId),
    agentId,
    { requireWorkSession: true },
  )
  if (!task?.sessionId) return null
  return { workSessionId: task.sessionId, title: task.title, taskId: task.taskId }
}
</script>

<style scoped>
.say-flow {
  display: flex;
  flex-direction: column;
}

/* 系统行居中细线:间距归这一层管(与房间 gap table 同一条纪律 ——
   RoomNoticeLine 自己不带 margin)。 */
.say-notice,
.say-error {
  padding: 6px var(--say-row-padding-inline, 20px);
  overflow-anchor: none;
}
</style>
