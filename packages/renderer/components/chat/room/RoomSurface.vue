<template>
  <div class="room-surface">
    <Scrollbar
      ref="scrollbarRef"
      class="room-flow"
      :class="{ 'stream-following': useBottomScrollAnchor }"
      :style="flowStyles"
    >
      <div
        ref="flowContentRef"
        class="room-flow-content"
      >
        <Button
          v-if="pageHistorySummary"
          unstyled
          class="room-history-summary"
          native-type="button"
          :disabled="pageState?.isLoadingOlder"
          @click="loadOlderHistoryIfNeeded(true)"
        >
          <span>{{ pageHistorySummary }}</span>
        </Button>

        <!-- 中栏只有 say(W2):署名 / 正文 markdown / 附件 / 引用 / 一个
             「展开执行 →」。工具卡、StepsPanel、diff 一律在右栏线程。 -->
        <SayChatFlow
          :messages="listMessages"
          :session-id="effectiveSessionId"
          :dm-mode="isUserDmSession"
          :pair-dm-mode="isPairDmSession"
          :highlighted-message-id="highlightedMessageId"
          @reply-to="handleReplyTo"
          @react="handleReact"
          @jump-to-message="handleJumpToMessage"
        />

        <!-- 流式跟随靠浏览器的 scroll anchoring:say 行一律 `overflow-anchor:
             none`,只有这一枚哨兵在跟随时打开,锚点因此只可能是"底"。 -->
        <div
          ref="bottomSentinelRef"
          class="room-flow-sentinel"
          aria-hidden="true"
        />
      </div>
    </Scrollbar>

    <Transition name="room-scroll-btn">
      <Button
        v-if="showScrollToBottomButton && listMessages.length > 0"
        unstyled
        class="room-scroll-bottom"
        native-type="button"
        title="回到底部"
        aria-label="回到底部"
        @click="scrollToBottomFromButton"
      >
        <ArrowDown
          :size="16"
          :stroke-width="2"
        />
      </Button>
    </Transition>

    <div
      ref="composerRef"
      class="room-composer"
    >
      <BackgroundJobsStatusBar />

      <!-- 权限账页栏位(§8 铁律 1):位置与语义与旧壳逐字段一致 —— 中栏底部、
           composer 上方、按 toolCallId 应答、scope 档位、Enter/D 快捷键。
           实现是同一个组件,不是一份拷贝。 -->
      <PermissionLedger
        v-if="pendingPermission"
        :tool-call="pendingPermission"
        :queued-count="queuedBehindCount"
        collab-scope-only
        @allow="(toolCall, scope) => void confirmTool(toolCall, scope)"
        @reject="openRejectDialog"
        @reject-with-instruction="(toolCall, reason) => handleRejectWithInstruction(toolCall, reason)"
      />

      <CollabTypingLine :session-id="effectiveSessionId" />

      <ComposerReplyBar
        v-if="pendingReplyTo"
        :reply-to="pendingReplyTo"
        @cancel="pendingReplyTo = null"
      />

      <InputBox
        ref="inputBoxRef"
        :is-loading="isGenerating"
        :session-id="effectiveSessionId"
        @send-message="handleSendMessage"
        @stop-generation="handleStopGeneration"
        @switch-session="(sessionId) => emit('switchSession', sessionId)"
      />
    </div>

    <RejectReasonDialog
      :visible="showRejectDialog"
      @confirm="confirmReject"
      @cancel="cancelReject"
    />

    <div
      v-if="reactionHint"
      class="room-action-hint"
    >
      {{ reactionHint }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 房 / 私聊的聊天面 —— 去复用重构 R1 的新中栏
 * (样板 `docs/design/im-redesign/final.html`,设计 §8)。
 *
 * 它**不是** `ChatPanel` 的一个分支,而是另一棵壳:没有 TabBar、没有
 * ChatSidePanel、没有 GoalStatusBar / 大纲导航轨 / 练习条,也没有行内工具卡。
 * 分流在 `ChatWindow` 层(`kind === 'room' && shellMode === 'workbench'`),两面
 * 永不同时挂载。
 *
 * **组件级复用照旧,壳级复用禁止**(§8 铁律 4)。这一面复用的是:
 *  - `SayChatFlow` / `SayMessageRow`(C2′ 的 say 呈现树,原样从 MessageList 提出)
 *  - `useFollowScroll` / `useMessageScrollCoordinator`(跟随与锚定)
 *  - `useHistoryPagination`(历史分页,与旧壳同一份阈值)
 *  - `PermissionLedger` + `usePermissionResponder` + `RejectReasonDialog`(审批,
 *    §8 铁律 1:位置/字段/快捷键零变化,靠"同一个实现"而不是靠比对)
 *  - `InputBox`(composer 不重写,§8 铁律 5;它自己会在 room 会话切 messenger 形态)
 *  - `CollabTypingLine` / `ComposerReplyBar` / `BackgroundJobsStatusBar`
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Scrollbar from '@/components/common/Scrollbar.vue'
import SayChatFlow from '../say/SayChatFlow.vue'
import { SAY_METRICS } from '../say/say-typography'
import InputBox from '../InputBox.vue'
import CollabTypingLine from '../CollabTypingLine.vue'
import ComposerReplyBar from '../ComposerReplyBar.vue'
import BackgroundJobsStatusBar from '../BackgroundJobsStatusBar.vue'
import PermissionLedger from '../permission/PermissionLedger.vue'
import RejectReasonDialog from '../permission/RejectReasonDialog.vue'
import {
  countQueuedBehind,
  findPendingPermission,
  type PermissionResponse,
} from '../permission/permission-ledger'
import { filterRoomMessages } from '../message/room-grouping'
import type { ChatMessage, ChatMessageMention, ChatMessageReplyTo, MessageAttachment, ToolCall } from '@/types'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useChatSession } from '@/composables/useChatSession'
import { useFollowScroll, shouldShowScrollToBottomButton } from '@/composables/useFollowScroll'
import { useMessageScrollCoordinator } from '@/composables/useMessageScrollCoordinator'
import { useHistoryPagination } from '@/composables/useHistoryPagination'
import { usePermissionResponder } from '@/composables/usePermissionResponder'
import { usePermissionShortcuts } from '@/composables/usePermissionShortcuts'
import { useCollabReactions } from '@/composables/useCollabReactions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { findRoomDefaultThread } from './room-head'
import { isAgentPairDmRoom, isUserDmRoom } from '@onething/runtime/collab'

const props = defineProps<{
  sessionId?: string
}>()

const emit = defineEmits<{
  switchSession: [sessionId: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)
const panelSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.sessions.find(item => item.id === sid) || null
})

const {
  messages,
  isLoading,
  isGenerating,
  sendMessage: chatSendMessage,
  steerMessage: chatSteerMessage,
  queueFollowUpMessage: chatQueueFollowUpMessage,
  stopGeneration: chatStopGeneration,
} = useChatSession(effectiveSessionId)

// 协调器的机器动作(激活驱动、resolved pass)在这里就被丢掉 —— 与旧壳同一个
// 过滤器,时间胶囊与署名合并因此看到的正是用户看到的那一串。
const listMessages = computed(() => filterRoomMessages(messages.value) as ChatMessage[])

const isUserDmSession = computed(() => isUserDmRoom(panelSession.value?.room))
const isPairDmSession = computed(() => isAgentPairDmRoom(panelSession.value?.room))

/** 排版档的唯一真源仍是 SAY_METRICS(与 C2′ 同一张表)。 */
const flowStyles = computed<Record<string, string>>(() => ({
  '--message-font-size': `${SAY_METRICS.fontSize}px`,
  '--message-line-height': String(SAY_METRICS.lineHeight),
  '--message-line-height-px': `${Math.round(SAY_METRICS.fontSize * SAY_METRICS.lineHeight)}px`,
  '--content-spacing-px': `${Math.round(SAY_METRICS.fontSize * SAY_METRICS.contentSpacing)}px`,
  '--chat-turn-gap': `${SAY_METRICS.turnGapPx}px`,
}))

// ── 滚动:跟随 / 锚定 / 分页,三件都复用既有 composable ──────────────────
const scrollbarRef = ref<InstanceType<typeof Scrollbar> | null>(null)
const scrollerRef = ref<HTMLElement | null>(null)
const flowContentRef = ref<HTMLElement | null>(null)
const bottomSentinelRef = ref<HTMLElement | null>(null)
const composerRef = ref<HTMLElement | null>(null)
const showScrollToBottomButton = ref(false)
const searchHighlightedMessageId = ref<string | null>(null)
let searchHighlightTimer: ReturnType<typeof setTimeout> | null = null

const highlightedMessageId = computed(() => searchHighlightedMessageId.value)

const hasActiveStream = computed(() => listMessages.value.some(message => message.isStreaming))
const pageState = computed(() => chatStore.getSessionPageState(effectiveSessionId.value))
const totalMessageCount = computed(() =>
  pageState.value?.totalCount ?? panelSession.value?.messageCount ?? listMessages.value.length)
const pageHistorySummary = computed(() => {
  const state = pageState.value
  const total = totalMessageCount.value
  const loaded = listMessages.value.length
  if (!state || !state.hasMoreBefore || total <= loaded) return ''
  if (state.isLoadingOlder) return `正在读更早的消息… ${loaded}/${total}`
  return `读更早的消息 · ${loaded}/${total}`
})

const follow = useFollowScroll({
  scroller: scrollerRef,
  content: flowContentRef,
  count: computed(() => listMessages.value.length),
  maintainOnLayout: hasActiveStream,
})
const { isFollowing } = follow
const useBottomScrollAnchor = computed(() => isFollowing.value && hasActiveStream.value)

function getMessageRowById(messageId: string): HTMLElement | null {
  return flowContentRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`) ?? null
}

function updateScrollToBottomButton() {
  const el = scrollerRef.value
  if (!el) {
    showScrollToBottomButton.value = false
    return
  }
  // 视野底部不等于对话末尾:hasMoreAfter 时强制亮着,否则用户没有回到真尾的入口。
  const hasMoreAfter = pageState.value?.hasMoreAfter ?? false
  showScrollToBottomButton.value = hasMoreAfter || shouldShowScrollToBottomButton(el, isFollowing.value)
}

const scrollCoordinator = useMessageScrollCoordinator({
  scroller: scrollerRef,
  getSessionId: () => effectiveSessionId.value,
  getMessageRowById,
  onStateChange: updateScrollToBottomButton,
})

const historyPagination = useHistoryPagination({
  scroller: scrollerRef,
  content: flowContentRef,
  getSessionId: () => effectiveSessionId.value,
  getPageState: () => pageState.value,
  isSwitching: () => follow.isSwitching(),
  isFollowing,
  clearScrollMode: () => scrollCoordinator.clear(),
  getMessageRowById,
  writeScrollTop: top => scrollCoordinator.writeScrollTop(top),
  onSettled: () => updateScrollToBottomButton(),
})
const { loadOlderHistoryIfNeeded, loadNewerHistoryIfNeeded } = historyPagination

function handleScroll() {
  follow.checkReattach()
  const el = scrollerRef.value
  if (el) {
    scrollCoordinator.detectExternalScroll(el)
    const isAtTail = el.scrollHeight - el.scrollTop - el.clientHeight <= 2
    // 只在真尾才进 tail 档:局部窗口的底不是对话的底,否则每次高度变化都会
    // 把视野甩向真尾。
    const isRealTail = !pageState.value?.hasMoreAfter
    if (isAtTail && isRealTail && !scrollCoordinator.isAnchored() && (hasActiveStream.value ? isFollowing.value : true)) {
      scrollCoordinator.setTail()
    }
  }
  updateScrollToBottomButton()
  void loadOlderHistoryIfNeeded()
  void loadNewerHistoryIfNeeded()
}

function handleWheel(event: WheelEvent) {
  scrollCoordinator.clear()
  follow.onWheel(event)
}

function handlePointerDown() {
  scrollCoordinator.clear()
}

let attachedScroller: HTMLElement | null = null

function attachScrollListeners() {
  const scroller = scrollbarRef.value?.getScrollElement() ?? null
  scrollerRef.value = scroller
  if (!scroller || attachedScroller === scroller) return
  detachScrollListeners()
  attachedScroller = scroller
  scroller.addEventListener('scroll', handleScroll)
  scroller.addEventListener('wheel', handleWheel, { passive: false })
  scroller.addEventListener('pointerdown', handlePointerDown)
}

function detachScrollListeners() {
  if (!attachedScroller) return
  attachedScroller.removeEventListener('scroll', handleScroll)
  attachedScroller.removeEventListener('wheel', handleWheel)
  attachedScroller.removeEventListener('pointerdown', handlePointerDown)
  attachedScroller = null
}

/** composer 高度变化会改可视区:跟随/锚定要立刻跟上,不能等下一次滚动。 */
let composerResizeObserver: ResizeObserver | null = null

function observeComposer() {
  composerResizeObserver?.disconnect()
  composerResizeObserver = null
  const el = composerRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  composerResizeObserver = new ResizeObserver(() => {
    scrollCoordinator.onLayoutChange()
    updateScrollToBottomButton()
  })
  composerResizeObserver.observe(el)
}

async function scrollToMessage(messageId: string, options: { preserveNavigation?: boolean } = {}) {
  void options
  const index = listMessages.value.findIndex(message => message.id === messageId)
  if (index === -1) return false
  isFollowing.value = false
  searchHighlightedMessageId.value = messageId

  await nextTick()
  const row = getMessageRowById(messageId)
  const scroller = scrollerRef.value
  if (row && scroller) {
    const offsetWithinMessage = -Math.round((scroller.clientHeight - row.offsetHeight) / 2)
    scrollCoordinator.writeScrollTop(row.offsetTop + offsetWithinMessage, { behavior: 'smooth' })
  }

  if (searchHighlightTimer) clearTimeout(searchHighlightTimer)
  searchHighlightTimer = setTimeout(() => {
    if (searchHighlightedMessageId.value === messageId) {
      searchHighlightedMessageId.value = null
    }
  }, 2600)
  return true
}

function handleJumpToMessage(messageId: string) {
  void scrollToMessage(messageId, { preserveNavigation: true })
}

async function scrollToBottomFromButton() {
  const sessionId = effectiveSessionId.value
  isFollowing.value = true
  // 局部窗口:先把尾页读回来,否则"回到底部"只回到这一窗的底。
  if (sessionId && pageState.value?.hasMoreAfter) {
    scrollCoordinator.clear()
    await chatStore.loadInitialMessagePage(sessionId)
    await nextTick()
  }
  scrollCoordinator.setTail({ behavior: 'smooth' })
}

// 新消息落地 / store 主动 bump:轻推一次跟随。
const effectiveScrollVersion = computed(() => chatStore.getScrollVersion(effectiveSessionId.value))
watch([effectiveScrollVersion, () => listMessages.value.length], () => {
  if (listMessages.value.length === 0) return
  if (historyPagination.isPrepending()) return
  nextTick(() => {
    scrollCoordinator.onLayoutChange()
    updateScrollToBottomButton()
  })
}, { flush: 'post' })

// ── 右栏「线程」的默认落点 ──────────────────────────────────────────────
//
// 右栏不另起一根:App 级 `RightWorkbenchPanel` 已经有 `thread` tab + 既有
// `ThreadWorkbench`,开合初值也已经走 `resolveInspectorDefaultOpen`(≥1400 默认
// 展开)。房面只回答"这间房该看哪条线程",并且**只在右栏已经开着时**才去落座
// —— 窄窗上不许由房面强行把右栏顶开,那会把 W-Q2 的窗宽策略架空。
const collabBoardStore = useCollabBoardStore()
collabBoardStore.ensureSubscribed()

function seatDefaultThread() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return
  if (!chatStore.inspectorOpen) return
  const thread = findRoomDefaultThread(collabBoardStore.boardFor(sessionId))
  if (!thread) return
  window.dispatchEvent(new CustomEvent('onething:open-thread', { detail: thread }))
}

// ── 权限审批 ────────────────────────────────────────────────────────────
const pendingPermission = computed<ToolCall | null>(() => findPendingPermission(messages.value))
const queuedBehindCount = computed(() => countQueuedBehind(messages.value, pendingPermission.value))

const { confirmTool, rejectTool } = usePermissionResponder({
  getSessionId: () => panelSession.value?.id,
  getMessages: () => messages.value,
})

const showRejectDialog = ref(false)
const pendingRejectToolCall = ref<ToolCall | null>(null)

function openRejectDialog(toolCall: ToolCall) {
  pendingRejectToolCall.value = toolCall
  showRejectDialog.value = true
}

function confirmReject(reason?: string) {
  if (pendingRejectToolCall.value) {
    void rejectTool(pendingRejectToolCall.value, reason)
  }
  cancelReject()
}

function cancelReject() {
  showRejectDialog.value = false
  pendingRejectToolCall.value = null
}

/** 与旧壳一致:栏位里写了理由就直接拒;理由为空则退回拒绝理由对话框。 */
function handleRejectWithInstruction(toolCall: ToolCall, reason: string | undefined) {
  if (reason) {
    void rejectTool(toolCall, reason)
    return
  }
  openRejectDialog(toolCall)
}

// Enter = allow current tool, D/Escape = reject —— 与旧壳同一个 composable、
// 同一组按键、同一道"对话框开着就不接管"的闸。
usePermissionShortcuts(
  () => !!pendingPermission.value && !showRejectDialog.value,
  {
    onAllow: () => {
      const pending = pendingPermission.value
      if (pending) void confirmTool(pending, 'once' as PermissionResponse)
    },
    onReject: () => {
      const pending = pendingPermission.value
      if (pending) openRejectDialog(pending)
    },
  },
)

// ── 表情 / 引用 / 发送 ──────────────────────────────────────────────────
const { reactionHint, react: handleReact } = useCollabReactions(() => effectiveSessionId.value)

const pendingReplyTo = ref<ChatMessageReplyTo | null>(null)
const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)

function handleReplyTo(replyTo: ChatMessageReplyTo) {
  pendingReplyTo.value = replyTo
  focusInput()
}

async function handleSendMessage(
  message: string,
  mode: 'send' | 'steer' | 'followup' = 'send',
  attachments?: MessageAttachment[],
  mentions?: ChatMessageMention[],
) {
  if (!panelSession.value) return
  if (mode === 'steer') {
    await chatSteerMessage(message)
    return
  }
  if (mode === 'followup') {
    await chatQueueFollowUpMessage(message)
    return
  }
  // 引用跟着这一次发送出去,并在 await 之前就被吃掉 —— 否则第二次 Enter 会把
  // 同一条引用再挂一次(§3.5 A)。房不会是草稿会话,所以没有 draft 物化分支。
  const replyTo = pendingReplyTo.value ?? undefined
  pendingReplyTo.value = null
  isFollowing.value = true
  scrollCoordinator.setTail()
  await chatSendMessage(message, attachments, {
    ...(replyTo ? { replyTo } : {}),
    ...(mentions ? { mentions } : {}),
  })
}

async function handleStopGeneration() {
  await chatStopGeneration()
}

function focusInput() {
  inputBoxRef.value?.focus()
}

function insertPromptReference(promptId: string) {
  inputBoxRef.value?.insertPromptReference(promptId)
}

// ── 会话快照(滚动位置 + 草稿),与旧壳同一本账 ─────────────────────────
const TAIL_SNAPSHOT_DISTANCE_PX = 4

function saveSnapshot(sessionId: string, prepareForSwitch = false) {
  const el = scrollerRef.value
  const distanceToBottom = el ? Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight) : 0
  const isAtTail = distanceToBottom <= TAIL_SNAPSHOT_DISTANCE_PX
  const anchor = captureAnchor()

  if (prepareForSwitch) {
    scrollCoordinator.clear()
    follow.prepareForSwitch()
  }

  chatStore.saveSnapshot(sessionId, {
    mode: isAtTail || !anchor ? 'tail' : 'anchor',
    anchorMessageId: isAtTail ? undefined : anchor?.messageId,
    offsetWithinMessage: isAtTail ? undefined : anchor?.offset,
    navMessageId: undefined,
    hasNavigated: false,
    messageInput: inputBoxRef.value?.getMessageInput() ?? '',
    quotedText: inputBoxRef.value?.getQuotedText() ?? '',
    attachments: inputBoxRef.value?.getAttachments() ?? [],
  })
}

function captureAnchor(): { messageId: string; offset: number } | null {
  const scroller = scrollerRef.value
  const content = flowContentRef.value
  if (!scroller || !content) return null
  const rows = Array.from(content.querySelectorAll<HTMLElement>('[data-message-id]'))
  const viewportTop = scroller.scrollTop
  const row = rows.find(candidate => candidate.offsetTop + candidate.offsetHeight > viewportTop)
  const messageId = row?.dataset.messageId
  if (!row || !messageId) return null
  return { messageId, offset: viewportTop - row.offsetTop }
}

function restoreTail() {
  scrollCoordinator.clear()
  isFollowing.value = true
  scrollCoordinator.setTail()
  follow.finishSwitch()
  updateScrollToBottomButton()
}

async function restoreSnapshot(sessionId: string) {
  const snapshot = chatStore.getSnapshot(sessionId)
  await nextTick()
  if (effectiveSessionId.value !== sessionId) return false
  if (!snapshot) {
    restoreTail()
    return false
  }
  inputBoxRef.value?.restoreSnapshot(snapshot)
  if (snapshot.mode !== 'anchor' || !snapshot.anchorMessageId) {
    restoreTail()
    return true
  }
  isFollowing.value = false
  const row = getMessageRowById(snapshot.anchorMessageId)
  if (!row) {
    restoreTail()
    return true
  }
  const offset = Math.max(0, snapshot.offsetWithinMessage ?? 0)
  scrollCoordinator.writeScrollTop(row.offsetTop + offset)
  scrollCoordinator.setAnchor(snapshot.anchorMessageId, offset)
  follow.finishSwitch()
  updateScrollToBottomButton()
  return true
}

onMounted(() => {
  attachScrollListeners()
  observeComposer()
  const sessionId = effectiveSessionId.value
  if (sessionId) void restoreSnapshot(sessionId)
  seatDefaultThread()
})

onBeforeUnmount(() => {
  detachScrollListeners()
  composerResizeObserver?.disconnect()
  composerResizeObserver = null
  if (searchHighlightTimer) clearTimeout(searchHighlightTimer)
  const sessionId = effectiveSessionId.value
  if (sessionId) saveSnapshot(sessionId)
})

watch(effectiveSessionId, async (newId, oldId) => {
  if (oldId && oldId !== newId) saveSnapshot(oldId, true)
  await nextTick()
  attachScrollListeners()
  if (!newId) return
  if (!chatStore.getSnapshot(newId)) inputBoxRef.value?.clearInput()
  await restoreSnapshot(newId)
  seatDefaultThread()
})

watch(() => listMessages.value.length, () => {
  nextTick(attachScrollListeners)
}, { flush: 'post' })

defineExpose({
  focusInput,
  insertPromptReference,
  scrollToMessage,
  isLoading,
})
</script>

<style scoped>
.room-surface {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 阅读列不收窄:房是高密度的场,吃满面板(W2)。 */
.room-flow {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.room-flow-content {
  display: flex;
  flex-direction: column;
  padding: 16px 0 4px;
}

.room-flow-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  overflow-anchor: none;
}

.room-flow.stream-following .room-flow-sentinel {
  overflow-anchor: auto;
}

.room-history-summary {
  align-self: center;
  margin-bottom: 8px;
  padding: 3px 12px;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 20px;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.room-history-summary:disabled {
  cursor: default;
  opacity: 0.6;
}

/* composer 区:样板里它吃满宽度、左右各留一格,不走阅读列的测量。
   `--chat-composer-width` / 两枚列边距是账页栏位与 InputBox 共同消费的输入
   变量 —— 在这里一次性钉成"整宽 + 零外边距",里面的组件一个字节都不用改。 */
.room-composer {
  --chat-composer-width: 100%;
  --chat-content-column-left: 0px;
  --chat-content-column-right: 0px;

  position: relative;
  z-index: 5;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 0 20px 16px;
}

.room-composer > :deep(.background-jobs-bar) {
  align-self: center;
}

.room-composer > :deep(.collab-typing),
.room-composer > :deep(.composer-reply) {
  box-sizing: border-box;
  width: 100%;
  margin: 0 0 4px;
}

/* 浮在 composer 上沿右角:它是"你不在底部"这件事的唯一提示,不能被 composer
   压住,所以 z-index 比 composer 低一档但位置在它上方。 */
.room-scroll-bottom {
  position: absolute;
  right: 26px;
  bottom: var(--room-scroll-bottom-offset, 96px);
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 50%;
  background: var(--ui-surface-panel-bg, var(--panel));
  cursor: pointer;
  color: var(--ui-text-muted-fg, var(--muted));
}

.room-scroll-bottom:hover {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.room-scroll-btn-enter-active,
.room-scroll-btn-leave-active {
  transition: opacity var(--duration-fast, 0.12s) var(--ease-default, ease);
}

.room-scroll-btn-enter-from,
.room-scroll-btn-leave-to {
  opacity: 0;
}

.room-action-hint {
  position: absolute;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  padding: 4px 10px;
  border-radius: var(--radius-xs, 4px);
  background: var(--ui-surface-panel-bg, var(--panel));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  pointer-events: none;
}
</style>
