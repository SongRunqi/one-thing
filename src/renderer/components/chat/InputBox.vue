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

    <!-- Attachment previews (shown above composer when files are attached) -->
    <div v-if="attachedFiles.length > 0" class="attachments-preview">
      <div
        v-for="file in attachedFiles"
        :key="file.id"
        class="attachment-item"
        :class="{ 'is-image': file.mediaType === 'image' }"
      >
        <img v-if="file.preview" :src="file.preview" :alt="file.name" class="attachment-thumb" />
        <div v-else class="attachment-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <span class="attachment-name">{{ file.name }}</span>
        <button class="attachment-remove" @click="removeAttachment(file.id)" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- Quoted text context (shown above input when text is referenced) -->
    <div v-if="quotedText" class="quoted-context">
      <div class="quoted-bar"></div>
      <div class="quoted-content-wrapper">
        <div class="quoted-text">{{ quotedText }}</div>
        <button class="remove-quote-btn" @click="clearQuotedText" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="composer" :class="{ focused: isFocused }" @click="focusTextarea">
      <!-- Skill Picker (only shows enabled skills for / trigger) -->
      <SkillPicker
        :visible="showSkillPicker"
        :query="skillTriggerQuery"
        :skills="enabledSkills"
        @select="handleSkillSelect"
        @close="handleSkillPickerClose"
      />

      <!-- Input area - full width -->
      <div class="input-area">
        <!-- Mirror div for caret coordinate calculation -->
        <div ref="mirrorRef" class="textarea-mirror" aria-hidden="true"></div>

        <!-- Custom animated caret -->
        <div
          v-if="isFocused && !isLoading"
          class="custom-caret"
          :style="caretStyle"
        >
          <div class="caret-main"></div>
          <div class="caret-tail"></div>
        </div>

        <textarea
          ref="textareaRef"
          v-model="messageInput"
          class="composer-input"
          placeholder="Ask anything..."
          @keydown="handleKeyDown"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @input="handleInput"
          @click="updateCaret"
          @keyup="updateCaret"
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <!-- Tools menu component -->
          <ToolsMenu
            @tools-enabled-change="handleToolsEnabledChange"
            @open-settings="openToolSettings"
          />

          <!-- Skills menu component -->
          <SkillsMenu @open-settings="openToolSettings" />

          <!-- Model selector component -->
          <ModelSelector />
        </div>

        <!-- Right side: send/stop button -->
        <div class="toolbar-right" @click.stop>
          <button
            v-if="isLoading || isSending"
            class="send-btn stop-btn"
            @click="stopGeneration"
            title="Stop generation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
          <button
            v-else
            class="send-btn"
            @click="sendMessage"
            :disabled="!canSend"
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
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
import SkillPicker from './SkillPicker.vue'
import ModelSelector from './ModelSelector.vue'
import ToolsMenu from './ToolsMenu.vue'
import SkillsMenu from './SkillsMenu.vue'

// Local interface for file preview (extends MessageAttachment with preview)
interface AttachedFile extends Omit<MessageAttachment, 'base64Data'> {
  preview?: string       // Data URL for preview display
  base64Data: string     // Base64 encoded file data
}

interface Props {
  isLoading?: boolean
  maxChars?: number
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

// Cache input text per session
const sessionInputCache = new Map<string, string>()

const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const isSending = ref(false)
const isComposing = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const mirrorRef = ref<HTMLDivElement | null>(null)
const composerWrapperRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<AttachedFile[]>([])

// ResizeObserver for dynamic height tracking
let composerResizeObserver: ResizeObserver | null = null

// Caret position state
const caretPos = ref({ x: 0, y: 0, height: 20 })

const caretStyle = computed(() => ({
  transform: `translate3d(${caretPos.value.x}px, ${caretPos.value.y}px, 0)`,
  height: `${caretPos.value.height}px`
}))

function updateCaret() {
  const textarea = textareaRef.value
  const mirror = mirrorRef.value
  if (!textarea || !mirror) return

  const { selectionStart, selectionEnd } = textarea
  if (selectionStart !== selectionEnd) {
    caretPos.value = { ...caretPos.value, opacity: 0 } as any
    return
  }

  const style = window.getComputedStyle(textarea)
  const properties = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'textTransform', 'wordSpacing', 'textIndent', 'whiteSpace', 'wordBreak',
    'wordWrap', 'paddingLeft', 'paddingRight', 'paddingBottom',
    'borderLeftWidth', 'borderRightWidth', 'lineHeight', 'width'
  ]

  properties.forEach(prop => {
    (mirror.style as any)[prop] = (style as any)[prop]
  })

  const content = textarea.value.substring(0, selectionStart)
  mirror.textContent = content

  const probe = document.createElement('span')
  probe.textContent = '\u200b'
  mirror.appendChild(probe)

  const fontSize = parseFloat(style.fontSize) || 16
  const lineHeight = parseFloat(style.lineHeight) || 24
  const caretHeight = fontSize * 1.6
  const yOffset = (lineHeight - caretHeight) / 2 - 2

  const x = probe.offsetLeft - textarea.scrollLeft
  const y = probe.offsetTop - textarea.scrollTop + yOffset

  caretPos.value = { x, y, height: caretHeight }
}

function handleInput() {
  adjustHeight()
  updateCaret()
}

watch(isFocused, (val) => {
  if (val) {
    nextTick(updateCaret)
  }
})

// Skills state
const availableSkills = ref<SkillDefinition[]>([])
const showSkillPicker = ref(false)
const skillTriggerQuery = ref('')

// Reset isSending when generation completes
watch(() => props.isLoading, (loading) => {
  if (!loading) {
    isSending.value = false
  }
})

// Cache input text when switching sessions
let previousSessionId: string | null = null
watch(() => sessionsStore.currentSessionId, (newSessionId, oldSessionId) => {
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
        updateCaret()
      })
    }
  }
  previousSessionId = newSessionId
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

function handleKeyDown(e: KeyboardEvent) {
  if (isComposing.value) return

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

function sendMessage() {
  if (canSend.value) {
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
    if (sessionsStore.currentSessionId) {
      sessionInputCache.delete(sessionsStore.currentSessionId)
    }
    nextTick(() => {
      adjustHeight()
    })
  }
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

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  const maxFileSize = 10 * 1024 * 1024 // 10MB limit
  const newFiles: AttachedFile[] = []

  for (const file of Array.from(files)) {
    if (file.size > maxFileSize) {
      console.warn(`File ${file.name} is too large (max 10MB)`)
      continue
    }

    const id = `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const mediaType = getMediaType(file.type)

    // Read file as base64
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
      // Get image dimensions
      const dimensions = await getImageDimensions(attachedFile.preview)
      attachedFile.width = dimensions.width
      attachedFile.height = dimensions.height
    }

    newFiles.push(attachedFile)
  }

  attachedFiles.value = [...attachedFiles.value, ...newFiles]

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
    updateCaret()
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
</script>

<style scoped>
.composer-wrapper {
  width: 85%;
  margin: 0 auto;
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
  background: rgba(120, 120, 128, 0.1);
  border-radius: 8px;
  max-width: 200px;
  animation: slideInDown 0.2s ease-out;
}

.attachment-item.is-image {
  padding: 4px;
  background: rgba(120, 120, 128, 0.08);
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
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  opacity: 1;
}

/* Quoted text context */
.quoted-context {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: rgba(120, 120, 128, 0.06);
  border-radius: 12px;
  position: relative;
  animation: slideInDown 0.2s ease-out;
}

@keyframes slideInDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.quoted-bar {
  width: 3px;
  background: linear-gradient(to bottom, rgba(59, 130, 246, 0.6), rgba(59, 130, 246, 0.3));
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
.quoted-text::-webkit-scrollbar-thumb { background: rgba(120, 120, 128, 0.3); border-radius: 2px; }

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
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
  opacity: 1;
}

/* Main composer container */
.composer {
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 0.5px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 30, 35, 0.65);
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

html[data-theme='light'] .composer {
  background: rgba(242, 240, 229, 0.85);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
}

html[data-theme='light'] .composer.focused {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 0 0 0.5px rgba(59, 130, 246, 0.15), 0 8px 32px rgba(0, 0, 0, 0.06), var(--shadow-glow);
}

/* Input area */
.input-area {
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
  caret-color: transparent !important;
}

.textarea-mirror {
  position: absolute;
  top: 12px;
  left: 18px;
  visibility: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: hidden;
  z-index: -1;
}

.custom-caret {
  position: absolute;
  top: 12px;
  left: 18px;
  width: 2px;
  pointer-events: none;
  z-index: 10;
  transition: transform 0.12s cubic-bezier(0.18, 0.89, 0.32, 1.15), opacity 0.15s ease;
}

.caret-main {
  width: 100%;
  height: 100%;
  background: var(--accent);
  border-radius: 1px;
  box-shadow: 0 0 8px var(--accent), 0 0 15px rgba(59, 130, 246, 0.4);
  animation: caret-blink 0.8s ease-in-out infinite;
}

.caret-tail {
  position: absolute;
  top: 0;
  left: -2px;
  width: 8px;
  height: 100%;
  background: linear-gradient(to right, var(--accent), transparent);
  opacity: 0.4;
  filter: blur(4px);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
}

@keyframes caret-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

html[data-theme='light'] .caret-main {
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.3);
}

.composer-input::placeholder {
  color: var(--text-input-placeholder);
  user-select: none;
  -webkit-user-select: none;
}

/* Removed: textarea is never disabled - users can type while waiting */

.composer-input::-webkit-scrollbar { width: 4px; }
.composer-input::-webkit-scrollbar-track { background: transparent; }
.composer-input::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 2px; }

/* Bottom toolbar */
.composer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-right {
  gap: 12px;
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

html[data-theme='light'] .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
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
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.96);
  box-shadow: 0 1px 4px rgba(59, 130, 246, 0.2);
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: not-allowed;
  box-shadow: none;
}

html[data-theme='light'] .send-btn:disabled {
  background: rgba(0, 0, 0, 0.06);
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
  .composer-wrapper { max-width: 100%; }
  .composer { border-radius: 14px; }
  .composer-input { font-size: 15px; }
  .toolbar-btn { width: 34px; height: 34px; }
  .send-btn { width: 36px; height: 36px; }
}

@media (max-width: 480px) {
  .composer { border-radius: 12px; }
  .input-area { padding: 10px 12px 0; }
  .composer-toolbar { padding: 6px 10px; }
  .composer-input { font-size: 15px; }
}
</style>
