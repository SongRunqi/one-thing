<template>
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
    <div class="bubble" ref="bubbleRef" @mouseenter="showActions = true" @mouseleave="showActions = false">
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
        <!-- Reasoning/Thinking section (collapsible) - show when reasoning exists or thinking is in progress -->
        <div v-if="message.reasoning || message.isThinking" :class="['reasoning-section', { 'is-thinking': message.isThinking }]">
          <button class="reasoning-toggle" @click="toggleReasoning">
            <div class="reasoning-toggle-left">
              <div :class="['thinking-icon-wrapper', { 'animate': message.isThinking }]">
                <svg :class="['thinking-brain-icon', { 'animate': message.isThinking }]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 4.5c-1.5-1.5-4-2-6 0s-2 5.5 0 8c1.5 2 4 3.5 6 6 2-2.5 4.5-4 6-6 2-2.5 2-6 0-8s-4.5-1.5-6 0z"/>
                  <path d="M12 4.5v16"/>
                  <path d="M9 8c-1 1-1 2.5 0 3.5"/>
                  <path d="M15 8c1 1 1 2.5 0 3.5"/>
                </svg>
              </div>
              <span class="reasoning-label">{{ message.isThinking ? '思考中...' : '思考过程' }}</span>
              <span v-if="!message.isThinking" class="reasoning-badge">Deep Thinking</span>
              <span v-else class="reasoning-badge thinking">思考中</span>
            </div>
            <div class="reasoning-toggle-right">
              <span class="reasoning-hint">{{ showReasoning ? '收起' : '展开查看' }}</span>
              <svg :class="['reasoning-chevron', { expanded: showReasoning }]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
          </button>
          <Transition name="reasoning-expand">
            <div v-show="showReasoning" class="reasoning-content-wrapper">
              <div :class="['reasoning-content', { 'is-streaming': message.isThinking }]" v-html="renderedReasoning"></div>
              <div v-if="message.isThinking && !message.reasoning" class="thinking-placeholder">
                <span class="thinking-dots">
                  <span></span><span></span><span></span>
                </span>
              </div>
            </div>
          </Transition>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import type { ChatMessage } from '@/types'

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
  branch: [messageId: string]
  goToBranch: [sessionId: string]
}>()

const showActions = ref(false)
const copied = ref(false)
const showBranchMenu = ref(false)
const showReasoning = ref(false)  // For collapsible reasoning/thinking section
const branchBtnRef = ref<HTMLElement | null>(null)
const bubbleRef = ref<HTMLElement | null>(null)
const branchMenuPosition = ref({ top: 0, left: 0 })

// Auto-expand reasoning when thinking starts
watch(
  () => props.message.isThinking,
  (isThinking) => {
    if (isThinking) {
      showReasoning.value = true
    }
  },
  { immediate: true }
)

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

// Rendered reasoning content (for thinking models)
const renderedReasoning = computed(() => {
  if (!props.message.reasoning) return ''
  return marked.parse(props.message.reasoning) as string
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

function toggleReasoning() {
  showReasoning.value = !showReasoning.value
}

// Close branch menu when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.branch-btn-wrapper')) {
    showBranchMenu.value = false
  }
}
</script>

<style scoped>
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

.bubble {
  max-width: min(720px, 82%);
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.06);
  position: relative;
}

.message.user .bubble {
  background: rgba(16, 163, 127, 0.14);
  border-color: rgba(16, 163, 127, 0.25);
}

.content {
  word-wrap: break-word;
  line-height: 1.6;
  font-size: 14px;
  color: var(--text);
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

/* Reasoning/Thinking section styles */
.reasoning-section {
  margin-bottom: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.06) 100%);
  border: 1px solid rgba(139, 92, 246, 0.2);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.08);
}

.reasoning-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.reasoning-toggle:hover {
  background: rgba(139, 92, 246, 0.08);
}

.reasoning-toggle-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.reasoning-toggle-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thinking-icon-wrapper {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Only animate when actively thinking */
.thinking-icon-wrapper.animate {
  animation: thinking-pulse 2s ease-in-out infinite;
}

@keyframes thinking-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(139, 92, 246, 0);
  }
}

.thinking-brain-icon {
  color: rgb(139, 92, 246);
}

/* Only animate when actively thinking */
.thinking-brain-icon.animate {
  animation: thinking-glow 2s ease-in-out infinite;
}

@keyframes thinking-glow {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(139, 92, 246, 0.5));
  }
  50% {
    filter: drop-shadow(0 0 6px rgba(139, 92, 246, 0.8));
  }
}

.reasoning-label {
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, rgb(139, 92, 246) 0%, rgb(59, 130, 246) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.reasoning-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.12) 100%);
  color: rgb(139, 92, 246);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

/* Thinking badge with animation */
.reasoning-badge.thinking {
  animation: badge-pulse 1.5s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.reasoning-hint {
  font-size: 12px;
  color: var(--muted);
  transition: color 0.2s ease;
}

.reasoning-toggle:hover .reasoning-hint {
  color: rgb(139, 92, 246);
}

.reasoning-chevron {
  color: var(--muted);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.reasoning-chevron.expanded {
  transform: rotate(180deg);
  color: rgb(139, 92, 246);
}

/* Expand/Collapse animation */
.reasoning-expand-enter-active,
.reasoning-expand-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.reasoning-expand-enter-from,
.reasoning-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.reasoning-expand-enter-to,
.reasoning-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

.reasoning-content-wrapper {
  border-top: 1px solid rgba(139, 92, 246, 0.15);
  background: rgba(0, 0, 0, 0.1);
}

.reasoning-content {
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
  max-height: 400px;
  overflow-y: auto;
}

/* Custom scrollbar for reasoning content */
.reasoning-content::-webkit-scrollbar {
  width: 6px;
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

.reasoning-content :deep(p) {
  margin: 0.6em 0;
}

.reasoning-content :deep(p:first-child) {
  margin-top: 0;
}

.reasoning-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* Code in reasoning */
.reasoning-content :deep(code) {
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 12px;
}

.reasoning-content :deep(pre) {
  background: rgba(0, 0, 0, 0.2);
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.75em 0;
}

.reasoning-content :deep(pre code) {
  background: transparent;
  padding: 0;
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

html[data-theme='light'] .thinking-icon-wrapper {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%);
}

html[data-theme='light'] .reasoning-badge {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%);
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
