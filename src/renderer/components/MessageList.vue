<template>
  <div class="message-list" ref="messageListRef">
    <div v-if="messages.length === 0 && !isLoading" class="empty-state">
      <div class="empty-title">ChatGPT 5.2</div>
      <div class="empty-subtitle">Ask anything</div>
    </div>
    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :branches="getBranchesForMessage(message.id)"
      :can-branch="canCreateBranch"
      @edit="handleEdit"
      @branch="handleBranch"
      @go-to-branch="handleGoToBranch"
    />

    <!-- Loading indicator -->
    <div v-if="isLoading" class="thinking-indicator">
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import type { ChatMessage } from '@/types'
import MessageItem from './MessageItem.vue'
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

const chatStore = useChatStore()
const sessionsStore = useSessionsStore()
const messageListRef = ref<HTMLElement | null>(null)

// Check if current session can create branches (only root sessions can)
const canCreateBranch = computed(() => {
  const currentSession = sessionsStore.currentSession
  if (!currentSession) return false
  // Only allow branching from root sessions (no parent)
  return !currentSession.parentSessionId
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

// Auto-scroll to bottom when messages change or loading state changes
watch(
  [() => props.messages, () => props.isLoading],
  async () => {
    await nextTick()
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  },
  { deep: true }
)

// Handle edit message event
async function handleEdit(messageId: string, newContent: string) {
  const currentSession = sessionsStore.currentSession
  if (!currentSession) return
  await chatStore.editAndResend(currentSession.id, messageId, newContent)
}

// Handle branch creation event
async function handleBranch(messageId: string) {
  const currentSession = sessionsStore.currentSession
  if (!currentSession) return
  await sessionsStore.createBranch(currentSession.id, messageId)
}

// Handle go to branch event
async function handleGoToBranch(sessionId: string) {
  await sessionsStore.switchSession(sessionId)
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
  gap: 8px;
  user-select: none;
}

.empty-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.2px;
}

.empty-subtitle {
  font-size: 14px;
  color: var(--muted);
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
  background: linear-gradient(135deg, rgba(16, 163, 127, 0.2), rgba(16, 163, 127, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(16, 163, 127);
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
  background: rgb(16, 163, 127);
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
</style>
