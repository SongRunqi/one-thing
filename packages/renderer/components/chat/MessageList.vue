<template>
  <div
    class="message-list-wrapper"
    :style="messageListStyles"
  >
    <Scrollbar
      ref="messageScrollbarRef"
      :class="[
        'message-list',
        `density-${messageListDensity}`,
        { 'stream-following': useBottomScrollAnchor },
      ]"
      :style="messageListStyles"
    >
      <EmptyState
        v-if="messages.length === 0 && !isLoading"
        @suggestion="handleSuggestion"
      />

      <div
        v-if="messages.length === 0"
        ref="messageListContentRef"
        class="message-list-content message-list-content--empty"
        aria-hidden="true"
      />

      <div
        v-else
        ref="messageListContentRef"
        class="message-list-content"
      >
        <Button
          v-if="pageHistorySummary"
          unstyled
          class="history-page-summary"
          native-type="button"
          :disabled="pageState?.isLoadingOlder"
          @click="loadOlderHistoryIfNeeded(true)"
        >
          <span>{{ pageHistorySummary }}</span>
        </Button>

        <template
          v-for="(message, index) in messages"
          :key="message.id || index"
        >
          <div
            class="message-list-row"
            :data-index="index"
            :data-message-id="message.id"
          >
            <MessageItem
              :message="message"
              :branches="getBranchesForMessage(message.id)"
              :can-branch="canCreateBranch"
              :is-highlighted="message.id === highlightedMessageId"
              @edit="handleEdit"
              @branch="handleBranch"
              @go-to-branch="handleGoToBranch"
              @text-selection="handleTextSelection"
              @regenerate="handleRegenerate"
              @execute-tool="handleExecuteTool"
              @open-file="(filePath) => emit('openFile', filePath)"
              @update-thinking-time="handleUpdateThinkingTime"
            />
          </div>

          <!-- Goal outcome: belongs to the run, so it sits after the reply
               that ended it rather than on the declaration that opened it. -->
          <GoalSummaryCard
            v-for="settledGoal in goalSummariesByIndex.get(index)"
            :key="settledGoal.id"
            :goal="settledGoal"
            @review="emit('reviewGoal', props.sessionId || '')"
          />
        </template>

        <div
          ref="bottomSentinelRef"
          class="message-list-bottom-sentinel"
          aria-hidden="true"
        />
      </div>
    </Scrollbar>

    <!-- Selection toolbar: one instance for the whole list; MessageItems
         report selections upward instead of each owning a toolbar. -->
    <Teleport to="body">
      <SelectionToolbar
        :visible="selectionToolbarVisible"
        :position="selectionToolbarPosition"
        :selected-text="selectionToolbarText"
        :can-branch="canCreateBranch"
        @quote="handleSelectionQuote"
        @branch="handleSelectionBranch"
        @close="hideSelectionToolbar"
      />
    </Teleport>

    <Teleport
      :to="props.outlineRailTarget || 'body'"
      :disabled="!useSideOutlineRail"
    >
      <AssistantMessageNavRail
        v-if="useSideOutlineRail && hasAssistantOutlineNav"
        :markers="assistantOutlineMarkers"
        :current-index="currentAssistantOutlineIndex"
        :panel-available="true"
        placement="side"
        :show-mode-switch="false"
        @navigate="navigateToAssistantOutline"
      />
    </Teleport>

    <UserMessageNavRail
      v-if="hasUserNavTrail"
      :markers="displayNavMarkers"
      :current-index="currentUserMessageNavIndex"
      :total-count="displayNavMarkers.length"
      :panel-available="hasNavPanelRoom"
      placement="overlay"
      :show-mode-switch="false"
      @navigate="navigateToUserMessage"
    />

    <Transition name="scroll-bottom-btn">
      <Button
        v-if="showScrollToBottomButton && messages.length > 0"
        unstyled
        class="scroll-to-bottom-btn"
        native-type="button"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
        @click="scrollToBottomFromButton"
      >
        <ArrowDown
          :size="16"
          :stroke-width="2"
        />
      </Button>
    </Transition>

    <!-- Reject Reason Dialog -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showRejectDialog"
          class="reject-dialog-overlay"
          @click.self="cancelReject"
        >
          <div class="reject-dialog">
            <div class="reject-dialog-header">
              <span class="reject-dialog-title">Reject reason</span>
              <Button
                unstyled
                class="reject-dialog-close"
                @click="cancelReject"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <div class="reject-dialog-body">
              <textarea
                ref="rejectReasonInputRef"
                v-model="rejectReason"
                class="reject-reason-input"
                placeholder="Reason for rejection (optional)..."
                rows="3"
                @keydown.enter.ctrl="confirmReject"
                @keydown.enter.meta="confirmReject"
                @keydown.escape="cancelReject"
              />
              <div class="reject-dialog-hint">
                Ctrl+Enter to confirm · Esc to cancel
              </div>
            </div>
            <div class="reject-dialog-footer">
              <Button
                unstyled
                class="reject-dialog-btn reject-dialog-btn-cancel"
                @click="cancelReject"
              >
                Cancel
              </Button>
              <Button
                unstyled
                class="reject-dialog-btn reject-dialog-btn-confirm"
                @click="confirmReject"
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Scrollbar from '@/components/common/Scrollbar.vue'
import { ref, watch, nextTick, computed, onMounted, onUnmounted, toRaw, onUpdated } from 'vue'
import type { ChatMessage, SessionGoal, ToolCall } from '@/types'
import MessageItem from './MessageItem.vue'
import GoalSummaryCard from './message/GoalSummaryCard.vue'
import SelectionToolbar from './message/SelectionToolbar.vue'
import EmptyState from './EmptyState.vue'
import AssistantMessageNavRail from './AssistantMessageNavRail.vue'
import UserMessageNavRail, { type UserMessageNavMarker } from './UserMessageNavRail.vue'
import {
  ASSISTANT_OUTLINE_ANCHOR_ATTR,
  buildAssistantMessageOutlineMarkers,
  shouldShowAssistantMessageOutline,
  type AssistantMessageOutlineMarker,
} from './assistant-message-outline'
import { ArrowDown } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { usePermissionShortcuts } from '@/composables/usePermissionShortcuts'
import {
  useFollowScroll,
  shouldShowScrollToBottomButton,
} from '@/composables/useFollowScroll'
import { useMessageScrollCoordinator } from '@/composables/useMessageScrollCoordinator'
import { buildFontFamily, buildFontLoadSpecs } from '@shared/fonts'
import { platformApi } from '@/platform'

interface BranchInfo {
  id: string
  name: string
}

// Shared stable reference for messages without branches. Returning a fresh `[]`
// per call gives every MessageItem a new `branches` prop on each list re-render,
// which defeats Vue's "skip unchanged child" optimization and re-renders the
// whole list on every send (cost scales with conversation length). This array
// is read-only by all consumers (MessageActions only iterates / reads length).
const EMPTY_BRANCHES: BranchInfo[] = []

type NavMarker = UserMessageNavMarker
type MessageScrollBehavior = 'auto' | 'instant' | 'smooth'
type ExecutableToolCall = Pick<ToolCall, 'id' | 'toolId' | 'arguments'>
type PermissionToolCall = Pick<ToolCall, 'id' | 'permissionId' | 'canRespond'>

interface Props {
  messages: ChatMessage[]
  isLoading?: boolean
  sessionId?: string
  layoutTransitioning?: boolean
  outlineRailTarget?: HTMLElement | null
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  sessionId: undefined,
  layoutTransitioning: false,
  outlineRailTarget: null,
})

const emit = defineEmits<{
  setQuotedText: [text: string]
  setInputText: [text: string]
  regenerate: [messageId: string]
  editAndResend: [messageId: string, newContent: string]
  splitWithBranch: [sessionId: string]
  openFile: [filePath: string]
  reviewGoal: [sessionId: string]
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const messageScrollbarRef = ref<InstanceType<typeof Scrollbar> | null>(null)
const messageListRef = ref<HTMLElement | null>(null)
const messageListContentRef = ref<HTMLElement | null>(null)
const bottomSentinelRef = ref<HTMLElement | null>(null)
const navMarkers = ref<NavMarker[]>([])
const assistantOutlineMarkers = ref<AssistantMessageOutlineMarker[]>([])
const hasNavPanelRoom = ref(false)
const showScrollToBottomButton = ref(false)
const searchHighlightedMessageId = ref<string | null>(null)
let searchHighlightTimer: ReturnType<typeof setTimeout> | null = null

// Reject reason dialog state
const showRejectDialog = ref(false)
const rejectReason = ref('')
const pendingRejectToolCall = ref<PermissionToolCall | null>(null)
const rejectReasonInputRef = ref<HTMLTextAreaElement | null>(null)

// Get the effective session for this panel (props.sessionId or fallback to global)
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)
const panelSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

// Get current message list density setting
const messageListDensity = computed(() => {
  return settingsStore.settings.general?.messageListDensity || 'comfortable'
})

// Get custom line height setting (overrides density default if set)
const customLineHeight = computed(() => {
  return settingsStore.settings.general?.messageLineHeight
})

// Get chat font size setting
const chatFontSize = computed(() => {
  return settingsStore.settings.chat?.chatFontSize
})

// Get chat font settings
const chatFontEn = computed(() => settingsStore.settings.chat?.chatFontEn)
const chatFontZh = computed(() => settingsStore.settings.chat?.chatFontZh)

const MESSAGE_DENSITY_TYPOGRAPHY = {
  compact: {
    fontSize: 14,
    lineHeight: 20 / 14,
    contentSpacing: 0.4,
  },
  comfortable: {
    fontSize: 15,
    lineHeight: 24 / 15,
    contentSpacing: 0.75,
  },
  spacious: {
    fontSize: 16,
    lineHeight: 29 / 16,
    contentSpacing: 1,
  },
} as const

type MessageDensityKey = keyof typeof MESSAGE_DENSITY_TYPOGRAPHY

function getDensityTypography(density: string) {
  return MESSAGE_DENSITY_TYPOGRAPHY[(density as MessageDensityKey)] ?? MESSAGE_DENSITY_TYPOGRAPHY.comfortable
}

function px(value: number): string {
  return `${Math.max(1, Math.round(value))}px`
}

// Combined styles for message list
const messageListStyles = computed(() => {
  const styles: Record<string, string> = {}
  const density = messageListDensity.value
  const densityTypography = getDensityTypography(density)
  const fontSize = Number(chatFontSize.value) || densityTypography.fontSize
  const lineHeight = Number(customLineHeight.value) || densityTypography.lineHeight
  const contentSpacing = densityTypography.contentSpacing

  if (customLineHeight.value) {
    styles['--message-line-height'] = String(customLineHeight.value)
  }
  if (chatFontSize.value) {
    styles['--message-font-size'] = `${chatFontSize.value}px`
  }
  if (chatFontEn.value || chatFontZh.value) {
    styles['--font-body'] = buildFontFamily(chatFontEn.value, chatFontZh.value)
  }
  styles['--message-line-height-px'] = px(fontSize * lineHeight)
  styles['--content-spacing-px'] = px(fontSize * contentSpacing)
  styles['--content-paragraph-gap'] = px(fontSize * 0.5)
  styles['--content-list-gap'] = px(fontSize * 0.4)
  styles['--content-list-item-gap'] = px(fontSize * 0.15)
  styles['--content-heading-top-gap'] = px(fontSize * 0.55)
  styles['--content-heading-bottom-gap'] = px(fontSize * 0.18)
  styles['--content-heading-line-height-px'] = px(fontSize * 1.32)
  styles['--chat-composer-safe-gap'] = px(fontSize * 1.75)
  return Object.keys(styles).length > 0 ? styles : undefined
})

// Track current navigation position among user messages
const currentUserMessageNavIndex = ref(-1)
const currentAssistantOutlineIndex = ref(-1)

// Track if user has actually navigated (to avoid showing highlight on session switch)
const hasNavigated = ref(false)


// Flag to prevent scroll handler from overriding navigation index during active navigation
let isActivelyNavigating = false
let navigationCooldownTimer: ReturnType<typeof setTimeout> | null = null
let navMarkerUpdateFrame: number | null = null
let navPanelRoomUpdateFrame: number | null = null
let assistantOutlineUpdateFrame: number | null = null
let visibleUserMessageFrame: number | null = null
let measurementRefreshFrame: number | null = null
let navResizeObserver: ResizeObserver | null = null
let isAssistantOutlineNavigating = false
let assistantOutlineCooldownTimer: ReturnType<typeof setTimeout> | null = null
let isPrependingHistory = false
let isLoadingNewerHistory = false
let renderMeasureStart: number | null = null
let renderMeasureSessionId = ''
let renderMeasureMessageCount = 0
let userMessageMeasurements: Array<{ messageIndex: number; messageId: string; start: number }> = []
let deferredLayoutMeasurementRefresh = false
let deferredLayoutMeasurementTimer: ReturnType<typeof setTimeout> | null = null
let deferredLayoutMeasurementFollowupTimer: ReturnType<typeof setTimeout> | null = null

interface TopAnchor {
  messageId: string
  offsetWithinMessage: number
}

const NAV_VIEWPORT_OFFSET_RATIO = 0.18
const NAV_PANEL_MIN_RIGHT_GAP = 300
const SCROLL_ANCHOR_LOCK_MS = 2400
const SESSION_RESTORE_ANCHOR_LOCK_MS = 120_000

const pageState = computed(() => chatStore.getSessionPageState(effectiveSessionId.value))
const loadedMessageCount = computed(() => props.messages.length)
const totalMessageCount = computed(() => pageState.value?.totalCount ?? panelSession.value?.messageCount ?? loadedMessageCount.value)
const pageHistorySummary = computed(() => {
  const state = pageState.value
  const total = totalMessageCount.value
  const loaded = loadedMessageCount.value
  if (!state || !state.hasMoreBefore || total <= loaded) return ''
  if (state.isLoadingOlder) return `Loading earlier messages... ${loaded}/${total}`
  return `Load earlier messages · ${loaded}/${total}`
})

const hasActiveStream = computed(() => props.messages.some(message => message.isStreaming))

function deferLayoutMeasurementDuringTransition(): boolean {
  if (!props.layoutTransitioning) return false
  deferredLayoutMeasurementRefresh = true
  return true
}

function cancelPendingLayoutMeasurementFrames() {
  if (navMarkerUpdateFrame !== null) {
    cancelAnimationFrame(navMarkerUpdateFrame)
    navMarkerUpdateFrame = null
  }
  if (navPanelRoomUpdateFrame !== null) {
    cancelAnimationFrame(navPanelRoomUpdateFrame)
    navPanelRoomUpdateFrame = null
  }
  if (assistantOutlineUpdateFrame !== null) {
    cancelAnimationFrame(assistantOutlineUpdateFrame)
    assistantOutlineUpdateFrame = null
  }
  if (visibleUserMessageFrame !== null) {
    cancelAnimationFrame(visibleUserMessageFrame)
    visibleUserMessageFrame = null
  }
  if (measurementRefreshFrame !== null) {
    cancelAnimationFrame(measurementRefreshFrame)
    measurementRefreshFrame = null
  }
}

const follow = useFollowScroll({
  scroller: messageListRef,
  content: messageListContentRef,
  count: computed(() => props.messages.length),
  maintainOnLayout: hasActiveStream,
})

const { isFollowing } = follow
const useBottomScrollAnchor = computed(() => isFollowing.value && hasActiveStream.value)
const scrollCoordinator = useMessageScrollCoordinator({
  scroller: messageListRef,
  getSessionId: () => effectiveSessionId.value,
  getMessageRowById,
  onStateChange: updateScrollToBottomButton,
})

// Auto-scroll: while a response is streaming, keep the scroller pinned to its natural bottom.
// Composer safety is real tail padding below the list content, so "follow" and
// the real scrollbar bottom stay identical even as the composer changes height.
const effectiveScrollVersion = computed(() => chatStore.getScrollVersion(effectiveSessionId.value))

let followNudgeFrame: number | null = null

function scheduleFollowNudge(source: string) {
  void source
  if ((isFollowing.value && hasActiveStream.value) || scrollCoordinator.isTail()) {
    scrollCoordinator.onLayoutChange()
    updateScrollToBottomButton()
    return
  }
  if (!scrollCoordinator.isAnchored()) {
    scheduleScrollStateUpdate()
    return
  }
  if (followNudgeFrame !== null) return
  followNudgeFrame = requestAnimationFrame(() => {
    followNudgeFrame = null
    scrollCoordinator.onLayoutChange()
    updateScrollToBottomButton()
  })
}

function updateScrollToBottomButton() {
  const el = messageListRef.value
  if (!el) {
    showScrollToBottomButton.value = false
    return
  }
  // When hasMoreAfter is true, the visible "bottom" is not the real end
  // of the conversation — force-show the button so the user can navigate
  // to actual latest messages.
  const hasMoreAfter = pageState.value?.hasMoreAfter ?? false
  showScrollToBottomButton.value = hasMoreAfter || shouldShowScrollToBottomButton(el, isFollowing.value)
}

// External drift triggers — store-emitted scroll bumps and message count
// changes. The composable's internal ResizeObserver also covers post-paint
// layout (markdown rendering, code blocks growing, images loading), but we
// fire an extra nudge here so a store bump doesn't have to wait for layout.
watch([effectiveScrollVersion, () => props.messages.length], () => {
  if (props.messages.length === 0) return
  if (isPrependingHistory) return
  nextTick(() => scheduleFollowNudge('watch:scrollVersion+msgLen'))
}, { flush: 'post' })

// Force-follow when a new user message lands. The user explicitly sent it,
// so they want the new bubble + the response to be visible regardless of
// whether they were detached. With estimateSize=150 the first scrollHeight
// can still be wrong before the browser lays out the new row, so schedule
// one post-paint nudge after the real heights settle.
const lastUserMessageId = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === 'user') return props.messages[i].id
  }
  return null
})
let isReloadingTailForSend = false
let isNavigatingCrossPage = false

watch([effectiveSessionId, lastUserMessageId, () => props.messages.length], async ([sessionId, newId, messageCount], [oldSessionId, oldId, oldMessageCount]) => {
  if (!newId || newId === oldId) return
  if (sessionId !== oldSessionId) return
  if (messageCount <= oldMessageCount) return
  if (follow.isSwitching()) return
  if (isReloadingTailForSend) return
  if (isNavigatingCrossPage) return
  // Only trigger when a new user message was APPENDED to the end
  // (user just sent a message), NOT when the message array was REPLACED
  // by a navigation action (loadMessagesAround/loadOlderMessages).
  // Heuristic: count increased by exactly 1, old last user message
  // still exists in the new array, and new last user message is
  // genuinely new (wasn't in the old array at any position).
  const countIncrementedByOne = messageCount === oldMessageCount + 1
  const oldMsgStillExists = oldId ? !!props.messages.find(m => m.id === oldId) : false
  const isNewUserMessage = countIncrementedByOne && oldMsgStillExists
  if (!isNewUserMessage) return
  
  // If we're viewing a truncated window (hasMoreAfter=true), reload the
  // tail page so the new message lands at the real bottom instead of being
  // appended into a partial window.
  if (sessionId && pageState.value?.hasMoreAfter) {
    isReloadingTailForSend = true
    try {
      scrollCoordinator.clear()
      await chatStore.loadInitialMessagePage(sessionId)
    } finally {
      isReloadingTailForSend = false
    }
  }
  
  follow.isFollowing.value = true
  scrollCoordinator.setTail()
  nextTick(() => scheduleFollowNudge('watch:lastUserMsg'))
})

// Nav-rail markers + visible-user-msg tracking also depend on content
// height changes. We add a separate (cheap) ResizeObserver here so the nav
// concerns stay independent of the follow logic in the composable.
let navContentResizeObserver: ResizeObserver | null = null
watch(
  messageListContentRef,
  (el) => {
    if (navContentResizeObserver) {
      navContentResizeObserver.disconnect()
      navContentResizeObserver = null
    }
    if (!el || typeof ResizeObserver === 'undefined') return
    navContentResizeObserver = new ResizeObserver(() => {
      if (deferLayoutMeasurementDuringTransition()) return
      scheduleNavMarkerUpdate()
      scheduleNavPanelRoomUpdate()
      scheduleAssistantOutlineUpdate()
      scheduleMeasurementRefresh()
      if (hasActiveStream.value || scrollCoordinator.isAnchored() || scrollCoordinator.isTail()) {
        scrollCoordinator.onLayoutChange()
      }
      if (!scrollCoordinator.isAnchored()) {
        scheduleVisibleUserMessageIndexUpdate()
      }
    })
    navContentResizeObserver.observe(el)
  },
  { immediate: true },
)

// Get indices of user messages
const userMessageIndices = computed(() => {
  return props.messages
    .map((msg, index) => ({ msg, index }))
    .filter(item => item.msg.role === 'user')
    .map(item => item.index)
})

const displayNavMarkers = computed<NavMarker[]>(() => {
  const sessionId = effectiveSessionId.value
  const fullMarkers = sessionId ? chatStore.sessionUserMarkers.get(sessionId) : undefined
  if (fullMarkers && fullMarkers.length > 0) {
    return fullMarkers.map((marker, navIndex) => ({
      navIndex,
      messageId: marker.id,
      seq: marker.seq,
      position: getEvenNavPosition(navIndex, fullMarkers.length),
      label: `${navIndex + 1}/${fullMarkers.length} ${formatNavTime(marker.timestamp)} - ${marker.preview}`,
      preview: marker.preview || `${navIndex + 1}/${fullMarkers.length}`,
    }))
  }

  const total = userMessageIndices.value.length
  if (total === 0) return []

  const fallbackMarkers = userMessageIndices.value.map((messageIndex, navIndex) => {
    const message = props.messages[messageIndex]
    return {
      navIndex,
      messageId: message?.id || `nav-${navIndex}`,
      seq: message?.seq,
      position: getFallbackNavPosition(messageIndex),
      label: message ? buildNavMarkerLabel(message, navIndex) : `${navIndex + 1}/${total}`,
      preview: message ? buildNavMarkerPreview(message) : `${navIndex + 1}/${total}`,
    }
  })

  if (navMarkers.value.length === 0) {
    return fallbackMarkers
  }

  const markerMap = new Map(navMarkers.value.map(marker => [marker.messageId, marker]))
  return fallbackMarkers.map(marker => markerMap.get(marker.messageId) || marker)
})

const hasAssistantOutlineNav = computed(() => assistantOutlineMarkers.value.length > 1)
const hasUserNavTrail = computed(() => displayNavMarkers.value.length > 1)
const useSideOutlineRail = computed(() => Boolean(props.outlineRailTarget))

watch([assistantOutlineMarkers, currentAssistantOutlineIndex], ([markers, currentIndex]) => {
  const current = markers.find(marker => marker.navIndex === currentIndex) || null
  window.dispatchEvent(new CustomEvent('assistant-outline:current-changed', {
    detail: {
      sessionId: props.sessionId || '',
      label: current?.preview || '',
      count: markers.length,
    },
  }))
})

function updateNavPanelRoom() {
  const scroller = messageListRef.value
  const content = messageListContentRef.value
  if (!scroller || !content) {
    hasNavPanelRoom.value = false
    return
  }

  const scrollerRect = scroller.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()
  const rightGap = scrollerRect.right - contentRect.right
  hasNavPanelRoom.value = rightGap >= NAV_PANEL_MIN_RIGHT_GAP
}

function scheduleNavPanelRoomUpdate() {
  if (deferLayoutMeasurementDuringTransition()) return
  if (navPanelRoomUpdateFrame !== null) {
    cancelAnimationFrame(navPanelRoomUpdateFrame)
  }
  navPanelRoomUpdateFrame = requestAnimationFrame(() => {
    navPanelRoomUpdateFrame = null
    updateNavPanelRoom()
  })
}

// Get the currently highlighted message ID for navigation
// Only returns a value if user has actually navigated (not on session switch)
const highlightedMessageId = computed(() => {
  if (searchHighlightedMessageId.value) return searchHighlightedMessageId.value
  if (!hasNavigated.value) return null
  if (currentUserMessageNavIndex.value < 0) return null
  return displayNavMarkers.value[currentUserMessageNavIndex.value]?.messageId ?? null
})

// A goal that has stopped running gets an outcome card in the timeline. Only
// terminal states qualify — an active goal has nothing to summarize yet, and
// resuming a paused one retracts the card.
const GOAL_OUTCOME_STATUSES = new Set([
  'complete',
  'abandoned',
  'paused',
  'blocked',
  'budget_limited',
])

const goalSummary = computed(() => {
  const goal = props.sessionId ? sessionsStore.sessionGoals.get(props.sessionId) : null
  return goal && GOAL_OUTCOME_STATUSES.has(goal.status) ? goal : null
})

/**
 * Every settled goal in the session, each anchored to the message it finished
 * on. A session can hold a run of goals now (docs/design/goal-system-v3.md),
 * so the timeline shows one card per goal rather than only the latest.
 *
 * Falls back to the single live goal for sessions whose history has not been
 * pushed down yet, which keeps the pre-v3 behaviour intact.
 */
const goalSummariesByIndex = computed<Map<number, SessionGoal[]>>(() => {
  const byIndex = new Map<number, SessionGoal[]>()
  if (!props.sessionId) return byIndex

  const history = sessionsStore.sessionGoalHistory.get(props.sessionId)
  const settled = history?.length
    ? history.filter(goal => GOAL_OUTCOME_STATUSES.has(goal.status))
    : goalSummary.value
      ? [goalSummary.value]
      : []

  for (const goal of settled) {
    const index = anchorIndexFor(goal)
    if (index === -1) continue
    const bucket = byIndex.get(index)
    if (bucket) bucket.push(goal)
    else byIndex.set(index, [goal])
  }
  return byIndex
})

// endedAt is the immutable moment the goal left 'active'. updatedAt keeps
// moving after that — completing a goal kicks off an async fileChanges
// backfill that rewrites it — which used to make the card jump a slot a
// moment after it appeared. Older records predate endedAt, hence the fallback.
function anchorIndexFor(goal: SessionGoal): number {
  const settledAt = goal.endedAt ?? goal.updatedAt
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if ((props.messages[i]?.timestamp ?? 0) <= settledAt) return i
  }
  return -1
}


// Initialize navigation index when messages change
// Note: Session switching is handled by ChatWindow's snapshot save/restore.
// This watcher handles message count changes (new messages arriving, session data swap).
watch(
  () => props.messages.length,
  () => {
    renderMeasureStart = performance.now()
    renderMeasureSessionId = effectiveSessionId.value
    renderMeasureMessageCount = props.messages.length
    // Skip during session switch — snapshot restore will set the correct state
    if (follow.isSwitching()) return
    if (isPrependingHistory) return

    // Reset navigation highlight (don't highlight on new message arrival)
    hasNavigated.value = false

    if (isFollowing.value) {
      setNavIndexToLastMarker()
    }

    // Schedule marker update after DOM renders
    nextTick(() => {
      scheduleMeasurementRefresh()
      nextTick(() => {
        scheduleNavMarkerUpdate()
        scheduleAssistantOutlineUpdate()
      })
    })
  },
  { immediate: true, flush: 'post' }
)

watch(effectiveSessionId, () => {
  clearAssistantOutline()
  renderMeasureStart = performance.now()
  renderMeasureSessionId = effectiveSessionId.value
  renderMeasureMessageCount = props.messages.length
}, { flush: 'pre' })

watch(effectiveSessionId, (sessionId) => {
  if (!sessionId || chatStore.sessionUserMarkers.get(sessionId)) return
  window.setTimeout(() => {
    if (effectiveSessionId.value === sessionId && !chatStore.sessionUserMarkers.get(sessionId)) {
      chatStore.loadUserMessageMarkers(sessionId)
    }
  }, 0)
}, { immediate: true })

watch(
  () => displayNavMarkers.value.length,
  () => {
    if (!isFollowing.value || hasNavigated.value) return
    setNavIndexToLastMarker()
  },
  { flush: 'post' },
)

onUpdated(() => {
  if (renderMeasureStart === null) return
  const start = renderMeasureStart
  const sessionId = renderMeasureSessionId
  const messageCount = renderMeasureMessageCount
  renderMeasureStart = null
  requestAnimationFrame(() => {
    const rows = messageListContentRef.value?.querySelectorAll('.message-list-row[data-message-id]').length ?? 0
    console.info('[Perf][SessionRender][MessageList]', {
      sessionId,
      totalToFirstFrameMs: Math.round(performance.now() - start),
      messageCount,
      domRows: rows,
      scrollHeight: messageListRef.value?.scrollHeight ?? 0,
    })
  })
})

// Ensure nav markers are updated when user message count changes
// This handles the case where messages are loaded asynchronously after app restart
watch(
  () => userMessageIndices.value.length,
  (newLen, oldLen) => {
    if (newLen !== oldLen && newLen > 0) {
      nextTick(() => scheduleNavMarkerUpdate())
    }
  }
)

async function navigateToUserMessage(navIndex: number) {
  const marker = displayNavMarkers.value.find(item => item.navIndex === navIndex)
  if (marker) {
    const sessionId = effectiveSessionId.value
    hasNavigated.value = true
    isFollowing.value = false
    lockNavigationIndex(navIndex)
    if (getMessageRowById(marker.messageId)) {
      scrollToMessage(marker.messageId, {
        preserveNavigation: true,
        behavior: 'smooth',
        viewportOffsetRatio: NAV_VIEWPORT_OFFSET_RATIO,
        lockDurationMs: SCROLL_ANCHOR_LOCK_MS,
      })
      return
    }
    if (!sessionId) return
    // Set a guard to prevent the lastUserMessageId watcher (Fix D5)
    // from re-loading the tail page while we're doing a cross-page
    // navigation. Without this, the watcher sees the new message set,
    // detects hasMoreAfter=true, and calls loadInitialMessagePage
    // which overwrites the anchor window with the tail.
    isNavigatingCrossPage = true
    // Clear any residual tail/anchor mode before loading a new message
    // window — otherwise the coordinator will pull the viewport to the
    // bottom instead of the target message.
    scrollCoordinator.clear()
    const loaded = await chatStore.loadMessagesAround(sessionId, marker.messageId)
    if (loaded) {
      await nextTick()
      lockNavigationIndex(navIndex)
      // Use 'auto' (instant) scroll for cross-page jumps so that
      // scrollToMessage's non-smooth branch sets an anchor lock on the
      // target message, protecting it from layout-driven drift.
      scrollToMessage(marker.messageId, {
        preserveNavigation: true,
        behavior: 'auto',
        viewportOffsetRatio: NAV_VIEWPORT_OFFSET_RATIO,
        lockDurationMs: SCROLL_ANCHOR_LOCK_MS,
      })
    }
    // Schedule a reset of the guard — uses nextTick so any pending
    // watcher invocations that were queued during the navigation
    // still see isNavigatingCrossPage = true.
    nextTick(() => { isNavigatingCrossPage = false })
    return
  }

  if (navIndex < 0 || navIndex >= userMessageIndices.value.length) return
  hasNavigated.value = true
  isFollowing.value = false
  lockNavigationIndex(navIndex)
  scrollToUserMessage(navIndex)
}

function clearAssistantOutline() {
  assistantOutlineMarkers.value = []
  currentAssistantOutlineIndex.value = -1
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function getAssistantOutlineAnchor(marker: AssistantMessageOutlineMarker): HTMLElement | null {
  const row = getMessageRowById(marker.messageId)
  if (!row) return null
  return row.querySelector<HTMLElement>(
    `[${ASSISTANT_OUTLINE_ANCHOR_ATTR}="${escapeCssAttributeValue(marker.anchorId)}"]`,
  )
}

function getScrollerRelativeTop(target: HTMLElement, scroller: HTMLElement): number {
  const scrollerRect = scroller.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  return scroller.scrollTop + targetRect.top - scrollerRect.top
}

function areAssistantOutlinesEqual(
  previous: AssistantMessageOutlineMarker[],
  next: AssistantMessageOutlineMarker[],
): boolean {
  if (previous.length !== next.length) return false
  return previous.every((marker, index) => {
    const other = next[index]
    return marker.anchorId === other.anchorId &&
      marker.messageId === other.messageId &&
      marker.label === other.label &&
      marker.level === other.level &&
      marker.kind === other.kind
  })
}

function updateVisibleAssistantOutlineIndex() {
  if (isAssistantOutlineNavigating) return
  const scroller = messageListRef.value
  const markers = assistantOutlineMarkers.value
  if (!scroller || markers.length === 0) {
    currentAssistantOutlineIndex.value = -1
    return
  }

  const anchorY = scroller.scrollTop + scroller.clientHeight * 0.22
  let nextIndex = markers[0]?.navIndex ?? -1

  for (const marker of markers) {
    const target = getAssistantOutlineAnchor(marker)
    if (!target) continue
    const top = getScrollerRelativeTop(target, scroller)
    if (top <= anchorY + 1) {
      nextIndex = marker.navIndex
    } else {
      break
    }
  }

  currentAssistantOutlineIndex.value = nextIndex
}

function updateAssistantOutline() {
  const scroller = messageListRef.value
  if (!scroller || props.messages.length === 0) {
    clearAssistantOutline()
    return
  }

  const viewportTop = scroller.scrollTop
  const viewportBottom = viewportTop + scroller.clientHeight
  const viewportAnchor = viewportTop + scroller.clientHeight * 0.28
  let best: {
    messageId: string
    markers: AssistantMessageOutlineMarker[]
    score: number
  } | null = null

  for (const message of props.messages) {
    if (message.role !== 'assistant' || message.isStreaming) continue
    const row = getMessageRowById(message.id)
    if (!row) continue

    const rowTop = row.offsetTop
    const rowBottom = rowTop + row.offsetHeight
    if (rowBottom < viewportTop || rowTop > viewportBottom) continue

    const markers = buildAssistantMessageOutlineMarkers(message.id, row)
    if (!shouldShowAssistantMessageOutline(row, scroller, markers.length)) continue

    const visiblePx = Math.max(0, Math.min(rowBottom, viewportBottom) - Math.max(rowTop, viewportTop))
    const containsAnchor = rowTop <= viewportAnchor && rowBottom >= viewportAnchor
    const anchorDistance = containsAnchor
      ? 0
      : Math.min(Math.abs(rowTop - viewportAnchor), Math.abs(rowBottom - viewportAnchor))
    const score = (containsAnchor ? 1_000_000 : 0) + visiblePx - anchorDistance * 0.25

    if (!best || score > best.score) {
      best = {
        messageId: message.id,
        markers,
        score,
      }
    }
  }

  if (!best) {
    clearAssistantOutline()
    return
  }

  if (!areAssistantOutlinesEqual(assistantOutlineMarkers.value, best.markers)) {
    assistantOutlineMarkers.value = best.markers
  }
  updateVisibleAssistantOutlineIndex()
}

function scheduleAssistantOutlineUpdate() {
  if (deferLayoutMeasurementDuringTransition()) return
  if (assistantOutlineUpdateFrame !== null) {
    cancelAnimationFrame(assistantOutlineUpdateFrame)
  }
  assistantOutlineUpdateFrame = requestAnimationFrame(() => {
    assistantOutlineUpdateFrame = null
    updateAssistantOutline()
  })
}

async function navigateToAssistantOutline(navIndex: number) {
  const marker = assistantOutlineMarkers.value.find(item => item.navIndex === navIndex)
  const scroller = messageListRef.value
  if (!marker || !scroller) return

  await nextTick()
  const target = getAssistantOutlineAnchor(marker)
  if (!target) return

  isFollowing.value = false
  scrollCoordinator.clear()
  isAssistantOutlineNavigating = true
  currentAssistantOutlineIndex.value = navIndex

  if (assistantOutlineCooldownTimer) {
    clearTimeout(assistantOutlineCooldownTimer)
  }

  const targetTop = getScrollerRelativeTop(target, scroller)
  const viewportOffset = Math.round(scroller.clientHeight * NAV_VIEWPORT_OFFSET_RATIO)
  scrollCoordinator.writeScrollTop(targetTop - viewportOffset, { behavior: 'smooth' })

  assistantOutlineCooldownTimer = setTimeout(() => {
    isAssistantOutlineNavigating = false
    updateAssistantOutline()
  }, 700)
}

function lockNavigationIndex(navIndex: number) {
  isActivelyNavigating = true
  currentUserMessageNavIndex.value = navIndex
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }
  navigationCooldownTimer = setTimeout(() => {
    isActivelyNavigating = false
    updateVisibleUserMessageIndex()
  }, 2600)
}

// Scroll to a specific user message by nav index
function scrollToUserMessage(navIndex: number) {
  const messageIndex = userMessageIndices.value[navIndex]
  if (messageIndex === undefined) return

  lockNavigationIndex(navIndex)
  isFollowing.value = false
  const messageId = props.messages[messageIndex]?.id
  if (!messageId) return
  scrollToMessage(messageId, {
    preserveNavigation: true,
    behavior: 'smooth',
    viewportOffsetRatio: NAV_VIEWPORT_OFFSET_RATIO,
    lockDurationMs: SCROLL_ANCHOR_LOCK_MS,
  })
}

function formatNavTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function buildNavMarkerLabel(message: ChatMessage, navIndex: number): string {
  const total = userMessageIndices.value.length
  const snippet = buildNavMarkerPreview(message)
  return `${navIndex + 1}/${total} ${formatNavTime(message.timestamp)} - ${snippet}`
}

function buildNavMarkerPreview(message: ChatMessage): string {
  const rawContent = typeof message.content === 'string' ? message.content : ''
  const compact = rawContent.replace(/\s+/g, ' ').trim()
  return compact ? compact.slice(0, 36) : 'No text'
}

function updateNavMarkers() {
  if (userMessageIndices.value.length === 0) {
    navMarkers.value = []
    return
  }

  const total = userMessageIndices.value.length
  navMarkers.value = userMessageIndices.value.map((messageIndex, navIndex) => {
    const message = props.messages[messageIndex]
    return {
      navIndex,
      messageId: message?.id || `nav-${navIndex}`,
      seq: message?.seq,
      position: getEvenNavPosition(navIndex, total),
      label: message ? buildNavMarkerLabel(message, navIndex) : `${navIndex + 1}/${total}`,
      preview: message ? buildNavMarkerPreview(message) : `${navIndex + 1}/${total}`,
    }
  })
}

function getMessageRow(messageIndex: number): HTMLElement | null {
  return messageListContentRef.value?.querySelector<HTMLElement>(`[data-index="${messageIndex}"]`) ?? null
}

function getMessageRowById(messageId: string): HTMLElement | null {
  return messageListContentRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`) ?? null
}

function getMessageSeq(message: ChatMessage | undefined): number | null {
  const seq = message?.seq
  return typeof seq === 'number' && Number.isFinite(seq) ? seq : null
}

function getMarkerIndexForMessage(message: ChatMessage | undefined): number {
  if (!message) return -1

  const exactIndex = displayNavMarkers.value.findIndex(marker => marker.messageId === message.id)
  if (exactIndex >= 0) return exactIndex

  const seq = getMessageSeq(message)
  if (seq === null) return -1

  let markerIndex = -1
  for (let i = 0; i < displayNavMarkers.value.length; i++) {
    const markerSeq = displayNavMarkers.value[i].seq
    if (typeof markerSeq !== 'number') continue
    if (markerSeq <= seq) markerIndex = i
    else break
  }
  return markerIndex
}

function captureTopAnchor(): TopAnchor | null {
  const scroller = messageListRef.value
  const content = messageListContentRef.value
  if (!scroller || !content) return null

  const rows = Array.from(content.querySelectorAll<HTMLElement>('[data-message-id]'))
  const viewportTop = scroller.scrollTop
  const row = rows.find(candidate => candidate.offsetTop + candidate.offsetHeight > viewportTop)
  if (!row) return null

  const messageId = row.dataset.messageId
  if (!messageId) return null

  return {
    messageId,
    offsetWithinMessage: viewportTop - row.offsetTop,
  }
}

function restoreTopAnchor(anchor: TopAnchor | null) {
  if (!anchor) return
  const scroller = messageListRef.value
  const row = getMessageRowById(anchor.messageId)
  if (!scroller || !row) return
  scrollCoordinator.writeScrollTop(row.offsetTop + anchor.offsetWithinMessage)
}

const HISTORY_AUTO_LOAD_THRESHOLD_RATIO = 1.75

function getAutoLoadThreshold(el: HTMLElement): number {
  // Use clientHeight-based threshold so it scales with viewport size
  // and large messages don't require pixel-perfect top-edge hugging.
  return Math.round(el.clientHeight * HISTORY_AUTO_LOAD_THRESHOLD_RATIO)
}

async function loadOlderHistoryIfNeeded(force = false) {
  const sessionId = effectiveSessionId.value
  const scroller = messageListRef.value
  const state = pageState.value
  if (follow.isSwitching()) return
  if (!sessionId || !scroller || !state?.hasMoreBefore || state.isLoadingOlder || isPrependingHistory) return
  if (!force && scroller.scrollTop > getAutoLoadThreshold(scroller)) return

  const anchor = captureTopAnchor()
  // Clear tail/anchor mode before prepend — the user has scrolled to the
  // top to load history, so pinning to bottom or a stale anchor is wrong.
  // Restore position is handled by restoreTopAnchor below.
  scrollCoordinator.clear()
  isPrependingHistory = true
  const wasFollowing = isFollowing.value
  try {
    const loaded = await chatStore.loadOlderMessages(sessionId)
    if (loaded) {
      await nextTick()
      restoreTopAnchor(anchor)
      scheduleMeasurementRefresh()
      scheduleNavMarkerUpdate()
      scheduleAssistantOutlineUpdate()
      scheduleVisibleUserMessageIndexUpdate()
    }
  } finally {
    isFollowing.value = wasFollowing
    isPrependingHistory = false
    updateScrollToBottomButton()
  }
}

async function loadNewerHistoryIfNeeded() {
  const sessionId = effectiveSessionId.value
  const scroller = messageListRef.value
  const state = pageState.value
  if (follow.isSwitching()) return
  if (!sessionId || !scroller || !state?.hasMoreAfter || state.isLoadingOlder || isLoadingNewerHistory) return
  
  const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  if (distanceToBottom > getAutoLoadThreshold(scroller)) return
  
  isLoadingNewerHistory = true
  try {
    const loaded = await chatStore.loadNewerMessages(sessionId)
    if (loaded) {
      await nextTick()
      scheduleMeasurementRefresh()
      scheduleNavMarkerUpdate()
      scheduleAssistantOutlineUpdate()
      scheduleVisibleUserMessageIndexUpdate()
    }
  } finally {
    isLoadingNewerHistory = false
    updateScrollToBottomButton()
  }
}

async function scrollToMessage(
  messageId: string,
  options: {
    preserveNavigation?: boolean
    behavior?: MessageScrollBehavior
    viewportOffsetRatio?: number
    lockDurationMs?: number
  } = {},
) {
  const messageIndex = props.messages.findIndex(message => message.id === messageId)
  if (messageIndex === -1) return false

  if (!options.preserveNavigation) {
    hasNavigated.value = false
  }
  isFollowing.value = false
  searchHighlightedMessageId.value = messageId

  await nextTick()
  const row = getMessageRowById(messageId) || getMessageRow(messageIndex)
  const scroller = messageListRef.value
  const behavior = options.behavior ?? 'smooth'
  if (row && scroller && typeof options.viewportOffsetRatio === 'number') {
    const offsetWithinMessage = -Math.round(scroller.clientHeight * options.viewportOffsetRatio)
    scrollCoordinator.writeScrollTop(row.offsetTop + offsetWithinMessage, { behavior })
    if (behavior !== 'smooth') {
      scrollCoordinator.setAnchor(messageId, offsetWithinMessage, options.lockDurationMs)
    }
  } else if (row && scroller) {
    const offsetWithinMessage = -Math.round((scroller.clientHeight - row.offsetHeight) / 2)
    scrollCoordinator.writeScrollTop(row.offsetTop + offsetWithinMessage, { behavior })
    if (behavior !== 'smooth') {
      scrollCoordinator.setAnchor(messageId, offsetWithinMessage, options.lockDurationMs)
    }
  }

  if (searchHighlightTimer) clearTimeout(searchHighlightTimer)
  searchHighlightTimer = setTimeout(() => {
    if (searchHighlightedMessageId.value === messageId) {
      searchHighlightedMessageId.value = null
    }
  }, 2600)

  return true
}

function getFallbackNavPosition(messageIndex: number): number {
  const denominator = Math.max(props.messages.length - 1, 1)
  return Math.min(0.98, Math.max(0.02, messageIndex / denominator))
}

function getEvenNavPosition(navIndex: number, total: number): number {
  if (total <= 1) return 0.5
  return (navIndex + 1) / (total + 1)
}

function setNavIndexToLastMarker() {
  currentUserMessageNavIndex.value = displayNavMarkers.value.length > 0
    ? displayNavMarkers.value.length - 1
    : -1
}

function setNavIndexToFirstMarker() {
  currentUserMessageNavIndex.value = displayNavMarkers.value.length > 0 ? 0 : -1
}

function setNavIndexToMessage(messageId: string | undefined) {
  if (!messageId) {
    setNavIndexToLastMarker()
    return
  }
  const index = displayNavMarkers.value.findIndex(marker => marker.messageId === messageId)
  currentUserMessageNavIndex.value = index >= 0 ? index : currentUserMessageNavIndex.value
}

function scheduleNavMarkerUpdate() {
  // Cancel any pending update and reschedule to ensure we use latest data
  // This fixes the issue where session switching could cause markers to disappear
  // due to RAF executing before messages are fully loaded
  if (navMarkerUpdateFrame !== null) {
    cancelAnimationFrame(navMarkerUpdateFrame)
  }
  navMarkerUpdateFrame = requestAnimationFrame(() => {
    navMarkerUpdateFrame = null
    updateNavMarkers()
  })
}

function scheduleScrollStateUpdate() {
  if (followNudgeFrame !== null) return
  followNudgeFrame = requestAnimationFrame(() => {
    followNudgeFrame = null
    updateScrollToBottomButton()
  })
}

function refreshUserMessageMeasurements() {
  const content = messageListContentRef.value
  if (!content || userMessageIndices.value.length === 0) {
    userMessageMeasurements = []
    return
  }

  userMessageMeasurements = userMessageIndices.value
    .map(messageIndex => {
      const message = props.messages[messageIndex]
      if (!message?.id) return null
      const row = getMessageRowById(message.id) || getMessageRow(messageIndex)
      if (!row) return null
      return {
        messageIndex,
        messageId: message.id,
        start: row.offsetTop,
      }
    })
    .filter((item): item is { messageIndex: number; messageId: string; start: number } => item !== null)
}

function scheduleMeasurementRefresh() {
  if (deferLayoutMeasurementDuringTransition()) return
  if (measurementRefreshFrame !== null) return
  measurementRefreshFrame = requestAnimationFrame(() => {
    measurementRefreshFrame = null
    refreshUserMessageMeasurements()
    scheduleVisibleUserMessageIndexUpdate()
  })
}

function scheduleVisibleUserMessageIndexUpdate() {
  if (deferLayoutMeasurementDuringTransition()) return
  if (visibleUserMessageFrame !== null) return
  visibleUserMessageFrame = requestAnimationFrame(() => {
    visibleUserMessageFrame = null
    updateVisibleUserMessageIndex()
  })
}

// Check if current session can create branches (only root sessions can)
const canCreateBranch = computed(() => {
  const currentSession = panelSession.value
  if (!currentSession) return false
  // Only allow branching from root sessions (no parent)
  return !currentSession.parentSessionId
})

// Compute branches for each message
// Returns a map of messageId -> branches created from that message
const messageBranches = computed(() => {
  const branchMap = new Map<string, BranchInfo[]>()
  const currentSession = panelSession.value
  if (!currentSession) return branchMap

  // Find all sessions that branched from the current session
  for (const session of sessionsStore.sessions) {
    if (session.parentSessionId === currentSession.id && session.branchFromMessageId) {
      const branches = branchMap.get(session.branchFromMessageId) || []
      branches.push({
        id: session.id,
        name: session.name
      })
      branchMap.set(session.branchFromMessageId, branches)
    }
  }

  return branchMap
})

// Get branches for a specific message
function getBranchesForMessage(messageId: string): BranchInfo[] {
  return messageBranches.value.get(messageId) ?? EMPTY_BRANCHES
}

// Find which user message is currently most visible in the viewport
function updateVisibleUserMessageIndex(options: { allowAnchored?: boolean } = {}) {
  if (isActivelyNavigating) return
  if (!options.allowAnchored && scrollCoordinator.isAnchored()) return
  if (props.messages.length === 0) return

  const el = messageListRef.value
  if (!el) return

  if (el.scrollTop <= 24) {
    setNavIndexToFirstMarker()
    return
  }

  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceToBottom < 96 || isFollowing.value) {
    setNavIndexToLastMarker()
    return
  }

  // A chat node represents a user turn, so assistant content belongs to the
  // most recent user message above the viewport anchor.
  const viewportAnchor = el.scrollTop + el.clientHeight * 0.18

  let activeMessageIndex = 0
  const measurements = userMessageMeasurements
  if (measurements.length > 0) {
    for (const measurement of measurements) {
      if (measurement.start <= viewportAnchor) activeMessageIndex = measurement.messageIndex
      else break
    }
  } else {
    for (const msgIdx of userMessageIndices.value) {
      const start = getFallbackNavPosition(msgIdx) * Math.max(1, el.scrollHeight)

      if (start <= viewportAnchor) activeMessageIndex = msgIdx
      else break
    }
  }

  const activeMessage = props.messages[activeMessageIndex]
  const markerIndex = getMarkerIndexForMessage(activeMessage)
  if (markerIndex >= 0) {
    currentUserMessageNavIndex.value = markerIndex
  }
}

function handleScroll() {
  follow.checkReattach()
  const el = messageListRef.value
  if (el) {
    // Detect user-initiated scrolls that bypass wheel/pointerdown
    // (custom scrollbar thumb drag, PageUp/Home, keyboard scroll, etc.)
    scrollCoordinator.detectExternalScroll(el)
    
    const isAtTail = el.scrollHeight - el.scrollTop - el.clientHeight <= 2
    // Only set tail mode when at the true end of the conversation,
    // not at the bottom of a partial window (hasMoreAfter=true).
    // Otherwise tail mode would snap the viewport to the window's
    // bottom on every content-height change, creating a cascade
    // that flings the user to the real bottom.
    const isRealTail = !pageState.value?.hasMoreAfter
    if (isAtTail && isRealTail && !scrollCoordinator.isAnchored() && (hasActiveStream.value ? isFollowing.value : true)) {
      scrollCoordinator.setTail()
    }
  }
  updateScrollToBottomButton()
  scheduleNavMarkerUpdate()
  scheduleAssistantOutlineUpdate()
  scheduleVisibleUserMessageIndexUpdate()
  loadOlderHistoryIfNeeded()
  loadNewerHistoryIfNeeded()
}

function handleWheel(event: WheelEvent) {
  scrollCoordinator.clear()
  follow.onWheel(event)
}

function handlePointerDown() {
  scrollCoordinator.clear()
}

// Track permission request cleanup function

// Get the first actionable permission request. `requiresConfirmation` alone is
// not enough: it is persisted engine history, while an approval is only
// answerable when the live permission manager has an emitted prompt for it —
// which is what `canRespond` (set from permission events / pending seed)
// tracks. Gating on both keeps dead approval cards from rendering after a
// restart or for queued followers.
const currentPendingPermission = computed<{ message: ChatMessage; toolCall: ToolCall } | null>(() => {
  for (const message of props.messages) {
    const pendingToolCall = message.toolCalls?.find(tc => tc.requiresConfirmation && tc.canRespond)
    if (pendingToolCall) {
      return { message, toolCall: pendingToolCall }
    }
  }
  return null
})

// Setup keyboard shortcuts for permission confirmation
// Enter = allow current tool, D/Escape = reject
usePermissionShortcuts(
  () => !!currentPendingPermission.value && !showRejectDialog.value,
  {
    onAllow: () => {
      const pending = currentPendingPermission.value
      if (pending) {
        handleConfirmTool(pending.toolCall, 'once')
      }
    },
    onReject: () => {
      const pending = currentPendingPermission.value
      if (pending) {
        openRejectDialog(pending.toolCall)
      }
    },
  }
)

// handlePermissionRequest is now in the chat store (called by IPC Hub)
// The store's handlePermissionRequest() updates messages reactively.

async function scrollToBottomFromButton() {
  const sessionId = effectiveSessionId.value
  setNavIndexToLastMarker()
  follow.isFollowing.value = true
  
  // If we're viewing a truncated window, reload from the tail so the
  // user sees actual latest messages instead of a partial window.
  if (sessionId && pageState.value?.hasMoreAfter) {
    scrollCoordinator.clear()
    await chatStore.loadInitialMessagePage(sessionId)
    await nextTick()
  }
  
  scrollCoordinator.setTail({ behavior: 'smooth' })
}

let attachedMessageListElement: HTMLElement | null = null

function syncMessageListScroller() {
  const scroller = messageScrollbarRef.value?.getScrollElement() ?? null
  messageListRef.value = scroller
  return scroller
}

function attachMessageListListeners() {
  const scroller = syncMessageListScroller()
  if (!scroller || attachedMessageListElement === scroller) return

  detachMessageListListeners()
  attachedMessageListElement = scroller
  scroller.addEventListener('scroll', handleScroll)
  scroller.addEventListener('wheel', handleWheel, { passive: false })
  scroller.addEventListener('pointerdown', handlePointerDown)

  if (typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(() => {
      if (deferLayoutMeasurementDuringTransition()) return
      scheduleNavMarkerUpdate()
      scheduleNavPanelRoomUpdate()
      scheduleAssistantOutlineUpdate()
      scheduleMeasurementRefresh()
    })
    navResizeObserver.observe(scroller)
  }
}

function detachMessageListListeners() {
  if (!attachedMessageListElement) return

  attachedMessageListElement.removeEventListener('scroll', handleScroll)
  attachedMessageListElement.removeEventListener('wheel', handleWheel)
  attachedMessageListElement.removeEventListener('pointerdown', handlePointerDown)
  attachedMessageListElement = null
  navResizeObserver?.disconnect()
  navResizeObserver = null
}

// Setup event listeners
onMounted(() => {
  document.addEventListener('click', handleSelectionDocumentClick)
  document.addEventListener('selectionchange', handleSelectionChange)
  nextTick(() => {
    attachMessageListListeners()

    // Scroll to bottom on initial mount (messages may be pre-loaded in store)
    const snapshot = effectiveSessionId.value ? chatStore.getSnapshot(effectiveSessionId.value) : null
    if (props.messages.length > 0 && messageListRef.value && snapshot?.mode !== 'anchor') {
      scrollCoordinator.setTail()
    }
    scheduleNavMarkerUpdate()
    scheduleNavPanelRoomUpdate()
    scheduleAssistantOutlineUpdate()
    scheduleMeasurementRefresh()
  })
})

watch(
  () => props.layoutTransitioning,
  (isTransitioning, wasTransitioning) => {
    if (isTransitioning) {
      cancelPendingLayoutMeasurementFrames()
      deferredLayoutMeasurementRefresh = true
      if (deferredLayoutMeasurementTimer) {
        clearTimeout(deferredLayoutMeasurementTimer)
        deferredLayoutMeasurementTimer = null
      }
      if (deferredLayoutMeasurementFollowupTimer) {
        clearTimeout(deferredLayoutMeasurementFollowupTimer)
        deferredLayoutMeasurementFollowupTimer = null
      }
      return
    }

    if (!wasTransitioning || !deferredLayoutMeasurementRefresh) return
    deferredLayoutMeasurementRefresh = false
    if (deferredLayoutMeasurementTimer) {
      clearTimeout(deferredLayoutMeasurementTimer)
    }
    deferredLayoutMeasurementTimer = setTimeout(() => {
      deferredLayoutMeasurementTimer = null
      requestAnimationFrame(() => {
        scheduleNavMarkerUpdate()
        updateScrollToBottomButton()
        if (deferredLayoutMeasurementFollowupTimer) {
          clearTimeout(deferredLayoutMeasurementFollowupTimer)
        }
        deferredLayoutMeasurementFollowupTimer = setTimeout(() => {
          deferredLayoutMeasurementFollowupTimer = null
          if (props.layoutTransitioning) {
            deferredLayoutMeasurementRefresh = true
            return
          }
          requestAnimationFrame(() => {
            scheduleNavPanelRoomUpdate()
            scheduleAssistantOutlineUpdate()
            scheduleMeasurementRefresh()
            if (!scrollCoordinator.isAnchored()) {
              scheduleVisibleUserMessageIndexUpdate()
            }
          })
        }, 80)
      })
    }, 700)
  },
)

onUnmounted(() => {
  document.removeEventListener('click', handleSelectionDocumentClick)
  document.removeEventListener('selectionchange', handleSelectionChange)
  if (deferredLayoutMeasurementTimer) {
    clearTimeout(deferredLayoutMeasurementTimer)
    deferredLayoutMeasurementTimer = null
  }
  if (deferredLayoutMeasurementFollowupTimer) {
    clearTimeout(deferredLayoutMeasurementFollowupTimer)
    deferredLayoutMeasurementFollowupTimer = null
  }
  detachMessageListListeners()
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }
  if (searchHighlightTimer) {
    clearTimeout(searchHighlightTimer)
    searchHighlightTimer = null
  }
  cancelPendingLayoutMeasurementFrames()
  if (followNudgeFrame !== null) {
    cancelAnimationFrame(followNudgeFrame)
    followNudgeFrame = null
  }
  if (assistantOutlineCooldownTimer) {
    clearTimeout(assistantOutlineCooldownTimer)
    assistantOutlineCooldownTimer = null
  }
  scrollCoordinator.clear()
  if (navResizeObserver) {
    navResizeObserver.disconnect()
    navResizeObserver = null
  }
  if (navContentResizeObserver) {
    navContentResizeObserver.disconnect()
    navContentResizeObserver = null
  }
})


// When session changes, reload any pending permission requests
// This fixes the issue where permission requests are "lost" after switching sessions
// Watch both sessionId AND messages.length to ensure messages are loaded before restoring permissions
watch(
  [effectiveSessionId, () => props.messages.length],
  async ([newSessionId, msgCount], [oldSessionId, oldMsgCount]) => {
    if (!newSessionId) return

    // Only restore permissions when:
    // 1. Session changed AND has messages
    // 2. Messages just loaded (went from 0 to non-0)
    const sessionChanged = newSessionId !== oldSessionId
    const messagesJustLoaded = oldMsgCount === 0 && msgCount > 0

    if (!sessionChanged && !messagesJustLoaded) return
    if (msgCount === 0) return  // Messages not loaded yet, wait

    try {
      const response = await platformApi.getPendingPermissions(newSessionId)
      if (response.success && response.pending && response.pending.length > 0) {
        console.log('[Frontend] Loading pending permissions for session:', newSessionId, response.pending.length)
        // Apply each pending permission to the UI via the store. Queued
        // prompts (waiting behind the session's serialized prompt queue, or
        // coalesced followers) get a waiting state, not a respond card.
        for (const info of response.pending) {
          if (info.promptState === 'queued') {
            if (info.callId) {
              chatStore.handlePermissionQueued({
                sessionId: info.sessionId,
                requestId: info.id,
                messageId: info.messageId,
                toolCallId: info.callId,
              })
            }
            continue
          }
          chatStore.handlePermissionRequest({
            sessionId: info.sessionId,
            requestId: info.id,
            messageId: info.messageId,
            callId: info.callId,
            permissionType: info.type,
            title: info.title,
            pattern: info.pattern,
            metadata: info.metadata,
            canRespond: (info.targetChannel || 'ipc') === 'ipc',
          })
        }
      }
    } catch (error) {
      console.error('[Frontend] Failed to load pending permissions:', error)
    }
  },
  { immediate: true }
)

// Nav marker update on density/font changes
watch(
  [messageListDensity, customLineHeight, chatFontSize],
  () => {
    nextTick(() => {
      scheduleNavMarkerUpdate()
      scheduleAssistantOutlineUpdate()
    })
  }
)

// --- Long-tail chat font preload ---
// Phase C covers the high-frequency CJK sample at startup, but historical
// messages with rare characters hit woff2 subsets that weren't preloaded.
// This watcher fires once per session-load and triggers document.fonts.load()
// with the actual visible message text, shrinking the swap window for those
// remaining subsets. We don't gate rendering — deferred swap for rare chars
// is acceptable and hiding text would introduce perceptible first-paint delay.

/** Track which session we've already preloaded, so we only fire once per load */
const fontPreloadSessionId = ref<string | null>(null)

/** Extract up to `maxChars` unique non-ASCII characters from the given messages */
function extractCjkSample(messages: ChatMessage[], maxChars = 300): string {
  const seen = new Set<string>()
  const chars: string[] = []
  for (const msg of messages) {
    const text = typeof msg.content === 'string' ? msg.content : ''
    for (const ch of text) {
      if (chars.length >= maxChars) break
      // Skip ASCII (unicode <= 0x7F) — those glyphs are always in the Latin subset
      if (ch.charCodeAt(0) <= 0x7f) continue
      if (seen.has(ch)) continue
      seen.add(ch)
      chars.push(ch)
    }
    if (chars.length >= maxChars) break
  }
  return chars.join('')
}

watch(
  [effectiveSessionId, () => props.messages.length],
  ([sessionId, msgCount]) => {
    if (!sessionId || msgCount === 0) return
    if (fontPreloadSessionId.value === sessionId) return
    if (typeof document === 'undefined' || !document.fonts) return
    fontPreloadSessionId.value = sessionId

    // Use last N messages (visible range) instead of all to stay cheap
    const visibleCount = Math.min(msgCount, 20)
    const visibleMessages = props.messages.slice(-visibleCount)
    const sample = extractCjkSample(visibleMessages)
    if (!sample) return

    const specs = buildFontLoadSpecs(chatFontEn.value, chatFontZh.value)
    for (const { spec } of specs) {
      document.fonts.load(spec, sample).catch(() => null)
    }
  },
  { immediate: true },
)


// Handle edit message event - emit to parent for immediate stop button response
function handleEdit(messageId: string, newContent: string) {
  emit('editAndResend', messageId, newContent)
}

// Handle branch creation event
async function handleBranch(messageId: string, quotedText?: string) {
  const currentSession = panelSession.value
  if (!currentSession) return

  // Create the branch
  const branchSession = await sessionsStore.createBranch(currentSession.id, messageId)

  if (branchSession) {
    // Check setting for split screen behavior
    const splitEnabled = settingsStore.settings.chat?.branchOpenInSplitScreen ?? true
    if (splitEnabled) {
      // Emit event to open branch in split view
      emit('splitWithBranch', branchSession.id)
    } else {
      // Just switch to the branch session
      await sessionsStore.switchSession(branchSession.id)
    }
  }

  // If we have quoted text, we need to pass it to InputBox
  // We'll emit this to the parent so it can handle setting the quoted text
  if (quotedText) {
    emit('setQuotedText', quotedText)
  }
}

// Handle go to branch event
async function handleGoToBranch(sessionId: string) {
  await sessionsStore.switchSession(sessionId)
}

// Handle quote text event
function handleQuote(quotedText: string) {
  emit('setQuotedText', quotedText)
}

// ============ Selection toolbar (single instance for the list) ============
const selectionToolbarVisible = ref(false)
const selectionToolbarText = ref('')
const selectionToolbarPosition = ref({ top: 0, left: 0 })
const selectionMessageId = ref<string | null>(null)

function handleTextSelection(messageId: string, text: string, position: { top: number; left: number }) {
  selectionMessageId.value = messageId
  selectionToolbarText.value = text
  selectionToolbarPosition.value = position
  selectionToolbarVisible.value = true
}

function hideSelectionToolbar() {
  selectionToolbarVisible.value = false
}

function handleSelectionQuote(text: string) {
  handleQuote(text)
  hideSelectionToolbar()
}

async function handleSelectionBranch(text: string) {
  if (!canCreateBranch.value || !selectionMessageId.value) return
  hideSelectionToolbar()
  await handleBranch(selectionMessageId.value, text)
}

// Close the toolbar when clicking outside of it
function handleSelectionDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.selection-toolbar')) {
    hideSelectionToolbar()
  }
}

// Hide the toolbar when the selection is cleared
function handleSelectionChange() {
  if (!selectionToolbarVisible.value) return
  const text = window.getSelection()?.toString().trim()
  if (!text) {
    hideSelectionToolbar()
  }
}

function handleRegenerate(messageId: string) {
  emit('regenerate', messageId)
}

function handleSuggestion(text: string) {
  emit('setInputText', text)
}

// Handle tool execution
async function handleExecuteTool(toolCall: ExecutableToolCall) {
  const currentSession = panelSession.value
  if (!currentSession) return

  // Find the message containing this tool call
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )
  const tc = message?.toolCalls?.find(t => t.id === toolCall.id)

  // Record start time
  const startTime = Date.now()
  if (!platformApi.capabilities.shellTools) {
    const error = 'Tool execution is not available in this host.'
    const endTime = Date.now()
    if (tc) {
      tc.endTime = endTime
      tc.status = 'failed'
      tc.error = error
    }
    if (message) {
      await platformApi.updateToolCall(currentSession.id, message.id, toolCall.id, {
        status: 'failed',
        startTime,
        endTime,
        error,
      })
    }
    return
  }

  if (tc) {
    tc.status = 'executing'
    tc.startTime = startTime
  }

  try {
    // Deep clone to unwrap all Vue reactive proxies - IPC cannot serialize Proxy objects
    const rawArguments = JSON.parse(JSON.stringify(toRaw(toolCall.arguments) || {}))
    const result = await platformApi.executeTool(
      toolCall.toolId,
      rawArguments,
      toolCall.id,
      currentSession.id
    )

    // Record end time and update status
    const endTime = Date.now()
    if (tc) {
      tc.endTime = endTime
      tc.status = result.success ? 'completed' : 'failed'
      tc.result = result.result
      tc.error = result.error
    }

    // Persist to backend
    if (message) {
      await platformApi.updateToolCall(currentSession.id, message.id, toolCall.id, {
        status: result.success ? 'completed' : 'failed',
        startTime,
        endTime,
        result: result.result,
        error: result.error,
      })
    }
  } catch (error) {
    console.error('Failed to execute tool:', error)
    const endTime = Date.now()
    if (tc) {
      tc.endTime = endTime
      tc.status = 'failed'
      tc.error = String(error)
    }

    // Persist to backend
    if (message) {
      await platformApi.updateToolCall(currentSession.id, message.id, toolCall.id, {
        status: 'failed',
        startTime,
        endTime,
        error: String(error),
      })
    }
  }
}

// Handle tool confirmation (for permission-gated tool calls)
type PermissionResponse = 'once' | 'session' | 'workdir'

async function handleConfirmTool(toolCall: PermissionToolCall, response: PermissionResponse = 'once') {
  const currentSession = panelSession.value
  if (!currentSession) return

  // Find the message containing this tool call
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )
  const tc = message?.toolCalls?.find(t => t.id === toolCall.id)

  // Find and update the corresponding step
  const step = message?.steps?.find(s => s.toolCallId === toolCall.id)

  if (!toolCall.canRespond) {
    console.warn('[Frontend] Permission response ignored: no live prompt for tool call', toolCall.id)
    return
  }

  // Use unified command channel to respond (EventBus → Permission validates
  // channel). The tool call id is the durable correlation key — the manager
  // resolves it to the pending prompt; requestId is a hint when we caught it.
  console.log(`[Frontend] Responding to permission for tool call ${toolCall.id} with ${response}`)
  try {
    await platformApi.emitCommand(currentSession.id, {
      type: 'command:permission-respond',
      requestId: toolCall.permissionId,
      toolCallId: toolCall.id,
      decision: response,
    })
    // The backend will handle execution and resume - just update UI state
    if (tc) {
      tc.status = 'executing'
      tc.requiresConfirmation = false
    }
    if (step) {
      step.status = 'running'
      if (message?.steps) {
        message.steps = [...message.steps]
      }
    }
  } catch (error) {
    console.error('Failed to respond to permission:', error)
  }
}

// Open the reject reason dialog
function openRejectDialog(toolCall: PermissionToolCall) {
  pendingRejectToolCall.value = toolCall
  rejectReason.value = ''
  showRejectDialog.value = true
  // Focus the textarea after dialog opens
  nextTick(() => {
    rejectReasonInputRef.value?.focus()
  })
}

// Confirm rejection with reason
function confirmReject() {
  if (pendingRejectToolCall.value) {
    handleRejectTool(pendingRejectToolCall.value, rejectReason.value.trim() || undefined)
  }
  cancelReject()
}

// Cancel the reject dialog
function cancelReject() {
  showRejectDialog.value = false
  rejectReason.value = ''
  pendingRejectToolCall.value = null
}

// Handle tool rejection with optional reason
async function handleRejectTool(toolCall: PermissionToolCall, rejectReasonArg?: string) {
  // Update the tool call status to cancelled/rejected
  const currentSession = panelSession.value
  if (!currentSession) return

  // Find the message containing this tool call and update its status
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )

  // Only send when the live permission manager has an emitted prompt; the
  // local UI cleanup below still runs either way.
  if (toolCall.canRespond) {
    // Use unified command channel to reject (EventBus → Permission validates channel)
    console.log(`[Frontend] Rejecting permission for tool call ${toolCall.id}`, rejectReasonArg ? `Reason: ${rejectReasonArg}` : '')
    try {
      await platformApi.emitCommand(currentSession.id, {
        type: 'command:permission-respond',
        requestId: toolCall.permissionId,
        toolCallId: toolCall.id,
        decision: 'reject',
        rejectReason: rejectReasonArg,
      })
    } catch (error) {
      console.error('Failed to respond to permission:', error)
    }
  }

  if (message) {
    const rejectionMessage = rejectReasonArg
      ? `The user rejected permission for this tool. Reason: ${rejectReasonArg}`
      : 'The user rejected permission for this tool.'
    const tc = message.toolCalls?.find(t => t.id === toolCall.id)
    if (tc) {
      tc.status = 'failed'
      tc.error = rejectionMessage
      tc.rejected = true
      tc.rejectionReason = rejectReasonArg
      tc.requiresConfirmation = false
    }

    // Update the corresponding step (step-own fields only; step.toolCall is
    // the same reference as tc above, so its fields are already updated).
    const step = message.steps?.find(s => s.toolCallId === toolCall.id)
    if (step) {
      step.status = 'failed'
      step.error = rejectionMessage
      step.rejected = true
      step.rejectionReason = rejectReasonArg
      // Force reactivity
      if (message.steps) {
        message.steps = [...message.steps]
      }
    }
  }
}

// Handle updating thinking time for a message
async function handleUpdateThinkingTime(messageId: string, thinkingTime: number) {
  const currentSession = panelSession.value
  if (!currentSession) return

  try {
    // Update local message
    const message = props.messages.find(m => m.id === messageId)
    if (message) {
      message.thinkingTime = thinkingTime
    }

    // Persist to backend
    await platformApi.updateMessageThinkingTime(currentSession.id, messageId, thinkingTime)
  } catch (error) {
    console.error('Failed to update thinking time:', error)
  }
}

// ============ Snapshot API for session switching ============

function finishSessionSwitchFromViewport() {
  follow.finishSwitch()
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = messageListRef.value
      if (!el) return
      isFollowing.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 2
      scheduleMeasurementRefresh()
      scheduleVisibleUserMessageIndexUpdate()
      scheduleNavMarkerUpdate()
      scheduleAssistantOutlineUpdate()
      updateScrollToBottomButton()
    })
  })
}

defineExpose({
  confirmTool: (toolCall: ToolCall, response: PermissionResponse = 'once') => handleConfirmTool(toolCall, response),
  rejectTool: (toolCall: ToolCall, reason?: string) => {
    if (reason) {
      void handleRejectTool(toolCall, reason)
    } else {
      openRejectDialog(toolCall)
    }
  },
  getIsFollowing: () => follow.isFollowing.value,
  getDistanceToBottom: () => {
    const el = messageListRef.value
    if (!el) return 0
    return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)
  },
  getHasNavigated: () => hasNavigated.value,
  getAnchorMessageId: () => captureTopAnchor()?.messageId ?? null,
  getAnchorOffset: () => captureTopAnchor()?.offsetWithinMessage ?? 0,
  getNavMessageId: () => displayNavMarkers.value[currentUserMessageNavIndex.value]?.messageId ?? null,
  notifyLayoutChange: () => {
    scheduleFollowNudge('composer-resize')
    updateScrollToBottomButton()
  },

  prepareForSwitch: () => {
    scrollCoordinator.clear()
    follow.prepareForSwitch()
  },

  finishSwitch: finishSessionSwitchFromViewport,

  restoreTail: () => {
    scrollCoordinator.clear()
    hasNavigated.value = false
    setNavIndexToLastMarker()
    follow.isFollowing.value = true
    scrollCoordinator.setTail()
    follow.finishSwitch()
    updateScrollToBottomButton()
  },

  restoreAnchor: (snap: {
    anchorMessageId?: string
    offsetWithinMessage?: number
    navMessageId?: string
    hasNavigated: boolean
  }) => {
    hasNavigated.value = snap.hasNavigated
    setNavIndexToMessage(snap.navMessageId)
    follow.isFollowing.value = false
    const restoreSessionId = effectiveSessionId.value

    const applyAnchor = () => {
      if (!restoreSessionId || effectiveSessionId.value !== restoreSessionId) {
        follow.finishSwitch()
        return true
      }
      const row = snap.anchorMessageId ? getMessageRowById(snap.anchorMessageId) : null
      if (!row || !messageListRef.value) return false

      const offsetWithinMessage = Math.max(0, snap.offsetWithinMessage ?? 0)
      scrollCoordinator.writeScrollTop(row.offsetTop + offsetWithinMessage)
      refreshUserMessageMeasurements()
      updateVisibleUserMessageIndex({ allowAnchored: true })
      if (snap.anchorMessageId) {
        scrollCoordinator.setAnchor(snap.anchorMessageId, offsetWithinMessage, SESSION_RESTORE_ANCHOR_LOCK_MS)
      }
      follow.finishSwitch()
      updateScrollToBottomButton()
      return true
    }

    if (applyAnchor()) return

    nextTick(async () => {
      if (!applyAnchor()) {
        scrollCoordinator.clear()
        hasNavigated.value = false
        setNavIndexToLastMarker()
        follow.isFollowing.value = true
        scrollCoordinator.setTail()
        follow.finishSwitch()
        updateScrollToBottomButton()
      }
    })
  },

  scrollToBottom: () => {
    setNavIndexToLastMarker()
    follow.isFollowing.value = true
    scrollCoordinator.setTail({ behavior: 'smooth' })
  },

  scrollToMessage,
})
</script>

<style scoped>
.message-list-wrapper {
  --chat-scroll-safe-gap: var(
    --chat-composer-safe-gap,
    max(calc(var(--content-spacing-px, 8px) * 3), calc(var(--message-line-height-px, 20px) * 1.25))
  );
  --chat-scroll-tail-reserve: var(--chat-scroll-safe-gap);
  --chat-scroll-top-reserve: max(
    calc(var(--content-spacing-px, 8px) * 1.25),
    calc(var(--message-line-height-px, 20px) * 0.65)
  );
  --scroll-bottom-button-offset: var(--chat-scroll-safe-gap);

  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  container-type: inline-size;
  overflow: visible;
}

/* Paper-ink, flat: an ink hairline ring on solid paper. Elevation (drop
   shadow + backdrop blur) was the one "floating plastic" element in an
   otherwise line-drawn surface. */
.scroll-to-bottom-btn {
  position: absolute;
  left: 50%;
  bottom: var(--scroll-bottom-button-offset);
  transform: translateX(-50%) translateY(50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel)));
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary, var(--text))) 78%, transparent);
  cursor: pointer;
  opacity: 0.7;
  transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
  z-index: 4;
}

.scroll-to-bottom-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  opacity: 1;
}

.scroll-to-bottom-btn:active {
  transform: translateX(-50%) translateY(50%) scale(0.94);
}

.scroll-bottom-btn-enter-active,
.scroll-bottom-btn-leave-active {
  transition: opacity 0.15s ease, transform 0.18s ease;
}
.scroll-bottom-btn-enter-from,
.scroll-bottom-btn-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(50%) translateY(6px);
}

.message-list {
  flex: 1;
  overflow-anchor: auto;
  padding: 0;
  background: transparent;
  position: relative;
}

.message-list-content {
  position: relative;
  width: var(--chat-content-width, var(--content-measure, 46rem));
  margin: 0 auto;
  padding-top: var(--chat-scroll-top-reserve);
  padding-bottom: var(--chat-scroll-tail-reserve);
}

.message-list-content.message-list-content--empty {
  height: 0;
  min-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
  pointer-events: none;
  overflow-anchor: none;
}

.history-page-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  max-width: 100%;
  min-height: 28px;
  margin: 0 auto 14px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 64%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg-panel))) 84%, transparent);
  color: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  cursor: pointer;
  font: inherit;
  font-size: var(--type-meta-size);
  line-height: var(--type-leading-control);
  overflow-anchor: none;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.history-page-summary:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 36%, var(--ui-border-default-border, var(--border)));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg-panel))));
  color: var(--ui-accent-primary-fg, var(--accent));
}

.history-page-summary:disabled {
  cursor: default;
  opacity: 0.72;
}

.message-list-row {
  width: 100%;
  overflow-anchor: none;
}

.message-list-bottom-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
  overflow-anchor: none;
}

.message-list.stream-following .message-list-bottom-sentinel {
  overflow-anchor: auto;
}

/* Message list density modes */
.message-list.density-compact {
  --chat-turn-gap: 24px;
  --message-gap: 4px;
  --message-padding: 8px 12px;
  --message-font-size: var(--type-chat-compact-size);
  --message-line-height: var(--type-chat-compact-line-height);
  --message-line-height-px: var(--type-chat-compact-line-height-px);
  --avatar-size: 24px;
  --content-spacing: 0.4em;
  --content-spacing-px: 6px;
  --content-paragraph-gap: 7px;
  --content-list-gap: 6px;
  --content-list-item-gap: 2px;
  --content-heading-top-gap: 8px;
  --content-heading-bottom-gap: 3px;
  --content-heading-line-height-px: 18px;
  gap: 6px;
  padding: 0;
}

.message-list.density-comfortable {
  --chat-turn-gap: 34px;
  --message-gap: 10px;
  --message-padding: 14px 18px;
  --message-font-size: var(--type-chat-comfortable-size);
  --message-line-height: var(--type-chat-comfortable-line-height);
  --message-line-height-px: var(--type-chat-comfortable-line-height-px);
  --avatar-size: 32px;
  --content-spacing: 0.75em;
  --content-spacing-px: 12px;
  --content-paragraph-gap: 9px;
  --content-list-gap: 8px;
  --content-list-item-gap: 2px;
  --content-heading-top-gap: 14px;
  --content-heading-bottom-gap: 5px;
  --content-heading-line-height-px: 22px;
  gap: 14px;
  padding: 0;
}

.message-list.density-spacious {
  --chat-turn-gap: 44px;
  --message-gap: 16px;
  --message-padding: 18px 24px;
  --message-font-size: var(--type-chat-spacious-size);
  --message-line-height: var(--type-chat-spacious-line-height);
  --message-line-height-px: var(--type-chat-spacious-line-height-px);
  --avatar-size: 40px;
  --content-spacing: 1em;
  --content-spacing-px: 16px;
  --content-paragraph-gap: 8px;
  --content-list-gap: 6px;
  --content-list-item-gap: 2px;
  --content-heading-top-gap: 9px;
  --content-heading-bottom-gap: 3px;
  --content-heading-line-height-px: 21px;
  gap: 24px;
  padding: 0;
}
/* Responsive styles */
@media (max-width: 768px) {
  .message-list {
    padding: 0;
    gap: 12px;
  }

  .thinking-indicator {
    padding: 14px 16px;
    border-radius: 14px;
  }

}

@container (max-width: 560px) {
  .assistant-nav-rail,
  .user-nav-rail {
    display: none;
  }

  .scroll-to-bottom-btn {
    bottom: var(--scroll-bottom-button-offset);
  }
}

@media (max-width: 480px) {
  .message-list {
    padding: 0;
    gap: 10px;
  }

  .empty-title {
    font-size: var(--type-display-size);
  }

  .empty-subtitle {
    font-size: var(--type-body-size);
  }

  .thinking-indicator {
    padding: 12px 14px;
    border-radius: 12px;
  }

  .thinking-avatar {
    width: 28px;
    height: 28px;
  }

  .thinking-avatar svg {
    width: 16px;
    height: 16px;
  }

}

/* Reject Reason Dialog */
.reject-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-max);
}

.reject-dialog {
  background: var(--ui-surface-panel-bg, var(--panel));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 16px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.reject-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.reject-dialog-title {
  font-size: var(--type-headline-size);
  font-weight: var(--type-headline-weight);
  line-height: var(--type-headline-line-height);
  color: var(--ui-text-primary-fg, var(--text));
}

.reject-dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted-fg, var(--muted));
  transition: all 0.15s ease;
}

.reject-dialog-close:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.reject-dialog-body {
  padding: 20px;
}

.reject-reason-input {
  width: 100%;
  min-height: 80px;
  padding: 12px 14px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 10px;
  background: var(--base);
  color: var(--ui-text-primary-fg, var(--text));
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.reject-reason-input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.reject-reason-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
}

.reject-dialog-hint {
  margin-top: 8px;
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
  color: var(--ui-text-muted-fg, var(--muted));
  text-align: right;
}

.reject-dialog-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  justify-content: flex-end;
}

.reject-dialog-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: var(--type-label-size);
  font-weight: var(--type-label-weight);
  line-height: var(--type-label-line-height);
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.reject-dialog-btn-cancel {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-default-border, var(--border));
}

.reject-dialog-btn-cancel:hover {
  background: var(--base);
}

.reject-dialog-btn-confirm {
  background: linear-gradient(135deg, var(--ui-status-danger-fg, #b3403a) 0%, var(--ui-status-danger-fg, #b3403a) 100%);
  color: white;
  border-color: var(--ui-status-danger-fg, #b3403a);
}

.reject-dialog-btn-confirm:hover {
  background: linear-gradient(135deg, var(--ui-status-danger-fg, #b3403a) 0%, var(--ui-status-danger-fg, #b3403a) 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}

.reject-dialog-btn-confirm:active {
  transform: translateY(0);
}

/* Modal fade transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .reject-dialog,
.modal-fade-leave-active .reject-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .reject-dialog,
.modal-fade-leave-to .reject-dialog {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

/* Light theme adjustments */
html[data-theme='light'] .reject-dialog-overlay {
  background: rgba(0, 0, 0, 0.3);
}

html[data-theme='light'] .reject-dialog {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
</style>
