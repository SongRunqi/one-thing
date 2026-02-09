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
        v-else
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="virtualItem.key"
          :data-index="virtualItem.index"
          :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
          class="virtual-message-item"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }"
        >
          <MessageItem
            :data-message-id="messages[virtualItem.index].id"
            :message="messages[virtualItem.index]"
            :branches="getBranchesForMessage(messages[virtualItem.index].id)"
            :can-branch="canCreateBranch"
            :is-highlighted="messages[virtualItem.index].id === highlightedMessageId"
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
        </div>
      </div>
    </div>

    <!-- User message navigation rail (timeline) -->
    <div
      v-if="userMessageIndices.length > 1"
      class="nav-rail"
    >
      <div
        ref="navRailTrackRef"
        class="nav-rail-track"
        @click="handleRailClick"
      >
        <div class="nav-rail-line" />
        <button
          v-for="marker in displayNavMarkers"
          :key="marker.messageId"
          class="nav-marker"
          :class="{ active: marker.navIndex === currentUserMessageNavIndex }"
          :style="{ top: `${marker.position * 100}%` }"
          :title="marker.label"
          @click.stop="handleMarkerClick(marker.navIndex)"
        />
      </div>
      <span class="nav-counter">{{ navCounter }}</span>
    </div>

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
              <div class="reject-mode-options">
                <label class="reject-mode-option">
                  <input
                    v-model="rejectMode"
                    type="radio"
                    value="stop"
                  >
                  <span class="reject-mode-label">拒绝并停止</span>
                  <span class="reject-mode-hint">AI 将停止执行</span>
                </label>
                <label class="reject-mode-option">
                  <input
                    v-model="rejectMode"
                    type="radio"
                    value="continue"
                  >
                  <span class="reject-mode-label">拒绝，换个方式</span>
                  <span class="reject-mode-hint">AI 将尝试其他方法</span>
                </label>
              </div>
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
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { UIMessage, AgentVoice, ToolCall, ToolUIPart, TextUIPart } from '@/types'
import MessageItem from './MessageItem.vue'
import EmptyState from './EmptyState.vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import { useSettingsStore } from '@/stores/settings'
import { usePermissionShortcuts } from '@/composables/usePermissionShortcuts'
import { getMessageText, getToolParts } from '@shared/message-converters'

interface BranchInfo {
  id: string
  name: string
}

interface NavMarker {
  navIndex: number
  messageId: string
  position: number
  label: string
}

interface Props {
  messages: UIMessage[]
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
const navRailTrackRef = ref<HTMLElement | null>(null)
const navMarkers = ref<NavMarker[]>([])

// Virtual scrolling setup
const virtualizer = useVirtualizer({
  count: computed(() => props.messages.length),
  getScrollElement: () => messageListRef.value,
  estimateSize: () => 164, // Estimated message height (150px) + margin (14px)
  overscan: 5, // Render 5 extra items above/below viewport
  measureElement: (el) => {
    // Measure actual element height for dynamic sizing (includes margin)
    return el?.getBoundingClientRect().height ?? 164
  },
})

const virtualItems = computed(() => virtualizer.value.getVirtualItems())

// Reject reason dialog state
const showRejectDialog = ref(false)
const rejectReason = ref('')
const rejectMode = ref<'stop' | 'continue'>('stop')
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

// Flag to prevent scroll handler from overriding navigation index during active navigation
let isActivelyNavigating = false
let navigationCooldownTimer: ReturnType<typeof setTimeout> | null = null
let navMarkerUpdateFrame: number | null = null
let navResizeObserver: ResizeObserver | null = null

// Get indices of user messages
const userMessageIndices = computed(() => {
  return props.messages
    .map((msg, index) => ({ msg, index }))
    .filter(item => item.msg.role === 'user')
    .map(item => item.index)
})

const navCounter = computed(() => {
  if (userMessageIndices.value.length === 0) return '0/0'
  const index = currentUserMessageNavIndex.value >= 0 ? currentUserMessageNavIndex.value + 1 : 1
  return `${index}/${userMessageIndices.value.length}`
})

const displayNavMarkers = computed<NavMarker[]>(() => {
  const total = userMessageIndices.value.length
  if (total === 0) return []

  const fallbackMarkers = userMessageIndices.value.map((messageIndex, navIndex) => {
    const message = props.messages[messageIndex]
    const position = total > 1 ? navIndex / (total - 1) : 0.5
    return {
      navIndex,
      messageId: message?.id || `nav-${navIndex}`,
      position: Math.min(0.98, Math.max(0.02, position)),
      label: message ? buildNavMarkerLabel(message, navIndex) : `${navIndex + 1}/${total}`
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
  if (!hasNavigated.value) return null
  if (currentUserMessageNavIndex.value < 0) return null
  const messageIndex = userMessageIndices.value[currentUserMessageNavIndex.value]
  if (messageIndex === undefined) return null
  return props.messages[messageIndex]?.id || null
})

// Initialize navigation index when messages change
watch(
  [effectiveSessionId, () => props.messages.length],
  ([newSessionId], [oldSessionId]) => {
    // Reset navigation state when messages or sessions change
    hasNavigated.value = false

    // Clear cached markers when session changes to avoid stale position data
    if (newSessionId !== oldSessionId) {
      navMarkers.value = []
    }

    // Reset to last user message when messages change
    if (userMessageIndices.value.length > 0) {
      currentUserMessageNavIndex.value = userMessageIndices.value.length - 1
    } else {
      currentUserMessageNavIndex.value = -1
    }

    // Schedule marker update after DOM renders
    // Use double nextTick to ensure TransitionGroup animations have started
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
  currentUserMessageNavIndex.value = navIndex
  scrollToUserMessage(navIndex)
}

function handleMarkerClick(navIndex: number) {
  navigateToUserMessage(navIndex)
}

function handleRailClick(event: MouseEvent) {
  if (!navRailTrackRef.value || displayNavMarkers.value.length === 0) return
  const rect = navRailTrackRef.value.getBoundingClientRect()
  if (rect.height <= 0) return

  const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  let closestMarker = displayNavMarkers.value[0]
  let closestDistance = Math.abs(closestMarker.position - ratio)

  for (const marker of displayNavMarkers.value) {
    const distance = Math.abs(marker.position - ratio)
    if (distance < closestDistance) {
      closestMarker = marker
      closestDistance = distance
    }
  }

  navigateToUserMessage(closestMarker.navIndex)
}

// Scroll to a specific user message by nav index
function scrollToUserMessage(navIndex: number) {
  const messageIndex = userMessageIndices.value[navIndex]
  if (messageIndex === undefined) return

  const message = props.messages[messageIndex]
  if (!message) return

  // Prevent scroll handler from overriding the navigation index
  isActivelyNavigating = true
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }

  // Use virtualizer to scroll to message
  virtualizer.value.scrollToIndex(messageIndex, {
    align: 'center',
    behavior: 'smooth',
  })

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

function buildNavMarkerLabel(message: UIMessage, navIndex: number): string {
  const total = userMessageIndices.value.length
  const rawContent = getMessageText(message)
  const compact = rawContent.replace(/\s+/g, ' ').trim()
  const snippet = compact ? compact.slice(0, 48) : 'No text'
  const timestamp = message.metadata?.timestamp ?? 0
  return `${navIndex + 1}/${total} ${formatNavTime(timestamp)} - ${snippet}`
}

function updateNavMarkers() {
  if (userMessageIndices.value.length === 0) {
    navMarkers.value = []
    return
  }

  // Get total virtual size for calculating positions
  const totalHeight = virtualizer.value.getTotalSize() || 1
  const markers: NavMarker[] = []
  const total = userMessageIndices.value.length

  for (let navIndex = 0; navIndex < userMessageIndices.value.length; navIndex++) {
    const messageIndex = userMessageIndices.value[navIndex]
    const message = props.messages[messageIndex]
    if (!message) continue

    // Calculate position based on virtual scroll position
    // Use the virtualizer's internal measurement system
    const fallbackPosition = total > 1 ? navIndex / (total - 1) : 0.5
    let position = Math.min(0.98, Math.max(0.02, fallbackPosition))

    // Try to get more accurate position from virtualizer
    try {
      const virtualItems = virtualizer.value.getVirtualItems()
      const virtualItem = virtualItems.find(item => item.index === messageIndex)

      if (virtualItem) {
        // Use virtual item's start position + half its size for center
        const messageCenter = virtualItem.start + (virtualItem.size / 2)
        const ratio = messageCenter / totalHeight
        position = Math.min(0.98, Math.max(0.02, ratio))
      }
    } catch (e) {
      // Fallback to estimated position
    }

    markers.push({
      navIndex,
      messageId: message.id,
      position,
      label: buildNavMarkerLabel(message, navIndex)
    })
  }

  navMarkers.value = markers
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
  return props.messages.some(m =>
    m.parts.some(p => p.type === 'text' && (p as TextUIPart).state === 'streaming')
  )
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
  const scrollTop = container.scrollTop
  const containerHeight = container.clientHeight
  const viewportCenter = scrollTop + containerHeight / 2

  let closestIndex = 0
  let closestDistance = Infinity

  // Find the user message closest to viewport center using virtual positions
  for (let i = 0; i < userMessageIndices.value.length; i++) {
    const messageIndex = userMessageIndices.value[i]
    const message = props.messages[messageIndex]
    if (!message) continue

    try {
      const virtualItems = virtualizer.value.getVirtualItems()
      const virtualItem = virtualItems.find(item => item.index === messageIndex)

      if (virtualItem) {
        const messageCenter = virtualItem.start + (virtualItem.size / 2)
        const distance = Math.abs(messageCenter - viewportCenter)

        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = i
        }
      }
    } catch (e) {
      // Fallback: estimate based on index
      const totalMessages = props.messages.length
      const estimatedPosition = (messageIndex / totalMessages) * virtualizer.value.getTotalSize()
      const distance = Math.abs(estimatedPosition - viewportCenter)

      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = i
      }
    }
  }

  currentUserMessageNavIndex.value = closestIndex
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
// Searches ToolUIPart in message.parts AND nested childSteps in data-steps parts
const currentPendingPermission = computed<{ message: UIMessage; toolCall: ToolCall } | null>(() => {
  for (const message of props.messages) {
    // 1. Check ToolUIParts in parts (normal tool calls)
    const toolParts = getToolParts(message)
    const pendingToolPart = toolParts.find(tp => tp.requiresConfirmation)
    if (pendingToolPart) {
      // Convert ToolUIPart to ToolCall-like for permission system compatibility
      const toolCall = toolUIPartToToolCall(pendingToolPart) as any
      // Preserve permissionId if set
      if ((pendingToolPart as any).permissionId) {
        toolCall.permissionId = (pendingToolPart as any).permissionId
      }
      return { message, toolCall }
    }

    // 2. Check nested childSteps (CustomAgent sub-tool calls) in data-steps parts
    const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
    for (const stepPart of stepParts) {
      for (const step of stepPart.steps || []) {
        if (step.childSteps?.length) {
          for (const childStep of step.childSteps) {
            if (childStep.toolCall?.requiresConfirmation) {
              return { message, toolCall: childStep.toolCall }
            }
            if ((childStep as any).customAgentPermissionId && childStep.status === 'awaiting-confirmation') {
              const existingToolCall = childStep.toolCall as ToolCall | undefined
              const toolCallFromStep: ToolCall & { customAgentPermissionId?: string } = existingToolCall ?? {
                id: childStep.id,
                toolId: childStep.type === 'command' ? 'bash' : childStep.type,
                toolName: childStep.title?.split(':')[0] || 'unknown',
                arguments: {},
                status: 'pending' as const,
                timestamp: childStep.timestamp,
                requiresConfirmation: true,
              }
              toolCallFromStep.customAgentPermissionId = (childStep as any).customAgentPermissionId
              return { message, toolCall: toolCallFromStep as ToolCall }
            }
          }
        }
      }
    }
  }
  return null
})

/** Convert ToolUIPart to legacy ToolCall for permission system compatibility */
function toolUIPartToToolCall(tp: ToolUIPart): ToolCall {
  return {
    id: tp.toolCallId,
    toolId: tp.toolName || tp.type.replace('tool-', ''),
    toolName: tp.toolName || tp.type.replace('tool-', ''),
    arguments: tp.input || {},
    status: tp.state === 'output-available' ? 'completed' as const
      : tp.state === 'output-error' ? 'failed' as const
      : tp.state === 'input-streaming' ? 'input-streaming' as const
      : 'pending' as const,
    result: tp.output as any,
    error: tp.errorText,
    requiresConfirmation: tp.requiresConfirmation,
    commandType: tp.commandType,
    startTime: tp.startTime,
    endTime: tp.endTime,
    timestamp: 0,
  } as ToolCall
}

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

  // Find the message that needs confirmation
  const message = props.messages.find(m => m.id === info.messageId)
  if (!message) {
    console.log('[Frontend] Message not found for permission request, messageId:', info.messageId)
    console.log('[Frontend] Available messages:', props.messages.map(m => m.id))
    return
  }

  // Find the ToolUIPart by callId or by matching command in metadata
  const toolParts = getToolParts(message)
  let toolPart = toolParts.find(tp => tp.toolCallId === info.callId)
  if (!toolPart && info.metadata.command) {
    toolPart = toolParts.find(tp => tp.input?.command === info.metadata.command)
  }

  if (toolPart) {
    // Store permission ID on tool part for later response
    ;(toolPart as any).permissionId = info.id
    toolPart.requiresConfirmation = true
    toolPart.state = 'input-available'

    // Update corresponding step in data-steps parts
    const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
    for (const stepPart of stepParts) {
      const step = stepPart.steps?.find((s: any) => s.toolCallId === toolPart!.toolCallId)
      if (step) {
        step.status = 'awaiting-confirmation'
        if (info.metadata && (info.metadata.diff || info.metadata.filePath)) {
          step.result = JSON.stringify(info.metadata)
        }
        if (step.toolCall) {
          ;(step.toolCall as any).permissionId = info.id
          step.toolCall.requiresConfirmation = true
          step.toolCall.status = 'pending'
        }
        break
      }
    }
    // Force reactivity by replacing parts array
    message.parts = [...message.parts]

    console.log('[Frontend] Updated tool part with permission request:', toolPart.toolCallId)
  } else {
    console.log('[Frontend] No matching tool part found for permission request')
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

  // Find the nested step that needs permission in data-steps parts
  let foundStep: any = null
  let parentStep: any = null
  let stepPartRef: any = null

  const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
  for (const sp of stepParts) {
    for (const step of sp.steps || []) {
      if (step.childSteps?.length) {
        for (const childStep of step.childSteps) {
          if (childStep.toolCallId === info.toolCall.id ||
              (childStep.toolCall?.toolName === info.toolCall.toolName &&
               JSON.stringify(childStep.toolCall?.arguments) === JSON.stringify(info.toolCall.arguments))) {
            foundStep = childStep
            parentStep = step
            stepPartRef = sp
            break
          }
        }
      }
      if (foundStep) break
    }
    if (foundStep) break
  }

  if (foundStep && parentStep) {
    (foundStep as any).customAgentPermissionId = info.requestId
    foundStep.status = 'awaiting-confirmation'

    if (foundStep.toolCall) {
      (foundStep.toolCall as any).customAgentPermissionId = info.requestId
      foundStep.toolCall.requiresConfirmation = true
      foundStep.toolCall.status = 'pending'
      foundStep.toolCall.commandType = info.toolCall.commandType
    }

    // Force Vue reactivity
    const parentIndex = stepPartRef.steps.findIndex((s: any) => s.id === parentStep.id)
    if (parentIndex >= 0) {
      const newChildSteps = parentStep.childSteps!.map((c: any) =>
        c === foundStep ? { ...foundStep } : c
      )
      stepPartRef.steps[parentIndex] = {
        ...parentStep,
        childSteps: newChildSteps,
      }
    }
    message.parts = [...message.parts]

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
    if (typeof ResizeObserver !== 'undefined') {
      navResizeObserver = new ResizeObserver(() => scheduleNavMarkerUpdate())
      navResizeObserver.observe(messageListRef.value)
    }
  }
  nextTick(() => scheduleNavMarkerUpdate())

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
  if (navigationCooldownTimer) {
    clearTimeout(navigationCooldownTimer)
  }
  if (navMarkerUpdateFrame !== null) {
    cancelAnimationFrame(navMarkerUpdateFrame)
    navMarkerUpdateFrame = null
  }
  if (navResizeObserver) {
    navResizeObserver.disconnect()
    navResizeObserver = null
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
    if (!userScrolledAway.value && props.messages.length > 0) {
      // Use virtualizer to scroll to last message
      virtualizer.value.scrollToIndex(props.messages.length - 1, {
        align: 'end',
        behavior: 'auto',
      })
    }
    scheduleNavMarkerUpdate()
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

  // Find the message containing this tool call via ToolUIPart
  const message = props.messages.find(m => {
    const parts = getToolParts(m)
    return parts.some(tp => tp.toolCallId === toolCall.id)
  })
  const toolPart = message ? getToolParts(message).find(tp => tp.toolCallId === toolCall.id) : undefined

  // Record start time
  const startTime = Date.now()
  if (toolPart) {
    toolPart.state = 'input-available'
    toolPart.startTime = startTime
    message!.parts = [...message!.parts]
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
    if (toolPart) {
      toolPart.endTime = endTime
      toolPart.state = result.success ? 'output-available' : 'output-error'
      toolPart.output = result.result
      toolPart.errorText = result.error
      message!.parts = [...message!.parts]
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
    if (toolPart) {
      toolPart.endTime = endTime
      toolPart.state = 'output-error'
      toolPart.errorText = String(error)
      message!.parts = [...message!.parts]
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

      // Update UI state - find the step in nested childSteps within data-steps parts
      for (const message of props.messages) {
        const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
        for (const sp of stepParts) {
          for (const parentStep of sp.steps || []) {
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
                const parentIndex = sp.steps.findIndex((s: any) => s.id === parentStep.id)
                if (parentIndex >= 0) {
                  const newChildSteps = [...parentStep.childSteps]
                  newChildSteps[childIndex] = { ...childStep }
                  sp.steps[parentIndex] = { ...parentStep, childSteps: newChildSteps }
                }
                message.parts = [...message.parts]
                break
              }
            }
          }
        }
      }
      return
    } catch (error) {
      console.error('Failed to respond to CustomAgent permission:', error)
    }
  }

  // Find the message containing this tool call via ToolUIPart
  const message = props.messages.find(m => {
    const parts = getToolParts(m)
    return parts.some(tp => tp.toolCallId === toolCall.id)
  })
  const toolPart = message ? getToolParts(message).find(tp => tp.toolCallId === toolCall.id) : undefined

  // Find and update the corresponding step in data-steps parts
  let step: any = undefined
  if (message) {
    const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
    for (const sp of stepParts) {
      step = sp.steps?.find((s: any) => s.toolCallId === toolCall.id)
      if (step) break
    }
  }

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
      if (toolPart) {
        toolPart.state = 'input-available'
        toolPart.requiresConfirmation = false
      }
      if (step) {
        step.status = 'running'
        if (step.toolCall) {
          step.toolCall.status = 'executing'
          step.toolCall.requiresConfirmation = false
        }
      }
      if (message) {
        message.parts = [...message.parts]
      }
      return
    } catch (error) {
      console.error('Failed to respond to permission:', error)
    }
  }

  // Fallback: Legacy flow - re-execute tool directly with confirmed: true
  // Record start time
  const startTime = Date.now()
  if (toolPart) {
    toolPart.state = 'input-available'
    toolPart.startTime = startTime
    toolPart.requiresConfirmation = false
  }

  // Update step to running
  if (step) {
    step.status = 'running'
    if (step.toolCall) {
      step.toolCall.status = 'executing'
      step.toolCall.requiresConfirmation = false
    }
  }
  if (message) {
    message.parts = [...message.parts]
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
    if (toolPart) {
      toolPart.endTime = endTime
      toolPart.state = result.success ? 'output-available' : 'output-error'
      toolPart.output = result.result
      toolPart.errorText = result.error
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
    }
    if (message) {
      message.parts = [...message.parts]
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
    if (toolPart) {
      toolPart.endTime = endTime
      toolPart.state = 'output-error'
      toolPart.errorText = String(error)
    }

    // Update step status on error
    if (step) {
      step.status = 'failed'
      step.error = String(error)
      if (step.toolCall) {
        step.toolCall.status = 'failed'
        step.toolCall.error = String(error)
      }
    }
    if (message) {
      message.parts = [...message.parts]
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
  rejectMode.value = 'stop'  // Reset to default
  showRejectDialog.value = true
  // Focus the textarea after dialog opens
  nextTick(() => {
    rejectReasonInputRef.value?.focus()
  })
}

// Confirm rejection with reason
function confirmReject() {
  if (pendingRejectToolCall.value) {
    handleRejectTool(
      pendingRejectToolCall.value,
      rejectReason.value.trim() || undefined,
      rejectMode.value
    )
  }
  cancelReject()
}

// Cancel the reject dialog
function cancelReject() {
  showRejectDialog.value = false
  rejectReason.value = ''
  pendingRejectToolCall.value = null
}

// Handle tool rejection with optional reason and mode
async function handleRejectTool(toolCall: any, rejectReasonArg?: string, rejectModeArg: 'stop' | 'continue' = 'stop') {
  // Update the tool call status to cancelled/rejected
  const currentSession = panelSession.value
  if (!currentSession) return

  // Check if this is a CustomAgent permission request
  const customAgentPermissionId = (toolCall as any).customAgentPermissionId
  if (customAgentPermissionId) {
    console.log(`[Frontend] Rejecting CustomAgent permission ${customAgentPermissionId}`, rejectReasonArg ? `Reason: ${rejectReasonArg}` : '')
    try {
      await window.electronAPI.respondToCustomAgentPermission(customAgentPermissionId, 'reject')

      // Update UI state - find the step in nested childSteps within data-steps parts
      for (const message of props.messages) {
        const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
        for (const sp of stepParts) {
          for (const parentStep of sp.steps || []) {
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
                const parentIndex = sp.steps.findIndex((s: any) => s.id === parentStep.id)
                if (parentIndex >= 0) {
                  const newChildSteps = [...parentStep.childSteps]
                  newChildSteps[childIndex] = { ...childStep }
                  sp.steps[parentIndex] = { ...parentStep, childSteps: newChildSteps }
                }
                message.parts = [...message.parts]
                break
              }
            }
          }
        }
      }
      return
    } catch (error) {
      console.error('Failed to respond to CustomAgent permission:', error)
    }
  }

  // Find the message containing this tool call via ToolUIPart
  const message = props.messages.find(m => {
    const parts = getToolParts(m)
    return parts.some(tp => tp.toolCallId === toolCall.id)
  })

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
        rejectMode: rejectModeArg,
      })
    } catch (error) {
      console.error('Failed to respond to permission:', error)
    }
  }

  if (message) {
    const toolPart = getToolParts(message).find(tp => tp.toolCallId === toolCall.id)
    if (toolPart) {
      toolPart.state = 'output-error'
      toolPart.errorText = 'Command rejected by user'
      toolPart.requiresConfirmation = false
    }

    // Update the corresponding step in data-steps parts
    const stepParts = message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
    for (const sp of stepParts) {
      const step = sp.steps?.find((s: any) => s.toolCallId === toolCall.id)
      if (step) {
        step.status = 'failed'
        step.error = 'Command execution cancelled by user'
        if (step.toolCall) {
          step.toolCall.status = 'cancelled'
          step.toolCall.error = 'Command rejected by user'
          step.toolCall.requiresConfirmation = false
        }
        break
      }
    }
    // Force reactivity
    message.parts = [...message.parts]
  }
}

// Handle updating thinking time for a message
async function handleUpdateThinkingTime(messageId: string, thinkingTime: number) {
  const currentSession = panelSession.value
  if (!currentSession) return

  try {
    // Update local message metadata
    const message = props.messages.find(m => m.id === messageId)
    if (message) {
      message.metadata = { timestamp: Date.now(), ...message.metadata, thinkingTime }
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
  /* Required for correct offsetTop calculation in nav markers */
  position: relative;
}

/* Virtual message item wrapper */
.virtual-message-item {
  margin-bottom: 14px;
}

.message-list.density-compact .virtual-message-item {
  margin-bottom: 6px;
}

.message-list.density-spacious .virtual-message-item {
  margin-bottom: 24px;
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

/* User message navigation rail */
.nav-rail {
  position: absolute;
  top: 16px;
  bottom: calc(var(--composer-height, 140px) + 16px);
  right: 12px;
  width: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 100;
  user-select: none;
}

.nav-rail-track {
  position: relative;
  flex: 1;
  width: 100%;
  cursor: pointer;
}

.nav-rail-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 999px;
}

.nav-marker {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 7px;
  height: 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--text) 35%, var(--border));
  background: color-mix(in srgb, var(--text) 65%, transparent);
  opacity: 0.75;
  z-index: 1;
  transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.nav-marker:hover {
  transform: translate(-50%, -50%) scale(1.2);
  background: var(--text);
  opacity: 1;
}

.nav-marker.active {
  width: 11px;
  height: 11px;
  background: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent);
  opacity: 1;
}

.nav-counter {
  font-size: 10px;
  color: var(--muted);
  background: var(--panel);
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
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

  .nav-rail {
    right: 10px;
    width: 20px;
  }

  .nav-marker {
    width: 6px;
    height: 6px;
  }

  .nav-marker.active {
    width: 10px;
    height: 10px;
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

  .nav-rail {
    right: 8px;
    width: 18px;
  }

  .nav-marker {
    width: 5px;
    height: 5px;
  }

  .nav-marker.active {
    width: 9px;
    height: 9px;
  }

  .nav-counter {
    font-size: 9px;
    padding: 1px 5px;
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

.reject-mode-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.reject-mode-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reject-mode-option:hover {
  background: var(--hover);
  border-color: var(--primary);
}

.reject-mode-option:has(input:checked) {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--primary);
}

.reject-mode-option input[type="radio"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

.reject-mode-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.reject-mode-hint {
  font-size: 12px;
  color: var(--muted);
  margin-left: auto;
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
