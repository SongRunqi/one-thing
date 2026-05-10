<template>
  <div class="chat-panel">
    <MessageList
      ref="messageListRef"
      :messages="panelMessages"
      :is-loading="isLoading"
      :session-id="effectiveSessionId"
      @set-quoted-text="handleSetQuotedText"
      @set-input-text="handleSetInputText"
      @regenerate="handleRegenerate"
      @edit-and-resend="handleEditAndResend"
      @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
    />

    <div
      v-memo="[isGenerating, effectiveSessionId]"
      class="composer-container"
    >
      <InputBox
        ref="inputBoxRef"
        :is-loading="isGenerating"
        :session-id="effectiveSessionId"
        @send-message="handleSendMessage"
        @stop-generation="handleStopGeneration"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'

const props = defineProps<{
  sessionId?: string
}>()

const emit = defineEmits<{
  splitWithBranch: [sessionId: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

const {
  messages,
  isLoading,
  isGenerating,
  sendMessage: chatSendMessage,
  steerMessage: chatSteerMessage,
  queueFollowUpMessage: chatQueueFollowUpMessage,
  regenerate: chatRegenerate,
  editAndResend: chatEditAndResend,
  stopGeneration: chatStopGeneration,
} = useChatSession(effectiveSessionId)

const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

const panelMessages = computed(() => messages.value)

const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)

// Session switch: save/restore scroll position and input state
watch(effectiveSessionId, async (newId, oldId) => {
  if (oldId && oldId !== newId) {
    messageListRef.value?.prepareForSwitch()
    chatStore.saveSnapshot(oldId, {
      firstVisibleIndex: messageListRef.value?.getFirstVisibleIndex() ?? 0,
      offsetWithinMessage: messageListRef.value?.getOffsetWithinMessage() ?? 0,
      isFollowing: messageListRef.value?.getIsFollowing() ?? true,
      navIndex: messageListRef.value?.getNavIndex() ?? -1,
      hasNavigated: messageListRef.value?.getHasNavigated() ?? false,
      messageInput: inputBoxRef.value?.getMessageInput() ?? '',
      quotedText: inputBoxRef.value?.getQuotedText() ?? '',
    })
  }

  await nextTick()

  if (newId) {
    const snapshot = chatStore.getSnapshot(newId)
    if (snapshot) {
      messageListRef.value?.restoreSnapshot(snapshot)
      inputBoxRef.value?.restoreSnapshot(snapshot)
    } else {
      messageListRef.value?.scrollToBottom()
      inputBoxRef.value?.clearInput()
    }
  }
})

async function handleSendMessage(message: string, mode: 'send' | 'steer' | 'followup' = 'send') {
  if (!currentSession.value) return
  messageListRef.value?.scrollToBottom()
  if (mode === 'steer') {
    await chatSteerMessage(message)
  } else if (mode === 'followup') {
    await chatQueueFollowUpMessage(message)
  } else {
    await chatSendMessage(message)
  }
}

async function handleStopGeneration() {
  await chatStopGeneration()
}

function handleSetQuotedText(text: string) {
  inputBoxRef.value?.setQuotedText(text)
}

async function handleRegenerate(messageId: string) {
  if (!currentSession.value) return
  await chatRegenerate(messageId)
}

async function handleEditAndResend(messageId: string, newContent: string) {
  if (!currentSession.value) return
  await chatEditAndResend(messageId, newContent)
}

function handleSetInputText(text: string) {
  inputBoxRef.value?.setMessageInput(text)
}

function focusInput() {
  inputBoxRef.value?.focus()
}

async function scrollToMessage(messageId: string) {
  await nextTick()
  return messageListRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  scrollToMessage,
})
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.composer-container {
  flex-shrink: 0;
  padding: 0 16px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
