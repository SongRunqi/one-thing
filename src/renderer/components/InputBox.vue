<template>
  <div class="composer-wrapper">
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

    <div class="composer" :class="{ focused: isFocused }">
      <button class="icon-btn attach-btn" title="Attach file" @click="handleAttach">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
      </button>

      <!-- Tools section -->
      <div class="tools-section" ref="toolsSectionRef">
        <!-- Tools toggle button -->
        <button
          class="icon-btn tools-toggle-btn"
          :class="{ active: toolsEnabled }"
          :title="toolsEnabled ? 'Tools enabled - click to disable' : 'Tools disabled - click to enable'"
          @click="toggleTools"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </button>

        <!-- Tools panel button (only show when tools enabled) -->
        <button
          v-if="toolsEnabled"
          class="icon-btn tools-panel-btn"
          :class="{ active: showToolsPanel }"
          @click="toggleToolsPanel"
          title="View available tools"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>

      <!-- Tools quick panel (Teleport to body) -->
      <Teleport to="body">
        <div
          v-if="showToolsPanel"
          class="tools-popover"
          :style="toolsPanelPosition"
          @click.stop
        >
          <div class="tools-popover-header">
            <span>Available Tools</span>
            <button class="popover-close" @click="showToolsPanel = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="tools-popover-list">
            <div
              v-for="tool in availableTools"
              :key="tool.id"
              class="tool-quick-item"
              :class="{ enabled: isToolEnabled(tool.id) }"
            >
              <div class="tool-quick-info">
                <span class="tool-quick-name">{{ tool.name || tool.id }}</span>
                <span class="tool-quick-status">{{ isToolEnabled(tool.id) ? 'On' : 'Off' }}</span>
              </div>
              <label class="mini-toggle">
                <input
                  type="checkbox"
                  :checked="isToolEnabled(tool.id)"
                  @change="toggleToolEnabled(tool.id)"
                />
                <span class="mini-toggle-slider"></span>
              </label>
            </div>
            <div v-if="availableTools.length === 0" class="tools-empty">
              No tools available
            </div>
          </div>
          <button class="tools-popover-settings" @click="openToolSettings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>Advanced Settings</span>
          </button>
        </div>
      </Teleport>

      <div class="input-container">
        <textarea
          ref="textareaRef"
          v-model="messageInput"
          class="composer-input"
          placeholder="Ask anything..."
          @keydown="handleKeyDown"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @input="adjustHeight"
          :disabled="isLoading"
          rows="1"
        />
      </div>

      <div class="composer-actions">
        <button
          class="send-btn"
          @click="sendMessage"
          :disabled="!canSend"
          :title="isLoading ? 'Sending...' : 'Send message'"
        >
          <span v-if="isLoading" class="loading-spinner"></span>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="composer-footer">
      <div class="hint">
        <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send
        <span v-if="toolsEnabled" class="tools-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          Tools on
        </span>
      </div>
      <div class="char-count" :class="{ warning: charCount > maxChars * 0.9, error: charCount > maxChars }">
        {{ charCount }} / {{ maxChars }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

interface ToolDefinition {
  id: string
  name: string
  description?: string
}

interface Props {
  isLoading?: boolean
  maxChars?: number
}

interface Emits {
  (e: 'sendMessage', message: string): void
  (e: 'toolsEnabledChange', enabled: boolean): void
  (e: 'openToolSettings'): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxChars: 4000,
})

const emit = defineEmits<Emits>()
const settingsStore = useSettingsStore()

const messageInput = ref('')
const quotedText = ref('')
const isFocused = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Tools panel state
const showToolsPanel = ref(false)
const toolsSectionRef = ref<HTMLElement | null>(null)
const toolsPanelPosition = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })
const availableTools = ref<ToolDefinition[]>([])

// Tools toggle state - synced with settings
const toolsEnabled = ref(settingsStore.settings?.tools?.enableToolCalls ?? true)

// Watch for settings changes
watch(() => settingsStore.settings?.tools?.enableToolCalls, (newValue) => {
  if (newValue !== undefined) {
    toolsEnabled.value = newValue
  }
})

function toggleTools() {
  toolsEnabled.value = !toolsEnabled.value
  // Update settings store
  if (settingsStore.settings?.tools) {
    settingsStore.settings.tools.enableToolCalls = toolsEnabled.value
    settingsStore.saveSettings(settingsStore.settings)
  }
  emit('toolsEnabledChange', toolsEnabled.value)
}

// Load available tools
async function loadAvailableTools() {
  try {
    const response = await window.electronAPI.getTools()
    if (response.success && response.tools) {
      availableTools.value = response.tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name || tool.id,
        description: tool.description
      }))
    }
  } catch (error) {
    console.error('Failed to load tools:', error)
  }
}

// Toggle tools panel
function toggleToolsPanel() {
  if (!showToolsPanel.value && toolsSectionRef.value) {
    const rect = toolsSectionRef.value.getBoundingClientRect()
    const panelHeight = 320
    const panelWidth = 280

    // Position panel above the button
    let top = rect.top - panelHeight - 8
    let left = rect.left

    // Ensure panel doesn't go off screen
    if (top < 8) {
      top = rect.bottom + 8
    }
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8
    }

    toolsPanelPosition.value = {
      top: `${top}px`,
      left: `${left}px`
    }
  }
  showToolsPanel.value = !showToolsPanel.value

  // Load tools when opening panel
  if (showToolsPanel.value) {
    loadAvailableTools()
  }
}

// Check if a tool is enabled
function isToolEnabled(toolId: string): boolean {
  const toolSettings = settingsStore.settings?.tools?.tools?.[toolId]
  return toolSettings?.enabled ?? true
}

// Toggle individual tool enabled state
function toggleToolEnabled(toolId: string) {
  if (settingsStore.settings?.tools) {
    if (!settingsStore.settings.tools.tools) {
      settingsStore.settings.tools.tools = {}
    }
    const current = settingsStore.settings.tools.tools[toolId]
    settingsStore.settings.tools.tools[toolId] = {
      ...current,
      enabled: !(current?.enabled ?? true)
    }
    settingsStore.saveSettings(settingsStore.settings)
  }
}

// Open tool settings
function openToolSettings() {
  showToolsPanel.value = false
  emit('openToolSettings')
}

// Close panel when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.tools-section') && !target.closest('.tools-popover')) {
    showToolsPanel.value = false
  }
}

const charCount = computed(() => messageInput.value.length)
const maxChars = computed(() => props.maxChars)

const canSend = computed(() => {
  return (
    messageInput.value.trim().length > 0 &&
    !props.isLoading &&
    charCount.value <= maxChars.value
  )
})

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl/Cmd + Enter to send
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    sendMessage()
    return
  }

  // Shift + Enter for new line (default behavior)
  if (e.shiftKey && e.key === 'Enter') {
    return // Allow default
  }

  // Plain Enter to send (optional, can be disabled)
  // Uncomment if you want Enter to send:
  // if (e.key === 'Enter' && !e.shiftKey) {
  //   e.preventDefault()
  //   sendMessage()
  // }
}

function sendMessage() {
  if (canSend.value) {
    let fullMessage = messageInput.value

    // If there's quoted text, prepend it to the message with markdown quote format
    if (quotedText.value) {
      // Format: > quoted text (each line prefixed with >)
      // Then a blank line, then the user's question
      const quotedLines = quotedText.value.split('\n').map(line => `> ${line}`).join('\n')
      fullMessage = `${quotedLines}\n\n${messageInput.value}`
    }

    emit('sendMessage', fullMessage)
    messageInput.value = ''
    quotedText.value = ''
    nextTick(() => {
      adjustHeight()
    })
  }
}

function adjustHeight() {
  const textarea = textareaRef.value
  if (!textarea) return

  // Reset height to auto to get the correct scrollHeight
  textarea.style.height = 'auto'

  // Calculate new height (min 24px, max 200px)
  const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200)
  textarea.style.height = `${newHeight}px`
}

function handleAttach() {
  // Placeholder for file attachment functionality
  console.log('Attach file clicked')
}

function setQuotedText(text: string) {
  quotedText.value = text
  // Focus on the input after setting quoted text
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function clearQuotedText() {
  quotedText.value = ''
}

// Expose methods to parent component
defineExpose({
  setQuotedText,
  clearQuotedText,
})

onMounted(() => {
  adjustHeight()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.composer-wrapper {
  width: min(860px, 100%);
  margin: 0 auto;
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
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.quoted-bar {
  width: 3px;
  background: linear-gradient(to bottom, rgba(16, 163, 127, 0.6), rgba(16, 163, 127, 0.3));
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

/* Custom scrollbar for quoted text */
.quoted-text::-webkit-scrollbar {
  width: 3px;
}

.quoted-text::-webkit-scrollbar-track {
  background: transparent;
}

.quoted-text::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 128, 0.3);
  border-radius: 2px;
}

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

.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04),
    0 4px 24px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.composer.focused {
  border-color: rgba(16, 163, 127, 0.35);
  box-shadow:
    0 0 0 1px rgba(16, 163, 127, 0.15),
    0 4px 32px rgba(0, 0, 0, 0.2),
    0 0 20px rgba(16, 163, 127, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Light theme */
html[data-theme='light'] .composer {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(250, 250, 250, 0.9) 100%
  );
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.04),
    0 4px 24px rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .composer.focused {
  border-color: rgba(16, 163, 127, 0.4);
  box-shadow:
    0 0 0 1px rgba(16, 163, 127, 0.1),
    0 4px 32px rgba(0, 0, 0, 0.08),
    0 0 20px rgba(16, 163, 127, 0.05);
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Tools toggle button */
.tools-toggle-btn {
  position: relative;
  transition: all 0.2s ease;
}

.tools-toggle-btn.active {
  color: var(--accent);
  background: rgba(16, 163, 127, 0.12);
  box-shadow: inset 0 0 0 1px rgba(16, 163, 127, 0.2);
}

.tools-toggle-btn.active:hover {
  background: rgba(16, 163, 127, 0.18);
}

/* Active indicator dot */
.tools-toggle-btn.active::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}

/* Tools indicator in footer */
.tools-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 12px;
  padding: 2px 8px;
  background: rgba(16, 163, 127, 0.1);
  border-radius: 10px;
  font-size: 11px;
  color: var(--accent);
}

.input-container {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.composer-input {
  width: 100%;
  padding: 8px 4px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  resize: none;
  min-height: 24px;
  max-height: 200px;
  line-height: 1.5;
  color: var(--text);
  font-family: inherit;
  overflow-y: auto;
}

.composer-input::placeholder {
  color: var(--muted);
}

.composer-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Custom scrollbar for textarea */
.composer-input::-webkit-scrollbar {
  width: 4px;
}

.composer-input::-webkit-scrollbar-track {
  background: transparent;
}

.composer-input::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.send-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #10a37f 0%, #0d8a6a 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(16, 163, 127, 0.3);
}

.send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0d8a6a 0%, #0a7559 100%);
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 16px rgba(16, 163, 127, 0.4);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.96);
  box-shadow: 0 1px 4px rgba(16, 163, 127, 0.2);
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: not-allowed;
  box-shadow: none;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding: 0 4px;
}

.hint {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
}

.char-count {
  font-size: 12px;
  color: var(--muted);
  transition: color 0.2s ease;
}

.char-count.warning {
  color: #f59e0b;
}

.char-count.error {
  color: #ef4444;
}

/* Tools section */
.tools-section {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Tools panel button */
.tools-panel-btn {
  margin-left: -4px;
  width: 32px;
  height: 32px;
}

.tools-panel-btn.active {
  background: rgba(16, 163, 127, 0.1);
  color: var(--accent);
}

/* Tools popover */
.tools-popover {
  position: fixed;
  width: 280px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 1000;
  overflow: hidden;
  animation: popoverSlideIn 0.2s ease-out;
}

@keyframes popoverSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.tools-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 14px;
}

.popover-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.popover-close:hover {
  background: var(--hover);
  color: var(--text);
}

.tools-popover-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
}

.tool-quick-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.tool-quick-item:last-child {
  margin-bottom: 0;
}

.tool-quick-item:hover {
  background: var(--hover);
}

.tool-quick-item.enabled {
  background: rgba(16, 163, 127, 0.06);
}

.tool-quick-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-quick-name {
  font-size: 13px;
  font-weight: 500;
}

.tool-quick-status {
  font-size: 11px;
  color: var(--muted);
}

.tools-empty {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}

.tools-popover-settings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: transparent;
  border-left: none;
  border-right: none;
  border-bottom: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.tools-popover-settings:hover {
  background: rgba(16, 163, 127, 0.08);
}

/* Mini toggle */
.mini-toggle {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.mini-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.mini-toggle-slider {
  display: block;
  width: 36px;
  height: 20px;
  background: var(--border);
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
}

.mini-toggle-slider::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.mini-toggle input:checked + .mini-toggle-slider {
  background: var(--accent);
}

.mini-toggle input:checked + .mini-toggle-slider::after {
  transform: translateX(16px);
}

/* Light theme */
html[data-theme='light'] .tools-popover {
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}
</style>
