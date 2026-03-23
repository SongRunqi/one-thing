<template>
  <main class="chat">
    <!-- Chat Header -->
    <ChatHeader
      :session-name="currentSession?.name || 'New chat'"
      :working-directory="currentSession?.workingDirectory || null"
      :session-agent="sessionAgent"
      :agents="[]"
      :is-branch-session="isBranchSession"
      :show-sidebar-toggle="showSidebarToggle"
      :show-split-button="canClose !== undefined"
      :can-close="!!canClose"
      :is-right-sidebar-open="false"
      @toggle-sidebar="emit('toggleSidebar')"
      @open-directory-picker="openWorkingDirectoryPicker"
      @update-title="handleUpdateTitle"
      @go-to-parent="goToParentSession"
      @split="emit('split')"
      @equalize="emit('equalize')"
      @close="emit('close')"
    />

    <!-- Chat body: MessageList fills space, InputBox floats at bottom -->
    <div class="chat-body">
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

      <div class="composer-container" v-memo="[isGenerating, effectiveSessionId]">
        <InputBox ref="inputBoxRef" @send-message="handleSendMessage" @stop-generation="handleStopGeneration" :is-loading="isGenerating" :session-id="effectiveSessionId" />
      </div>
    </div>

    <!-- Settings Panel overlay -->
    <Transition name="settings-fade">
      <SettingsPanel v-if="showSettings" @close="emit('closeSettings')" />
    </Transition>

  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import ChatHeader from './ChatHeader.vue'
import SettingsPanel from '../SettingsPanel.vue'

interface Props {
  showSettings?: boolean
  sessionId?: string
  canClose?: boolean
  showSidebarToggle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSettings: false,
  showSidebarToggle: false,
})

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
  close: []
  split: []
  equalize: []
  splitWithBranch: [sessionId: string]
  toggleSidebar: []
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

// Get effective session ID (props.sessionId or current session)
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// Use independent chat session state
const {
  messages,
  isLoading,
  isGenerating,
  sendMessage: chatSendMessage,
  regenerate: chatRegenerate,
  editAndResend: chatEditAndResend,
  stopGeneration: chatStopGeneration,
} = useChatSession(effectiveSessionId)

// Get the session for this panel
const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

// Messages for this panel (from composable)
const panelMessages = computed(() => messages.value)

// Agent feature removed - always null
const sessionAgent = computed(() => null)

// Check if current session is a branch
const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

// Go back to parent session
async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// Open folder picker to set working directory
async function openWorkingDirectoryPicker() {
  if (!currentSession.value) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Working Directory',
    defaultPath: currentSession.value.workingDirectory || undefined,
  })

  if (!result.canceled && result.filePaths.length > 0) {
    await sessionsStore.updateSessionWorkingDirectory(currentSession.value.id, result.filePaths[0])
  }
}

// Handle title update from ChatHeader
async function handleUpdateTitle(title: string) {
  if (!currentSession.value) return
  await sessionsStore.renameSession(currentSession.value.id, title)
}

// Child component refs
const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)

// Session switch: save snapshot of old session, restore snapshot of new session
watch(effectiveSessionId, async (newId, oldId) => {
  if (oldId && oldId !== newId) {
    // Block auto-scroll in MessageList before data changes
    messageListRef.value?.prepareForSwitch()

    // Save current UI state as index-based snapshot (with sub-message offset)
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

  // Wait for Vue to render new session's messages
  await nextTick()

  if (newId) {
    const snapshot = chatStore.getSnapshot(newId)
    if (snapshot) {
      // Restore saved state
      messageListRef.value?.restoreSnapshot(snapshot)
      inputBoxRef.value?.restoreSnapshot(snapshot)
    } else {
      // First visit — scroll to bottom, clear input
      messageListRef.value?.scrollToBottom()
      inputBoxRef.value?.clearInput()
    }
  }
})

async function handleSendMessage(message: string) {
  if (!currentSession.value) return
  // User sending a message = intent to follow the response
  messageListRef.value?.scrollToBottom()
  await chatSendMessage(message)
}

async function handleStopGeneration() {
  await chatStopGeneration()
}

function handleSetQuotedText(text: string) {
  // Set quoted text in the input box
  if (inputBoxRef.value) {
    inputBoxRef.value.setQuotedText(text)
  }
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
  if (inputBoxRef.value) {
    inputBoxRef.value.setMessageInput(text)
  }
}

// Focus the input box (for keyboard shortcuts)
function focusInput() {
  inputBoxRef.value?.focus()
}

// Expose methods for parent component
defineExpose({
  focusInput,
})
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  background: var(--bg-panel, var(--bg-elevated, var(--bg-chat)));
  position: relative;
  overflow: hidden;
  border: none;
  contain: layout style;
}

.chat-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.composer-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0 16px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  pointer-events: none;
  z-index: 100;
}

.composer-container > :deep(*) {
  pointer-events: auto;
}



/* Settings Fade Transition */
.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: all 0.3s ease;
}

.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
}

.settings-fade-enter-active :deep(.floating-hub) {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.settings-fade-enter-from :deep(.floating-hub) {
  transform: scale(0.9) translateY(20px);
}
</style>
