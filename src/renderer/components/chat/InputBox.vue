<template>
  <div
    ref="composerWrapperRef"
    class="composer-wrapper"
  >
    <!-- Quoted text context -->
    <QuotedContext
      :text="quotedText"
      @clear="clearQuotedText"
    />

    <!-- Command Feedback -->
    <Transition name="fade">
      <div
        v-if="commandFeedback"
        :class="['command-feedback', commandFeedback.type]"
      >
        <Check
          v-if="commandFeedback.type === 'success'"
          :size="14"
          :stroke-width="2.5"
        />
        <X
          v-else
          :size="14"
          :stroke-width="2.5"
        />
        <span>{{ commandFeedback.message }}</span>
      </div>
    </Transition>

    <!-- Command Picker -->
    <CommandPicker
      :visible="showCommandPicker"
      :query="commandQuery"
      :skills="enabledSkills"
      @select="handleCommandSelect"
      @close="handleCommandPickerClose"
    />

    <!-- Skill Picker -->
    <SkillPicker
      :visible="showSkillPicker"
      :query="skillTriggerQuery"
      :skills="enabledSkills"
      @select="handleSkillSelect"
      @close="handleSkillPickerClose"
    />

    <!-- File Picker -->
    <FilePicker
      :visible="showFilePicker"
      :query="fileQuery"
      :cwd="workingDirectory"
      :session-id="effectiveSessionId || ''"
      @select="handleFilePickerSelect"
      @close="handleFilePickerClose"
    />

    <!-- Path Picker -->
    <PathPicker
      :visible="showPathPicker"
      :path-input="pathQuery"
      @select="handlePathPickerSelect"
      @close="handlePathPickerClose"
    />

    <TransitionGroup
      name="queued-message"
      tag="div"
      class="queued-messages"
    >
      <div
        v-for="item in queuedMessages"
        :key="item.id"
        class="queued-message-card"
      >
        <CornerDownRight
          class="queued-message-icon"
          :size="16"
          :stroke-width="2"
        />
        <div class="queued-message-text">
          {{ item.content || attachmentSummary(item.attachments) }}
          <span
            v-if="item.content && item.attachments?.length"
            class="queued-message-attachments"
          >
            {{ attachmentSummary(item.attachments) }}
          </span>
        </div>
        <button
          class="queued-message-action"
          type="button"
          :disabled="!!item.attachments?.length"
          :title="item.attachments?.length ? 'File messages will send after the current response' : 'Steer the current tool loop with this message'"
          @click.stop="steerQueuedMessage(item.id)"
        >
          <CornerDownRight
            :size="15"
            :stroke-width="2"
          />
          <span>Steer</span>
        </button>
        <button
          class="queued-message-icon-btn"
          type="button"
          title="Remove from queue"
          @click.stop="removeQueuedMessage(item.id)"
        >
          <Trash2
            :size="16"
            :stroke-width="2"
          />
        </button>
        <button
          class="queued-message-icon-btn"
          type="button"
          title="More actions"
          @click.stop
        >
          <MoreHorizontal
            :size="16"
            :stroke-width="2"
          />
        </button>
      </div>
    </TransitionGroup>

    <div
      class="composer"
      :class="{ focused: isFocused }"
      @click="focusEditor"
    >
      <!-- Input area -->
      <div class="input-area">
        <TextEditor
          ref="editorRef"
          v-model="messageInput"
          class="composer-input"
          profile="composer"
          language="markdown"
          placeholder="Ask anything..."
          :settings="editorSettings"
          :min-height="56"
          :max-height="composerMaxHeight"
          @keydown="handleKeyDown"
          @paste="handlePasteAttachments"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @height-change="handleEditorHeightChange"
          @selection-change="handleEditorSelectionChange"
          @transaction="handleEditorTransaction"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
      </div>

      <div
        v-if="attachedFiles.length > 0 || isProcessingAttachments"
        class="attachment-tray"
        @click.stop
      >
        <div
          v-for="file in attachedFiles"
          :key="file.id"
          class="attachment-chip"
          :class="{ 'is-image': file.mediaType === 'image' }"
          :title="`${file.fileName} (${formatFileSize(file.size)})`"
        >
          <img
            v-if="file.mediaType === 'image' && file.preview"
            class="attachment-thumb"
            :src="file.preview"
            :alt="file.fileName"
          >
          <span
            v-else
            class="attachment-file-icon"
          >
            <FileText :size="15" />
          </span>
          <span class="attachment-info">
            <span class="attachment-name">{{ file.fileName }}</span>
            <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
          </span>
          <button
            class="attachment-remove"
            type="button"
            :title="`Remove ${file.fileName}`"
            @click.stop="removeAttachment(file.id)"
          >
            <X :size="14" />
          </button>
        </div>
        <div
          v-if="isProcessingAttachments"
          class="attachment-chip is-loading"
        >
          <Loader2
            class="attachment-spinner"
            :size="15"
          />
          <span>Reading files...</span>
        </div>
      </div>

      <!-- Bottom toolbar -->
      <div class="composer-toolbar">
        <div class="toolbar-left">
          <ModelSelector :session-id="props.sessionId" />
          <ThinkToggle :session-id="props.sessionId" />
        </div>

        <div
          class="toolbar-right"
          @click.stop
        >
          <button
            class="send-btn"
            :class="{ 'stop-btn': shouldShowStopAction }"
            :disabled="isPrimaryActionDisabled"
            :title="primaryActionTitle"
            @click="handlePrimaryAction"
          >
            <Send
              v-if="!shouldShowStopAction"
              :size="18"
              :stroke-width="2"
            />
            <Square
              v-else
              :size="16"
              fill="currentColor"
              :stroke-width="0"
            />
          </button>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
// Sub-components
import QuotedContext from './QuotedContext.vue'
import SkillPicker from './SkillPicker.vue'
import CommandPicker from './CommandPicker.vue'
import FilePicker from './FilePicker.vue'
import PathPicker from './PathPicker.vue'
import ModelSelector from './ModelSelector.vue'
import ThinkToggle from './ThinkToggle.vue'
import { X, Square, Send, Check, CornerDownRight, Trash2, MoreHorizontal, FileText, Loader2 } from 'lucide-vue-next'
import { findCommand, refreshPluginCommands } from '@/services/commands'
import TextEditor from '@/editor/TextEditor.vue'
import type { EditorHandle } from '@/editor'
import type { MessageAttachment } from '@/types'

// Composables
import { useInputHistory } from '@/composables/useInputHistory'
import { usePickerOrchestration } from '@/composables/usePickerOrchestration'
import { useCommandFeedback } from '@/composables/useCommandFeedback'
import { useAttachments } from '@/composables/useAttachments'
import type { AttachedFile } from '@/composables/useAttachments'

interface Props {
  isLoading?: boolean
  maxChars?: number
  sessionId?: string
}

interface Emits {
  (e: 'sendMessage', message: string, mode?: 'send' | 'steer' | 'followup', attachments?: MessageAttachment[]): void
  (e: 'stopGeneration'): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxChars: 4000,
})

const emit = defineEmits<Emits>()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()

// Core state
const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const isComposing = ref(false)
const editorRef = ref<EditorHandle | null>(null)
const composerWrapperRef = ref<HTMLElement | null>(null)

interface QueuedMessage {
  id: string
  content: string
  attachments?: MessageAttachment[]
}

const queuedMessages = ref<QueuedMessage[]>([])

// Get the effective session ID
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// Get the working directory for file search
const workingDirectory = computed(() => {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return ''
  const workdirVariable = sessionsStore.sessionVariables.get(sessionId)?.find(variable => variable.name === 'workdir')
  if (workdirVariable?.value) return workdirVariable.value
  const session = sessionsStore.sessions.find(s => s.id === sessionId)
  return session?.workingDirectory || ''
})

// --- Composables ---

const editorSettings = computed(() => settingsStore.settings.general.editor)
const composerMaxHeight = computed(() => editorSettings.value?.composerMaxHeight ?? 200)

function updateComposerHeight() {
  const height = composerWrapperRef.value?.getBoundingClientRect().height ?? 0
  if (height > 0) {
    document.documentElement.style.setProperty('--composer-height', `${height + 40}px`)
  }
}

function handleEditorHeightChange() {
  updateComposerHeight()
}

const {
  resetHistoryNavigation,
  handleHistoryNavigation,
  checkHistoryEdit,
} = useInputHistory(effectiveSessionId, messageInput, editorRef, updateComposerHeight)

const {
  enabledSkills,
  loadSkills,
  showSkillPicker,
  skillTriggerQuery,
  handleSkillSelect,
  handleSkillPickerClose,
  showCommandPicker,
  commandQuery,
  handleCommandSelect,
  handleCommandPickerClose,
  showFilePicker,
  fileQuery,
  handleFilePickerSelect,
  handleFilePickerClose,
  showPathPicker,
  pathQuery,
  handlePathPickerSelect,
  handlePathPickerClose,
  anyPickerVisible,
  handleEditorSelectionChange,
  handleEditorTransaction,
  closeAllPickers,
} = usePickerOrchestration(messageInput, workingDirectory, editorRef, updateComposerHeight, checkHistoryEdit)

const { commandFeedback, showCommandFeedback } = useCommandFeedback()
const {
  attachedFiles,
  isProcessing: isProcessingAttachments,
  handlePaste: handleAttachmentPaste,
  removeAttachment,
  clearAttachments,
  restoreAttachments,
  toMessageAttachments,
} = useAttachments()

// --- Computed ---

const hasMessageContent = computed(() => messageInput.value.trim().length > 0)
const hasAttachments = computed(() => attachedFiles.value.length > 0)
const hasActiveGeneration = computed(() => {
  const sessionId = effectiveSessionId.value
  return !!props.isLoading || (sessionId ? chatStore.isSessionGenerating(sessionId) : false)
})

const canSend = computed(() => {
  return (hasMessageContent.value || hasAttachments.value) && !isProcessingAttachments.value
})

const shouldShowStopAction = computed(() => {
  return hasActiveGeneration.value && !hasMessageContent.value && !hasAttachments.value
})

const isPrimaryActionDisabled = computed(() => {
  if (shouldShowStopAction.value) return false
  return !canSend.value
})

const primaryActionTitle = computed(() => {
  if (shouldShowStopAction.value) return 'Stop generation'
  if (hasActiveGeneration.value) return 'Queue message after current response'
  return 'Send message'
})

// --- Watchers ---

// Send the next queued follow-up when the active generation completes.
watch(hasActiveGeneration, (generating) => {
  if (!generating) {
    flushQueuedMessage()
  }
})

// --- ResizeObserver ---

let composerResizeObserver: ResizeObserver | null = null

function handleDocumentMouseDown(event: MouseEvent) {
  const wrapper = composerWrapperRef.value
  if (!wrapper) return
  if (event.target instanceof Node && wrapper.contains(event.target)) return
  closeAllPickers()
}

onMounted(async () => {
  updateComposerHeight()
  await loadSkills()
  document.addEventListener('mousedown', handleDocumentMouseDown)

  if (composerWrapperRef.value) {
    composerResizeObserver = new ResizeObserver((entries) => {
      const height = entries[0].contentRect.height
      document.documentElement.style.setProperty('--composer-height', `${height + 40}px`)
    })
    composerResizeObserver.observe(composerWrapperRef.value)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown)

  if (composerResizeObserver) {
    composerResizeObserver.disconnect()
    composerResizeObserver = null
  }
})

// --- Core handlers ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function attachmentSummary(attachments?: MessageAttachment[]) {
  const count = attachments?.length ?? 0
  if (count === 0) return ''
  return count === 1 ? '1 file attached' : `${count} files attached`
}

function showAttachmentResult(accepted: AttachedFile[], rejected: { message: string }[]) {
  if (rejected.length > 0) {
    showCommandFeedback('error', rejected[0].message)
    return
  }
  if (accepted.length > 0) {
    showCommandFeedback('success', accepted.length === 1
      ? `Attached ${accepted[0].fileName}`
      : `Attached ${accepted.length} files`)
  }
}

async function handlePasteAttachments(event: ClipboardEvent) {
  const result = await handleAttachmentPaste(event)
  if (!result.handled) return
  showAttachmentResult(result.accepted, result.rejected)
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

function handleKeyDown(e: KeyboardEvent) {
  if (isComposing.value || e.isComposing) return

  // Don't handle send shortcuts when any picker is visible
  const pathPickerVisible = showPathPicker.value

  if (anyPickerVisible.value && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    return
  }

  // PathPicker: Tab/Arrow/Escape handled by picker, but Enter sends the command
  if (pathPickerVisible) {
    if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      closeAllPickers()
      sendMessage()
      return
    }
  }

  // History navigation (up/down arrows)
  if (e.key === 'ArrowUp') {
    if (handleHistoryNavigation('up')) {
      e.preventDefault()
      return
    }
  }
  if (e.key === 'ArrowDown') {
    if (handleHistoryNavigation('down')) {
      e.preventDefault()
      return
    }
  }

  const shortcuts = settingsStore.settings?.general?.shortcuts
  if (shortcuts?.sendMessage) {
    const shortcut = shortcuts.sendMessage
    const keyMatches = e.key.toLowerCase() === shortcut.key.toLowerCase()
    const modifiersMatch =
      !!shortcut.ctrlKey === e.ctrlKey &&
      !!shortcut.metaKey === e.metaKey &&
      !!shortcut.altKey === e.altKey &&
      !!shortcut.shiftKey === e.shiftKey

    if (keyMatches && modifiersMatch) {
      e.preventDefault()
      sendMessage()
      return
    }
  }

  const legacyShortcut = settingsStore.settings?.general?.sendShortcut || 'enter'

  if (legacyShortcut === 'enter') {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  } else {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    }
  }
}

async function sendMessage() {
  if (!canSend.value) return

  // Check if this is a command
  const commandMatch = !hasAttachments.value
    ? messageInput.value.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/)
    : null
  if (commandMatch) {
    const commandId = commandMatch[1]
    const argsString = commandMatch[2] || ''
    let command = findCommand(commandId)
    if (!command) {
      await refreshPluginCommands()
      command = findCommand(commandId)
    }

    if (command) {
      const result = await command.execute({
        sessionId: effectiveSessionId.value,
        args: argsString.split(/\s+/).filter(Boolean),
        rawArgs: argsString,
      })

      if (result.success) {
          showCommandFeedback('success', result.message || 'Done')
        messageInput.value = ''
        resetHistoryNavigation()
        closeAllPickers()
        nextTick(() => {
          updateComposerHeight()
          editorRef.value?.focus()
        })
      } else {
        showCommandFeedback('error', result.error || `/${commandId} failed`)
        closeAllPickers()
        nextTick(() => {
          updateComposerHeight()
          editorRef.value?.focus()
        })
      }
      return
    }
  }

  // Regular message sending
  let fullMessage = messageInput.value
  const attachments = toMessageAttachments()

  if (quotedText.value) {
    const quotedLines = quotedText.value.split('\n').map(line => `> ${line}`).join('\n')
    fullMessage = `${quotedLines}\n\n${messageInput.value}`
  }

  if (hasActiveGeneration.value) {
    queuedMessages.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content: fullMessage,
      attachments,
    })
    showCommandFeedback('success', 'Message queued')
  } else {
    emit('sendMessage', fullMessage, 'send', attachments)
  }

  messageInput.value = ''
  resetHistoryNavigation()
  quotedText.value = ''
  clearAttachments()
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.scrollToTop()
    editorRef.value?.focus()
  })
}

function stopGeneration() {
  emit('stopGeneration')
}

function handlePrimaryAction() {
  if (shouldShowStopAction.value) {
    stopGeneration()
    return
  }
  sendMessage()
}

function steerQueuedMessage(id: string) {
  const item = queuedMessages.value.find(message => message.id === id)
  if (!item) return
  if (item.attachments?.length) {
    showCommandFeedback('error', 'File messages will send after the current response')
    return
  }
  queuedMessages.value = queuedMessages.value.filter(message => message.id !== id)
  emit('sendMessage', item.content, 'steer')
  showCommandFeedback('success', 'Steering queued')
}

function removeQueuedMessage(id: string) {
  queuedMessages.value = queuedMessages.value.filter(message => message.id !== id)
}

function flushQueuedMessage() {
  if (hasActiveGeneration.value) return
  const nextMessage = queuedMessages.value.shift()
  if (!nextMessage) return
  emit('sendMessage', nextMessage.content, 'send', nextMessage.attachments)
}

function focusEditor() {
  editorRef.value?.focus()
}

// --- Exposed methods ---

function setQuotedText(text: string) {
  quotedText.value = text
  nextTick(() => {
    editorRef.value?.focus()
  })
}

function clearQuotedText() {
  quotedText.value = ''
}

function setMessageInput(text: string) {
  messageInput.value = text
  nextTick(() => {
    updateComposerHeight()
    editorRef.value?.focus()
  })
}

defineExpose({
  setQuotedText,
  clearQuotedText,
  setMessageInput,
  focus: focusEditor,
  // Snapshot API for session switching
  getMessageInput: () => messageInput.value,
  getQuotedText: () => quotedText.value,
  getAttachments: () => toMessageAttachments() ?? [],
  restoreSnapshot: (snap: { messageInput: string; quotedText: string; attachments?: MessageAttachment[] }) => {
    messageInput.value = snap.messageInput
    quotedText.value = snap.quotedText
    restoreAttachments(snap.attachments)
    nextTick(() => updateComposerHeight())
  },
  clearInput: () => {
    messageInput.value = ''
    quotedText.value = ''
    clearAttachments()
    nextTick(() => updateComposerHeight())
  },
})
</script>

<style scoped>
.composer-wrapper {
  width: var(--chat-content-width, min(70%, 800px));
  margin: 0 auto;
  position: relative;
}

/* Command feedback - toast style */
.command-feedback {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 100;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.command-feedback.success {
  background: rgba(34, 197, 94, 0.9);
  color: white;
}

.command-feedback.error {
  background: rgba(239, 68, 68, 0.9);
  color: white;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.queued-messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: calc(100% - 72px);
  margin: 0 auto -12px;
  position: relative;
  z-index: 2;
  pointer-events: none;
}

.queued-message-card {
  min-height: 42px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border: 0.5px solid var(--border);
  border-radius: 12px 12px 7px 7px;
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.5);
  color: var(--text-muted);
  box-shadow: 0 -1px 12px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(18px) saturate(1.08);
  -webkit-backdrop-filter: blur(18px) saturate(1.08);
  pointer-events: auto;
}

.queued-message-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.queued-message-text {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-muted);
}

.queued-message-action,
.queued-message-icon-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: background 0.16s ease, color 0.16s ease;
}

.queued-message-action {
  gap: 5px;
  height: 28px;
  padding: 0 7px;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
}

.queued-message-icon-btn {
  width: 28px;
  height: 28px;
}

.queued-message-action:hover,
.queued-message-icon-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.queued-message-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.queued-message-attachments {
  display: inline-block;
  margin-left: 8px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.queued-message-enter-active,
.queued-message-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.queued-message-enter-from,
.queued-message-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Main composer container */
.composer {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 0.5px solid var(--border, rgba(255, 255, 255, 0.08));
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.65);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.composer.focused {
  border-color: rgba(var(--accent-rgb), 0.35);
  box-shadow: 0 0 0 0.5px rgba(var(--accent-rgb), 0.2), 0 8px 32px rgba(0, 0, 0, 0.18), var(--shadow-glow);
}

/* Input area */
.input-area {
  position: relative;
  padding: 0 18px 6px 18px;
}

.composer-input {
  width: 100%;
  --editor-font-size: 15px;
  min-height: 56px;
}

.attachment-tray {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 12px 8px;
  min-height: 44px;
}

.attachment-tray::-webkit-scrollbar {
  height: 4px;
}

.attachment-tray::-webkit-scrollbar-track {
  background: transparent;
}

.attachment-tray::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 2px;
}

.attachment-chip {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  width: min(230px, 68vw);
  height: 42px;
  padding: 5px 6px 5px 5px;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.48);
  color: var(--text);
}

.attachment-chip.is-loading {
  grid-template-columns: auto 1fr;
  width: auto;
  padding: 5px 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.attachment-thumb,
.attachment-file-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
}

.attachment-thumb {
  object-fit: cover;
  background: var(--bg-muted);
}

.attachment-file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--hover);
  color: var(--muted);
}

.attachment-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.attachment-name,
.attachment-size {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-name {
  font-size: 12px;
  line-height: 1.25;
}

.attachment-size {
  font-size: 11px;
  color: var(--muted);
}

.attachment-remove {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.attachment-remove:hover {
  background: var(--hover);
  color: var(--text);
}

.attachment-spinner {
  animation: attachment-spin 0.8s linear infinite;
}

@keyframes attachment-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Bottom toolbar */
.composer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  user-select: none;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Toolbar buttons */
.toolbar-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.toolbar-btn:hover {
  background: var(--hover);
  color: var(--text);
  transform: scale(1.1);
}

.toolbar-btn:active {
  transform: scale(0.95);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Send button */
.send-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: none;
  background: var(--gradient-accent);
  color: var(--text-btn-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  box-shadow: var(--shadow-glow-accent);
}

.send-btn:hover:not(:disabled) {
  background: var(--bg-btn-primary-hover);
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 16px rgba(var(--accent-rgb), 0.4);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.96);
  box-shadow: 0 1px 4px rgba(var(--accent-rgb), 0.2);
}

.send-btn:disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
  box-shadow: none;
}

.send-btn.stop-btn {
  background: var(--hover);
  box-shadow: none;
  color: var(--muted);
  border: 1px solid var(--border);
}

.send-btn.stop-btn:hover {
  background: var(--active);
  color: var(--text);
  transform: translateY(-1px) scale(1.02);
  box-shadow: none;
}

.send-btn.stop-btn:active {
  transform: scale(0.96);
  background: var(--active);
}

/* Responsive styles */
@media (max-width: 768px) {
  .composer { border-radius: 14px; }
  .composer-input { font-size: 15px; }
  .toolbar-btn { width: 32px; height: 32px; }
  .send-btn { width: 36px; height: 36px; }
}

@media (max-width: 600px) {
  .toolbar-left { gap: 2px; }
  .toolbar-btn { width: 30px; height: 30px; }
}

@media (max-width: 480px) {
  .composer { border-radius: 12px; }
  .input-area { padding: 10px 12px 0; }
  .composer-toolbar { padding: 6px 8px; }
  .composer-input { font-size: 15px; }
  .send-btn { width: 34px; height: 34px; }
}
</style>
