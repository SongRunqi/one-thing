<template>
  <div class="message-list-wrapper">
    <div
      :class="['message-list', `density-${messageListDensity}`]"
      :style="messageListStyles"
      ref="messageListRef"
    >
    <EmptyState
      v-if="messages.length === 0 && !isLoading"
      @suggestion="handleSuggestion"
    />
    <TransitionGroup name="msg-list">
      <MessageItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :branches="getBranchesForMessage(message.id)"
        :can-branch="canCreateBranch"
        :is-highlighted="message.id === highlightedMessageId"
        :voice-config="currentAgentVoiceConfig"
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
    </TransitionGroup>

    </div>

    <!-- User message navigation buttons (outside scrollable area, inside wrapper) -->
    <div v-if="userMessageIndices.length >= 1" class="nav-buttons">
      <Tooltip text="Previous (double-click for first)" position="left">
        <button
          class="nav-btn"
          :disabled="!canGoPrev && isCurrentMessageTopVisible"
          @click="handlePrevClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 15l-6-6-6 6"/>
          </svg>
        </button>
      </Tooltip>
      <span class="nav-position">{{ currentUserMessageNavIndex + 1 }}/{{ userMessageIndices.length }}</span>
      <Tooltip text="Next (double-click for last)" position="left">
        <button
          class="nav-btn"
          :disabled="!canGoNext"
          @click="handleNextClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </Tooltip>
    </div>

    <!-- Reject Reason Dialog -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showRejectDialog" class="reject-dialog-overlay" @click.self="cancelReject">
          <div class="reject-dialog">
            <div class="reject-dialog-header">
              <span class="reject-dialog-title">拒绝原因</span>
              <button class="reject-dialog-close" @click="cancelReject">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
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
              ></textarea>
              <div class="reject-dialog-hint">按 Ctrl+Enter 确认，Esc 取消</div>
            </div>
            <div class="reject-dialog-footer">
              <button class="reject-dialog-btn reject-dialog-btn-cancel" @click="cancelReject">
                取消
              </button>
              <button class="reject-dialog-btn reject-dialog-btn-confirm" @click="confirmReject">
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
import type { ChatMessage, AgentVoice, ToolCall } from '@/types'
import MessageItem from './MessageItem.vue'
import EmptyState from './EmptyState.vue'
import Tooltip from '../common/Tooltip.vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import { useSettingsStore } from '@/stores/settings'
import { usePermissionShortcuts } from '@/composables/usePermissionShortcuts'

interface BranchInfo {
  id: string
  name: string
}

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
const customAgentsStore = useCustomAgentsStore()
const settingsStore = useSettingsStore()
const messageListRef = ref<HTMLElement | null>(null)

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

// Get current agent's voice config (if session is associated with an agent)
// Note: CustomAgents don't have voice configuration - this feature was part of the old Agent system
// Returning undefined disables agent-specific voice for now
const currentAgentVoiceConfig = computed<AgentVoice | undefined>(() => {
  // CustomAgents don't support voice configuration yet
  return undefined
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

// Combined styles for message list
const messageListStyles = computed(() => {
  const styles: Record<string, string> = {}
  if (customLineHeight.value) {
    styles['--message-line-height'] = String(customLineHeight.value)
  }
  if (chatFontSize.value) {
    styles['--message-font-size'] = `${chatFontSize.value}px`
  }
  return Object.keys(styles).length > 0 ? styles : undefined
})

// Track current navigation position among user messages
const currentUserMessageNavIndex = ref(-1)

// Track if user has actually navigated (to avoid showing highlight on session switch)
const hasNavigated = ref(false)

// Track if user has scrolled away from bottom (to allow manual scrolling during streaming)
const userScrolledAway = ref(false)
let lastScrollTop = 0
let scrollCooldownTimer: ReturnType<typeof setTimeout> | null = null

// Click timers for distinguishing single vs double click
let prevClickTimer: ReturnType<typeof setTimeout> | null = null
let nextClickTimer: ReturnType<typeof setTimeout> | null = null
const DOUBLE_CLICK_DELAY = 250 // ms

// Flag to prevent scroll handler from overriding navigation index during active navigation
let isActivelyNavigating = false
let navigationCooldownTimer: ReturnType<typeof setTimeout> | null = null

// Get indices of user messages
const userMessageIndices = computed(() => {
  return props.messages
    .map((msg, index) => ({ msg, index }))
    .filter(item => item.msg.role === 'user')
    .map(item => item.index)
})

// Navigation state
const canGoPrev = computed(() => {
  if (userMessageIndices.value.length === 0) return false
  return currentUserMessageNavIndex.value > 0
})

const canGoNext = computed(() => {
  if (userMessageIndices.value.length === 0) return false
  return currentUserMessageNavIndex.value < userMessageIndices.value.length - 1
})

// Check if current message top is visible (for enabling prev button even at first message)
const isCurrentMessageTopVisible = ref(true)

// Get the currently highlighted message ID for navigation
// Only returns a value if user has actually navigated (not on session switch)
const highlightedMessageId = computed(() => {
  if (!hasNavigated.value) return null
  if (currentUserMessageNavIndex.value < 0) return null
  const messageIndex = userMessageIndices.value[currentUserMessageNavIndex.value]
  if (messageIndex === undefined) return null
  return props.messages[messageIndex]?.id || null
})

// Initialize navigation index when messages change
watch(
  () => props.messages.length,
  () => {
    // Reset navigation state when messages change (e.g., session switch)
    hasNavigated.value = false
    // Reset to last user message when messages change
    if (userMessageIndices.value.length > 0) {
      currentUserMessageNavIndex.value = userMessageIndices.value.length - 1
    } else {
      currentUserMessageNavIndex.value = -1
    }
  },
  { immediate: true }
)

// Navigate to previous user message
// If current message top is not visible, scroll to current message top first
function goToPrevUserMessage() {
  hasNavigated.value = true

  // First check if current message's top is visible
  const currentMessageIndex = userMessageIndices.value[currentUserMessageNavIndex.value]
  if (currentMessageIndex !== undefined && messageListRef.value) {
    const message = props.messages[currentMessageIndex]
    if (message) {
      const messageEl = messageListRef.value.querySelector(`[data-message-id="${message.id}"]`)
      if (messageEl) {
        const containerRect = messageListRef.value.getBoundingClientRect()
        const messageRect = messageEl.getBoundingClientRect()

        // If message top is above the visible area (with some threshold), scroll to current message top first
        if (messageRect.top < containerRect.top - 10) {
          // Prevent scroll handler from overriding the navigation index
          isActivelyNavigating = true
          if (navigationCooldownTimer) {
            clearTimeout(navigationCooldownTimer)
          }
          messageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          navigationCooldownTimer = setTimeout(() => {
            isActivelyNavigating = false
          }, 2600)
          return
        }
      }
    }
  }

  // If current message top is already visible, go to previous message
  if (!canGoPrev.value) return
  currentUserMessageNavIndex.value--
  scrollToUserMessage(currentUserMessageNavIndex.value)
}

// Navigate to next user message
function goToNextUserMessage() {
  if (!canGoNext.value) return
  hasNavigated.value = true
  currentUserMessageNavIndex.value++
  scrollToUserMessage(currentUserMessageNavIndex.value)
}

// Navigate to first user message (double-click)
function goToFirstUserMessage() {
  if (userMessageIndices.value.length === 0) return
  hasNavigated.value = true
  currentUserMessageNavIndex.value = 0
  scrollToUserMessage(0)
}

// Navigate to bottom of message list (double-click down button)
function goToLastUserMessage() {
  hasNavigated.value = true
  // Update navigation index to last user message (if any)
  if (userMessageIndices.value.length > 0) {
    currentUserMessageNavIndex.value = userMessageIndices.value.length - 1
  }
  // Scroll to absolute bottom
  if (messageListRef.value) {
    // Prevent scroll handler from overriding the navigation index
    isActivelyNavigating = true
    if (navigationCooldownTimer) {
      clearTimeout(navigationCooldownTimer)
    }

    messageListRef.value.scrollTo({
      top: messageListRef.value.scrollHeight,
      behavior: 'smooth'
    })

    // Reset flag after scroll animation completes
    navigationCooldownTimer = setTimeout(() => {
      isActivelyNavigating = false
    }, 800)
  }
}

// Handle prev button click with single/double click distinction
function handlePrevClick() {
  if (prevClickTimer) {
    // Double click detected
    clearTimeout(prevClickTimer)
    prevClickTimer = null
    goToFirstUserMessage()
  } else {
    // Start timer for single click
    prevClickTimer = setTimeout(() => {
      prevClickTimer = null
      goToPrevUserMessage()
    }, DOUBLE_CLICK_DELAY)
  }
}

// Handle next button click with single/double click distinction
function handleNextClick() {
  if (nextClickTimer) {
    // Double click detected
    clearTimeout(nextClickTimer)
    nextClickTimer = null
    goToLastUserMessage()
  } else {
    // Start timer for single click
    nextClickTimer = setTimeout(() => {
      nextClickTimer = null
      goToNextUserMessage()
    }, DOUBLE_CLICK_DELAY)
  }
}

// Scroll to a specific user message by nav index
function scrollToUserMessage(navIndex: number) {
  const messageIndex = userMessageIndices.value[navIndex]
  if (messageIndex === undefined) return

  const message = props.messages[messageIndex]
  if (!message || !messageListRef.value) return

  const messageEl = messageListRef.value.querySelector(`[data-message-id="${message.id}"]`)
  if (messageEl) {
    // Prevent scroll handler from overriding the navigation index
    isActivelyNavigating = true
    if (navigationCooldownTimer) {
      clearTimeout(navigationCooldownTimer)
    }

    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Reset flag after highlight animation completes (2.5s) to prevent index override
    navigationCooldownTimer = setTimeout(() => {
      isActivelyNavigating = false
    }, 2600)
  }
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

// Check if scroll is near bottom (within threshold)
function isNearBottom(): boolean {
  if (!messageListRef.value) return true
  const { scrollTop, scrollHeight, clientHeight } = messageListRef.value
  // Consider "near bottom" if within 50px of bottom
  return scrollHeight - scrollTop - clientHeight < 50
}

// Find which user message is currently most visible in the viewport
function updateVisibleUserMessageIndex() {
  // Skip if user is actively navigating (to prevent overriding manual navigation)
  if (isActivelyNavigating) return
  if (!messageListRef.value || userMessageIndices.value.length === 0) return

  const container = messageListRef.value
  const containerRect = container.getBoundingClientRect()
  const containerCenter = containerRect.top + containerRect.height / 2

  let closestIndex = 0
  let closestDistance = Infinity

  // Find the user message closest to viewport center
  for (let i = 0; i < userMessageIndices.value.length; i++) {
    const messageIndex = userMessageIndices.value[i]
    const message = props.messages[messageIndex]
    if (!message) continue

    const messageEl = container.querySelector(`[data-message-id="${message.id}"]`)
    if (!messageEl) continue

    const rect = messageEl.getBoundingClientRect()
    const messageCenter = rect.top + rect.height / 2
    const distance = Math.abs(messageCenter - containerCenter)

    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = i
    }
  }

  currentUserMessageNavIndex.value = closestIndex

  // Update visibility of current message top
  const currentMessageIndex = userMessageIndices.value[closestIndex]
  if (currentMessageIndex !== undefined) {
    const message = props.messages[currentMessageIndex]
    if (message) {
      const messageEl = container.querySelector(`[data-message-id="${message.id}"]`)
      if (messageEl) {
        const rect = messageEl.getBoundingClientRect()
        // Message top is visible if it's within the container bounds (with threshold)
        isCurrentMessageTopVisible.value = rect.top >= containerRect.top - 10
      }
    }
  }
}

// Handle wheel events to detect user intent to scroll
function handleWheel(event: WheelEvent) {
  // deltaY > 0 means scrolling down, < 0 means scrolling up
  if (event.deltaY < 0) {
    // User is trying to scroll UP - stop auto-scroll with cooldown
    userScrolledAway.value = true

    // Clear any existing cooldown timer
    if (scrollCooldownTimer) {
      clearTimeout(scrollCooldownTimer)
    }

    // Set a cooldown period - auto-scroll won't resume for 1.5 seconds after last upward scroll
    scrollCooldownTimer = setTimeout(() => {
      // After cooldown, check if user is at bottom - if so, re-enable auto-scroll
      if (isNearBottom()) {
        userScrolledAway.value = false
      }
    }, 1500)
  }
}

// Handle scroll events for position tracking and reset detection
function handleScroll() {
  if (!messageListRef.value) return
  const { scrollTop } = messageListRef.value

  // Only reset userScrolledAway when user actively scrolls DOWN to bottom
  if (scrollTop > lastScrollTop && isNearBottom()) {
    userScrolledAway.value = false
  }

  // Update visible user message index while scrolling
  updateVisibleUserMessageIndex()

  lastScrollTop = scrollTop
}

// Track permission request cleanup function
let cleanupPermissionListener: (() => void) | null = null
let cleanupCustomAgentPermissionListener: (() => void) | null = null

// Get the first pending permission request (tool call requiring confirmation)
// Searches both top-level toolCalls AND nested childSteps (for CustomAgent sub-tool calls)
const currentPendingPermission = computed<{ message: ChatMessage; toolCall: ToolCall } | null>(() => {
  for (const message of props.messages) {
    // 1. Check top-level toolCalls (normal tool calls)
    const pendingToolCall = message.toolCalls?.find(tc => tc.requiresConfirmation)
    if (pendingToolCall) {
      return { message, toolCall: pendingToolCall }
    }

    // 2. Check nested childSteps (CustomAgent sub-tool calls)
    // CustomAgent steps are stored as childSteps of the parent custom-agent step
    for (const step of message.steps || []) {
      if (step.childSteps?.length) {
        for (const childStep of step.childSteps) {
          // Check if this child step has a toolCall that requires confirmation
          if (childStep.toolCall?.requiresConfirmation) {
            return { message, toolCall: childStep.toolCall }
          }
          // Also check for customAgentPermissionId (set by handleCustomAgentPermissionRequest)
          if ((childStep as any).customAgentPermissionId && childStep.status === 'awaiting-confirmation') {
            // Construct a toolCall-like object from the step if toolCall is missing
            // Use type assertion since customAgentPermissionId is a custom extension
            const toolCallFromStep = (childStep.toolCall || {
              id: childStep.id,
              toolId: childStep.type === 'command' ? 'bash' : childStep.type,
              toolName: childStep.title?.split(':')[0] || 'unknown',
              arguments: childStep.toolCall?.arguments || {},
              status: 'pending' as const,
              timestamp: childStep.timestamp,
              requiresConfirmation: true,
            }) as ToolCall & { customAgentPermissionId?: string }
            toolCallFromStep.customAgentPermissionId = (childStep as any).customAgentPermissionId
            return { message, toolCall: toolCallFromStep as ToolCall }
          }
        }
      }
    }
  }
  return null
})

// Setup keyboard shortcuts for permission confirmation
// Enter = once (本次), S = session (本会话), W = workspace (本工作区), D/Escape = reject
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
    onAllowWorkspace: () => {
      const pending = currentPendingPermission.value
      if (pending) {
        handleConfirmTool(pending.toolCall, 'workspace')
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

// Handle incoming permission requests from backend
function handlePermissionRequest(info: {
  id: string
  type: string
  pattern?: string | string[]
  sessionId: string
  messageId: string
  callId?: string
  title: string
  metadata: Record<string, unknown>
  createdAt: number
}) {
  console.log('[Frontend] Received permission request:', info)

  // Use effectiveSessionId (from props or global) instead of just global currentSession
  // This ensures each panel only handles its own session's permission requests
  const panelSessionId = effectiveSessionId.value
  if (!panelSessionId || panelSessionId !== info.sessionId) {
    console.log('[Frontend] Permission request for different session, ignoring. Expected:', panelSessionId, 'Got:', info.sessionId)
    return
  }

  // Find the message and tool call that needs confirmation
  // Use props.messages (from useChatSession composable) instead of chatStore.messages
  const message = props.messages.find(m => m.id === info.messageId)
  if (!message) {
    console.log('[Frontend] Message not found for permission request, messageId:', info.messageId)
    console.log('[Frontend] Available messages:', props.messages.map(m => m.id))
    return
  }

  // Find the tool call by callId or by matching command in metadata
  let toolCall = message.toolCalls?.find(tc => tc.id === info.callId)
  if (!toolCall && info.metadata.command) {
    // Try to find by command match
    toolCall = message.toolCalls?.find(tc =>
      tc.arguments?.command === info.metadata.command
    )
  }

  if (toolCall) {
    // Store permission ID on tool call for later response
    (toolCall as any).permissionId = info.id
    toolCall.requiresConfirmation = true
    toolCall.status = 'pending'

    // Update corresponding step
    const step = message.steps?.find(s => s.toolCallId === toolCall!.id)
    if (step) {
      step.status = 'awaiting-confirmation'
      // Store metadata from permission request (contains diff for edit tool)
      // This ensures diff is available even if STEP_UPDATED hasn't propagated yet
      if (info.metadata && (info.metadata.diff || info.metadata.filePath)) {
        step.result = JSON.stringify(info.metadata)
      }
      if (step.toolCall) {
        (step.toolCall as any).permissionId = info.id
        step.toolCall.requiresConfirmation = true
        step.toolCall.status = 'pending'
      }
      // Force reactivity
      if (message.steps) {
        message.steps = [...message.steps]
      }
    }

    console.log('[Frontend] Updated tool call with permission request:', toolCall.id)
  } else {
    console.log('[Frontend] No matching tool call found for permission request')
  }
}

// Handle incoming CustomAgent permission requests from backend
// CustomAgent has nested steps that need permission (e.g., bash commands within a CustomAgent)
function handleCustomAgentPermissionRequest(info: {
  requestId: string
  sessionId: string
  messageId: string
  stepId: string
  toolCall: {
    id: string
    toolName: string
    arguments: Record<string, unknown>
    commandType?: 'read-only' | 'dangerous' | 'forbidden'
    error?: string
  }
}) {
  console.log('[Frontend] Received CustomAgent permission request:', info)

  // Use effectiveSessionId (from props or global) instead of just global currentSession
  const panelSessionId = effectiveSessionId.value
  if (!panelSessionId || panelSessionId !== info.sessionId) {
    console.log('[Frontend] CustomAgent permission request for different session, ignoring')
    return
  }

  // Find the message
  const message = props.messages.find(m => m.id === info.messageId)
  if (!message) {
    console.log('[Frontend] Message not found for CustomAgent permission request:', info.messageId)
    return
  }

  // Find the nested step that needs permission
  // The stepId from CustomAgent is like "toolName-toolCallId"
  // We need to search in childSteps of parent steps
  let foundStep: any = null
  let parentStep: any = null

  for (const step of message.steps || []) {
    // Check if this step has childSteps that contain our target
    if (step.childSteps?.length) {
      for (const childStep of step.childSteps) {
        // Match by toolCallId or by the tool call info
        if (childStep.toolCallId === info.toolCall.id ||
            (childStep.toolCall?.toolName === info.toolCall.toolName &&
             JSON.stringify(childStep.toolCall?.arguments) === JSON.stringify(info.toolCall.arguments))) {
          foundStep = childStep
          parentStep = step
          break
        }
      }
    }
    if (foundStep) break
  }

  if (foundStep && parentStep) {
    // Store the CustomAgent permission request ID on the step
    (foundStep as any).customAgentPermissionId = info.requestId
    foundStep.status = 'awaiting-confirmation'

    // Also set on toolCall if present
    if (foundStep.toolCall) {
      (foundStep.toolCall as any).customAgentPermissionId = info.requestId
      foundStep.toolCall.requiresConfirmation = true
      foundStep.toolCall.status = 'pending'
      foundStep.toolCall.commandType = info.toolCall.commandType
    }

    // Force Vue reactivity by replacing the parent step
    const parentIndex = message.steps!.findIndex(s => s.id === parentStep.id)
    if (parentIndex >= 0) {
      const newChildSteps = parentStep.childSteps!.map((c: any) =>
        c === foundStep ? { ...foundStep } : c
      )
      message.steps![parentIndex] = {
        ...parentStep,
        childSteps: newChildSteps,
      }
      message.steps = [...message.steps!]
    }

    console.log('[Frontend] Updated child step with CustomAgent permission request:', foundStep.id || info.stepId)
  } else {
    console.log('[Frontend] No matching child step found for CustomAgent permission request')
  }
}

// Setup event listeners
onMounted(() => {
  if (messageListRef.value) {
    messageListRef.value.addEventListener('scroll', handleScroll)
    messageListRef.value.addEventListener('wheel', handleWheel, { passive: true })
  }

  // Listen for permission requests from backend
  cleanupPermissionListener = window.electronAPI.onPermissionRequest(handlePermissionRequest)

  // Listen for CustomAgent permission requests from backend
  cleanupCustomAgentPermissionListener = window.electronAPI.onCustomAgentPermissionRequest(handleCustomAgentPermissionRequest)
})

onUnmounted(() => {
  if (messageListRef.value) {
    messageListRef.value.removeEventListener('scroll', handleScroll)
    messageListRef.value.removeEventListener('wheel', handleWheel)
  }
  if (scrollCooldownTimer) {
    clearTimeout(scrollCooldownTimer)
  }
  if (prevClickTimer) {
    clearTimeout(prevClickTimer)
  }
  if (nextClickTimer) {
    clearTimeout(nextClickTimer)
  }
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }
  // Cleanup permission listener
  if (cleanupPermissionListener) {
    cleanupPermissionListener()
    cleanupPermissionListener = null
  }
  // Cleanup CustomAgent permission listener
  if (cleanupCustomAgentPermissionListener) {
    cleanupCustomAgentPermissionListener()
    cleanupCustomAgentPermissionListener = null
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
        // Apply each pending permission to the UI
        for (const info of response.pending) {
          handlePermissionRequest(info)
        }
      }
    } catch (error) {
      console.error('[Frontend] Failed to load pending permissions:', error)
    }
  },
  { immediate: true }
)

// Auto-scroll to bottom when messages change or loading state changes
// Only scroll if user hasn't scrolled away manually
watch(
  [() => props.messages, () => props.isLoading],
  async () => {
    await nextTick()
    if (messageListRef.value && !userScrolledAway.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  },
  { deep: true }
)

// Reset userScrolledAway when streaming ends
watch(
  () => props.isLoading,
  (isLoading, wasLoading) => {
    // When loading finishes (was true, now false), reset scroll state
    if (wasLoading && !isLoading) {
      userScrolledAway.value = false
    }
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
// response: 'once' = allow this time, 'session' = allow for session, 'workspace' = allow permanently in workspace
// Note: 'always' is kept for backwards compatibility and maps to 'session'
async function handleConfirmTool(toolCall: any, response: 'once' | 'session' | 'workspace' | 'always' = 'once') {
  const currentSession = panelSession.value
  if (!currentSession) return

  // Check if this is a CustomAgent permission request
  const customAgentPermissionId = (toolCall as any).customAgentPermissionId
  if (customAgentPermissionId) {
    console.log(`[Frontend] Responding to CustomAgent permission ${customAgentPermissionId} with ${response}`)
    try {
      // Map 'once'/'always' to the decision format expected by CustomAgent
      const decision = response === 'once' ? 'allow' : 'always'
      await window.electronAPI.respondToCustomAgentPermission(customAgentPermissionId, decision)

      // Update UI state - find the step in nested childSteps
      for (const message of props.messages) {
        for (const parentStep of message.steps || []) {
          if (parentStep.childSteps?.length) {
            const childIndex = parentStep.childSteps.findIndex(
              (c: any) => c.customAgentPermissionId === customAgentPermissionId ||
                          c.toolCall?.customAgentPermissionId === customAgentPermissionId
            )
            if (childIndex >= 0) {
              const childStep = parentStep.childSteps[childIndex]
              childStep.status = 'running'
              delete (childStep as any).customAgentPermissionId
              if (childStep.toolCall) {
                childStep.toolCall.status = 'executing'
                childStep.toolCall.requiresConfirmation = false
                delete (childStep.toolCall as any).customAgentPermissionId
              }
              // Force Vue reactivity
              const parentIndex = message.steps!.findIndex(s => s.id === parentStep.id)
              if (parentIndex >= 0) {
                const newChildSteps = [...parentStep.childSteps]
                newChildSteps[childIndex] = { ...childStep }
                message.steps![parentIndex] = { ...parentStep, childSteps: newChildSteps }
                message.steps = [...message.steps!]
              }
              break
            }
          }
        }
      }
      return
    } catch (error) {
      console.error('Failed to respond to CustomAgent permission:', error)
    }
  }

  // Find the message containing this tool call
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )
  const tc = message?.toolCalls?.find(t => t.id === toolCall.id)

  // Find and update the corresponding step
  const step = message?.steps?.find(s => s.toolCallId === toolCall.id)

  // Check if there's a pending permission request for this tool call
  const permissionId = (toolCall as any).permissionId
  if (permissionId) {
    // Use Permission system to respond
    console.log(`[Frontend] Responding to permission ${permissionId} with ${response}`)
    try {
      await window.electronAPI.respondToPermission({
        sessionId: currentSession.id,
        permissionId,
        response,
      })
      // The backend will handle execution and resume - just update UI state
      if (tc) {
        tc.status = 'executing'
        tc.requiresConfirmation = false
      }
      if (step) {
        step.status = 'running'
        if (step.toolCall) {
          step.toolCall.status = 'executing'
          step.toolCall.requiresConfirmation = false
        }
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
    if (step.toolCall) {
      step.toolCall.status = 'executing'
      step.toolCall.requiresConfirmation = false
    }
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

    // Update step status
    if (step) {
      step.status = result.success ? 'completed' : 'failed'
      step.result = typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
      step.error = result.error
      if (step.toolCall) {
        step.toolCall.status = result.success ? 'completed' : 'failed'
        step.toolCall.result = result.result
        step.toolCall.error = result.error
      }
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
      if (step.toolCall) {
        step.toolCall.status = 'failed'
        step.toolCall.error = String(error)
      }
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

  // Check if this is a CustomAgent permission request
  const customAgentPermissionId = (toolCall as any).customAgentPermissionId
  if (customAgentPermissionId) {
    console.log(`[Frontend] Rejecting CustomAgent permission ${customAgentPermissionId}`, rejectReasonArg ? `Reason: ${rejectReasonArg}` : '')
    try {
      await window.electronAPI.respondToCustomAgentPermission(customAgentPermissionId, 'reject')

      // Update UI state - find the step in nested childSteps
      for (const message of props.messages) {
        for (const parentStep of message.steps || []) {
          if (parentStep.childSteps?.length) {
            const childIndex = parentStep.childSteps.findIndex(
              (c: any) => c.customAgentPermissionId === customAgentPermissionId ||
                          c.toolCall?.customAgentPermissionId === customAgentPermissionId
            )
            if (childIndex >= 0) {
              const childStep = parentStep.childSteps[childIndex]
              childStep.status = 'failed'
              childStep.error = 'Command rejected by user'
              delete (childStep as any).customAgentPermissionId
              if (childStep.toolCall) {
                childStep.toolCall.status = 'cancelled'
                childStep.toolCall.error = 'Command rejected by user'
                childStep.toolCall.requiresConfirmation = false
                delete (childStep.toolCall as any).customAgentPermissionId
              }
              // Force Vue reactivity
              const parentIndex = message.steps!.findIndex(s => s.id === parentStep.id)
              if (parentIndex >= 0) {
                const newChildSteps = [...parentStep.childSteps]
                newChildSteps[childIndex] = { ...childStep }
                message.steps![parentIndex] = { ...parentStep, childSteps: newChildSteps }
                message.steps = [...message.steps!]
              }
              break
            }
          }
        }
      }
      return
    } catch (error) {
      console.error('Failed to respond to CustomAgent permission:', error)
    }
  }

  // Find the message containing this tool call and update its status
  const message = props.messages.find(m =>
    m.toolCalls?.some(tc => tc.id === toolCall.id)
  )

  // Check if there's a pending permission request for this tool call
  const permissionId = (toolCall as any).permissionId
  if (permissionId) {
    // Use Permission system to respond with reject
    console.log(`[Frontend] Rejecting permission ${permissionId}`, rejectReasonArg ? `Reason: ${rejectReasonArg}` : '')
    try {
      await window.electronAPI.respondToPermission({
        sessionId: currentSession.id,
        permissionId,
        response: 'reject',
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

    // Update the corresponding step
    const step = message.steps?.find(s => s.toolCallId === toolCall.id)
    if (step) {
      step.status = 'failed'
      step.error = 'Command execution cancelled by user'
      if (step.toolCall) {
        step.toolCall.status = 'cancelled'
        step.toolCall.error = 'Command rejected by user'
        step.toolCall.requiresConfirmation = false
      }
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

.message-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px 18px var(--composer-height, 140px);
  background: transparent;
  /* Match parent container's border-radius for proper clipping at bottom corners */
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
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
  padding: 12px 12px var(--composer-height, 140px);
}

.message-list.density-comfortable {
  --message-gap: 10px;
  --message-padding: 14px 18px;
  --message-font-size: 15px;
  --message-line-height: 1.6;
  --avatar-size: 32px;
  --content-spacing: 0.75em;
  gap: 14px;
  padding: 18px 18px var(--composer-height, 140px);
}

.message-list.density-spacious {
  --message-gap: 16px;
  --message-padding: 18px 24px;
  --message-font-size: 16px;
  --message-line-height: 1.8;
  --avatar-size: 40px;
  --content-spacing: 1em;
  gap: 24px;
  padding: 24px 24px var(--composer-height, 140px);
}

/* List Transitions */
.msg-list-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.msg-list-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

/* User message navigation buttons */
.nav-buttons {
  position: absolute;
  bottom: 140px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 100;
  user-select: none;
}

.nav-position {
  font-size: 11px;
  color: var(--muted);
  background: var(--panel);
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
}

.nav-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.nav-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
  border-color: rgba(59, 130, 246, 0.3);
  transform: scale(1.05);
}

.nav-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

html[data-theme='light'] .nav-btn {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Responsive styles */
@media (max-width: 768px) {
  .message-list {
    padding: 14px 12px var(--composer-height, 120px);
    gap: 12px;
  }

  .thinking-indicator {
    padding: 14px 16px;
    border-radius: 14px;
  }

  .nav-buttons {
    right: 12px;
    bottom: 120px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
}

@media (max-width: 480px) {
  .message-list {
    padding: 10px 8px var(--composer-height, 100px);
    gap: 10px;
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

  .nav-buttons {
    right: 12px;
    bottom: 100px;
  }

  .nav-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }

  .nav-btn svg {
    width: 14px;
    height: 14px;
  }

  .nav-position {
    font-size: 10px;
    padding: 2px 6px;
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
  z-index: 10000;
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
