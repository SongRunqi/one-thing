<template>
  <div class="composer-wrapper" ref="composerWrapperRef">
    <!-- Plan Panel (shown above composer when plan exists) -->
    <PlanPanel :session-id="effectiveSessionId" />

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv"
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- Attachment previews (shown above composer when files are attached) -->
    <div v-if="attachedFiles.length > 0" class="attachments-preview">
      <div
        v-for="file in attachedFiles"
        :key="file.id"
        class="attachment-item"
        :class="{ 'is-image': file.mediaType === 'image' }"
      >
        <img v-if="file.preview" :src="file.preview" :alt="file.fileName" class="attachment-thumb" />
        <div v-else class="attachment-icon">
          <FileText :size="20" :stroke-width="2" />
        </div>
        <span class="attachment-name">{{ file.fileName }}</span>
        <button class="attachment-remove" @click="removeAttachment(file.id)" title="Remove">
          <X :size="14" :stroke-width="2.5" />
        </button>
      </div>
    </div>

    <!-- Quoted text context (shown above input when text is referenced) -->
    <div v-if="quotedText" class="quoted-context">
      <div class="quoted-bar"></div>
      <div class="quoted-content-wrapper">
        <div class="quoted-text">{{ quotedText }}</div>
        <button class="remove-quote-btn" @click="clearQuotedText" title="Remove">
          <X :size="16" :stroke-width="2.5" />
        </button>
      </div>
    </div>

    <!-- Command Feedback -->
    <Transition name="fade">
      <div v-if="commandFeedback" :class="['command-feedback', commandFeedback.type]">
        <Check v-if="commandFeedback.type === 'success'" :size="14" :stroke-width="2.5" />
        <X v-else :size="14" :stroke-width="2.5" />
        <span>{{ commandFeedback.message }}</span>
      </div>
    </Transition>

    <!-- Command Picker (positioned above composer) -->
    <CommandPicker
      :visible="showCommandPicker"
      :query="commandQuery"
      @select="handleCommandSelect"
      @close="handleCommandPickerClose"
    />

    <!-- Skill Picker (positioned above composer) -->
    <SkillPicker
      :visible="showSkillPicker"
      :query="skillTriggerQuery"
      :skills="enabledSkills"
      @select="handleSkillSelect"
      @close="handleSkillPickerClose"
    />

    <!-- File Picker (positioned above composer, for @ file search) -->
    <FilePicker
      :visible="showFilePicker"
      :query="fileQuery"
      :cwd="workingDirectory"
      @select="handleFilePickerSelect"
      @close="handleFilePickerClose"
    />

    <div class="composer" :class="{ focused: isFocused }" @click="focusTextarea">
      <!-- Input area - full width -->
      <div class="input-area">
        <textarea
          ref="textareaRef"
          v-model="messageInput"
          class="composer-input"
          placeholder="Ask anything..."
          @keydown="handleKeyDown"
          @focus="handleFocus"
          @blur="handleBlur"
          @input="handleInput"
          @paste="handlePaste"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
          rows="1"
        />
      </div>

      <!-- Bottom toolbar -->
      <div class="composer-toolbar">
        <!-- Left side: attach and tools -->
        <div class="toolbar-left">
          <button class="toolbar-btn" title="Attach file" @click="handleAttach">
            <Paperclip :size="18" :stroke-width="2" />
          </button>

          <!-- Tools menu component -->
          <ToolsMenu
            @tools-enabled-change="handleToolsEnabledChange"
            @open-settings="openToolSettings"
          />

          <!-- Skills menu component -->
          <SkillsMenu @open-settings="openToolSettings" />

          <!-- Model selector component -->
          <ModelSelector :session-id="props.sessionId" />

          <!-- Context indicator component -->
          <ContextIndicator :session-id="props.sessionId" />

          <!-- Mode toggle (Build/Plan) -->
          <ModeToggle ref="modeToggleRef" :session-id="effectiveSessionId" />
        </div>

        <!-- Right side: send/stop button -->
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
import type { SkillDefinition, MessageAttachment, AttachmentMediaType } from '@/types'
import type { CommandDefinition } from '@/types/commands'
import SkillPicker from './SkillPicker.vue'
import CommandPicker from './CommandPicker.vue'
import FilePicker from './FilePicker.vue'
import ModelSelector from './ModelSelector.vue'
import ContextIndicator from './ContextIndicator.vue'
import ToolsMenu from './ToolsMenu.vue'
import SkillsMenu from './SkillsMenu.vue'
import ModeToggle from './ModeToggle.vue'
import PlanPanel from './PlanPanel.vue'
import { FileText, X, Paperclip, Square, Send, Check } from 'lucide-vue-next'
import { getCommands, findCommand, filterCommands } from '@/services/commands'

// Local interface for file preview (extends MessageAttachment with preview)
interface AttachedFile extends Omit<MessageAttachment, 'base64Data'> {
  preview?: string       // Data URL for preview display
  base64Data: string     // Base64 encoded file data
}

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

// Get the effective session ID for this panel
const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// Get the working directory for file search
const workingDirectory = computed(() => {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return ''
  const session = sessionsStore.sessions.find(s => s.id === sessionId)
  return session?.workingDirectory || ''
})

// Cache input text per session
const sessionInputCache = new Map<string, string>()

const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const isSending = ref(false)
const isComposing = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const composerWrapperRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<AttachedFile[]>([])
const modeToggleRef = ref<InstanceType<typeof ModeToggle> | null>(null)

// ResizeObserver for dynamic height tracking
let composerResizeObserver: ResizeObserver | null = null

function handleFocus() {
  isFocused.value = true
}

function handleBlur() {
  isFocused.value = false
}

function handleInput() {
  adjustHeight()
}

// Skills state
const availableSkills = ref<SkillDefinition[]>([])
const showSkillPicker = ref(false)
const skillTriggerQuery = ref('')

// Commands state
const showCommandPicker = ref(false)
const commandQuery = ref('')

// File picker state (for @ file search)
const showFilePicker = ref(false)
const fileQuery = ref('')

// Command feedback state
const commandFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)
let feedbackTimeout: ReturnType<typeof setTimeout> | null = null

function showCommandFeedback(type: 'success' | 'error', message: string) {
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout)
  }
  commandFeedback.value = { type, message }
  feedbackTimeout = setTimeout(() => {
    commandFeedback.value = null
  }, 3000)
}

// Reset isSending when generation completes
watch(() => props.isLoading, (loading) => {
  if (!loading) {
    isSending.value = false
  }
})

// Cache input text when switching sessions
let previousSessionId: string | null = null
watch(effectiveSessionId, (newSessionId, oldSessionId) => {
  // Save current input to cache for the old session
  if (oldSessionId && messageInput.value) {
    sessionInputCache.set(oldSessionId, messageInput.value)
  }
  // Clear input if old session had content (will restore from cache if available)
  if (oldSessionId) {
    messageInput.value = ''
  }
  // Restore cached input for the new session
  if (newSessionId) {
    const cachedInput = sessionInputCache.get(newSessionId)
    if (cachedInput) {
      messageInput.value = cachedInput
      nextTick(() => {
        adjustHeight()
      })
    }
  }
  previousSessionId = newSessionId ?? null
}, { immediate: true })

function handleToolsEnabledChange(enabled: boolean) {
  emit('toolsEnabledChange', enabled)
}

function openToolSettings() {
  emit('openToolSettings')
}

const canSend = computed(() => {
  const hasContent = messageInput.value.trim().length > 0 || attachedFiles.value.length > 0
  return hasContent && !props.isLoading
})

// Check if current model supports image input (vision capability)
const currentModelSupportsVision = computed(() => {
  const provider = settingsStore.settings.ai.provider
  const modelId = settingsStore.settings.ai.providers[provider]?.model
  const models = settingsStore.getCachedModels(provider)
  const model = models.find(m => m.id === modelId)
  return model?.architecture?.input_modalities?.includes('image') || false
})

function handleKeyDown(e: KeyboardEvent) {
  if (isComposing.value) return

  // Don't handle send shortcuts when any picker is visible
  // (they handle Enter/Tab themselves)
  const anyPickerVisible = showCommandPicker.value || showSkillPicker.value || showFilePicker.value
  if (anyPickerVisible && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    // Let the picker handle these keys
    return
  }

  // Tab or Shift+Tab toggles between Build/Ask mode (only when input is empty)
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Only toggle mode when input is empty
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
      // Execute command locally (don't send to AI)
      const result = await command.execute({
        sessionId: effectiveSessionId.value,
        args: argsString.split(/\s+/).filter(Boolean),
        rawArgs: argsString,
      })

      // Show feedback
      if (result.success) {
        showCommandFeedback('success', `cd → ${result.message}`)
      } else {
        showCommandFeedback('error', result.error || `/${commandId} failed`)
      }

      // Clear input
      messageInput.value = ''
      showCommandPicker.value = false
      commandQuery.value = ''
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

  // Convert attached files to MessageAttachment format (without preview)
  const attachments: MessageAttachment[] | undefined = attachedFiles.value.length > 0
    ? attachedFiles.value.map(f => ({
        id: f.id,
        fileName: f.fileName,
        mimeType: f.mimeType,
        size: f.size,
        mediaType: f.mediaType,
        base64Data: f.base64Data,
        width: f.width,
        height: f.height,
      }))
    : undefined

  emit('sendMessage', fullMessage, attachments)
  messageInput.value = ''
  quotedText.value = ''
  attachedFiles.value = [] // Clear attachments after sending
  // Clear the cache for this session since message was sent
  if (effectiveSessionId.value) {
    sessionInputCache.delete(effectiveSessionId.value)
  }
  nextTick(() => {
    adjustHeight()
    // Reset scroll position to top
    if (textareaRef.value) {
      textareaRef.value.scrollTop = 0
    }
    // Refocus the textarea after sending
    textareaRef.value?.focus()
  })
}

function stopGeneration() {
  emit('stopGeneration')
}

function adjustHeight() {
  const textarea = textareaRef.value
  if (!textarea) return

  textarea.style.height = 'auto'
  const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200)
  textarea.style.height = `${newHeight}px`
}

function handleAttach() {
  fileInputRef.value?.click()
}

// File handling functions
function getMediaType(mimeType: string): AttachmentMediaType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf' || mimeType.includes('document') || mimeType.includes('word')) return 'document'
  return 'file'
}

// Process a single file and add to attachments
async function processFile(file: File): Promise<boolean> {
  const maxFileSize = 10 * 1024 * 1024 // 10MB limit
  if (file.size > maxFileSize) {
    console.warn(`File ${file.name} is too large (max 10MB)`)
    return false
  }

  const id = `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const mediaType = getMediaType(file.type)
  const base64Data = await readFileAsBase64(file)

  const attachedFile: AttachedFile = {
    id,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    mediaType,
    base64Data,
  }

  // Generate preview for images
  if (mediaType === 'image') {
    attachedFile.preview = await createImagePreview(file)
    const dimensions = await getImageDimensions(attachedFile.preview)
    attachedFile.width = dimensions.width
    attachedFile.height = dimensions.height
  }

  attachedFiles.value = [...attachedFiles.value, attachedFile]
  return true
}

// Handle paste event - allow image paste only if model supports vision
async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      // Check if current model supports image input
      if (!currentModelSupportsVision.value) {
        // Debug: output current model info
        const provider = settingsStore.settings.ai.provider
        const modelId = settingsStore.settings.ai.providers[provider]?.model
        const models = settingsStore.getCachedModels(provider)
        const model = models.find(m => m.id === modelId)
        console.warn('[InputBox] Current model does not support image input:', {
          provider,
          modelId,
          modelFound: !!model,
          inputModalities: model?.architecture?.input_modalities,
          cachedModelsCount: models.length,
        })
        return // Don't prevent default - allow text to be pasted normally
      }

      event.preventDefault()
      const file = item.getAsFile()
      if (file) {
        await processFile(file)
      }
      return // Only process first image
    }
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  for (const file of Array.from(files)) {
    await processFile(file)
  }

  // Reset input for re-selection
  input.value = ''
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix to get pure base64
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = dataUrl
  })
}

function removeAttachment(id: string) {
  attachedFiles.value = attachedFiles.value.filter(f => f.id !== id)
}

function setQuotedText(text: string) {
  quotedText.value = text
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function clearQuotedText() {
  quotedText.value = ''
}

function focusTextarea() {
  textareaRef.value?.focus()
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

async function loadSkills() {
  try {
    const response = await window.electronAPI.getSkills()
    if (response.success && response.skills) {
      availableSkills.value = response.skills
    }
  } catch (error) {
    console.error('Failed to load skills:', error)
  }
}

const enabledSkills = computed(() => {
  return availableSkills.value.filter(s => s.enabled)
})

watch(messageInput, (newValue) => {
  // Check for command pattern first: /word (without space - still typing command name)
  const commandMatch = newValue.match(/^\/(\w*)$/)

  if (commandMatch) {
    const query = commandMatch[1]
    const commands = filterCommands(query)
    if (commands.length > 0) {
      commandQuery.value = query
      showCommandPicker.value = true
      showSkillPicker.value = false
      showFilePicker.value = false
      skillTriggerQuery.value = ''
      fileQuery.value = ''
      return
    }
  }

  // Close command picker if not matching command pattern
  showCommandPicker.value = false
  commandQuery.value = ''

  // Check for @ file search pattern: @xxx (anywhere in text, matches the last @)
  // Only trigger if there's a working directory set
  const fileMatch = newValue.match(/@([^\s@]*)$/)
  if (fileMatch && workingDirectory.value) {
    fileQuery.value = fileMatch[1]
    showFilePicker.value = true
    showSkillPicker.value = false
    skillTriggerQuery.value = ''
    return
  }

  // Close file picker if not matching file pattern
  showFilePicker.value = false
  fileQuery.value = ''

  // Fall back to skill matching
  const triggerMatch = newValue.match(/^([/@]\w*)$/)
  if (triggerMatch && enabledSkills.value.length > 0) {
    skillTriggerQuery.value = triggerMatch[1]
    showSkillPicker.value = true
  } else {
    showSkillPicker.value = false
    skillTriggerQuery.value = ''
  }
})

async function handleSkillSelect(skill: SkillDefinition) {
  showSkillPicker.value = false

  try {
    const inputContent = messageInput.value.replace(/^[/@]\w*\s*/, '')

    const result = await window.electronAPI.executeSkill(skill.id, {
      sessionId: '',
      input: inputContent,
    })

    if (result.success && result.result?.output) {
      messageInput.value = result.result.output
      await nextTick()
      adjustHeight()
      textareaRef.value?.focus()
    }
  } catch (error) {
    console.error('Failed to execute skill:', error)
  }
}

function handleSkillPickerClose() {
  showSkillPicker.value = false
}

// Command handling
async function handleCommandSelect(command: CommandDefinition) {
  showCommandPicker.value = false
  // Fill in the command in the input, user can add arguments
  messageInput.value = `/${command.id} `
  await nextTick()
  adjustHeight()
  textareaRef.value?.focus()
}

function handleCommandPickerClose() {
  showCommandPicker.value = false
  commandQuery.value = ''
}

// File picker handling
async function handleFilePickerSelect(filePath: string) {
  showFilePicker.value = false
  // Replace @xxx with the selected file path
  messageInput.value = messageInput.value.replace(/@[^\s@]*$/, `@${filePath} `)
  fileQuery.value = ''
  await nextTick()
  adjustHeight()
  textareaRef.value?.focus()
}

function handleFilePickerClose() {
  showFilePicker.value = false
  fileQuery.value = ''
}
</script>

<style scoped>
.composer-wrapper {
  width: 85%;
  margin: 0 auto;
  position: relative;
}

/* Command feedback */
.command-feedback {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.command-feedback.success {
  background: rgba(var(--color-success-rgb, 34, 197, 94), 0.15);
  color: var(--text-success, var(--color-success));
  border: 1px solid rgba(var(--color-success-rgb, 34, 197, 94), 0.3);
}

.command-feedback.error {
  background: rgba(var(--color-danger-rgb, 239, 68, 68), 0.15);
  color: var(--text-error, var(--color-danger));
  border: 1px solid rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Attachment preview */
.attachments-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border-radius: 8px;
  max-width: 200px;
  animation: slideInDown 0.2s ease-out;
}

.attachment-item.is-image {
  padding: 4px;
  background: var(--bg-hover);
}

.attachment-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}

.attachment-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.attachment-name {
  flex: 1;
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.attachment-remove {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.attachment-remove:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--text-error);
  opacity: 1;
}

/* Quoted text context */
.quoted-context {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  position: relative;
  animation: slideInDown 0.2s ease-out;
  box-shadow: var(--shadow-sm);
}

@keyframes slideInDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.quoted-bar {
  width: 3px;
  background: linear-gradient(to bottom, rgba(var(--accent-rgb), 0.6), rgba(var(--accent-rgb), 0.3));
  border-radius: 2px;
  flex-shrink: 0;
}

.quoted-content-wrapper {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.quoted-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  opacity: 0.75;
  max-height: 80px;
  overflow-y: auto;
  min-width: 0;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.quoted-text::-webkit-scrollbar { width: 3px; }
.quoted-text::-webkit-scrollbar-track { background: transparent; }
.quoted-text::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

.remove-quote-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
  opacity: 0.6;
}

.remove-quote-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  opacity: 1;
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

/* Removed: textarea is never disabled - users can type while waiting */

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
