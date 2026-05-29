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
      @open-file="(filePath) => emit('openFile', filePath)"
    />

    <TodoPlanPanel
      v-if="settingsStore.settings.general?.todoPlan?.enabled !== false"
      :session-id="effectiveSessionId"
      :working-directory="currentSession?.workingDirectory || ''"
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
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import TodoPlanPanel from './TodoPlanPanel.vue'
import type { MessageAttachment } from '@/types'

const props = defineProps<{
  sessionId?: string
}>()

const emit = defineEmits<{
  splitWithBranch: [sessionId: string]
  openFile: [filePath: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()

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
const TAIL_SNAPSHOT_DISTANCE_PX = 4
const RESTORE_WAIT_FRAME_LIMIT = 120

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

async function waitForRestorePage(sessionId: string, anchorMessageId?: string) {
  for (let frame = 0; frame < RESTORE_WAIT_FRAME_LIMIT; frame += 1) {
    if (effectiveSessionId.value !== sessionId) return false
    const messages = chatStore.sessionMessages.get(sessionId) ?? []
    const hasRestoreMessages = messages.length > 0
    const hasAnchor = !anchorMessageId || messages.some(message => message.id === anchorMessageId)
    if (!isLoading.value && hasRestoreMessages && hasAnchor) {
      await nextTick()
      return true
    }
    await nextFrame()
  }
  return effectiveSessionId.value === sessionId
}

function saveCurrentSnapshot(sessionId: string, prepareForSwitch = false) {
  const distanceToBottom = messageListRef.value?.getDistanceToBottom() ?? 0
  const isAtTail = distanceToBottom <= TAIL_SNAPSHOT_DISTANCE_PX
  const anchorMessageId = messageListRef.value?.getAnchorMessageId() ?? undefined
  const anchorOffset = messageListRef.value?.getAnchorOffset() ?? 0
  const navMessageId = messageListRef.value?.getNavMessageId() ?? undefined
  const hasNavigated = messageListRef.value?.getHasNavigated() ?? false
  const messageInput = inputBoxRef.value?.getMessageInput() ?? ''
  const quotedText = inputBoxRef.value?.getQuotedText() ?? ''
  const attachments = inputBoxRef.value?.getAttachments() ?? []

  if (prepareForSwitch) {
    messageListRef.value?.prepareForSwitch()
  }

  chatStore.saveSnapshot(sessionId, {
    mode: isAtTail || !anchorMessageId ? 'tail' : 'anchor',
    anchorMessageId: isAtTail ? undefined : anchorMessageId,
    offsetWithinMessage: isAtTail ? undefined : anchorOffset,
    navMessageId: isAtTail ? undefined : navMessageId,
    hasNavigated,
    messageInput,
    quotedText,
    attachments,
  })
}

async function restoreCurrentSnapshot(sessionId: string) {
  const snapshot = chatStore.getSnapshot(sessionId)
  if (!snapshot) return false

  if (snapshot.mode === 'anchor') {
    await waitForRestorePage(sessionId, snapshot.anchorMessageId)
  }
  if (effectiveSessionId.value !== sessionId) return false

  if (snapshot.mode === 'anchor') {
    messageListRef.value?.restoreAnchor(snapshot)
  } else {
    messageListRef.value?.restoreTail()
  }

  if (effectiveSessionId.value !== sessionId) return false
  inputBoxRef.value?.restoreSnapshot(snapshot)
  return true
}

onMounted(() => {
  const sessionId = effectiveSessionId.value
  if (sessionId) {
    restoreCurrentSnapshot(sessionId)
  }
})

onBeforeUnmount(() => {
  const sessionId = effectiveSessionId.value
  if (sessionId) {
    saveCurrentSnapshot(sessionId)
  }
})

// Session switch: save/restore scroll position and input state
watch(effectiveSessionId, async (newId, oldId) => {
  const start = performance.now()
  const oldMessageCount = oldId ? (chatStore.sessionMessages.get(oldId)?.length ?? 0) : 0
  const newMessageCount = newId ? (chatStore.sessionMessages.get(newId)?.length ?? 0) : 0
  if (oldId && oldId !== newId) {
    saveCurrentSnapshot(oldId, true)
  }

  const beforeTick = performance.now()
  await nextTick()
  const afterTick = performance.now()

  if (newId) {
    const hadSnapshot = !!chatStore.getSnapshot(newId)
    await restoreCurrentSnapshot(newId)
    if (effectiveSessionId.value !== newId) return
    if (!hadSnapshot) {
      inputBoxRef.value?.clearInput()
    }
  }

  requestAnimationFrame(() => {
    console.info('[Perf][SessionRender][ChatPanel]', {
      sessionId: newId,
      oldSessionId: oldId,
      totalToFirstFrameMs: Math.round(performance.now() - start),
      nextTickMs: Math.round(afterTick - beforeTick),
      oldMessageCount,
      newMessageCount,
      restoredSnapshot: !!(newId && chatStore.getSnapshot(newId)),
    })
  })
})

async function handleSendMessage(
  message: string,
  mode: 'send' | 'steer' | 'followup' = 'send',
  attachments?: MessageAttachment[],
) {
  if (!currentSession.value) return
  // Note: do not scroll here. This runs before the message is in state, so it
  // would smooth-scroll against stale content and then fight MessageList's
  // new-user-message watcher (force-follow + instant setTail), producing a
  // visible "smooth then snap" double scroll. The watcher owns follow-on-send.
  if (mode === 'steer') {
    await chatSteerMessage(message)
  } else if (mode === 'followup') {
    await chatQueueFollowUpMessage(message)
  } else {
    await chatSendMessage(message, attachments)
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

function insertPromptReference(promptId: string) {
  inputBoxRef.value?.insertPromptReference(promptId)
}

function saveSnapshotForCurrentSession() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  saveCurrentSnapshot(sessionId, false)
  return true
}

async function restoreSnapshotForCurrentSession() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  return restoreCurrentSnapshot(sessionId)
}

async function scrollToMessage(messageId: string) {
  await nextTick()
  return messageListRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  saveSnapshotForCurrentSession,
  restoreSnapshotForCurrentSession,
  scrollToMessage,
})
</script>

<style scoped>
.chat-panel {
  --chat-content-width: min(680px, max(64%, calc(100% - 96px)));

  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.composer-container {
  flex-shrink: 0;
  padding: 0 16px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

@media (max-width: 768px) {
  .chat-panel {
    --chat-content-width: calc(100% - 48px);
  }
}

@media (max-width: 480px) {
  .chat-panel {
    --chat-content-width: calc(100% - 24px);
  }
}
</style>
