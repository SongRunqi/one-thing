<template>
  <div class="message-list" ref="messageListRef">
    <div v-if="messages.length === 0 && !isLoading" class="empty-state">
      <div class="empty-title">
        <span class="typing-text">one thing</span>
        <!-- <span class="cursor"></span> -->
      </div>
      <div class="empty-subtitle">Ask anything</div>
    </div>
    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :branches="getBranchesForMessage(message.id)"
      :can-branch="canCreateBranch"
      :is-highlighted="message.id === highlightedMessageId"
      @edit="handleEdit"
      @branch="handleBranch"
      @go-to-branch="handleGoToBranch"
      @quote="handleQuote"
      @regenerate="handleRegenerate"
    />

    <!-- Loading indicator (only show if no streaming message exists to avoid duplicate indicators) -->
    <div v-if="isLoading && !hasStreamingMessage" class="thinking-indicator">
      <div class="thinking-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div class="thinking-content">
        <div class="thinking-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
        <span class="thinking-text">Thinking...</span>
      </div>
    </div>

    <!-- User message navigation buttons -->
    <div v-if="userMessageIndices.length > 1" class="nav-buttons">
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import type { ChatMessage } from '@/types'
import MessageItem from './MessageItem.vue'
import Tooltip from '../common/Tooltip.vue'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'

interface BranchInfo {
  id: string
  name: string
}

interface Props {
  messages: ChatMessage[]
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
})

const emit = defineEmits<{
  setQuotedText: [text: string]
  regenerate: [messageId: string]
}>()

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const messageListRef = ref<HTMLElement | null>(null)

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

// Navigate to last user message (double-click)
function goToLastUserMessage() {
  if (userMessageIndices.value.length === 0) return
  hasNavigated.value = true
  currentUserMessageNavIndex.value = userMessageIndices.value.length - 1
  scrollToUserMessage(userMessageIndices.value.length - 1)
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
  const currentSession = sessionsStore.currentSession
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
  const currentSession = sessionsStore.currentSession
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

// Setup event listeners
onMounted(() => {
  if (messageListRef.value) {
    messageListRef.value.addEventListener('scroll', handleScroll)
    messageListRef.value.addEventListener('wheel', handleWheel, { passive: true })
  }
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
})

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

// Handle edit message event
async function handleEdit(messageId: string, newContent: string) {
  const currentSession = sessionsStore.currentSession
  if (!currentSession) return
  await chatStore.editAndResend(currentSession.id, messageId, newContent)
}

// Handle branch creation event
async function handleBranch(messageId: string, quotedText?: string) {
  const currentSession = sessionsStore.currentSession
  if (!currentSession) return

  // Create the branch
  await sessionsStore.createBranch(currentSession.id, messageId)

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
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px 18px 26px;
  background: transparent;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  gap: 12px;
  user-select: none;
}

.empty-title {
  display: flex;
  align-items: center;
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.5px;
}

.typing-text {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 0;
  animation: typing 1.2s steps(9, end) forwards;
  animation-delay: 0.3s;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: var(--accent);
  margin-left: 2px;
  animation: blink 1s step-end 3 forwards;
  opacity: 0;
  animation-delay: 1.5s;
}

@keyframes typing {
  from {
    width: 0;
  }
  to {
    width: 4.8em;
  }
}

@keyframes blink {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}

.empty-subtitle {
  font-size: 15px;
  color: var(--muted);
  opacity: 0;
  animation: fadeInUp 0.5s ease forwards;
  animation-delay: 1.5s;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Thinking indicator */
.thinking-indicator {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: min(860px, 100%);
  padding: 16px 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.thinking-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(59, 130, 246);
  flex-shrink: 0;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.thinking-content {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 6px;
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.dot {
  width: 8px;
  height: 8px;
  background: rgb(59, 130, 246);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.dot:nth-child(1) {
  animation-delay: 0s;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

.thinking-text {
  font-size: 14px;
  color: var(--muted);
  font-style: italic;
}

/* User message navigation buttons */
.nav-buttons {
  position: fixed;
  bottom: 140px;
  right: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 1000;
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
    padding: 14px 12px 22px;
    gap: 12px;
  }

  .thinking-indicator {
    padding: 14px 16px;
    border-radius: 14px;
  }

  .nav-buttons {
    right: 16px;
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
    padding: 10px 8px 18px;
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
</style>
