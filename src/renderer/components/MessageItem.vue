<template>
  <!-- Selection toolbar (floating) -->
  <Teleport to="body">
    <div
      v-if="showSelectionToolbar"
      class="selection-toolbar"
      :style="{ top: selectionToolbarPosition.top + 'px', left: selectionToolbarPosition.left + 'px' }"
    >
      <button class="toolbar-btn" @click="copySelection" title="Copy selected text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>{{ selectionCopied ? 'Copied!' : 'Copy' }}</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="quoteSelection" title="Quote in current chat">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
        </svg>
        <span>Quote</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="createBranchWithSelection" title="Create branch with this text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="6" y1="3" x2="6" y2="15"/>
          <circle cx="18" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
        <span>Branch</span>
      </button>
    </div>
  </Teleport>

  <!-- Error message (notification style) -->
  <div v-if="message.role === 'error'" class="message error">
    <div class="error-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <div class="error-bubble">
      <div class="error-content">{{ message.content }}</div>
      <div v-if="message.errorDetails" class="error-details">{{ message.errorDetails }}</div>
      <div class="error-footer">
        <span class="error-time">{{ formatTime(message.timestamp) }}</span>
      </div>
    </div>
  </div>

  <!-- Normal user/assistant message -->
  <div v-else :class="['message', message.role]">
    <div class="avatar" aria-hidden="true">
      <span v-if="message.role === 'assistant'">◎</span>
      <span v-else>🙂</span>
    </div>
    <div class="message-content-wrapper">
      <!-- Waiting/Thinking status indicator (streaming) - outside bubble -->
      <div v-if="message.isStreaming && !message.content" class="thinking-status">
        <!-- Waiting: no reasoning yet, still waiting for API response -->
        <span v-if="!message.reasoning" class="thinking-text flowing">Waiting</span>
        <!-- Thinking: has reasoning, model is thinking -->
        <span v-else class="thinking-text flowing">Thinking</span>
      </div>

      <!-- Message bubble - only show if there's content -->
      <div v-if="message.content || !message.isStreaming" class="bubble" ref="bubbleRef" @mouseenter="showActions = true" @mouseleave="showActions = false" @mouseup="handleTextSelection">
        <!-- Edit mode for user messages -->
        <div v-if="isEditing" class="edit-container">
          <textarea
            ref="editTextarea"
            v-model="editContent"
            class="edit-textarea"
            @keydown.enter.ctrl="submitEdit"
            @keydown.escape="cancelEdit"
          ></textarea>
          <div class="edit-actions">
            <button class="edit-btn cancel" @click="cancelEdit">Cancel</button>
            <button class="edit-btn submit" @click="submitEdit">Send</button>
          </div>
        </div>
        <!-- Normal display -->
        <template v-else>
          <div :class="['content', { typing: isTyping }]" v-html="renderedContent"></div>
        <div class="message-footer">
          <div class="meta">{{ formatTime(message.timestamp) }}</div>
          <div :class="['actions', { visible: showActions }]">
            <button class="action-btn" @click="copyContent" :title="copied ? 'Copied!' : 'Copy'">
              <span v-if="copied">✓</span>
              <span v-else>⧉</span>
            </button>
            <!-- Edit button for user messages -->
            <button
              v-if="message.role === 'user'"
              class="action-btn"
              @click="startEdit"
              title="Edit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <!-- Branch button (only for assistant messages in root sessions) -->
            <div v-if="canBranch && message.role === 'assistant'" class="branch-btn-wrapper" ref="branchBtnRef">
              <button
                class="action-btn"
                :class="{ 'has-branches': hasBranches }"
                @click="hasBranches ? toggleBranchMenu() : createBranch()"
                :title="hasBranches ? `${branchCount} branch${branchCount > 1 ? 'es' : ''}` : 'Create branch from here'"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="6" y1="3" x2="6" y2="15"/>
                  <circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
                <span v-if="hasBranches" class="branch-count-badge">{{ branchCount }}</span>
              </button>
              <!-- Branch dropdown menu -->
              <div v-if="showBranchMenu && hasBranches" class="branch-menu" :style="branchMenuStyle">
                <div class="branch-menu-list">
                  <button
                    v-for="branch in branches"
                    :key="branch.id"
                    class="branch-menu-item"
                    @click="goToBranch(branch.id)"
                  >
                    <span class="branch-name">{{ branch.name || 'Untitled branch' }}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
                </div>
                <div class="branch-menu-footer">
                  <button class="branch-menu-new" @click="createBranch">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>New branch</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              v-if="message.role === 'assistant'"
              class="action-btn"
              @click="regenerate"
              title="Regenerate"
            >
              ↻
            </button>
          </div>
        </div>
      </template>
    </div>

      <!-- Tool calls - Independent section outside bubble -->
      <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls-container">
        <div class="tool-calls-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <span>Tool {{ message.toolCalls.length > 1 ? 'Calls' : 'Call' }}</span>
          <span class="tool-calls-count">{{ message.toolCalls.length }}</span>
        </div>
        <div class="tool-calls-list">
          <ToolCallItem
            v-for="toolCall in message.toolCalls"
            :key="toolCall.id"
            :toolCall="toolCall"
            @execute="handleToolExecute"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import type { ChatMessage, ToolCall } from '@/types'
import ToolCallItem from './ToolCallItem.vue'

interface BranchInfo {
  id: string
  name: string
}

interface Props {
  message: ChatMessage
  branches?: BranchInfo[]  // Branches that were created from this message
  canBranch?: boolean      // Whether branching is allowed (false for child sessions)
}

const props = defineProps<Props>()
const emit = defineEmits<{
  regenerate: [messageId: string]
  edit: [messageId: string, newContent: string]
  branch: [messageId: string, quotedText?: string]
  goToBranch: [sessionId: string]
  quote: [quotedText: string]
  executeTool: [toolCall: ToolCall]
}>()

const showActions = ref(false)
const copied = ref(false)
const showBranchMenu = ref(false)
const branchBtnRef = ref<HTMLElement | null>(null)
const bubbleRef = ref<HTMLElement | null>(null)
const branchMenuPosition = ref({ top: 0, left: 0 })

// Text selection toolbar state
const showSelectionToolbar = ref(false)
const selectedText = ref('')
const selectionToolbarPosition = ref({ top: 0, left: 0 })
const selectionCopied = ref(false)

// Computed: whether this message has branches
const hasBranches = computed(() => props.branches && props.branches.length > 0)
const branchCount = computed(() => props.branches?.length || 0)

// Computed style for branch menu positioning
const branchMenuStyle = computed(() => ({
  top: `${branchMenuPosition.value.top}px`,
  left: `${branchMenuPosition.value.left}px`
}))

// Edit mode state
const isEditing = ref(false)
const editContent = ref('')
const editTextarea = ref<HTMLTextAreaElement | null>(null)

// Typewriter effect state
const displayedContent = ref('')
const isTyping = ref(false)
let typewriterInterval: ReturnType<typeof setInterval> | null = null

// Configure marked with highlight.js
marked.setOptions({
  breaks: true,
  gfm: true,
})

// Custom renderer for code blocks
const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<div class="code-block">
    <div class="code-header">
      <span class="code-lang">${language}</span>
      <button class="code-copy" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.textContent)">Copy</button>
    </div>
    <pre><code class="hljs language-${language}">${highlighted}</code></pre>
  </div>`
}

renderer.codespan = ({ text }: { text: string }) => {
  return `<code class="inline-code">${text}</code>`
}

marked.use({ renderer })

// Get content to render (either typed content or full content)
const contentToRender = computed(() => {
  if (isTyping.value) {
    return displayedContent.value
  }
  return props.message.content
})

const renderedContent = computed(() => {
  if (props.message.role === 'user') {
    // For user messages, just escape HTML and preserve line breaks
    return escapeHtml(contentToRender.value).replace(/\n/g, '<br>')
  }
  // For assistant messages, render markdown
  return marked.parse(contentToRender.value) as string
})

// Clean reasoning content by removing XML tags (e.g., <think>...</think> from DeepSeek-R1)
function cleanReasoningContent(content: string): string {
  if (!content) return ''

  console.log('[MessageItem] Raw reasoning content:', content)
  console.log('[MessageItem] Content length:', content.length)

  // Remove <think> and </think> tags (case-insensitive)
  let cleaned = content.replace(/<\/?think>/gi, '')

  // Remove other common reasoning-related XML tags
  cleaned = cleaned.replace(/<\/?thinking>/gi, '')
  cleaned = cleaned.replace(/<\/?reasoning>/gi, '')

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim()

  console.log('[MessageItem] Cleaned reasoning content:', cleaned)

  return cleaned
}

// Rendered reasoning content (for thinking models)
const renderedReasoning = computed(() => {
  if (!props.message.reasoning) return ''

  // Clean XML tags before parsing markdown
  const cleanedContent = cleanReasoningContent(props.message.reasoning)

  return marked.parse(cleanedContent) as string
})

// Typewriter effect logic
function startTypewriter() {
  if (props.message.role !== 'assistant' || !props.message.isStreaming) {
    displayedContent.value = props.message.content
    return
  }

  isTyping.value = true
  displayedContent.value = ''
  let currentIndex = 0
  const content = props.message.content
  const charsPerTick = 3 // Characters to add per tick
  const tickInterval = 20 // Milliseconds between ticks

  typewriterInterval = setInterval(() => {
    if (currentIndex < content.length) {
      currentIndex = Math.min(currentIndex + charsPerTick, content.length)
      displayedContent.value = content.slice(0, currentIndex)
    } else {
      stopTypewriter()
    }
  }, tickInterval)
}

function stopTypewriter() {
  if (typewriterInterval) {
    clearInterval(typewriterInterval)
    typewriterInterval = null
  }
  isTyping.value = false
  displayedContent.value = props.message.content
}

// Watch for streaming changes
watch(
  () => props.message.isStreaming,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      startTypewriter()
    } else if (!newVal && oldVal) {
      stopTypewriter()
    }
  },
  { immediate: true }
)

// Watch for content updates during streaming
watch(
  () => props.message.content,
  () => {
    if (!props.message.isStreaming && !isTyping.value) {
      displayedContent.value = props.message.content
    }
  }
)

onMounted(() => {
  if (props.message.isStreaming) {
    startTypewriter()
  } else {
    displayedContent.value = props.message.content
  }
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  stopTypewriter()
  document.removeEventListener('click', handleClickOutside)
})

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function regenerate() {
  emit('regenerate', props.message.id)
}

function startEdit() {
  editContent.value = props.message.content
  isEditing.value = true
  nextTick(() => {
    if (editTextarea.value) {
      editTextarea.value.focus()
      // Auto-resize textarea
      editTextarea.value.style.height = 'auto'
      editTextarea.value.style.height = editTextarea.value.scrollHeight + 'px'
    }
  })
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

function submitEdit() {
  if (!editContent.value.trim()) return
  emit('edit', props.message.id, editContent.value.trim())
  isEditing.value = false
}

function createBranch() {
  showBranchMenu.value = false
  emit('branch', props.message.id)
}

function toggleBranchMenu() {
  if (showBranchMenu.value) {
    showBranchMenu.value = false
    return
  }

  // Calculate menu position based on branch button position
  if (branchBtnRef.value && bubbleRef.value) {
    const btnRect = branchBtnRef.value.getBoundingClientRect()
    const bubbleRect = bubbleRef.value.getBoundingClientRect()
    const menuWidth = 200 // approximate menu width
    const menuHeight = 150 // approximate menu height
    const padding = 8

    // Position: below the bubble, menu's left edge aligns with button's left edge
    let top = bubbleRect.bottom + padding
    let left = btnRect.left

    // If menu would go off the right edge, shift left
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding
    }

    // If menu would go off the left edge
    if (left < padding) {
      left = padding
    }

    // If menu would go off the bottom, show above the bubble
    if (top + menuHeight > window.innerHeight - padding) {
      top = bubbleRect.top - menuHeight - padding
    }

    branchMenuPosition.value = { top, left }
  }

  showBranchMenu.value = true
}

function goToBranch(sessionId: string) {
  showBranchMenu.value = false
  emit('goToBranch', sessionId)
}

// Close branch menu when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.branch-btn-wrapper')) {
    showBranchMenu.value = false
  }
  // Also close selection toolbar if clicking outside
  if (!target.closest('.selection-toolbar') && !target.closest('.bubble')) {
    showSelectionToolbar.value = false
  }
}

// Handle text selection in assistant messages
function handleTextSelection(event: MouseEvent) {
  // Only handle selection for assistant messages
  if (props.message.role !== 'assistant') return

  // Small delay to ensure selection is complete
  setTimeout(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (!text || text.length === 0) {
      showSelectionToolbar.value = false
      return
    }

    // Store selected text
    selectedText.value = text

    // Get selection position for toolbar placement
    const range = selection?.getRangeAt(0)
    if (!range) return

    const rect = range.getBoundingClientRect()
    const padding = 8
    const toolbarWidth = 320  // approximate toolbar width (Copy + Quote + Branch)
    const toolbarHeight = 44  // approximate toolbar height

    // Position toolbar above the selection, centered
    let top = rect.top - toolbarHeight - padding
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2)

    // Adjust if toolbar would go off screen
    if (left < padding) {
      left = padding
    }
    if (left + toolbarWidth > window.innerWidth - padding) {
      left = window.innerWidth - toolbarWidth - padding
    }
    if (top < padding) {
      // If no room above, show below
      top = rect.bottom + padding
    }

    selectionToolbarPosition.value = { top, left }
    showSelectionToolbar.value = true
  }, 10)
}

// Copy selected text to clipboard
async function copySelection() {
  try {
    await navigator.clipboard.writeText(selectedText.value)
    selectionCopied.value = true
    setTimeout(() => {
      selectionCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy selection:', err)
  }
}

// Quote selected text in current chat
function quoteSelection() {
  emit('quote', selectedText.value)

  // Hide toolbar and clear selection
  showSelectionToolbar.value = false
  window.getSelection()?.removeAllRanges()
}

// Create branch with selected text as context
function createBranchWithSelection() {
  // Emit branch event with selected text
  emit('branch', props.message.id, selectedText.value)

  // Hide toolbar and clear selection
  showSelectionToolbar.value = false
  window.getSelection()?.removeAllRanges()
}

// Handle tool execution
function handleToolExecute(toolCall: ToolCall) {
  emit('executeTool', toolCall)
}
</script>

<style scoped>
/* Custom text selection highlight for AI messages */
.message.assistant .bubble ::selection {
  background: rgba(16, 163, 127, 0.35);
  color: inherit;
}

.message.assistant .bubble ::-moz-selection {
  background: rgba(16, 163, 127, 0.35);
  color: inherit;
}

html[data-theme='light'] .message.assistant .bubble ::selection {
  background: rgba(16, 163, 127, 0.25);
}

html[data-theme='light'] .message.assistant .bubble ::-moz-selection {
  background: rgba(16, 163, 127, 0.25);
}

/* Selection toolbar (floating) */
.selection-toolbar {
  position: fixed;
  z-index: 9999;
  background: rgba(24, 24, 27, 0.98);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 4px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.3),
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 12px 24px -4px rgba(0, 0, 0, 0.4),
    0 0 40px rgba(16, 163, 127, 0.08);
  display: flex;
  align-items: center;
  gap: 2px;
  animation: toolbarSlideIn 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

html[data-theme='light'] .selection-toolbar {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 12px 24px -4px rgba(0, 0, 0, 0.15),
    0 0 40px rgba(16, 163, 127, 0.06);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 2px;
}

html[data-theme='light'] .toolbar-divider {
  background: rgba(0, 0, 0, 0.1);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.32, 0.72, 0, 1);
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: rgba(16, 163, 127, 0.15);
  color: var(--accent);
  transform: translateY(-1px);
}

.toolbar-btn:active {
  transform: translateY(0) scale(0.98);
}

.toolbar-btn svg {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.toolbar-btn:hover svg {
  transform: scale(1.1);
}

@keyframes toolbarSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.message {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  animation: fadeIn 0.18s ease-out;
  width: min(900px, 100%);
}

.message.user {
  flex-direction: row-reverse;
}

.message.assistant {
  flex-direction: row;
}

.avatar {
  height: 34px;
  width: 34px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  user-select: none;
  flex: 0 0 auto;
}

.message-content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

/* User messages: align items to the right */
.message.user .message-content-wrapper {
  align-items: flex-end;
}

.bubble {
  max-width: min(680px, 78%);
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.05);
  position: relative;
}

/* AI messages: remove bubble styling for clean reading experience */
.message.assistant .bubble {
  max-width: 100%;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
}

.message.user .bubble {
  background: rgba(16, 163, 127, 0.14);
  border-color: rgba(16, 163, 127, 0.25);
}

.content {
  word-wrap: break-word;
  line-height: 1.7;
  font-size: 14.5px;
  color: var(--text);
  letter-spacing: 0.01em;
}

.content.typing::after {
  content: '|';
  animation: blink 0.7s infinite;
  color: var(--accent);
  font-weight: 300;
  margin-left: 2px;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* Markdown content styles */
.content :deep(p) {
  margin: 0 0 0.75em 0;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(ul),
.content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.content :deep(li) {
  margin: 0.25em 0;
}

.content :deep(h1),
.content :deep(h2),
.content :deep(h3),
.content :deep(h4) {
  margin: 1em 0 0.5em 0;
  font-weight: 600;
}

.content :deep(h1) { font-size: 1.4em; }
.content :deep(h2) { font-size: 1.25em; }
.content :deep(h3) { font-size: 1.1em; }

.content :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid var(--accent);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0 8px 8px 0;
}

.content :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.content :deep(a:hover) {
  text-decoration: underline;
}

.content :deep(table) {
  border-collapse: collapse;
  margin: 0.75em 0;
  width: 100%;
}

.content :deep(th),
.content :deep(td) {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}

.content :deep(th) {
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
}

.content :deep(.inline-code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.9em;
}

.content :deep(.code-block) {
  margin: 0.75em 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.3);
}

.content :deep(.code-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid var(--border);
}

.content :deep(.code-lang) {
  font-size: 12px;
  color: var(--muted);
  text-transform: lowercase;
}

.content :deep(.code-copy) {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s ease;
}

.content :deep(.code-copy:hover) {
  background: rgba(255, 255, 255, 0.15);
}

.content :deep(pre) {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
}

.content :deep(code) {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.5;
}

/* highlight.js theme overrides */
.content :deep(.hljs) {
  background: transparent;
  color: #e6e6e6;
}

.content :deep(.hljs-keyword) { color: #c678dd; }
.content :deep(.hljs-string) { color: #98c379; }
.content :deep(.hljs-number) { color: #d19a66; }
.content :deep(.hljs-comment) { color: #5c6370; font-style: italic; }
.content :deep(.hljs-function) { color: #61afef; }
.content :deep(.hljs-class) { color: #e5c07b; }
.content :deep(.hljs-variable) { color: #e06c75; }
.content :deep(.hljs-attr) { color: #d19a66; }
.content :deep(.hljs-built_in) { color: #e6c07b; }
.content :deep(.hljs-title) { color: #61afef; }
.content :deep(.hljs-params) { color: #abb2bf; }
.content :deep(.hljs-punctuation) { color: #abb2bf; }

.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

/* AI messages: adjust footer for clean layout */
.message.assistant .message-footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.meta {
  font-size: 12px;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.actions.visible {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Error message styles */
.message.error {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: min(860px, 100%);
  animation: fadeIn 0.18s ease-out;
}

.error-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  color: rgb(239, 68, 68);
  flex-shrink: 0;
}

.error-bubble {
  flex: 1;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

.error-content {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
}

html[data-theme='light'] .error-content {
  color: rgba(0, 0, 0, 0.85);
}

.error-details {
  margin-top: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, monospace;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.65);
  word-break: break-all;
}

html[data-theme='light'] .error-details {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.6);
}

.error-footer {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.error-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

html[data-theme='light'] .error-time {
  color: rgba(0, 0, 0, 0.4);
}

/* Edit mode styles */
.edit-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-textarea {
  width: 100%;
  min-height: 60px;
  max-height: 300px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
}

.edit-textarea:focus {
  border-color: var(--accent);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.edit-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-btn.cancel {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}

.edit-btn.cancel:hover {
  background: var(--hover);
  color: var(--text);
}

.edit-btn.submit {
  background: var(--accent);
  border: none;
  color: white;
}

.edit-btn.submit:hover {
  background: #0d8e6f;
}

/* Branch button and menu styles */
.branch-btn-wrapper {
  position: relative;
}

.action-btn.has-branches {
  background: rgba(16, 163, 127, 0.15);
  color: var(--accent);
}

.action-btn.has-branches:hover {
  background: rgba(16, 163, 127, 0.25);
}

.branch-count-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  background: var(--accent);
  color: white;
  border-radius: 7px;
}

.branch-menu {
  position: fixed;
  min-width: 180px;
  max-width: 240px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  z-index: 1000;
}

.branch-menu-list {
  max-height: 180px;
  overflow-y: auto;
}

.branch-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.branch-menu-item:hover {
  background: var(--hover);
}

.branch-menu-item svg {
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.branch-menu-item:hover svg {
  opacity: 1;
}

.branch-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-menu-footer {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 4px;
}

.branch-menu-new {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.15s ease;
}

.branch-menu-new:hover {
  background: rgba(16, 163, 127, 0.1);
}

/* Tool calls container - Independent section outside bubble */
.tool-calls-container {
  margin-top: 12px;
  max-width: min(720px, 100%);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  animation: toolCallSlideIn 0.25s ease-out;
}

@keyframes toolCallSlideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tool-calls-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(16, 163, 127, 0.06);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.tool-calls-header svg {
  opacity: 0.8;
}

.tool-calls-count {
  margin-left: auto;
  padding: 2px 8px;
  background: rgba(16, 163, 127, 0.15);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.tool-calls-list {
  padding: 8px;
}

/* Light theme */
html[data-theme='light'] .tool-calls-container {
  background: rgba(0, 0, 0, 0.02);
}

html[data-theme='light'] .tool-calls-header {
  background: rgba(16, 163, 127, 0.05);
}

/* Thinking status indicator - flowing text */
.thinking-status {
  padding: 8px 0;
  width: fit-content;
  max-width: 100%;
}

.thinking-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}

/* Flowing text animation - gradient sweeps from left to right */
.thinking-text.flowing {
  background: linear-gradient(
    90deg,
    rgba(120, 120, 128, 0.3) 0%,
    rgba(120, 120, 128, 1) 25%,
    rgba(120, 120, 128, 1) 50%,
    rgba(120, 120, 128, 1) 75%,
    rgba(120, 120, 128, 0.3) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: flowing-gradient 2.5s ease-in-out infinite;
}

@keyframes flowing-gradient {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.reasoning-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
  max-height: 400px;
  overflow-y: auto;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
  scrollbar-gutter: stable;
}

/* Custom scrollbar for reasoning content */
.reasoning-content::-webkit-scrollbar {
  width: 8px;
}

.reasoning-content::-webkit-scrollbar-track {
  background: transparent;
}

.reasoning-content::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.3);
  border-radius: 3px;
}

.reasoning-content::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.5);
}

/* Markdown elements in reasoning content */
.reasoning-content :deep(p) {
  margin: 0.6em 0;
}

.reasoning-content :deep(p:first-child) {
  margin-top: 0;
}

.reasoning-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* Lists */
.reasoning-content :deep(ul),
.reasoning-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.reasoning-content :deep(li) {
  margin: 0.25em 0;
  line-height: 1.6;
}

.reasoning-content :deep(ul ul),
.reasoning-content :deep(ol ol),
.reasoning-content :deep(ul ol),
.reasoning-content :deep(ol ul) {
  margin: 0.15em 0;
}

/* Headings */
.reasoning-content :deep(h1),
.reasoning-content :deep(h2),
.reasoning-content :deep(h3),
.reasoning-content :deep(h4),
.reasoning-content :deep(h5),
.reasoning-content :deep(h6) {
  margin: 0.8em 0 0.4em 0;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.3;
}

.reasoning-content :deep(h1:first-child),
.reasoning-content :deep(h2:first-child),
.reasoning-content :deep(h3:first-child),
.reasoning-content :deep(h4:first-child),
.reasoning-content :deep(h5:first-child),
.reasoning-content :deep(h6:first-child) {
  margin-top: 0;
}

.reasoning-content :deep(h1) { font-size: 1.3em; }
.reasoning-content :deep(h2) { font-size: 1.2em; }
.reasoning-content :deep(h3) { font-size: 1.1em; }
.reasoning-content :deep(h4) { font-size: 1.05em; }
.reasoning-content :deep(h5) { font-size: 1em; }
.reasoning-content :deep(h6) { font-size: 0.95em; }

/* Blockquote */
.reasoning-content :deep(blockquote) {
  margin: 0.6em 0;
  padding: 0.4em 0.8em;
  border-left: 3px solid rgba(139, 92, 246, 0.5);
  background: rgba(139, 92, 246, 0.08);
  border-radius: 0 6px 6px 0;
  color: rgba(255, 255, 255, 0.75);
}

/* Links */
.reasoning-content :deep(a) {
  color: rgba(139, 92, 246, 0.9);
  text-decoration: none;
  transition: color 0.15s ease;
}

.reasoning-content :deep(a:hover) {
  color: rgb(139, 92, 246);
  text-decoration: underline;
}

/* Tables */
.reasoning-content :deep(table) {
  border-collapse: collapse;
  margin: 0.6em 0;
  width: 100%;
  font-size: 12px;
}

.reasoning-content :deep(th),
.reasoning-content :deep(td) {
  border: 1px solid rgba(139, 92, 246, 0.2);
  padding: 6px 10px;
  text-align: left;
}

.reasoning-content :deep(th) {
  background: rgba(139, 92, 246, 0.15);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.reasoning-content :deep(tr:hover) {
  background: rgba(139, 92, 246, 0.05);
}

/* Horizontal rule */
.reasoning-content :deep(hr) {
  border: none;
  border-top: 1px solid rgba(139, 92, 246, 0.2);
  margin: 0.8em 0;
}

/* Strong and emphasis */
.reasoning-content :deep(strong) {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.reasoning-content :deep(em) {
  font-style: italic;
  color: rgba(255, 255, 255, 0.8);
}

/* Code in reasoning */
.reasoning-content :deep(.inline-code),
.reasoning-content :deep(code:not(pre code)) {
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.reasoning-content :deep(.code-block),
.reasoning-content :deep(pre) {
  background: rgba(0, 0, 0, 0.25);
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.6em 0;
  border: 1px solid rgba(139, 92, 246, 0.15);
}

.reasoning-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 12px;
  line-height: 1.5;
}

/* Light theme */
html[data-theme='light'] .reasoning-section {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%);
  border-color: rgba(139, 92, 246, 0.18);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.06);
}

html[data-theme='light'] .reasoning-content-wrapper {
  background: rgba(139, 92, 246, 0.03);
}

html[data-theme='light'] .reasoning-content {
  color: rgba(0, 0, 0, 0.65);
}

html[data-theme='light'] .reasoning-content :deep(h1),
html[data-theme='light'] .reasoning-content :deep(h2),
html[data-theme='light'] .reasoning-content :deep(h3),
html[data-theme='light'] .reasoning-content :deep(h4),
html[data-theme='light'] .reasoning-content :deep(h5),
html[data-theme='light'] .reasoning-content :deep(h6) {
  color: rgba(0, 0, 0, 0.85);
}

html[data-theme='light'] .reasoning-content :deep(strong) {
  color: rgba(0, 0, 0, 0.8);
}

html[data-theme='light'] .reasoning-content :deep(em) {
  color: rgba(0, 0, 0, 0.7);
}

html[data-theme='light'] .reasoning-content :deep(blockquote) {
  background: rgba(139, 92, 246, 0.06);
  border-left-color: rgba(139, 92, 246, 0.4);
  color: rgba(0, 0, 0, 0.7);
}

html[data-theme='light'] .reasoning-content :deep(.inline-code),
html[data-theme='light'] .reasoning-content :deep(code:not(pre code)) {
  background: rgba(139, 92, 246, 0.12);
  color: rgba(0, 0, 0, 0.8);
}

html[data-theme='light'] .reasoning-content :deep(.code-block),
html[data-theme='light'] .reasoning-content :deep(pre) {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(139, 92, 246, 0.12);
}

html[data-theme='light'] .reasoning-content :deep(th) {
  background: rgba(139, 92, 246, 0.1);
  color: rgba(0, 0, 0, 0.85);
}

html[data-theme='light'] .reasoning-content :deep(tr:hover) {
  background: rgba(139, 92, 246, 0.03);
}


/* Thinking placeholder with animated dots */
.thinking-placeholder {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.thinking-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(139, 92, 246);
  animation: thinking-dot-bounce 1.4s ease-in-out infinite;
}

.thinking-dots span:nth-child(1) {
  animation-delay: 0s;
}

.thinking-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes thinking-dot-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Streaming content cursor */
.reasoning-content.is-streaming::after {
  content: '|';
  animation: cursor-blink 0.8s infinite;
  color: rgb(139, 92, 246);
  font-weight: 300;
  margin-left: 2px;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* Is-thinking state enhancement */
.reasoning-section.is-thinking {
  border-color: rgba(139, 92, 246, 0.35);
  box-shadow: 0 2px 12px rgba(139, 92, 246, 0.15);
}
</style>
