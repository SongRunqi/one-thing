<template>
  <div class="message-list-wrapper">
    <div
      ref="messageListRef"
      :class="['message-list', `density-${messageListDensity}`]"
      :style="messageListStyles"
    >
      <EmptyState
        v-if="messages.length === 0 && !isLoading"
        @suggestion="handleSuggestion"
      />

      <div
        v-if="messages.length > 0"
        ref="messageListContentRef"
        class="message-list-content"
      >
        <div
          v-for="(message, index) in messages"
          :key="message.id || index"
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
            @quote="handleQuote"
            @regenerate="handleRegenerate"
            @execute-tool="handleExecuteTool"
            @confirm-tool="handleConfirmTool"
            @reject-tool="handleRejectTool"
            @update-thinking-time="handleUpdateThinkingTime"
          />
        </div>

        <div
          ref="bottomSentinelRef"
          class="message-list-bottom-sentinel"
          aria-hidden="true"
        />
      </div>
    </div>

    <UserMessageNavRail
      v-if="userMessageIndices.length > 1"
      :markers="displayNavMarkers"
      :current-index="currentUserMessageNavIndex"
      @navigate="navigateToUserMessage"
    />

    <Transition name="scroll-bottom-btn">
      <button
        v-if="showScrollToBottomButton && messages.length > 0"
        class="scroll-to-bottom-btn"
        type="button"
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
        @click="scrollToBottomFromButton"
      >
        <ArrowDown
          :size="18"
          :stroke-width="2"
        />
      </button>
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
              <span class="reject-dialog-title">拒绝原因</span>
              <button
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
              </button>
            </div>
            <div class="reject-dialog-body">
              <textarea
                ref="rejectReasonInputRef"
                v-model="rejectReason"
                class="reject-reason-input"
                placeholder="请输入拒绝原因（可选）..."
                rows="3"
                @keydown.enter.ctrl="confirmReject"
                @keydown.enter.meta="confirmReject"
                @keydown.escape="cancelReject"
              />
              <div class="reject-dialog-hint">
                按 Ctrl+Enter 确认，Esc 取消
              </div>
            </div>
            <div class="reject-dialog-footer">
              <button
                class="reject-dialog-btn reject-dialog-btn-cancel"
                @click="cancelReject"
              >
                取消
              </button>
              <button
                class="reject-dialog-btn reject-dialog-btn-confirm"
                @click="confirmReject"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted, toRaw } from 'vue'
import type { ChatMessage, ToolCall } from '@/types'
import MessageItem from './MessageItem.vue'
import EmptyState from './EmptyState.vue'
import UserMessageNavRail, { type UserMessageNavMarker } from './UserMessageNavRail.vue'
import { ArrowDown } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { usePermissionShortcuts } from '@/composables/usePermissionShortcuts'
import {
  useFollowScroll,
  FOLLOW_BOTTOM_GAP,
  shouldShowScrollToBottomButton,
} from '@/composables/useFollowScroll'
import { buildFontFamily } from '@shared/fonts'

interface BranchInfo {
  id: string
  name: string
}

type NavMarker = UserMessageNavMarker

interface Props {
  messages: ChatMessage[]
  isLoading?: boolean
  sessionId?: string
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
})

const emit = defineEmits<{
  setQuotedText: [text: string]
  setInputText: [text: string]
  regenerate: [messageId: string]
  editAndResend: [messageId: string, newContent: string]
  splitWithBranch: [sessionId: string]
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const messageListRef = ref<HTMLElement | null>(null)
const messageListContentRef = ref<HTMLElement | null>(null)
const bottomSentinelRef = ref<HTMLElement | null>(null)
const navMarkers = ref<NavMarker[]>([])
const showScrollToBottomButton = ref(false)
const searchHighlightedMessageId = ref<string | null>(null)
let searchHighlightTimer: ReturnType<typeof setTimeout> | null = null

// Reject reason dialog state
const showRejectDialog = ref(false)
const rejectReason = ref('')
const pendingRejectToolCall = ref<any>(null)
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

// Combined styles for message list
const messageListStyles = computed(() => {
  const styles: Record<string, string> = {}
  if (customLineHeight.value) {
    styles['--message-line-height'] = String(customLineHeight.value)
  }
  if (chatFontSize.value) {
    styles['--message-font-size'] = `${chatFontSize.value}px`
  }
  if (chatFontEn.value || chatFontZh.value) {
    styles['--font-body'] = buildFontFamily(chatFontEn.value, chatFontZh.value)
  }
  styles['--follow-bottom-gap'] = `${FOLLOW_BOTTOM_GAP}px`
  return Object.keys(styles).length > 0 ? styles : undefined
})

// Track current navigation position among user messages
const currentUserMessageNavIndex = ref(-1)

// Track if user has actually navigated (to avoid showing highlight on session switch)
const hasNavigated = ref(false)


// Flag to prevent scroll handler from overriding navigation index during active navigation
let isActivelyNavigating = false
let navigationCooldownTimer: ReturnType<typeof setTimeout> | null = null
let navMarkerUpdateFrame: number | null = null
let navResizeObserver: ResizeObserver | null = null

const follow = useFollowScroll({
  scroller: messageListRef,
  content: messageListContentRef,
  count: computed(() => props.messages.length),
})

const { isFollowing } = follow

// Auto-scroll: when following, keep the scroller pinned to its natural bottom.
// The visual composer gap comes from FOLLOW_BOTTOM_GAP tail space below the
// real list content, so "follow" and the real scrollbar bottom are identical.
const effectiveScrollVersion = computed(() => chatStore.getScrollVersion(effectiveSessionId.value))

let followNudgeFrame: number | null = null

function scheduleFollowNudge(source: string) {
  if (isFollowing.value) {
    follow.nudgeToAnchor(source)
    updateScrollToBottomButton()
    return
  }
  if (followNudgeFrame !== null) return
  followNudgeFrame = requestAnimationFrame(() => {
    followNudgeFrame = null
    follow.nudgeToAnchor(source)
    updateScrollToBottomButton()
  })
}

function updateScrollToBottomButton() {
  const el = messageListRef.value
  if (!el) {
    showScrollToBottomButton.value = false
    return
  }
  showScrollToBottomButton.value = shouldShowScrollToBottomButton(el, isFollowing.value)
}

// External drift triggers — store-emitted scroll bumps and message count
// changes. The composable's internal ResizeObserver also covers post-paint
// layout (markdown rendering, code blocks growing, images loading), but we
// fire an extra nudge here so a store bump doesn't have to wait for layout.
watch([effectiveScrollVersion, () => props.messages.length], () => {
  if (props.messages.length === 0) return
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
watch(lastUserMessageId, (newId, oldId) => {
  if (!newId || newId === oldId) return
  follow.snapToBottom('watch:lastUserMsg/snap')
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
      scheduleNavMarkerUpdate()
      updateVisibleUserMessageIndex()
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
  const total = userMessageIndices.value.length
  if (total === 0) return []

  const fallbackMarkers = userMessageIndices.value.map((messageIndex, navIndex) => {
    const message = props.messages[messageIndex]
    return {
      navIndex,
      messageId: message?.id || `nav-${navIndex}`,
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

// Get the currently highlighted message ID for navigation
// Only returns a value if user has actually navigated (not on session switch)
const highlightedMessageId = computed(() => {
  if (searchHighlightedMessageId.value) return searchHighlightedMessageId.value
  if (!hasNavigated.value) return null
  if (currentUserMessageNavIndex.value < 0) return null
  const messageIndex = userMessageIndices.value[currentUserMessageNavIndex.value]
  if (messageIndex === undefined) return null
  return props.messages[messageIndex]?.id || null
})

// Initialize navigation index when messages change
// Note: Session switching is handled by ChatWindow's snapshot save/restore.
// This watcher handles message count changes (new messages arriving, session data swap).
watch(
  () => props.messages.length,
  () => {
    // Skip during session switch — snapshot restore will set the correct state
    if (follow.isSwitching()) return

    // Reset navigation highlight (don't highlight on new message arrival)
    hasNavigated.value = false

    // Reset to last user message
    if (userMessageIndices.value.length > 0) {
      currentUserMessageNavIndex.value = userMessageIndices.value.length - 1
    } else {
      currentUserMessageNavIndex.value = -1
    }

    // Schedule marker update after DOM renders
    nextTick(() => {
      nextTick(() => scheduleNavMarkerUpdate())
    })
  },
  { immediate: true, flush: 'post' }
)

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

function navigateToUserMessage(navIndex: number) {
  if (navIndex < 0 || navIndex >= userMessageIndices.value.length) return
  hasNavigated.value = true
  isFollowing.value = false
  currentUserMessageNavIndex.value = navIndex
  scrollToUserMessage(navIndex)
}

// Scroll to a specific user message by nav index
function scrollToUserMessage(navIndex: number) {
  const messageIndex = userMessageIndices.value[navIndex]
  if (messageIndex === undefined) return

  // Prevent scroll handler from overriding the navigation index
  isActivelyNavigating = true
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }

  isFollowing.value = false
  const row = getMessageRow(messageIndex)
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Reset flag after highlight animation completes (2.5s) to prevent index override
  navigationCooldownTimer = setTimeout(() => {
    isActivelyNavigating = false
  }, 2600)
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

async function scrollToMessage(messageId: string) {
  const messageIndex = props.messages.findIndex(message => message.id === messageId)
  if (messageIndex === -1) return false

  hasNavigated.value = false
  isFollowing.value = false
  searchHighlightedMessageId.value = messageId

  await nextTick()
  const row = getMessageRowById(messageId) || getMessageRow(messageIndex)
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  if (searchHighlightTimer) clearTimeout(searchHighlightTimer)
  searchHighlightTimer = setTimeout(() => {
    if (searchHighlightedMessageId.value === messageId) {
      searchHighlightedMessageId.value = null
    }
  }, 2600)

  return true
}

function getMessageMeasurement(messageIndex: number): { start: number; end: number; size: number } | undefined {
  const row = getMessageRow(messageIndex)
  if (!row) return undefined
  return {
    start: row.offsetTop,
    end: row.offsetTop + row.offsetHeight,
    size: row.offsetHeight,
  }
}

function getFallbackNavPosition(messageIndex: number): number {
  const denominator = Math.max(props.messages.length - 1, 1)
  return Math.min(0.98, Math.max(0.02, messageIndex / denominator))
}

function getEvenNavPosition(navIndex: number, total: number): number {
  if (total <= 1) return 0.5
  return (navIndex + 1) / (total + 1)
}

function setNavIndexToLastUserMessage() {
  if (userMessageIndices.value.length > 0) {
    currentUserMessageNavIndex.value = userMessageIndices.value.length - 1
  }
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

// Check if current session can create branches (only root sessions can)
const canCreateBranch = computed(() => {
  const currentSession = panelSession.value
  if (!currentSession) return false
  // Only allow branching from root sessions (no parent)
  return !currentSession.parentSessionId
})

// Check if there's already a streaming message (to avoid double loading indicator)
const hasStreamingMessage = computed(() => {
  return props.messages.some(m => m.isStreaming)
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
  return messageBranches.value.get(messageId) || []
}

// Find which user message is currently most visible in the viewport
function updateVisibleUserMessageIndex() {
  if (isActivelyNavigating) return
  if (userMessageIndices.value.length === 0) return

  const el = messageListRef.value
  if (!el) return

  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceToBottom < 96 || isFollowing.value) {
    setNavIndexToLastUserMessage()
    return
  }

  // A chat node represents a user turn, so assistant content belongs to the
  // most recent user message above the viewport anchor.
  const viewportAnchor = el.scrollTop + el.clientHeight * 0.18

  let activeNavIndex = 0

  for (let i = 0; i < userMessageIndices.value.length; i++) {
    const msgIdx = userMessageIndices.value[i]
    const measurement = getMessageMeasurement(msgIdx)
    const start = measurement
      ? measurement.start
      : getFallbackNavPosition(msgIdx) * Math.max(1, el.scrollHeight)

    if (start <= viewportAnchor) activeNavIndex = i
    else break
  }

  currentUserMessageNavIndex.value = activeNavIndex
}

function handleScroll() {
  follow.checkReattach()
  updateScrollToBottomButton()
  scheduleNavMarkerUpdate()
  updateVisibleUserMessageIndex()
}

// Track permission request cleanup function

// Get the first pending permission request (tool call requiring confirmation)
const currentPendingPermission = computed<{ message: ChatMessage; toolCall: ToolCall } | null>(() => {
  for (const message of props.messages) {
    const pendingToolCall = message.toolCalls?.find(tc => tc.requiresConfirmation)
    if (pendingToolCall) {
      return { message, toolCall: pendingToolCall }
    }
  }
  return null
})

// Setup keyboard shortcuts for permission confirmation
// Enter = once (本次), S = session (本会话), W = workdir (本工作目录), D/Escape = reject
usePermissionShortcuts(
  () => !!currentPendingPermission.value && !showRejectDialog.value,
  {
    onAllowOnce: () => {
      const pending = currentPendingPermission.value
      if (pending) {
        handleConfirmTool(pending.toolCall, 'once')
      }
    },
    onAllowSession: () => {
      const pending = currentPendingPermission.value
      if (pending) {
        handleConfirmTool(pending.toolCall, 'session')
      }
    },
    onAllowWorkdir: () => {
      const pending = currentPendingPermission.value
      if (pending) {
        handleConfirmTool(pending.toolCall, 'workdir')
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

function scrollToBottomFromButton() {
  setNavIndexToLastUserMessage()
  follow.snapToBottom('button:scrollToBottom')
}

// Setup event listeners
onMounted(() => {
  if (messageListRef.value) {
    messageListRef.value.addEventListener('scroll', handleScroll)
    messageListRef.value.addEventListener('wheel', follow.onWheel, { passive: false })
    if (typeof ResizeObserver !== 'undefined') {
      navResizeObserver = new ResizeObserver(() => scheduleNavMarkerUpdate())
      navResizeObserver.observe(messageListRef.value)
    }
  }
  // Scroll to bottom on initial mount (messages may be pre-loaded in store)
  nextTick(() => {
    if (props.messages.length > 0 && messageListRef.value) {
      follow.snapToBottom('mounted:initial')
    }
    scheduleNavMarkerUpdate()
  })
})

onUnmounted(() => {
  if (messageListRef.value) {
    messageListRef.value.removeEventListener('scroll', handleScroll)
    messageListRef.value.removeEventListener('wheel', follow.onWheel)
  }
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }
  if (searchHighlightTimer) {
    clearTimeout(searchHighlightTimer)
    searchHighlightTimer = null
  }
  if (navMarkerUpdateFrame !== null) {
    cancelAnimationFrame(navMarkerUpdateFrame)
    navMarkerUpdateFrame = null
  }
  if (followNudgeFrame !== null) {
    cancelAnimationFrame(followNudgeFrame)
    followNudgeFrame = null
  }
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
      const response = await window.electronAPI.getPendingPermissions(newSessionId)
      if (response.success && response.pending && response.pending.length > 0) {
        console.log('[Frontend] Loading pending permissions for session:', newSessionId, response.pending.length)
        // Apply each pending permission to the UI via the store
        for (const info of response.pending) {
          chatStore.handlePermissionRequest({
            sessionId: info.sessionId,
            requestId: info.id,
            messageId: info.messageId,
            callId: info.callId,
            permissionType: info.type,
            title: info.title,
            pattern: info.pattern,
            metadata: info.metadata,
            canRespond: ((info as any).targetChannel || 'ipc') === 'ipc',
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
    nextTick(() => scheduleNavMarkerUpdate())
  }
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

function handleRegenerate(messageId: string) {
  emit('regenerate', messageId)
}

function handleSuggestion(text: string) {
  emit('setInputText', text)
}

// Handle tool execution
async function handleExecuteTool(toolCall: any) {
  const currentSession = panelSession.value
  if (!currentSession) return

  // Find the message containing this tool call
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )
  const tc = message?.toolCalls?.find(t => t.id === toolCall.id)

  // Record start time
  const startTime = Date.now()
  if (tc) {
    tc.status = 'executing'
    tc.startTime = startTime
  }

  try {
    // Deep clone to unwrap all Vue reactive proxies - IPC cannot serialize Proxy objects
    const rawArguments = JSON.parse(JSON.stringify(toRaw(toolCall.arguments) || {}))
    const result = await window.electronAPI.executeTool(
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
      await window.electronAPI.updateToolCall(currentSession.id, message.id, toolCall.id, {
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
      await window.electronAPI.updateToolCall(currentSession.id, message.id, toolCall.id, {
        status: 'failed',
        startTime,
        endTime,
        error: String(error),
      })
    }
  }
}

// Handle tool confirmation (for dangerous bash commands)
// response: 'once' = allow this time, 'session' = allow for session, 'workdir' = allow permanently in this working directory
// Note: 'always' is kept for backwards compatibility and maps to 'session'
async function handleConfirmTool(toolCall: any, response: 'once' | 'session' | 'workdir' | 'always' = 'once') {
  const currentSession = panelSession.value
  if (!currentSession) return

  // Find the message containing this tool call
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )
  const tc = message?.toolCalls?.find(t => t.id === toolCall.id)

  // Find and update the corresponding step
  const step = message?.steps?.find(s => s.toolCallId === toolCall.id)

  // Check if there's a pending permission request for this tool call
  const permissionId = toolCall.permissionId
  if (permissionId) {
    // Use unified command channel to respond (EventBus → Permission validates channel)
    console.log(`[Frontend] Responding to permission ${permissionId} with ${response}`)
    try {
      await window.electronAPI.emitCommand(currentSession.id, {
        type: 'command:permission-respond',
        requestId: permissionId,
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
      return
    } catch (error) {
      console.error('Failed to respond to permission:', error)
    }
  }

  // Fallback: Legacy flow - re-execute tool directly with confirmed: true
  // Record start time
  const startTime = Date.now()
  if (tc) {
    tc.status = 'executing'
    tc.startTime = startTime
    tc.requiresConfirmation = false
  }

  // Update step to running
  if (step) {
    step.status = 'running'
    // Force reactivity
    if (message?.steps) {
      message.steps = [...message.steps]
    }
  }

  try {
    // Re-execute the tool with confirmed: true
    const result = await window.electronAPI.executeTool(
      toolCall.toolId,
      { ...toolCall.arguments, confirmed: true },
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

    // Update step status (step-own fields only; step.toolCall === tc above
    // so the field updates on tc already cover the canonical toolCall).
    if (step) {
      step.status = result.success ? 'completed' : 'failed'
      step.result = typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
      step.error = result.error
      // Force reactivity
      if (message?.steps) {
        message.steps = [...message.steps]
      }
    }

    // Persist to backend
    if (message) {
      await window.electronAPI.updateToolCall(currentSession.id, message.id, toolCall.id, {
        status: result.success ? 'completed' : 'failed',
        startTime,
        endTime,
        result: result.result,
        error: result.error,
        requiresConfirmation: false,
      })

      // Resume the LLM conversation to process the tool result
      console.log('[Frontend] Resuming LLM after tool confirm')
      await window.electronAPI.resumeAfterToolConfirm(currentSession.id, message.id)
    }
  } catch (error) {
    console.error('Failed to confirm tool:', error)
    const endTime = Date.now()
    if (tc) {
      tc.endTime = endTime
      tc.status = 'failed'
      tc.error = String(error)
    }

    // Update step status on error
    if (step) {
      step.status = 'failed'
      step.error = String(error)
      // Force reactivity
      if (message?.steps) {
        message.steps = [...message.steps]
      }
    }

    // Persist to backend
    if (message) {
      await window.electronAPI.updateToolCall(currentSession.id, message.id, toolCall.id, {
        status: 'failed',
        startTime,
        endTime,
        error: String(error),
        requiresConfirmation: false,
      })
    }
  }
}

// Open the reject reason dialog
function openRejectDialog(toolCall: any) {
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
async function handleRejectTool(toolCall: any, rejectReasonArg?: string) {
  // Update the tool call status to cancelled/rejected
  const currentSession = panelSession.value
  if (!currentSession) return

  // Find the message containing this tool call and update its status
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )

  // Check if there's a pending permission request for this tool call
  const permissionId = toolCall.permissionId
  if (permissionId) {
    // Use unified command channel to reject (EventBus → Permission validates channel)
    console.log(`[Frontend] Rejecting permission ${permissionId}`, rejectReasonArg ? `Reason: ${rejectReasonArg}` : '')
    try {
      await window.electronAPI.emitCommand(currentSession.id, {
        type: 'command:permission-respond',
        requestId: permissionId,
        decision: 'reject',
        rejectReason: rejectReasonArg,
      })
    } catch (error) {
      console.error('Failed to respond to permission:', error)
    }
  }

  if (message) {
    const tc = message.toolCalls?.find(t => t.id === toolCall.id)
    if (tc) {
      tc.status = 'cancelled'
      tc.error = 'Command rejected by user'
      tc.requiresConfirmation = false
    }

    // Update the corresponding step (step-own fields only; step.toolCall is
    // the same reference as tc above, so its fields are already updated).
    const step = message.steps?.find(s => s.toolCallId === toolCall.id)
    if (step) {
      step.status = 'failed'
      step.error = 'Command execution cancelled by user'
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
    await window.electronAPI.updateMessageThinkingTime(currentSession.id, messageId, thinkingTime)
  } catch (error) {
    console.error('Failed to update thinking time:', error)
  }
}

// ============ Snapshot API for session switching ============

defineExpose({
  getFirstVisibleIndex: () => follow.captureSnapshot().firstVisibleIndex,
  getOffsetWithinMessage: () => follow.captureSnapshot().offsetWithinMessage,
  getIsFollowing: () => follow.isFollowing.value,
  getNavIndex: () => currentUserMessageNavIndex.value,
  getHasNavigated: () => hasNavigated.value,

  prepareForSwitch: follow.prepareForSwitch,

  restoreSnapshot: (snap: {
    firstVisibleIndex: number
    offsetWithinMessage: number
    isFollowing?: boolean
    userScrolledAway?: boolean
    navIndex: number
    hasNavigated: boolean
  }) => {
    const following =
      snap.isFollowing ?? (snap.userScrolledAway !== undefined ? !snap.userScrolledAway : true)
    currentUserMessageNavIndex.value = snap.navIndex
    hasNavigated.value = snap.hasNavigated
    follow.restoreSnapshot(
      {
        firstVisibleIndex: snap.firstVisibleIndex,
        offsetWithinMessage: snap.offsetWithinMessage,
        isFollowing: following,
      },
      () => setNavIndexToLastUserMessage(),
    )
  },

  scrollToBottom: () => {
    setNavIndexToLastUserMessage()
    follow.snapToBottom('expose:scrollToBottom')
  },

  scrollToMessage,
})
</script>

<style scoped>
.message-list-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  /* Inherit parent's bottom border-radius for proper clipping */
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
  overflow: hidden;
}

.scroll-to-bottom-btn {
  position: absolute;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 0.5px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--bg-elevated, var(--bg-panel)) 78%, transparent);
  color: var(--text);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.10);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
  transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
  z-index: 4;
}

.scroll-to-bottom-btn:hover {
  background: var(--bg-elevated, var(--bg-panel));
  color: var(--accent);
}

.scroll-to-bottom-btn:active {
  transform: translateX(-50%) scale(0.94);
}

.scroll-bottom-btn-enter-active,
.scroll-bottom-btn-leave-active {
  transition: opacity 0.15s ease, transform 0.18s ease;
}
.scroll-bottom-btn-enter-from,
.scroll-bottom-btn-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-anchor: none;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--muted) 45%, transparent) transparent;
  padding: 18px;
  background: transparent;
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
  position: relative;
}

.message-list::-webkit-scrollbar {
  width: 10px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--muted) 34%, transparent);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--muted) 52%, transparent);
  border: 3px solid transparent;
  background-clip: content-box;
}

.message-list-content {
  position: relative;
  width: min(74%, 860px);
  margin: 0 auto;
  padding-bottom: var(--follow-bottom-gap, 64px);
}

.message-list-row {
  width: 100%;
}

.message-list-bottom-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
}


/* Message list density modes */
.message-list.density-compact {
  --message-gap: 4px;
  --message-padding: 8px 12px;
  --message-font-size: 14px;
  --message-line-height: 1.4;
  --avatar-size: 24px;
  --content-spacing: 0.4em;
  gap: 6px;
  padding: 12px;
}

.message-list.density-comfortable {
  --message-gap: 10px;
  --message-padding: 14px 18px;
  --message-font-size: 15px;
  --message-line-height: 1.6;
  --avatar-size: 32px;
  --content-spacing: 0.75em;
  gap: 14px;
  padding: 18px;
}

.message-list.density-spacious {
  --message-gap: 16px;
  --message-padding: 18px 24px;
  --message-font-size: 16px;
  --message-line-height: 1.8;
  --avatar-size: 40px;
  --content-spacing: 1em;
  gap: 24px;
  padding: 24px;
}
/* Responsive styles */
@media (max-width: 768px) {
  .message-list {
    padding: 14px 12px;
    gap: 12px;
  }

  .message-list-content {
    width: 94%;
  }

  .thinking-indicator {
    padding: 14px 16px;
    border-radius: 14px;
  }

}

@media (max-width: 480px) {
  .message-list {
    padding: 10px 8px;
    gap: 10px;
  }

  .message-list-content {
    width: 100%;
  }

  .empty-title {
    font-size: 26px;
  }

  .empty-subtitle {
    font-size: 14px;
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
  background: var(--panel);
  border: 1px solid var(--border);
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
  border-bottom: 1px solid var(--border);
}

.reject-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
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
  color: var(--muted);
  transition: all 0.15s ease;
}

.reject-dialog-close:hover {
  background: var(--hover);
  color: var(--text);
}

.reject-dialog-body {
  padding: 20px;
}

.reject-reason-input {
  width: 100%;
  min-height: 80px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--base);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.reject-reason-input::placeholder {
  color: var(--muted);
}

.reject-reason-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.reject-dialog-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
  text-align: right;
}

.reject-dialog-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}

.reject-dialog-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.reject-dialog-btn-cancel {
  background: var(--hover);
  color: var(--text);
  border-color: var(--border);
}

.reject-dialog-btn-cancel:hover {
  background: var(--base);
}

.reject-dialog-btn-confirm {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border-color: #dc2626;
}

.reject-dialog-btn-confirm:hover {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
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
