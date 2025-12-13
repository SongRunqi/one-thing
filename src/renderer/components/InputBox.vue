<template>
  <div class="composer-wrapper">
    <div class="composer" :class="{ focused: isFocused }">
      <button class="icon-btn attach-btn" title="Attach file" @click="handleAttach">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
      </button>

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
      </div>
      <div class="char-count" :class="{ warning: charCount > maxChars * 0.9, error: charCount > maxChars }">
        {{ charCount }} / {{ maxChars }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'

interface Props {
  isLoading?: boolean
  maxChars?: number
}

interface Emits {
  (e: 'sendMessage', message: string): void
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  maxChars: 4000,
})

const emit = defineEmits<Emits>()

const messageInput = ref('')
const isFocused = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

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
    emit('sendMessage', messageInput.value)
    messageInput.value = ''
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

onMounted(() => {
  adjustHeight()
})
</script>

<style scoped>
.composer-wrapper {
  width: min(860px, 100%);
  margin: 0 auto;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  box-shadow: var(--shadow);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.composer.focused {
  border-color: rgba(16, 163, 127, 0.4);
  box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.1), var(--shadow);
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
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #0d8a6a;
  transform: scale(1.02);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: not-allowed;
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
</style>
