import { ref, computed, type Ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { nextTick } from 'vue'

export function useInputHistory(
  effectiveSessionId: Ref<string | undefined>,
  messageInput: Ref<string>,
  textareaRef: Ref<HTMLTextAreaElement | null>,
  adjustHeight: () => void,
) {
  const chatStore = useChatStore()

  const historyIndex = ref(-1)  // -1 means not in history mode, 0 is most recent
  const originalInput = ref('')  // original input before navigation

  // Current session's user message history (newest first)
  const userMessageHistory = computed(() => {
    const sessionId = effectiveSessionId.value
    if (!sessionId) return []
    const messages = chatStore.sessionMessages.get(sessionId) || []
    return messages
      .filter(m => m.role === 'user' && m.content.trim())
      .map(m => m.content)
      .reverse()
  })

  function isCursorOnFirstLine(): boolean {
    const textarea = textareaRef.value
    if (!textarea || !textarea.value) return true
    return !textarea.value.substring(0, textarea.selectionStart).includes('\n')
  }

  function isCursorOnLastLine(): boolean {
    const textarea = textareaRef.value
    if (!textarea || !textarea.value) return true
    return !textarea.value.substring(textarea.selectionStart).includes('\n')
  }

  function resetHistoryNavigation() {
    historyIndex.value = -1
    originalInput.value = ''
  }

  function handleHistoryNavigation(direction: 'up' | 'down'): boolean {
    const history = userMessageHistory.value
    if (history.length === 0) return false

    if (direction === 'up') {
      if (messageInput.value !== '' && !isCursorOnFirstLine()) return false
      if (historyIndex.value === -1) originalInput.value = messageInput.value
      const newIndex = historyIndex.value + 1
      if (newIndex >= history.length) return true
      historyIndex.value = newIndex
      messageInput.value = history[newIndex]
    } else {
      if (historyIndex.value === -1) return false
      if (!isCursorOnLastLine()) return false
      const newIndex = historyIndex.value - 1
      if (newIndex < 0) {
        historyIndex.value = -1
        messageInput.value = originalInput.value
        originalInput.value = ''
      } else {
        historyIndex.value = newIndex
        messageInput.value = history[newIndex]
      }
    }

    nextTick(() => {
      adjustHeight()
      if (textareaRef.value) {
        textareaRef.value.selectionStart = textareaRef.value.selectionEnd = textareaRef.value.value.length
      }
    })
    return true
  }

  /** Check if user is editing in history mode (for watcher) */
  function checkHistoryEdit(newValue: string) {
    if (historyIndex.value !== -1) {
      const history = userMessageHistory.value
      if (history[historyIndex.value] !== newValue) {
        historyIndex.value = -1
        originalInput.value = ''
      }
    }
  }

  return {
    historyIndex,
    resetHistoryNavigation,
    handleHistoryNavigation,
    checkHistoryEdit,
  }
}
