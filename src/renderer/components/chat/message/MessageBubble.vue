<template>
  <div
    v-if="hasVisibleContent"
    class="bubble"
    :class="{ editing: isEditing, [role]: true }"
    ref="bubbleRef"
    @mouseup="handleTextSelection"
  >
    <!-- Attachments preview (shown above text for user messages) -->
    <div v-if="attachments && attachments.length > 0" class="message-attachments">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="message-attachment"
        :class="{ 'is-image': attachment.mediaType === 'image' }"
      >
        <img
          v-if="attachment.mediaType === 'image' && attachment.base64Data"
          :src="`data:${attachment.mimeType};base64,${attachment.base64Data}`"
          :alt="attachment.fileName"
          class="attachment-image"
          @click="emit('openImage', attachment)"
        />
        <div v-else class="attachment-file">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="attachment-file-name">{{ attachment.fileName }}</span>
        </div>
      </div>
    </div>

    <!-- Skill usage badge -->
    <div v-if="skillUsed && role === 'assistant'" class="skill-badge">
      <svg class="skill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      <span class="skill-name">{{ skillUsed }}</span>
    </div>

    <!-- Edit mode for user messages -->
    <div v-if="isEditing" class="edit-container" @click.stop>
      <textarea
        ref="editTextarea"
        v-model="localEditContent"
        class="edit-textarea"
        @keydown="handleEditKeyDown"
        @compositionstart="isEditComposing = true"
        @compositionend="isEditComposing = false"
        @input="adjustEditTextareaHeight"
      ></textarea>
    </div>

    <!-- Normal display -->
    <div v-else class="content-display" @click="handleContentClick">
      <!-- Collapsible wrapper (only for user messages) -->
      <div
        ref="contentRef"
        class="content-wrapper"
        :class="{
          collapsed: role === 'user' && isCollapsed && isOverflowing && !isStreaming,
          'has-overflow': role === 'user' && isOverflowing
        }"
        :style="role === 'user' && isCollapsed && isOverflowing && !isStreaming ? { maxHeight: MAX_COLLAPSED_HEIGHT + 'px' } : {}"
      >
        <!-- New contentParts-based rendering -->
        <template v-if="contentParts && contentParts.length > 0">
          <!-- Text 内容 - Waiting 状态由 MessageThinking 组件处理 -->
          <Transition name="text-fade">
            <div
              v-if="firstTextPart"
              class="content"
              :class="{ typing: isTyping }"
              v-html="renderContentMarkdown(firstTextPart.content)"
            ></div>
          </Transition>

          <!-- Other parts: tool-call, steps, additional text (with TransitionGroup) -->
          <TransitionGroup
            v-if="otherParts && otherParts.length > 0"
            name="other-parts"
            tag="div"
            class="other-parts-container"
          >
            <template v-for="(part, index) in otherParts" :key="getOtherPartKey(part, index)">
              <!-- Tool loop waiting (工具执行后等待 AI 继续) -->
              <div v-if="part.type === 'waiting'" class="tool-loop-waiting">
                <span class="thinking-text flowing">Waiting</span>
              </div>
              <!-- Additional text parts (after the first one) -->
              <div
                v-else-if="part.type === 'text'"
                class="content"
                v-html="renderContentMarkdown(part.content)"
              ></div>
              <!-- Tool call part - show only for streaming input that doesn't have a step yet -->
              <template v-else-if="part.type === 'tool-call' && (!hasSteps || hasInputStreamingToolCalls(part.toolCalls))">
                <template v-if="!hasSteps">
                  <!-- No steps at all, show all tool calls -->
                  <ToolCallGroup
                    :toolCalls="part.toolCalls"
                    @execute="(tc) => emit('executeTool', tc)"
                  />
                  <ToolCallItem
                    v-for="tc in part.toolCalls"
                    :key="tc.id"
                    :toolCall="tc"
                    @execute="(tc) => emit('executeTool', tc)"
                    @confirm="(tc, r) => emit('confirmTool', tc, r)"
                    @reject="(tc) => emit('rejectTool', tc)"
                  />
                </template>
                <template v-else>
                  <!-- Has steps, only show streaming tool calls without corresponding step -->
                  <ToolCallItem
                    v-for="tc in getToolCallsWithoutSteps(part.toolCalls)"
                    :key="tc.id"
                    :toolCall="tc"
                    @execute="(tc) => emit('executeTool', tc)"
                    @confirm="(tc, r) => emit('confirmTool', tc, r)"
                    @reject="(tc) => emit('rejectTool', tc)"
                  />
                </template>
              </template>
              <!-- Steps panel - rendered inline -->
              <StepsPanel
                v-else-if="part.type === 'data-steps' && steps && steps.length > 0"
                :steps="getStepsForTurn(part.turnIndex)"
                :session-id="sessionId"
                @confirm="(tc, r) => emit('confirmTool', tc, r)"
                @reject="(tc) => emit('rejectTool', tc)"
              />
              <!-- Retrieved memories with feedback UI -->
              <RetrievedMemoriesPanel
                v-else-if="part.type === 'retrieved-memories' && part.memories.length > 0"
                :memories="part.memories"
              />
            </template>
          </TransitionGroup>
        </template>

        <!-- Fallback: legacy content display (no contentParts) -->
        <template v-else>
          <!-- Tool calls if no steps OR if streaming input without step -->
          <template v-if="toolCalls && toolCalls.length > 0 && (!hasSteps || hasInputStreamingToolCalls(toolCalls))">
            <template v-if="!hasSteps">
              <ToolCallGroup
                :toolCalls="toolCalls"
                @execute="(tc) => emit('executeTool', tc)"
              />
              <ToolCallItem
                v-for="tc in toolCalls"
                :key="tc.id"
                :toolCall="tc"
                @execute="(tc) => emit('executeTool', tc)"
                @confirm="(tc, r) => emit('confirmTool', tc, r)"
                @reject="(tc) => emit('rejectTool', tc)"
              />
            </template>
            <template v-else>
              <ToolCallItem
                v-for="tc in getToolCallsWithoutSteps(toolCalls)"
                :key="tc.id"
                :toolCall="tc"
                @execute="(tc) => emit('executeTool', tc)"
                @confirm="(tc, r) => emit('confirmTool', tc, r)"
                @reject="(tc) => emit('rejectTool', tc)"
              />
            </template>
          </template>
          <div :class="['content', { typing: isTyping }]" v-html="renderedContent"></div>
        </template>
      </div>

      <!-- Collapse/Expand button (only for user messages) -->
      <button
        v-if="role === 'user' && isOverflowing && !isStreaming"
        class="collapse-toggle"
        :class="{ collapsed: isCollapsed }"
        @click.stop="toggleCollapse"
      >
        <svg
          class="collapse-icon"
          :class="{ rotated: !isCollapsed }"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span>{{ isCollapsed ? 'Show more' : 'Show less' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, createApp, h, type App } from 'vue'
import ToolCallGroup from '../ToolCallGroup.vue'
import ToolCallItem from '../ToolCallItem.vue'
import StepsPanel from '../StepsPanel.vue'
import InfographicBlock from '../InfographicBlock.vue'
import RetrievedMemoriesPanel from './RetrievedMemoriesPanel.vue'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import type { ToolCall, Step, ContentPart, MessageAttachment } from '@/types'
import type { InfographicConfig } from '@shared/ipc/infographics'

interface Props {
  role: 'user' | 'assistant'
  content: string
  contentParts?: ContentPart[]
  attachments?: MessageAttachment[]
  toolCalls?: ToolCall[]
  steps?: Step[]
  skillUsed?: string
  isStreaming?: boolean
  isEditing?: boolean
  editContent?: string
  sessionId?: string  // Session ID for AgentExecutionPanel state management
}

const props = defineProps<Props>()

const emit = defineEmits<{
  submitEdit: [content: string]
  cancelEdit: []
  openImage: [attachment: MessageAttachment]
  contentClick: [event: MouseEvent]
  textSelection: [text: string, position: { top: number; left: number }]
  executeTool: [toolCall: ToolCall]
  confirmTool: [toolCall: ToolCall, response: 'once' | 'always']
  rejectTool: [toolCall: ToolCall]
}>()

const bubbleRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const editTextarea = ref<HTMLTextAreaElement | null>(null)
const localEditContent = ref('')
const isEditComposing = ref(false)

// Collapsible content
const MAX_COLLAPSED_HEIGHT = 300 // 最大折叠高度（像素）
const isCollapsed = ref(true) // 默认折叠
const isOverflowing = ref(false) // 内容是否超出最大高度
let resizeObserver: ResizeObserver | null = null

// Typewriter effect
const displayedContent = ref('')
const isTyping = ref(false)
let typewriterInterval: ReturnType<typeof setInterval> | null = null

// ============ New overlay-based transition system ============

// Extract the first text part (rendered separately for smooth transition)
const firstTextPart = computed(() => {
  return props.contentParts?.find(p => p.type === 'text') || null
})

// Other parts (excluding first text, but keeping tool loop waiting) for TransitionGroup
const otherParts = computed(() => {
  if (!props.contentParts) return []
  let foundFirstText = false
  let foundFirstWaiting = false

  return props.contentParts.filter(p => {
    // 跳过 loading-memory（由 MessageThinking 处理）
    if (p.type === 'loading-memory') {
      return false
    }

    // 跳过第一个 waiting（由 MessageThinking 处理）
    // 但保留后续的 waiting（tool loop 中的等待）
    if (p.type === 'waiting') {
      if (!foundFirstWaiting && !foundFirstText) {
        foundFirstWaiting = true
        return false // 第一个 waiting 跳过
      }
      return true // 后续 waiting（tool loop）保留
    }

    if (p.type === 'text' && !foundFirstText) {
      foundFirstText = true
      return false // first text is rendered separately
    }
    return true
  })
})

// Generate stable keys for other parts TransitionGroup
function getOtherPartKey(part: ContentPart, index: number): string {
  if (part.type === 'text') return `text-other-${index}`
  if (part.type === 'tool-call') return `tool-call-${index}`
  if (part.type === 'data-steps') return `steps-${part.turnIndex ?? index}`
  if (part.type === 'waiting') return `waiting-${index}`
  if (part.type === 'retrieved-memories') return `retrieved-memories-${index}`
  return `part-${index}`
}

// Infographic 实例管理
const infographicApps: App[] = []

// 挂载 Infographic 组件到占位符
function mountInfographics() {
  if (!bubbleRef.value || props.isStreaming) return

  // 清理旧实例
  unmountInfographics()

  // 查找所有 infographic 占位符
  const placeholders = bubbleRef.value.querySelectorAll('.infographic-block:not(.mounted)')

  placeholders.forEach((placeholder) => {
    const configStr = placeholder.getAttribute('data-config')
    const syntaxType = placeholder.getAttribute('data-syntax') || 'json'
    if (!configStr) return

    try {
      const decodedConfig = decodeURIComponent(configStr)

      // 创建挂载容器
      const mountPoint = document.createElement('div')
      mountPoint.className = 'infographic-mount-point'
      placeholder.innerHTML = ''
      placeholder.appendChild(mountPoint)
      placeholder.classList.add('mounted')

      // 根据语法类型选择传递的属性
      const componentProps: Record<string, any> = {
        isStreaming: props.isStreaming,
        syntaxType
      }

      if (syntaxType === 'dsl') {
        // DSL 语法：直接传递原始字符串
        componentProps.syntax = decodedConfig
      } else {
        // JSON 格式：解析为对象
        componentProps.config = JSON.parse(decodedConfig) as InfographicConfig
      }

      // 创建 Vue App 实例
      const app = createApp({
        render() {
          return h(InfographicBlock, componentProps)
        }
      })

      app.mount(mountPoint)
      infographicApps.push(app)
    } catch (e) {
      console.error('Failed to mount infographic:', e)
    }
  })
}

// 卸载所有 Infographic 实例
function unmountInfographics() {
  infographicApps.forEach(app => {
    try {
      app.unmount()
    } catch (e) {
      // 忽略卸载错误
    }
  })
  infographicApps.length = 0
}

// Computed
const hasSteps = computed(() => props.steps && props.steps.length > 0)

// Check if any tool calls are currently streaming input (and don't have a corresponding step yet)
function hasInputStreamingToolCalls(toolCalls: ToolCall[]): boolean {
  return toolCalls.some(tc => {
    // Only show if streaming AND no corresponding step exists
    if (tc.status !== 'input-streaming') return false
    // Check if a step already exists for this tool call
    const hasStep = props.steps?.some(s => s.toolCallId === tc.id)
    return !hasStep
  })
}

// Filter tool calls to only show those without corresponding steps
function getToolCallsWithoutSteps(toolCalls: ToolCall[]): ToolCall[] {
  if (!props.steps || props.steps.length === 0) return toolCalls
  return toolCalls.filter(tc => {
    // Only show if streaming input AND no step exists
    return tc.status === 'input-streaming' && !props.steps?.some(s => s.toolCallId === tc.id)
  })
}

const hasVisibleContent = computed(() => {
  return props.content ||
    (props.contentParts && props.contentParts.length > 0) ||
    !props.isStreaming
})

const renderedContent = computed(() => {
  const content = isTyping.value ? displayedContent.value : props.content
  return renderContentMarkdown(content)
})

function renderContentMarkdown(content: string): string {
  return renderMarkdown(content, props.role === 'user')
}

function getStepsForTurn(turnIndex: number | undefined) {
  if (!props.steps) return []
  if (turnIndex === undefined) return props.steps
  return props.steps.filter(step => step.turnIndex === turnIndex)
}

// Edit mode
watch(
  () => props.isEditing,
  (newVal) => {
    if (newVal) {
      localEditContent.value = props.editContent || props.content
      nextTick(() => {
        if (editTextarea.value) {
          editTextarea.value.style.height = 'auto'
          editTextarea.value.style.height = editTextarea.value.scrollHeight + 'px'
          editTextarea.value.focus()
          editTextarea.value.select()
        }
      })
    }
  }
)

function adjustEditTextareaHeight() {
  if (editTextarea.value) {
    editTextarea.value.style.height = 'auto'
    editTextarea.value.style.height = editTextarea.value.scrollHeight + 'px'
  }
}

function handleEditKeyDown(e: KeyboardEvent) {
  if (isEditComposing.value) return

  if (e.key === 'Escape') {
    emit('cancelEdit')
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    const trimmed = localEditContent.value.trim()
    if (trimmed) {
      emit('submitEdit', trimmed)
    }
  }
}

// Typewriter effect
function startTypewriter() {
  if (props.role !== 'assistant' || !props.isStreaming) {
    displayedContent.value = props.content
    return
  }

  isTyping.value = true
  displayedContent.value = ''
  let currentIndex = 0
  const content = props.content
  const charsPerTick = 3
  const tickInterval = 20

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
  displayedContent.value = props.content
}

watch(
  () => props.isStreaming,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      startTypewriter()
    } else if (!newVal && oldVal) {
      stopTypewriter()
      // 流式结束后挂载 Infographic
      nextTick(() => mountInfographics())
      // 流式结束后检测溢出并默认折叠
      nextTick(() => {
        checkOverflow()
        isCollapsed.value = true // 流式结束后重置为折叠状态
      })
    }
  },
  { immediate: true }
)

watch(
  () => props.content,
  () => {
    if (!props.isStreaming && !isTyping.value) {
      displayedContent.value = props.content
    }
    // 内容变化后重新检测溢出
    nextTick(() => checkOverflow())
  }
)

// 检测内容是否溢出
function checkOverflow() {
  if (!contentRef.value) return
  const scrollHeight = contentRef.value.scrollHeight
  isOverflowing.value = scrollHeight > MAX_COLLAPSED_HEIGHT
}

// 切换折叠状态
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

// 设置 ResizeObserver
function setupResizeObserver() {
  if (!contentRef.value) return

  resizeObserver = new ResizeObserver(() => {
    checkOverflow()
  })
  resizeObserver.observe(contentRef.value)

  // 初始检查
  checkOverflow()
}

// 清理 ResizeObserver
function cleanupResizeObserver() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

onMounted(() => {
  if (props.isStreaming) {
    startTypewriter()
  } else {
    displayedContent.value = props.content
    // 延迟挂载 Infographic，确保 DOM 已渲染
    nextTick(() => mountInfographics())
  }

  // 设置内容溢出检测
  nextTick(() => setupResizeObserver())
})

onUnmounted(() => {
  stopTypewriter()
  unmountInfographics()
  cleanupResizeObserver()
})

// Text selection
function handleTextSelection() {
  if (props.role !== 'assistant') return

  setTimeout(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (!text || text.length === 0) return

    const range = selection?.getRangeAt(0)
    if (!range) return

    const rect = range.getBoundingClientRect()
    const toolbarWidth = 320
    const toolbarHeight = 44
    const padding = 8

    let top = rect.top - toolbarHeight - padding
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2)

    if (left < padding) left = padding
    if (left + toolbarWidth > window.innerWidth - padding) {
      left = window.innerWidth - toolbarWidth - padding
    }
    if (top < padding) {
      top = rect.bottom + padding
    }

    emit('textSelection', text, { top, left })
  }, 10)
}

function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.tagName === 'IMG') {
    const img = target as HTMLImageElement
    const src = img.src
    const alt = img.alt || ''

    // Check if alt text contains mediaId (format: "Generated Image|mediaId:xxx")
    const mediaIdMatch = alt.match(/\|mediaId:([a-f0-9-]+)/)
    if (mediaIdMatch) {
      const mediaId = mediaIdMatch[1]
      console.log('[MessageBubble] Opening gallery for mediaId:', mediaId)
      window.electronAPI?.openImageGallery(mediaId)
    } else {
      // Non-media image (attachment, external URL, old format)
      window.electronAPI?.openImagePreview(src, alt)
    }
  }
  emit('contentClick', event)
}
</script>

<style scoped>
.bubble {
  max-width: 80%;
  padding: var(--message-padding, 14px 18px);
  border-radius: 18px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  position: relative;
  transition: all 0.2s ease;
  box-shadow: var(--shadow);
}

.bubble.editing {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* AI messages: remove bubble styling */
.bubble.assistant {
  max-width: 100%;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

/* User message bubble */
.bubble.user {
  background: var(--user-bubble);
  border-radius: 18px 18px 4px 18px;
  border: 1px solid var(--user-bubble-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

html[data-theme='light'] .bubble.user {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

/* Custom text selection highlight for AI messages */
.bubble.assistant ::selection {
  background: rgba(59, 130, 246, 0.35);
  color: inherit;
}

.bubble.assistant ::-moz-selection {
  background: rgba(59, 130, 246, 0.35);
  color: inherit;
}

html[data-theme='light'] .bubble.assistant ::selection {
  background: rgba(59, 130, 246, 0.25);
}

/* Message attachments */
.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.message-attachment {
  border-radius: 12px;
  overflow: hidden;
}

.message-attachment.is-image {
  max-width: 300px;
  max-height: 300px;
}

.attachment-image {
  display: block;
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.attachment-image:hover {
  transform: scale(1.02);
  opacity: 0.95;
}

.attachment-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
}

.attachment-file svg {
  flex-shrink: 0;
  opacity: 0.7;
}

.attachment-file-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

html[data-theme='light'] .attachment-file {
  background: rgba(0, 0, 0, 0.05);
}

/* Skill badge */
.skill-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(var(--accent-rgb), 0.1);
  border-radius: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--accent);
}

.skill-icon {
  width: 14px;
  height: 14px;
}

.skill-name {
  font-weight: 500;
}

/* Edit container */
.edit-container {
  width: 100%;
}

.edit-textarea {
  width: 100%;
  min-height: 60px;
  padding: 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: var(--message-font-size, 15px);
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  outline: none;
}

/* Content display */
.content-display {
  width: 100%;
}

/* Collapsible content wrapper */
.content-wrapper {
  position: relative;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.content-wrapper.collapsed {
  /* Gradient mask at bottom when collapsed */
}

.content-wrapper.collapsed::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(
    to bottom,
    transparent,
    var(--user-bubble)
  );
  pointer-events: none;
}

/* Collapse/Expand button */
.collapse-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 8px 0;
  margin-top: 4px;
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.collapse-toggle:hover {
  color: var(--accent);
}

.collapse-icon {
  transition: transform 0.3s ease;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.content {
  word-wrap: break-word;
  line-height: var(--message-line-height, 1.6);
  font-size: var(--message-font-size, 15px);
  color: var(--text);
  letter-spacing: 0.01em;
}

/* AI message text */
.bubble.assistant .content {
  color: var(--ai-text);
}

.bubble.user .content {
  line-height: var(--message-line-height, 1.6);
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

/* ============ Text 淡入动画 ============ */

/* Text 内容淡入 - Waiting 状态由 MessageThinking 组件处理 */
.text-fade-enter-active {
  transition: opacity 0.3s ease;
}

.text-fade-enter-from {
  opacity: 0;
}

/* Tool loop waiting (工具执行后等待 AI 继续) */
.tool-loop-waiting {
  padding: 8px 0;
}

/* Flowing gradient text for waiting indicator */
.thinking-text.flowing {
  font-size: 13px;
  font-weight: 500;
  background: linear-gradient(
    90deg,
    var(--muted) 0%,
    var(--accent) 50%,
    var(--muted) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: flowingGradient 2s linear infinite;
}

@keyframes flowingGradient {
  0% { background-position: 200% center; }
  100% { background-position: -200% center; }
}

/* ============ Other Parts TransitionGroup ============ */

/* Container for tool-calls, steps, and additional text parts */
.other-parts-container {
  position: relative;
}

/* Other parts transition classes */
.other-parts-enter-active {
  animation: otherPartsEnter 0.3s ease;
}

.other-parts-leave-active {
  position: absolute;  /* 离开时脱离文档流，避免影响布局 */
  width: 100%;
  animation: otherPartsLeave 0.25s ease forwards;
}

.other-parts-move {
  transition: transform 0.3s ease;
}

@keyframes otherPartsEnter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes otherPartsLeave {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* Markdown content styles */
.content :deep(p) {
  margin: 0 0 var(--content-spacing, 0.75em) 0;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(ul),
.content :deep(ol) {
  margin: calc(var(--content-spacing, 0.75em) * 0.67) 0;
  padding-left: 1.5em;
}

.content :deep(li) {
  margin: calc(var(--content-spacing, 0.75em) * 0.33) 0;
}

.content :deep(h1),
.content :deep(h2),
.content :deep(h3),
.content :deep(h4) {
  margin: calc(var(--content-spacing, 0.75em) * 1.33) 0 calc(var(--content-spacing, 0.75em) * 0.67) 0;
  font-weight: 600;
}

.content :deep(h1) { font-size: 1.4em; }
.content :deep(h2) { font-size: 1.25em; }
.content :deep(h3) { font-size: 1.1em; }

.content :deep(blockquote) {
  margin: var(--content-spacing, 0.75em) 0;
  padding: calc(var(--content-spacing, 0.75em) * 0.67) 1em;
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

/* Horizontal rule */
.content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--border-subtle, var(--border));
  margin: 1em 0;
  opacity: 0.5;
}

/* Generated images */
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

/* Table styles */
.content :deep(table) {
  border-collapse: collapse;
  margin: var(--content-spacing, 0.75em) 0;
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

/* Inline code */
.content :deep(.inline-code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.9em;
}

html[data-theme='light'] .content :deep(.inline-code) {
  background: rgba(0, 0, 0, 0.06);
  color: #e45649;
}

/* Code block container */
.content :deep(.code-block-container) {
  margin: var(--content-spacing, 0.75em) 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-code, var(--border));
  background: var(--bg-code-block, rgba(0, 0, 0, 0.3));
}

.content :deep(.code-block-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-code-header, rgba(255, 255, 255, 0.05));
  border-bottom: 1px solid var(--border-code, var(--border));
}

.content :deep(.code-block-lang) {
  font-size: 12px;
  color: var(--muted);
  text-transform: lowercase;
}

.content :deep(.code-block-copy) {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s ease;
}

.content :deep(.code-block-copy:hover) {
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

/* highlight.js base - syntax colors are handled by global hljs-theme.css */
.content :deep(.hljs) {
  background: transparent;
  color: var(--text-code-block, #e6e6e6);
}

/* Light theme code block - colors are now controlled by theme variables */

/* MathJax / LaTeX styles */
.content :deep(mjx-container) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0;
}

.content :deep(mjx-container[display="true"]) {
  display: block;
  text-align: center;
  margin: var(--content-spacing, 0.75em) 0;
  padding: 8px 0;
}

.content :deep(mjx-container svg) {
  max-width: 100%;
  height: auto;
}

/* Dark theme: invert MathJax SVG colors */
.content :deep(mjx-container svg) {
  color: var(--text);
}

html[data-theme='light'] .content :deep(mjx-container svg) {
  color: #1a1a1a;
}

/* Infographic 占位符样式 */
.content :deep(.infographic-block) {
  margin: 16px 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.content :deep(.infographic-placeholder) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 12px;
  color: var(--muted);
}

.content :deep(.infographic-placeholder .placeholder-icon) {
  opacity: 0.5;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.content :deep(.infographic-parse-error) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--error, #ef4444);
  font-size: 13px;
}

.content :deep(.infographic-parse-error .error-icon) {
  opacity: 0.7;
}

.content :deep(.infographic-mount-point) {
  width: 100%;
}
</style>
