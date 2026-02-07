<template>
  <div class="composer-wrapper" ref="composerWrapperRef">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv"
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- Attachment previews -->
    <AttachmentPreview :files="attachedFiles" @remove="removeAttachment" />

    <!-- Quoted text context -->
    <QuotedContext :text="quotedText" @clear="clearQuotedText" />

    <!-- Command Feedback -->
    <Transition name="fade">
      <div v-if="commandFeedback" :class="['command-feedback', commandFeedback.type]">
        <Check v-if="commandFeedback.type === 'success'" :size="14" :stroke-width="2.5" />
        <X v-else :size="14" :stroke-width="2.5" />
        <span>{{ commandFeedback.message }}</span>
      </div>
    </Transition>

    <!-- Command Picker -->
    <CommandPicker
      :visible="showCommandPicker"
      :query="commandQuery"
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

    <!-- Quick Command Bar -->
    <QuickCommandBar
      :session-id="effectiveSessionId"
      @executed="handleQuickCommandExecuted"
    />

    <!-- Plan Panel -->
    <PlanPanel :session-id="effectiveSessionId" />

    <div class="composer" :class="{ focused: isFocused }" @click="focusTextarea">
      <!-- Input area -->
      <div class="input-area">
        <textarea
          ref="textareaRef"
          v-model="messageInput"
          class="composer-input"
          placeholder="Ask anything..."
          @keydown="handleKeyDown"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @input="adjustHeight"
          @paste="handlePaste"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
          rows="1"
        />
      </div>

      <!-- Bottom toolbar -->
      <div class="composer-toolbar">
        <div class="toolbar-left">
          <button class="toolbar-btn" title="Attach file" @click="handleAttach">
            <Paperclip :size="18" :stroke-width="2" />
          </button>
          <ToolsMenu
            @tools-enabled-change="(enabled: boolean) => emit('toolsEnabledChange', enabled)"
            @open-settings="() => emit('openToolSettings')"
          />
          <SkillsMenu @open-settings="() => emit('openToolSettings')" />
          <ModelSelector :session-id="props.sessionId" />
          <ContextIndicator :session-id="props.sessionId" />
          <ModeToggle ref="modeToggleRef" :session-id="effectiveSessionId" />
        </div>

        <div class="toolbar-right" @click.stop>
          <button
            v-if="isLoading || isSending"
            class="send-btn stop-btn"
            @click="stopGeneration"
            title="Stop generation"
          >
            <Square :size="16" fill="currentColor" :stroke-width="0" />
          </button>
          <button
            v-else
            class="send-btn"
            @click="sendMessage"
            :disabled="!canSend"
            title="Send message"
          >
            <Send :size="18" :stroke-width="2" />
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
import type { MessageAttachment } from '@/types'

// Sub-components
import AttachmentPreview from './AttachmentPreview.vue'
import QuotedContext from './QuotedContext.vue'
import SkillPicker from './SkillPicker.vue'
import CommandPicker from './CommandPicker.vue'
import FilePicker from './FilePicker.vue'
import PathPicker from './PathPicker.vue'
import QuickCommandBar from './QuickCommandBar.vue'
import ModelSelector from './ModelSelector.vue'
import ContextIndicator from './ContextIndicator.vue'
import ToolsMenu from './ToolsMenu.vue'
import SkillsMenu from './SkillsMenu.vue'
import ModeToggle from './ModeToggle.vue'
import PlanPanel from './PlanPanel.vue'
import { X, Paperclip, Square, Send, Check } from 'lucide-vue-next'
import { findCommand } from '@/services/commands'

// Composables
import { useAttachments } from '@/composables/useAttachments'
import { useInputHistory } from '@/composables/useInputHistory'
import { usePickerOrchestration } from '@/composables/usePickerOrchestration'
import { useCommandFeedback } from '@/composables/useCommandFeedback'

interface Props {
  isLoading?: boolean
  maxChars?: number
  sessionId?: string
}

interface Emits {
  (e: 'sendMessage', message: string, attachments?: MessageAttachment[]): void
  (e: 'stopGeneration'): void
  (e: 'toolsEnabledChange', enabled: boolean): void
  (e: 'openToolSettings'): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxChars: 4000,
})

const emit = defineEmits<Emits>()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

// Core state
const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const isSending = ref(false)
const isComposing = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const composerWrapperRef = ref<HTMLElement | null>(null)
const modeToggleRef = ref<InstanceType<typeof ModeToggle> | null>(null)

// Session input cache
const sessionInputCache = new Map<string, string>()

// Get the effective session ID
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// Get the working directory for file search
const workingDirectory = computed(() => {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return ''
  const session = sessionsStore.sessions.find(s => s.id === sessionId)
  return session?.workingDirectory || ''
})

// --- Composables ---

const {
  attachedFiles,
  fileInputRef,
  handleAttach,
  handleFileSelect,
  handlePaste,
  removeAttachment,
  clearAttachments,
  toMessageAttachments,
} = useAttachments()

function adjustHeight() {
  const textarea = textareaRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200)
  textarea.style.height = `${newHeight}px`
}

const {
  resetHistoryNavigation,
  handleHistoryNavigation,
  checkHistoryEdit,
} = useInputHistory(effectiveSessionId, messageInput, textareaRef, adjustHeight)

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
  closeAllPickers,
} = usePickerOrchestration(messageInput, workingDirectory, textareaRef, adjustHeight, checkHistoryEdit)

const { commandFeedback, showCommandFeedback } = useCommandFeedback()

// --- Computed ---

const canSend = computed(() => {
  const hasContent = messageInput.value.trim().length > 0 || attachedFiles.value.length > 0
  return hasContent && !props.isLoading
})

// --- Watchers ---

// Reset isSending when generation completes
watch(() => props.isLoading, (loading) => {
  if (!loading) {
    isSending.value = false
  }
})

// Cache input text when switching sessions
watch(effectiveSessionId, (newSessionId, oldSessionId) => {
  if (oldSessionId && messageInput.value) {
    sessionInputCache.set(oldSessionId, messageInput.value)
  }
  if (oldSessionId) {
    messageInput.value = ''
  }
  if (newSessionId) {
    const cachedInput = sessionInputCache.get(newSessionId)
    if (cachedInput) {
      messageInput.value = cachedInput
      nextTick(() => {
        adjustHeight()
      })
    }
  }
  resetHistoryNavigation()
}, { immediate: true })

// --- ResizeObserver ---

let composerResizeObserver: ResizeObserver | null = null

onMounted(async () => {
  adjustHeight()
  await loadSkills()

  if (composerWrapperRef.value) {
    composerResizeObserver = new ResizeObserver((entries) => {
      const height = entries[0].contentRect.height
      document.documentElement.style.setProperty('--composer-height', `${height + 40}px`)
    })
    composerResizeObserver.observe(composerWrapperRef.value)
  }
})

onUnmounted(() => {
  if (composerResizeObserver) {
    composerResizeObserver.disconnect()
    composerResizeObserver = null
  }
})

// --- Core handlers ---

function handleKeyDown(e: KeyboardEvent) {
  if (isComposing.value) return

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

  // Tab toggles between Build/Ask mode (only when input is empty)
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (messageInput.value.trim() === '') {
      e.preventDefault()
      modeToggleRef.value?.toggleMode()
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
    }
    return
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
  const commandMatch = messageInput.value.match(/^\/(\w+)(?:\s+(.*))?$/)
  if (commandMatch) {
    const commandId = commandMatch[1]
    const argsString = commandMatch[2] || ''
    const command = findCommand(commandId)

    if (command) {
      const result = await command.execute({
        sessionId: effectiveSessionId.value,
        args: argsString.split(/\s+/).filter(Boolean),
        rawArgs: argsString,
      })

      if (result.success) {
        showCommandFeedback('success', result.message || 'Done')
      } else {
        showCommandFeedback('error', result.error || `/${commandId} failed`)
      }

      messageInput.value = ''
      resetHistoryNavigation()
      closeAllPickers()
      nextTick(() => {
        adjustHeight()
        textareaRef.value?.focus()
      })
      return
    }
  }

  // Regular message sending
  isSending.value = true
  let fullMessage = messageInput.value

  if (quotedText.value) {
    const quotedLines = quotedText.value.split('\n').map(line => `> ${line}`).join('\n')
    fullMessage = `${quotedLines}\n\n${messageInput.value}`
  }

  const attachments = toMessageAttachments()

  emit('sendMessage', fullMessage, attachments)
  messageInput.value = ''
  resetHistoryNavigation()
  quotedText.value = ''
  clearAttachments()
  if (effectiveSessionId.value) {
    sessionInputCache.delete(effectiveSessionId.value)
  }
  nextTick(() => {
    adjustHeight()
    if (textareaRef.value) {
      textareaRef.value.scrollTop = 0
    }
    textareaRef.value?.focus()
  })
}

function stopGeneration() {
  emit('stopGeneration')
}

function focusTextarea() {
  textareaRef.value?.focus()
}

// --- Quick Command Bar handler ---

function handleQuickCommandExecuted(result: {
  commandId: string
  success: boolean
  message?: string
  error?: string
}) {
  if (result.success) {
    if (result.message) {
      showCommandFeedback('success', result.message)
    }
  } else {
    showCommandFeedback('error', result.error || 'Command failed')
  }
}

// --- Exposed methods ---

function setQuotedText(text: string) {
  quotedText.value = text
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function clearQuotedText() {
  quotedText.value = ''
}

function setMessageInput(text: string) {
  messageInput.value = text
  nextTick(() => {
    adjustHeight()
    textareaRef.value?.focus()
  })
}

defineExpose({
  setQuotedText,
  clearQuotedText,
  setMessageInput,
  focus: focusTextarea,
})
</script>

<style scoped>
.composer-wrapper {
  width: 85%;
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

/* Main composer container */
.composer {
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
  padding: 12px 0 0 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-input);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  min-height: 28px;
  max-height: 200px;
  overflow-y: auto;
  caret-color: var(--accent);
}

.composer-input::placeholder {
  color: var(--text-input-placeholder);
  user-select: none;
  -webkit-user-select: none;
}

.composer-input::-webkit-scrollbar { width: 4px; }
.composer-input::-webkit-scrollbar-track { background: transparent; }
.composer-input::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

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
  gap: 12px;
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
  .composer-wrapper { max-width: 100%; width: 95%; }
  .composer { border-radius: 14px; }
  .composer-input { font-size: 15px; }
  .toolbar-btn { width: 32px; height: 32px; }
  .send-btn { width: 36px; height: 36px; }
}

@media (max-width: 600px) {
  .composer-wrapper { width: 100%; }
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
