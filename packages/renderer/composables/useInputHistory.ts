import { ref, computed, type Ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { nextTick } from 'vue'
import type { EditorHandle, EditorVisualLineEdges } from '@/editor'
import type { ContentPart } from '@/types'
import { rawTextFromPromptParts } from '@shared/prompt-references'

export function isSelectionOnFirstLine(value: string, selectionStart: number): boolean {
  if (!value) return true
  return !value.substring(0, selectionStart).includes('\n')
}

export function isSelectionOnLastLine(value: string, selectionStart: number): boolean {
  if (!value) return true
  return !value.substring(selectionStart).includes('\n')
}

/**
 * 决定「光标是不是在首/末行」——这是上下键该翻历史还是该移动光标的唯一判据。
 *
 * 输入框开着软换行：一条长文本折成好几个视觉行，里面一个 `\n` 都没有。按 `\n`
 * 数逻辑行会把折行中段也算成第一行，于是按上直接拿历史记录覆盖了正在写的草稿。
 * 所以编辑器能测出视觉行时以视觉行为准，测不出（jsdom / 未挂载）才退回逻辑行。
 */
export function resolveCursorLineEdges(
  value: string,
  selectionStart: number,
  visualEdges: EditorVisualLineEdges | undefined,
): EditorVisualLineEdges {
  if (visualEdges) return visualEdges
  return {
    atFirstLine: isSelectionOnFirstLine(value, selectionStart),
    atLastLine: isSelectionOnLastLine(value, selectionStart),
  }
}

export function historyTextFromMessage(message: {
  content: string
  contentParts?: ContentPart[]
}): string {
  return rawTextFromPromptParts(message.content, message.contentParts)
}

export function useInputHistory(
  effectiveSessionId: Ref<string | undefined>,
  messageInput: Ref<string>,
  editorRef: Ref<EditorHandle | null>,
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
      .map(m => historyTextFromMessage(m))
      .reverse()
  })

  function cursorLineEdges(): EditorVisualLineEdges {
    const editor = editorRef.value
    if (!editor || !editor.getValue()) return { atFirstLine: true, atLastLine: true }
    return resolveCursorLineEdges(editor.getValue(), editor.getSelection().from, editor.getVisualLineEdges?.())
  }

  function isCursorOnFirstLine(): boolean {
    return cursorLineEdges().atFirstLine
  }

  function isCursorOnLastLine(): boolean {
    return cursorLineEdges().atLastLine
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
      editorRef.value?.setSelection(messageInput.value.length)
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
