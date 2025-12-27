<template>
  <div class="message-item-wrapper">
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
  <div v-else :class="['message', message.role, { highlighted: isHighlighted }]" :data-message-id="message.id">
    <div class="message-content-wrapper" @mouseenter="showActions = true" @mouseleave="showActions = false">
      <!-- Waiting status (streaming, no content yet, no reasoning) -->
      <div v-if="message.isStreaming && !message.content && !message.reasoning" class="thinking-status">
        <div class="thinking-status-row">
          <span class="thinking-text flowing">Waiting</span>
          <span class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
        </div>
      </div>

      <!-- Thinking/Thought status (has reasoning) -->
      <div v-if="message.reasoning" class="thinking-status">
        <div class="thinking-with-content">
          <div class="thinking-status-row" @click="toggleThinkingExpand">
            <!-- Still thinking: animated -->
            <span v-if="message.isStreaming && !message.content" class="thinking-text flowing">Thinking</span>
            <!-- Done thinking: static "Thought for X seconds" -->
            <span v-else class="thinking-text thought">Thought for {{ formatThinkingTime(finalThinkingTime) }}</span>
            <!-- Show time separately only when still thinking -->
            <span v-if="message.isStreaming && !message.content" class="thinking-time">{{ formatThinkingTime(thinkingElapsed) }}</span>
            <button class="thinking-toggle-btn" :class="{ expanded: isThinkingExpanded }">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          </div>
          <div v-if="isThinkingExpanded" class="thinking-content-wrapper">
            <div class="thinking-content" v-html="renderMarkdown(message.reasoning)"></div>
          </div>
        </div>
      </div>

      <!-- Message bubble - show if there's content, contentParts, or streaming is done -->
      <div v-if="message.content || (message.contentParts && message.contentParts.length > 0) || !message.isStreaming" class="bubble" :class="{ editing: isEditing }" ref="bubbleRef" @mouseup="handleTextSelection">
        <!-- Skill usage badge -->
        <div v-if="message.skillUsed && message.role === 'assistant'" class="skill-badge">
          <svg class="skill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <span class="skill-name">{{ message.skillUsed }}</span>
        </div>
        <!-- Edit mode for user messages - inline editing -->
        <div v-if="isEditing" class="edit-container" @click.stop>
          <textarea
            ref="editTextarea"
            v-model="editContent"
            class="edit-textarea"
            @keydown="handleEditKeyDown"
            @compositionstart="isEditComposing = true"
            @compositionend="isEditComposing = false"
            @input="adjustEditTextareaHeight"
          ></textarea>
        </div>
        <!-- Normal display -->
        <div v-else class="content-display">
            <!-- Sequential content parts (text and tool calls interleaved) -->
            <template v-if="message.contentParts && message.contentParts.length > 0">
              <template v-for="(part, index) in message.contentParts" :key="index">
                <!-- Text part -->
                <div v-if="part.type === 'text'" :class="['content', { typing: isTyping && index === message.contentParts.length - 1 }]" v-html="renderMarkdown(part.content)"></div>
                <!-- Tool call part - only show if no steps (steps panel handles tool calls now) -->
                <template v-else-if="part.type === 'tool-call' && !(message.steps && message.steps.length > 0)">
                  <ToolCallGroup
                    :toolCalls="part.toolCalls"
                    @execute="handleToolExecute"
                  />
                  <!-- Show individual ToolCallItem for detailed view and confirmation -->
                  <ToolCallItem
                    v-for="tc in part.toolCalls"
                    :key="tc.id"
                    :toolCall="tc"
                    @execute="handleToolExecute"
                    @confirm="handleToolConfirm"
                    @reject="handleToolReject"
                  />
                </template>
                <!-- Steps panel - rendered inline where tool agent was called -->
                <!-- Filter steps by turnIndex to show only steps for this specific turn -->
                <StepsPanel
                  v-else-if="part.type === 'data-steps' && message.steps && message.steps.length > 0"
                  :steps="getStepsForTurn(part.turnIndex)"
                  @confirm="handleToolConfirm"
                  @reject="handleToolReject"
                />
                <!-- Waiting indicator (after tool call, before AI continues) -->
                <div v-else-if="part.type === 'waiting'" class="thinking-status-inline">
                  <span class="thinking-text flowing">Waiting</span>
                </div>
              </template>
            </template>
            <!-- Fallback: legacy content display (no contentParts) -->
            <template v-else>
              <!-- Only show tool calls if no steps (steps panel handles tool calls now) -->
              <template v-if="message.toolCalls && message.toolCalls.length > 0 && !(message.steps && message.steps.length > 0)">
                <ToolCallGroup
                  :toolCalls="message.toolCalls"
                  @execute="handleToolExecute"
                />
                <ToolCallItem
                  v-for="tc in message.toolCalls"
                  :key="tc.id"
                  :toolCall="tc"
                  @execute="handleToolExecute"
                  @confirm="handleToolConfirm"
                  @reject="handleToolReject"
                />
              </template>
              <div :class="['content', { typing: isTyping }]" v-html="renderedContent"></div>
            </template>
          </div>
        <!-- Steps panel fallback - only for legacy messages without contentParts -->
        <!-- (Normal messages render StepsPanel inline via contentParts type='data-steps') -->
        <StepsPanel
          v-if="message.role === 'assistant' && message.steps && message.steps.length > 0 && (!message.contentParts || !message.contentParts.some(p => p.type === 'data-steps'))"
          :steps="message.steps"
          @confirm="handleToolConfirm"
          @reject="handleToolReject"
        />
      </div>
      <!-- Message footer - moved outside bubble -->
      <div class="message-footer">
        <div v-if="message.role !== 'user'" class="meta">{{ formatTime(message.timestamp) }}</div>
        <div :class="['actions', message.role === 'user' ? 'user-actions' : '', { visible: showActions }]">
          <!-- Copy button -->
          <Tooltip :text="copied ? 'Copied!' : 'Copy'">
            <button class="action-btn copy-btn" @click="copyContent">
              <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
          </Tooltip>
          <!-- Edit button for user messages -->
          <Tooltip v-if="message.role === 'user'" text="Edit">
            <button
              class="action-btn edit-btn"
              @click.stop="startEdit"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
          </Tooltip>
          <!-- Regenerate button (for assistant messages) -->
          <Tooltip v-if="message.role === 'assistant'" text="Regenerate">
            <button
              class="action-btn regenerate-btn"
              @click="regenerate"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </Tooltip>
          <!-- Speak button (for assistant messages with TTS support) -->
          <Tooltip v-if="message.role === 'assistant' && ttsSupported" :text="speakTooltip">
            <button
              class="action-btn speak-btn"
              :class="{ speaking: isCurrentlySpeaking }"
              @click="handleSpeak"
            >
              <!-- Play icon (not speaking) -->
              <svg v-if="!isCurrentlySpeaking" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
              <!-- Stop icon (speaking) -->
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
              </svg>
            </button>
          </Tooltip>
          <!-- Branch button (for assistant messages) -->
          <Tooltip v-if="message.role === 'assistant'" :text="hasBranches ? `${branchCount} branch${branchCount > 1 ? 'es' : ''}` : 'Branch'">
            <div class="branch-btn-wrapper" ref="branchBtnRef">
              <button
                class="action-btn"
                :class="{ 'has-branches': hasBranches }"
                @click="hasBranches ? toggleBranchMenu() : createBranch()"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
          </Tooltip>
          <Tooltip v-if="message.role === 'user'" text="Regenerate response">
            <button
              class="action-btn regenerate-btn"
              @click="regenerate"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import type { ChatMessage, ToolCall, AgentVoice } from '@/types'
import ToolCallGroup from './ToolCallGroup.vue'
import ToolCallItem from './ToolCallItem.vue'
import StepsPanel from './StepsPanel.vue'
import Tooltip from '../common/Tooltip.vue'
import { useTTS } from '@/composables/useTTS'

interface BranchInfo {
  id: string
  name: string
}

interface Props {
  message: ChatMessage
  branches?: BranchInfo[]  // Branches that were created from this message
  canBranch?: boolean      // Whether branching is allowed (false for child sessions)
  isHighlighted?: boolean  // Whether this message is highlighted by navigation
  voiceConfig?: AgentVoice // Voice configuration for TTS (from current agent)
}

const props = defineProps<Props>()
const emit = defineEmits<{
  regenerate: [messageId: string]
  edit: [messageId: string, newContent: string]
  branch: [messageId: string, quotedText?: string]
  goToBranch: [sessionId: string]
  quote: [quotedText: string]
  executeTool: [toolCall: ToolCall]
  confirmTool: [toolCall: ToolCall, response: 'once' | 'always']
  rejectTool: [toolCall: ToolCall]
  updateThinkingTime: [messageId: string, thinkingTime: number]
}>()

// TTS (Text-to-Speech) functionality
const { isSupported: ttsSupported, isSpeaking, speak, stop } = useTTS()
const speakingMessageId = ref<string | null>(null)

// Check if this specific message is currently being spoken
const isCurrentlySpeaking = computed(() =>
  isSpeaking.value && speakingMessageId.value === props.message.id
)

// Tooltip text based on speaking state
const speakTooltip = computed(() =>
  isCurrentlySpeaking.value ? 'Stop' : 'Speak'
)

// Handle speak button click
async function handleSpeak() {
  if (isCurrentlySpeaking.value) {
    stop()
    speakingMessageId.value = null
    return
  }

  // Stop any other speaking
  stop()

  // Get plain text from message content (strip markdown)
  const textContent = getPlainTextContent()
  if (!textContent) return

  speakingMessageId.value = props.message.id

  try {
    await speak(textContent, props.voiceConfig)
  } catch (error) {
    console.error('TTS error:', error)
  } finally {
    speakingMessageId.value = null
  }
}

// Extract plain text from message content (remove markdown formatting)
function getPlainTextContent(): string {
  const content = props.message.content
  if (!content) return ''

  // Simple markdown stripping (for TTS)
  return content
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`[^`]+`/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove headers
    .replace(/^#+\s*/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

// Computed: whether this message is highlighted
const isHighlighted = computed(() => props.isHighlighted || false)

// Computed style for branch menu positioning
const branchMenuStyle = computed(() => ({
  top: `${branchMenuPosition.value.top}px`,
  left: `${branchMenuPosition.value.left}px`
}))

// Edit mode state
const isEditing = ref(false)
const editContent = ref('')
const editTextarea = ref<HTMLTextAreaElement | null>(null)
const savedBubbleSize = ref<{ width: string; height: string } | null>(null)
const isEditComposing = ref(false)  // Track IME composition state for CJK input

// Typewriter effect state
const displayedContent = ref('')
const isTyping = ref(false)
let typewriterInterval: ReturnType<typeof setInterval> | null = null

// Thinking state
const isThinkingExpanded = ref(false) // Default collapsed after thinking done
const thinkingElapsed = ref(0)
const finalThinkingTime = ref(0) // Store final time when thinking ends
let thinkingStartTime: number | null = null
let thinkingTimer: ReturnType<typeof setInterval> | null = null

// Toggle thinking content expand/collapse
function toggleThinkingExpand() {
  if (props.message.reasoning) {
    isThinkingExpanded.value = !isThinkingExpanded.value
  }
}

// Format thinking time (seconds -> mm:ss or ss.s)
function formatThinkingTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Start thinking timer
function startThinkingTimer() {
  if (thinkingTimer) return
  // Use message's thinkingStartTime if available (for session switching)
  // Otherwise use current time
  thinkingStartTime = props.message.thinkingStartTime || Date.now()
  // Initialize elapsed time based on start time
  thinkingElapsed.value = (Date.now() - thinkingStartTime) / 1000
  thinkingTimer = setInterval(() => {
    if (thinkingStartTime) {
      thinkingElapsed.value = (Date.now() - thinkingStartTime) / 1000
    }
  }, 100)
}

// Stop thinking timer
function stopThinkingTimer() {
  if (thinkingTimer) {
    clearInterval(thinkingTimer)
    thinkingTimer = null
    // Save final time
    finalThinkingTime.value = thinkingElapsed.value
    // Persist to backend
    if (finalThinkingTime.value > 0) {
      emit('updateThinkingTime', props.message.id, finalThinkingTime.value)
    }
  }
}

// Configure markdown-it with highlight.js
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true,
})

// Custom fence (code block) renderer
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const code = token.content
  const lang = token.info.trim() || 'text'

  let highlighted: string
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch (e) {
      console.error('Highlight error:', e)
      highlighted = md.utils.escapeHtml(code)
    }
  } else {
    highlighted = md.utils.escapeHtml(code)
  }

  return `<div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">${lang}</div>
      <button class="code-block-copy" onclick="navigator.clipboard.writeText(decodeURIComponent(this.getAttribute('data-code'))); this.querySelector('span').textContent='Copied!'; setTimeout(() => this.querySelector('span').textContent='Copy', 2000)" data-code="${encodeURIComponent(code)}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
      </button>
    </div>
    <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
  </div>`
}

// Custom inline code renderer
md.renderer.rules.code_inline = (tokens, idx) => {
  const token = tokens[idx]
  return `<code class="inline-code">${md.utils.escapeHtml(token.content)}</code>`
}

// Get content to render (either typed content or full content)
const contentToRender = computed(() => {
  if (isTyping.value) {
    return displayedContent.value
  }
  return props.message.content
})

// Render markdown for a given content string
function renderMarkdown(content: string): string {
  if (props.message.role === 'user') {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }
  return md.render(content)
}

const renderedContent = computed(() => {
  return renderMarkdown(contentToRender.value)
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

  return md.render(cleanedContent)
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
      startThinkingTimer()
    } else if (!newVal && oldVal) {
      stopTypewriter()
      // Don't stop thinking timer here - it should stop when content arrives
    }
  },
  { immediate: true }
)

// Watch for content - stop thinking timer when content arrives
watch(
  () => props.message.content,
  (newVal, oldVal) => {
    // When content first appears, stop the thinking timer
    if (newVal && !oldVal) {
      stopThinkingTimer()
    }
  }
)

// Watch for thinkingTime changes (e.g., when switching sessions)
watch(
  () => props.message.thinkingTime,
  (newVal) => {
    if (newVal && newVal > 0) {
      finalThinkingTime.value = newVal
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
  // Restore thinking time from persisted message
  if (props.message.thinkingTime && props.message.thinkingTime > 0) {
    finalThinkingTime.value = props.message.thinkingTime
  }

  if (props.message.isStreaming) {
    startTypewriter()
    // Only start thinking timer if no content yet
    if (!props.message.content) {
      startThinkingTimer()
    }
  } else {
    displayedContent.value = props.message.content
  }
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  stopTypewriter()
  // Clean up timer without saving final time
  if (thinkingTimer) {
    clearInterval(thinkingTimer)
    thinkingTimer = null
  }
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

function adjustEditTextareaHeight() {
  if (editTextarea.value) {
    editTextarea.value.style.height = 'auto'
    editTextarea.value.style.height = editTextarea.value.scrollHeight + 'px'
  }
}

// Handle keydown in edit mode with IME support
function handleEditKeyDown(e: KeyboardEvent) {
  // Don't submit during IME composition (Chinese, Japanese, Korean input)
  if (isEditComposing.value) {
    return
  }

  if (e.key === 'Escape') {
    cancelEdit()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitEdit()
  }
  // Shift+Enter allows new line (default behavior)
}

function startEdit() {
  // Capture bubble width before switching to edit mode
  if (bubbleRef.value) {
    savedBubbleSize.value = {
      width: bubbleRef.value.offsetWidth + 'px',
      height: ''
    }
  }
  editContent.value = props.message.content
  isEditing.value = true
  nextTick(() => {
    // Apply saved width to bubble
    if (bubbleRef.value && savedBubbleSize.value) {
      bubbleRef.value.style.width = savedBubbleSize.value.width
    }
    if (editTextarea.value) {
      // Set textarea height to match content
      editTextarea.value.style.height = 'auto'
      editTextarea.value.style.height = editTextarea.value.scrollHeight + 'px'
      editTextarea.value.focus()
      // Select all text for easy replacement
      editTextarea.value.select()
    }
  })
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
  // Reset bubble width
  if (bubbleRef.value) {
    bubbleRef.value.style.width = ''
  }
  savedBubbleSize.value = null
}

function submitEdit(event?: KeyboardEvent) {
  // Prevent default Enter behavior (newline)
  if (event) {
    event.preventDefault()
  }

  const trimmedContent = editContent.value.trim()
  if (!trimmedContent) return

  emit('edit', props.message.id, trimmedContent)
  isEditing.value = false
  editContent.value = ''
  // Reset bubble width
  if (bubbleRef.value) {
    bubbleRef.value.style.width = ''
  }
  savedBubbleSize.value = null
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
  // Cancel editing when clicking outside the bubble
  if (isEditing.value && !target.closest('.bubble')) {
    cancelEdit()
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

// Handle tool confirmation (for dangerous bash commands)
function handleToolConfirm(toolCall: ToolCall, response: 'once' | 'always' = 'once') {
  emit('confirmTool', toolCall, response)
}

// Handle tool rejection
function handleToolReject(toolCall: ToolCall) {
  emit('rejectTool', toolCall)
}

// Get steps for a specific turn (used for interleaving steps with text via contentParts)
function getStepsForTurn(turnIndex: number | undefined) {
  if (!props.message.steps) return []
  if (turnIndex === undefined) {
    // If no turnIndex specified, return all steps (fallback behavior)
    return props.message.steps
  }
  return props.message.steps.filter(step => step.turnIndex === turnIndex)
}
</script>

<style scoped>
/* Wrapper for TransitionGroup compatibility */
.message-item-wrapper {
  width: 85%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
}

/* Custom text selection highlight for AI messages */
.message.assistant .bubble ::selection {
  background: rgba(59, 130, 246, 0.35);
  color: inherit;
}

.message.assistant .bubble ::-moz-selection {
  background: rgba(59, 130, 246, 0.35);
  color: inherit;
}

html[data-theme='light'] .message.assistant .bubble ::selection {
  background: rgba(59, 130, 246, 0.25);
}

html[data-theme='light'] .message.assistant .bubble ::-moz-selection {
  background: rgba(59, 130, 246, 0.25);
}

/* Selection toolbar (floating) */
.selection-toolbar {
  position: fixed;
  z-index: 9999;
  background: var(--bg-elevated);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 4px;
  box-shadow: var(--shadow);
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
    0 0 40px rgba(59, 130, 246, 0.06);
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
  background: rgba(59, 130, 246, 0.15);
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
  gap: 10px;
  align-items: flex-start;
  animation: fadeIn 0.18s ease-out;
  width: 100%;
  margin-bottom: 4px;
}

.message.user {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.message.assistant {
  flex-direction: row;
  justify-content: flex-start;
}

/* Navigation highlight effect - only highlight user's bubble */
.message.user.highlighted .bubble {
  animation: highlight-pulse 2.5s ease-out;
}

@keyframes highlight-pulse {
  0% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.6), 0 0 20px rgba(59, 130, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.4), 0 0 15px rgba(59, 130, 246, 0.2);
  }
  100% {
    box-shadow: none;
  }
}

.avatar {
  height: 32px;
  width: 32px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  user-select: none;
  flex: 0 0 auto;
  font-size: 16px;
}

.message-content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

/* User messages: align items to the right */
.message.user .message-content-wrapper {
  align-items: flex-end;
}


.message.assistant .message-content-wrapper {
  gap: 8px;
  max-width: 100%;
  margin: 0; /* Remove auto margin to align with avatar and header */
}

.bubble {
  max-width: 80%;
  padding: 14px 18px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  position: relative;
  transition: all 0.2s ease;
  box-shadow: var(--shadow);
}

/* Editing state - smoother transition */
.bubble.editing {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* AI messages: remove bubble styling for clean reading experience */
.message.assistant .bubble {
  max-width: 100%;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  box-shadow: none; /* Reset shadow for AI messages to avoid ghost border */
}

/* User message bubble - Modern gradient design */
.message.user .bubble {
  background: var(--user-bubble);
  border-radius: 18px 18px 4px 18px;
  border: 1px solid var(--user-bubble-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

html[data-theme='light'] .message.user .bubble {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.content {
  word-wrap: break-word;
  line-height: 1.6;
  font-size: 15px;
  color: var(--text);
  letter-spacing: 0.01em;
}

/* AI message text - slightly dimmed for comfortable reading */
.message.assistant .content {
  color: var(--ai-text);
}

.message.user .content {
  line-height: 1.5;
  color: var(--text-user-primary);
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

/* Generated images styling */
.content :deep(img) {
  max-width: 400px;
  max-height: 400px;
  width: auto;
  height: auto;
  border-radius: 12px;
  margin: 8px 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.content :deep(img:hover) {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

html[data-theme='light'] .content :deep(img) {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

html[data-theme='light'] .content :deep(img:hover) {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
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

/* Light theme highlight.js overrides */
html[data-theme='light'] .content :deep(.hljs) {
  color: #383a42;
}

html[data-theme='light'] .content :deep(.hljs-keyword) { color: #a626a4; }
html[data-theme='light'] .content :deep(.hljs-string) { color: #50a14f; }
html[data-theme='light'] .content :deep(.hljs-number) { color: #986801; }
html[data-theme='light'] .content :deep(.hljs-comment) { color: #a0a1a7; font-style: italic; }
html[data-theme='light'] .content :deep(.hljs-function) { color: #4078f2; }
html[data-theme='light'] .content :deep(.hljs-class) { color: #c18401; }
html[data-theme='light'] .content :deep(.hljs-variable) { color: #e45649; }
html[data-theme='light'] .content :deep(.hljs-attr) { color: #986801; }
html[data-theme='light'] .content :deep(.hljs-built_in) { color: #c18401; }
html[data-theme='light'] .content :deep(.hljs-title) { color: #4078f2; }
html[data-theme='light'] .content :deep(.hljs-params) { color: #383a42; }
html[data-theme='light'] .content :deep(.hljs-punctuation) { color: #383a42; }

/* Light theme inline code */
html[data-theme='light'] .content :deep(.inline-code) {
  background: rgba(0, 0, 0, 0.06);
  color: #e45649;
}

.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding: 0 4px;
}

/* User messages: position actions at bottom-right of bubble */
.message.user .message-footer {
  position: relative;
  margin-top: 6px;
  margin-right: 8px;
  justify-content: flex-end;
  padding: 0;
}

/* AI messages: adjust footer for clean layout */
/* Toolbar on left, time on right */
.message.assistant .message-footer {
  margin-top: 12px;
  padding-left: 0;
  flex-direction: row-reverse;
}

.meta {
  font-size: 12px;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(30, 30, 35, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 4px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.06) inset;
}

.actions.visible {
  opacity: 1;
}

/* User message actions - now unified with AI actions style */

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: background 0.12s ease, color 0.12s ease;
  flex-shrink: 0;
  position: relative;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.action-btn:active {
  background: rgba(255, 255, 255, 0.15);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

/* Copy button success state */
.copy-btn:has(svg polyline) {
  color: var(--accent);
}

/* Speak button speaking state */
.speak-btn.speaking {
  color: var(--accent);
  background: rgba(59, 130, 246, 0.15);
}

.speak-btn.speaking:hover {
  background: rgba(59, 130, 246, 0.25);
}

html[data-theme='light'] .speak-btn.speaking {
  color: var(--accent);
  background: rgba(59, 130, 246, 0.1);
}

html[data-theme='light'] .speak-btn.speaking:hover {
  background: rgba(59, 130, 246, 0.18);
}

html[data-theme='light'] .actions {
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05) inset;
}


html[data-theme='light'] .action-btn {
  color: rgba(0, 0, 0, 0.45);
}

html[data-theme='light'] .action-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

html[data-theme='light'] .action-btn:active {
  background: rgba(0, 0, 0, 0.1);
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

/* Edit mode styles - inline editing */
.edit-container {
  position: relative;
}

/* User message edit mode - inline, minimal change from original bubble */
.message.user .edit-textarea {
  width: 100%;
  min-height: 1.5em;
  max-height: 300px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  overflow-y: auto;
  caret-color: var(--accent);
}

.message.user .edit-textarea::-webkit-scrollbar {
  width: 4px;
}

.message.user .edit-textarea::-webkit-scrollbar-track {
  background: transparent;
}

.message.user .edit-textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.message.user .edit-textarea::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

html[data-theme='light'] .message.user .edit-textarea {
  color: rgba(0, 0, 0, 0.9);
}

html[data-theme='light'] .message.user .edit-textarea::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

html[data-theme='light'] .message.user .edit-textarea::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

/* Editing state bubble - keep original size, just add focus indicator */
.message.user .bubble.editing {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    0 0 0 2px rgba(59, 130, 246, 0.4);
}

html[data-theme='light'] .message.user .bubble.editing {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.04),
    0 0 0 2px rgba(59, 130, 246, 0.3);
}

/* Assistant message edit mode */
.message.assistant .edit-textarea {
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
  caret-color: var(--accent);
}

.message.assistant .edit-textarea:focus {
  border-color: var(--accent);
}

/* Branch button and menu styles */
.branch-btn-wrapper {
  position: relative;
}

.action-btn.has-branches {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.action-btn.has-branches:hover {
  background: rgba(59, 130, 246, 0.25);
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
  background: rgba(59, 130, 246, 0.1);
}

.regenerate-btn svg {
  transition: transform 0.3s ease;
}

.regenerate-btn:hover svg {
  transform: rotate(180deg);
}

/* Skill usage badge */
.skill-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-bottom: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  font-size: 12px;
  color: var(--muted);
}

.skill-icon {
  width: 14px;
  height: 14px;
  stroke: var(--accent);
}

.skill-name {
  font-weight: 500;
  color: var(--text-secondary);
}

/* Thinking status indicator */
.thinking-status {
  padding: 8px 0;
  width: fit-content;
  max-width: 100%;
}

.thinking-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.thinking-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}

.thinking-text.thought {
  font-style: italic;
  opacity: 0.8;
}

/* Flowing text animation - gradient sweeps from left to right */
.thinking-text.flowing {
  background: linear-gradient(
    90deg,
    rgba(var(--accent-rgb), 0.3) 0%,
    rgba(var(--accent-rgb), 1) 25%,
    rgba(var(--accent-rgb), 1) 50%,
    rgba(var(--accent-rgb), 1) 75%,
    rgba(var(--accent-rgb), 0.3) 100%
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

.thinking-time {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  opacity: 0.7;
  font-family: 'SF Mono', Monaco, monospace;
}

.thinking-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: rgba(120, 120, 128, 0.15);
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.thinking-toggle-btn:hover {
  background: rgba(120, 120, 128, 0.25);
}

.thinking-toggle-btn svg {
  transition: transform 0.2s ease;
}

.thinking-toggle-btn.expanded svg {
  transform: rotate(180deg);
}

/* Thinking content display */
.thinking-with-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.thinking-content-wrapper {
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: 10px;
  border-left: 3px solid var(--accent);
  max-height: 300px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease;
  box-shadow: var(--shadow);
}

.thinking-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  word-wrap: break-word;
}

.thinking-content :deep(p) {
  margin: 0 0 0.5em 0;
}

.thinking-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* Scrollbar for thinking content */
.thinking-content-wrapper::-webkit-scrollbar {
  width: 4px;
}

.thinking-content-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.thinking-content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 128, 0.3);
  border-radius: 2px;
}

/* Inline waiting status (after tool calls) */
.thinking-status-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}

.thinking-status-inline .thinking-text {
  font-size: 12px;
}

/* Code block container enhancements */
.bubble :deep(.code-block-container) {
  margin: 16px 0;
  border-radius: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.bubble :deep(.code-block-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  -webkit-app-region: no-drag;
}

.bubble :deep(.code-block-lang) {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted);
  letter-spacing: 0.8px;
}

.bubble :deep(.code-block-copy) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.bubble :deep(.code-block-copy:hover) {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
  border-color: var(--accent);
}

.bubble :deep(.code-block-copy svg) {
  width: 12px;
  height: 12px;
}

.bubble :deep(.code-block-container pre) {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  background: transparent;
}

/* Light theme code block overrides */
html[data-theme='light'] .bubble :deep(.code-block-header) {
  background: rgba(0, 0, 0, 0.03);
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

html[data-theme='light'] .bubble :deep(.code-block-copy) {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

html[data-theme='light'] .bubble :deep(.code-block-copy:hover) {
  background: rgba(0, 0, 0, 0.08);
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
  background: rgba(var(--accent-rgb), 0.3);
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
  border-left: 3px solid var(--accent);
  background: var(--hover);
  border-radius: 0 6px 6px 0;
  color: var(--muted);
}

/* Links */
.reasoning-content :deep(a) {
  color: var(--accent);
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
html[data-theme='light'] .reasoning-content {
  color: var(--text);
}

html[data-theme='light'] .reasoning-content :deep(blockquote) {
  background: var(--panel-2);
}

html[data-theme='light'] .reasoning-content :deep(th),
html[data-theme='light'] .reasoning-content :deep(td) {
  border-color: var(--border);
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
  background: var(--accent); /* Sync with theme accent */
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
  color: var(--accent); /* Sync with theme accent */
  font-weight: 300;
  margin-left: 2px;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* Is-thinking state enhancement */
.reasoning-section.is-thinking {
  border-color: rgba(var(--accent-rgb), 0.35);
  box-shadow: 0 2px 12px rgba(var(--accent-rgb), 0.15);
}

/* Responsive styles */
@media (max-width: 768px) {
  .message {
    width: 100%;
    gap: 8px;
  }

  .bubble {
    padding: 12px 14px;
    border-radius: 16px;
  }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }

  .avatar svg {
    width: 14px;
    height: 14px;
  }

  .message-actions {
    gap: 2px;
  }

  .action-btn {
    padding: 5px 8px;
    font-size: 11px;
  }

  .action-btn svg {
    width: 12px;
    height: 12px;
  }
}

@media (max-width: 480px) {
  .message {
    gap: 6px;
  }

  .bubble {
    padding: 10px 12px;
    border-radius: 14px;
    font-size: 14px;
  }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 6px;
  }

  .avatar svg {
    width: 12px;
    height: 12px;
  }

  .message-actions {
    flex-wrap: wrap;
    gap: 4px;
  }

  .action-btn {
    padding: 4px 6px;
    font-size: 10px;
    border-radius: 6px;
  }

  .action-btn svg {
    width: 11px;
    height: 11px;
  }

  .action-btn span {
    display: none; /* Hide button text on very small screens */
  }

  .selection-toolbar {
    padding: 3px;
    gap: 1px;
    border-radius: 10px;
  }

  .toolbar-btn {
    padding: 6px 10px;
    font-size: 12px;
  }

  .toolbar-btn svg {
    width: 13px;
    height: 13px;
  }

  .reasoning-section {
    padding: 10px 12px;
    border-radius: 10px;
  }

  .reasoning-header {
    font-size: 11px;
  }

  .reasoning-content {
    font-size: 12px;
  }
}
</style>
