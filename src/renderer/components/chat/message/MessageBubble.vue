<template>
  <div
    v-if="hasVisibleContent"
    ref="bubbleRef"
    class="bubble"
    :class="{ editing: isEditing, [role]: true }"
    @mouseup="handleTextSelection"
  >
    <!-- Attachments preview (shown above text for user messages) -->
    <div
      v-if="attachments && attachments.length > 0"
      class="message-attachments"
    >
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="message-attachment"
        :class="{ 'is-image': attachment.mediaType === 'image' }"
      >
        <img
          v-if="attachment.mediaType === 'image' && attachmentImageSrc(attachment)"
          :src="attachmentImageSrc(attachment)"
          :alt="attachment.fileName"
          class="attachment-image"
          @click.stop="openImageFromAttachment(attachment)"
        >
        <div
          v-else
          class="attachment-file"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span class="attachment-file-name">{{ attachment.fileName }}</span>
        </div>
      </div>
    </div>

    <!-- Skill usage badge -->
    <div
      v-if="skillUsed && role === 'assistant'"
      class="skill-badge"
    >
      <svg
        class="skill-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <span class="skill-name">{{ skillUsed }}</span>
    </div>

    <!-- Edit mode for user messages -->
    <div
      v-if="isEditing"
      class="edit-container"
      @click.stop
    >
      <TextEditor
        ref="editEditor"
        v-model="localEditContent"
        class="edit-textarea"
        profile="inline-message"
        language="markdown"
        :min-height="60"
        :max-height="280"
        :select-on-focus="true"
        @keydown="handleEditKeyDown"
        @compositionstart="isEditComposing = true"
        @compositionend="isEditComposing = false"
        @height-change="adjustEditTextareaHeight"
      />
    </div>

    <!-- Normal display -->
    <div
      v-else
      class="content-display"
      @click="handleContentClick"
    >
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
          <Transition
            name="text-fade"
            :css="false"
          >
            <div
              v-if="firstTextPart"
              class="content md-code-block-scope md-inline-code-scope"
            >
              <StreamingMarkdown
                v-if="shouldUseStreamingMarkdown(role === 'user')"
                :content="firstTextPart.content"
                :is-user="role === 'user'"
                :is-streaming="Boolean(isStreaming)"
              />
              <StaticMarkdown
                v-else
                :content="firstTextPart.content"
                :is-user="role === 'user'"
              />
            </div>
          </Transition>

          <component
            :is="otherPartsTag"
            v-if="otherParts && otherParts.length > 0"
            v-bind="otherPartsWrapperProps"
          >
            <template
              v-for="(part, index) in otherParts"
              :key="getOtherPartKey(part, index)"
            >
              <!-- Generation waiting (工具执行后等待 AI 继续) -->
              <div
                v-if="part.type === 'waiting'"
                class="generation-waiting"
                role="status"
                aria-live="polite"
              >
                <span
                  class="waiting-dot"
                  aria-hidden="true"
                />
                <span class="waiting-text flowing">Waiting</span>
              </div>
              <div
                v-else-if="part.type === 'image-loading'"
                class="image-generation-skeleton"
                role="status"
                :aria-label="part.label || 'Generating image'"
                :title="part.label || 'Generating image'"
              />
              <PromptReferenceCard
                v-else-if="part.type === 'prompt-ref'"
                :title="part.title"
                :content="part.content"
                :description="part.description"
              />
              <PromptReferenceCard
                v-else-if="part.type === 'skill-ref'"
                :title="part.name"
                :content="part.content"
                :description="part.description"
              />
              <!-- Additional text parts (after the first one) -->
              <div
                v-else-if="part.type === 'text'"
                class="content md-code-block-scope md-inline-code-scope"
              >
                <StreamingMarkdown
                  v-if="shouldUseStreamingMarkdown(role === 'user')"
                  :content="part.content"
                  :is-user="role === 'user'"
                  :is-streaming="Boolean(isStreaming)"
                />
                <StaticMarkdown
                  v-else
                  :content="part.content"
                  :is-user="role === 'user'"
                />
              </div>
              <!-- Inline reasoning parts that arrive after answer text -->
              <CollapsePanel
                v-else-if="part.type === 'reasoning'"
                class="inline-reasoning"
                :name="inlineReasoningKey(part, index)"
                default-collapsed
                :status="isStreaming ? 'streaming' : 'completed'"
                :streaming="Boolean(isStreaming)"
                variant="plain"
                expand-icon-position="inline-end"
                expand-icon-display="hover"
              >
                <template #title>
                  <div class="inline-reasoning-header">
                    <span class="inline-reasoning-label">Thought</span>
                    <span
                      v-if="getInlineReasoningSummary(part)"
                      class="inline-reasoning-summary"
                      :title="getInlineReasoningSummary(part)"
                    >
                      <span
                        class="inline-reasoning-summary-separator"
                        aria-hidden="true"
                      >·</span>
                      <span class="inline-reasoning-summary-text">{{ getInlineReasoningSummary(part) }}</span>
                    </span>
                  </div>
                </template>

                <div class="inline-reasoning-body">
                  <div
                    class="inline-reasoning-content md-body"
                  >
                    <StreamingMarkdown
                      v-if="shouldUseStreamingMarkdown(false)"
                      :content="cleanReasoningContent(part.content)"
                      :is-user="false"
                      :is-streaming="Boolean(isStreaming)"
                    />
                    <StaticMarkdown
                      v-else
                      :content="cleanReasoningContent(part.content)"
                      :is-user="false"
                    />
                  </div>
                </div>
              </CollapsePanel>
              <!-- Tool call part - show only for streaming input that doesn't have a step yet -->
              <StepsPanel
                v-else-if="part.type === 'tool-call' && streamingOnlySteps(part.toolCalls).length > 0"
                :steps="streamingOnlySteps(part.toolCalls)"
                :session-id="sessionId"
                @open-file="(filePath) => emit('openFile', filePath)"
              />
              <!-- Steps panel - rendered inline -->
              <StepsPanel
                v-else-if="part.type === 'data-steps' && steps && steps.length > 0"
                :steps="getStepsForTurn(part.turnIndex)"
                :session-id="sessionId"
                @open-file="(filePath) => emit('openFile', filePath)"
              />
            </template>
          </component>
        </template>

        <!-- Fallback for messages without contentParts (user messages and
             empty edge cases). Assistant messages always have contentParts
             populated by rebuildContentParts before reaching here, so no
             tool-call rendering is needed in this branch. -->
        <div
          v-else
          class="content md-code-block-scope md-inline-code-scope"
        >
          <StreamingMarkdown
            v-if="shouldUseStreamingMarkdown(role === 'user')"
            :content="content"
            :is-user="role === 'user'"
            :is-streaming="Boolean(isStreaming)"
          />
          <StaticMarkdown
            v-else
            :content="content"
            :is-user="role === 'user'"
          />
        </div>
      </div>

      <!-- Collapse/Expand button (only for user messages) -->
      <Button
        v-if="role === 'user' && isOverflowing && !isStreaming"
        unstyled
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
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import StepsPanel from '../StepsPanel.vue'
import CollapsePanel from '@/components/common/CollapsePanel.vue'
import PromptReferenceCard from '@/components/common/PromptReferenceCard.vue'
import StreamingMarkdown from './StreamingMarkdown.vue'
import StaticMarkdown from './StaticMarkdown.vue'
import type { ToolCall, Step, ContentPart, MessageAttachment } from '@/types'
import { stepFromToolCall } from '@/stores/helpers/tool-step-view'
import { cleanReasoningContent } from '@/composables/useMarkdownRenderer'
import TextEditor from '@/editor/TextEditor.vue'
import type { EditorHandle } from '@/editor'

interface Props {
  role: 'user' | 'assistant'
  content: string
  contentParts?: ContentPart[]
  attachments?: MessageAttachment[]
  toolCalls?: ToolCall[]
  steps?: Step[]
  skillUsed?: string
  isStreaming?: boolean
  hideInlineReasoning?: boolean
  isEditing?: boolean
  editContent?: string
  sessionId?: string  // Session ID for AgentExecutionPanel state management
}

const props = defineProps<Props>()

const emit = defineEmits<{
  submitEdit: [content: string]
  cancelEdit: []
  openImage: [src: string, fileName?: string]
  contentClick: [event: MouseEvent]
  textSelection: [text: string, position: { top: number; left: number }]
  executeTool: [toolCall: ToolCall]
  openFile: [filePath: string]
}>()

const bubbleRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const editEditor = ref<EditorHandle | null>(null)
const localEditContent = ref('')
const isEditComposing = ref(false)
const hasBeenStreaming = ref(Boolean(props.isStreaming))

// Collapsible content
const MAX_COLLAPSED_HEIGHT = 300 // 最大折叠高度（像素）
const isCollapsed = ref(true) // 默认折叠
const isOverflowing = ref(false) // 内容是否超出最大高度
let resizeObserver: ResizeObserver | null = null
const INLINE_REASONING_SUMMARY_MAX = 88

// ============ New overlay-based transition system ============

// Extract the first text part (rendered separately for smooth transition)
// Only treat the first part as "firstTextPart" if it's actually a text part.
// If the first part is a tool-call/data-steps, all parts go through otherParts in order.
const firstTextPart = computed(() => {
  const parts = props.contentParts
  if (!parts || parts.length === 0) return null
  return parts[0].type === 'text' ? parts[0] : null
})

// Other parts for TransitionGroup
// If firstTextPart captured parts[0], skip it here; otherwise keep all parts in order
const otherParts = computed(() => {
  if (!props.contentParts) return []
  const hasFirstText = !!firstTextPart.value
  let skippedFirstText = false
  let sawVisiblePartBeforeWaiting = false

  return props.contentParts.filter(p => {
    if (p.type === 'loading-memory' || p.type === 'provider-data') {
      return false
    }

    if (p.type === 'reasoning' && props.hideInlineReasoning) {
      return false
    }

    if (p.type === 'reasoning' && !hasVisibleReasoningContent(p.content)) {
      return false
    }

    // Skip the initial waiting (handled by MessageThinking)
    if (p.type === 'waiting') {
      if (!sawVisiblePartBeforeWaiting) {
        return false
      }
      return true
    }

    // Only skip the first text if firstTextPart is rendering it
    if (p.type === 'text' && hasFirstText && !skippedFirstText) {
      skippedFirstText = true
      sawVisiblePartBeforeWaiting = true
      return false
    }
    sawVisiblePartBeforeWaiting = true
    return true
  })
})

const otherPartsTag = 'div'
const otherPartsWrapperProps = { class: 'other-parts-container' }

const useLiveAssistantMarkdown = computed(() =>
  props.role === 'assistant' && hasBeenStreaming.value,
)

function shouldUseStreamingMarkdown(isUser: boolean): boolean {
  return Boolean(props.isStreaming || (!isUser && useLiveAssistantMarkdown.value))
}

// Generate stable keys for other parts TransitionGroup
function getOtherPartKey(part: ContentPart, index: number): string {
  if (part.type === 'text') return `text-other-${index}`
  if (part.type === 'reasoning') return inlineReasoningKey(part, index)
  if (part.type === 'prompt-ref') return `prompt-ref-${part.promptId}-${part.bodyHash || index}`
  if (part.type === 'skill-ref') return `skill-ref-${part.skillId}-${part.bodyHash || index}`
  if (part.type === 'tool-call') return `tool-call-${part.toolCalls.map(tc => tc.id).join('-') || index}`
  if (part.type === 'data-steps') return `steps-${part.turnIndex ?? index}`
  if (part.type === 'waiting') return `waiting-${part.turnIndex ?? index}`
  if (part.type === 'image-loading') return `image-loading-${part.turnIndex ?? index}`
  return `part-${index}`
}

function inlineReasoningKey(part: Extract<ContentPart, { type: 'reasoning' }>, index: number): string {
  // Stable across streaming: a reasoning part keeps its position while its
  // content grows. Keying on the content fingerprint changed the key on every
  // chunk, so an expanded streaming block lost its state and snapped shut —
  // making it impossible to keep the last (still-streaming) thought open.
  return `reasoning-${part.turnIndex ?? index}`
}

function hasVisibleReasoningContent(content: string): boolean {
  const cleaned = cleanReasoningContent(content)
  if (!cleaned) return false
  return /[\p{L}\p{N}\p{Script=Han}]/u.test(cleaned)
}

function getInlineReasoningSummary(part: Extract<ContentPart, { type: 'reasoning' }>): string {
  return summarizeReasoningContent(part.content)
}

function summarizeReasoningContent(content: string): string {
  const cleaned = cleanReasoningContent(content)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\r\n/g, '\n')

  const lines = cleaned
    .split('\n')
    .map(line => line
      .replace(/^\s{0,3}(?:#{1,6}|[-*+]|>\s*|\d+[.)])\s+/u, '')
      .trim())
    .filter(line => hasVisibleReasoningContent(line))

  const source = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!source) return ''

  const boundary = source.search(/[.!?。！？]/u)
  const sentence = boundary >= 8 ? source.slice(0, boundary + 1) : source
  return truncateReasoningSummary(sentence)
}

function truncateReasoningSummary(value: string): string {
  if (value.length <= INLINE_REASONING_SUMMARY_MAX) return value
  return `${value.slice(0, INLINE_REASONING_SUMMARY_MAX - 3).trimEnd()}...`
}

// Computed
const hasSteps = computed(() => props.steps && props.steps.length > 0)

// Filter tool calls to only show those without corresponding steps
function getToolCallsWithoutSteps(toolCalls: ToolCall[]): ToolCall[] {
  if (!props.steps || props.steps.length === 0) return toolCalls
  return toolCalls.filter(tc => {
    // Only show if streaming input AND no step exists
    return tc.status === 'input-streaming' && !props.steps?.some(s => s.toolCallId === tc.id)
  })
}

function streamingOnlySteps(toolCalls: ToolCall[]): Step[] {
  const source = hasSteps.value ? getToolCallsWithoutSteps(toolCalls) : toolCalls
  return source.map(stepFromToolCall)
}

const hasVisibleContent = computed(() => {
  return props.content ||
    (props.attachments && props.attachments.length > 0) ||
    (props.contentParts && props.contentParts.length > 0) ||
    !props.isStreaming
})

watch(
  () => props.isStreaming,
  (isStreaming) => {
    if (isStreaming) hasBeenStreaming.value = true
  },
  { immediate: true },
)

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
        editEditor.value?.focus()
        editEditor.value?.setSelection(0, localEditContent.value.length)
      })
    }
  }
)

function adjustEditTextareaHeight() {
  // CodeMirror handles inline editor sizing.
}

function handleEditKeyDown(e: KeyboardEvent) {
  if (isEditComposing.value || e.isComposing) return

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

// Reset collapse state when streaming ends so long user messages re-collapse
watch(
  () => props.isStreaming,
  (newVal, oldVal) => {
    if (!newVal && oldVal) {
      nextTick(() => {
        checkOverflow()
        isCollapsed.value = true
      })
    }
  }
)

// Re-check overflow when content changes (streaming chunks, edits, etc.)
watch(
  () => props.content,
  () => {
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
  // 设置内容溢出检测
  nextTick(() => setupResizeObserver())
})

onUnmounted(() => {
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

function attachmentImageSrc(attachment: MessageAttachment): string {
  if (attachment.base64Data) {
    return `data:${attachment.mimeType};base64,${attachment.base64Data}`
  }
  return attachment.url || ''
}

function openImageFromAttachment(attachment: MessageAttachment) {
  const src = attachmentImageSrc(attachment)
  if (!src) {
    console.warn('[MessageBubble] Image attachment has no preview source:', {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    })
    return
  }
  emit('openImage', src, attachment.fileName)
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
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  position: relative;
  transition: all 0.2s ease;
  box-shadow: var(--ui-message-surface-shadow, var(--shadow));
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
  transition: none;
}

/* User message bubble */
.bubble.user {
  --user-bubble-surface: color-mix(
    in srgb,
    var(--ui-message-user-bg, var(--user-bubble)) 72%,
    var(--ui-surface-chat-bg, var(--bg-chat, transparent)) 28%
  );

  max-width: min(74%, 680px);
  background: var(--user-bubble-surface);
  border-radius: 14px 14px 5px 14px;
  border: 1px solid color-mix(in srgb, var(--ui-message-user-border, var(--user-bubble-border)) 46%, transparent);
  box-shadow: var(
    --ui-message-user-shadow,
    0 1px 4px rgba(0, 0, 0, 0.075),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.5%, transparent)
  );
  width: fit-content;
}

html[data-theme='light'] .bubble.user {
  box-shadow: var(--ui-message-user-shadow, 0 4px 12px rgba(0, 0, 0, 0.04));
}

/* Custom text selection highlight for AI messages */
.bubble.assistant ::selection {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 35%, transparent);
  color: inherit;
}

.bubble.assistant ::-moz-selection {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 35%, transparent);
  color: inherit;
}

html[data-theme='light'] .bubble.assistant ::selection {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 25%, transparent);
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
  font-size: var(--type-meta-size);
  font-weight: var(--type-meta-weight);
  line-height: var(--type-meta-line-height);
  color: var(--ui-text-primary-fg, var(--text));
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
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  border-radius: 12px;
  margin-bottom: 8px;
  font-size: var(--type-caption-muted-size);
  line-height: var(--type-caption-muted-line-height);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.skill-icon {
  width: 14px;
  height: 14px;
}

.skill-name {
  font-weight: var(--type-meta-weight);
}

/* Edit container */
.edit-container {
  width: 100%;
}

.edit-textarea {
  width: 100%;
  --editor-font-size: var(--message-font-size, var(--type-chat-comfortable-size));
  min-height: 60px;
  padding: 12px;
}

/* Content display */
.content-display {
  width: 100%;
}

/* Collapsible content wrapper */
.content-wrapper {
  position: relative;
  overflow: visible;
  transition: max-height 0.3s ease;
}

.content-wrapper.collapsed {
  overflow: hidden;
}

.bubble.assistant .content-wrapper {
  overflow: visible;
  transition: none;
}

.image-generation-skeleton {
  position: relative;
  width: min(320px, 70vw);
  max-width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, transparent), transparent 36%),
    var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.image-generation-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.16),
    transparent
  );
  animation: image-skeleton-shimmer 1.25s ease-in-out infinite;
}

html[data-theme='light'] .image-generation-skeleton::after {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.72),
    transparent
  );
}

@keyframes image-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .image-generation-skeleton::after {
    animation: none;
  }
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
    var(--user-bubble-surface, var(--ui-message-user-bg, var(--user-bubble)))
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
  padding: 6px 0 5px;
  margin-top: 2px;
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 82%, transparent);
  font-size: var(--type-meta-size);
  font-weight: var(--type-meta-weight);
  line-height: var(--type-meta-line-height);
  cursor: pointer;
  transition: color 0.2s ease;
}

.collapse-toggle:hover {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.collapse-icon {
  transition: transform 0.3s ease;
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.content {
  --md-code-block-margin: calc(var(--content-spacing-px, 10px) * 0.98) 0;
  --md-code-copy-width: 22px;
  --md-code-copy-height: 21px;
  --md-code-copy-gap: 0;
  --md-code-copy-padding: 0;
  --md-code-copy-justify-content: center;
  --md-code-copy-transition: all 0.15s ease;
  --md-code-copy-check-display: none;
  --md-code-copy-copied-icon-display: none;
  --md-code-copy-copied-check-display: block;
  --md-code-copy-copied-check-color: var(--ui-accent-primary-fg, var(--accent));
  --md-code-line-height: var(--type-code-line-height-px);
  --md-code-plain-fg: var(--hg-syntax-plain-fg, var(--text-code-block));

  display: flow-root;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  font-family: var(--font-body);
  line-height: var(--message-line-height-px, var(--type-chat-comfortable-line-height-px));
  font-size: var(--message-font-size, var(--type-chat-comfortable-size));
  color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 96%, var(--ui-text-secondary-fg, var(--text-secondary)) 4%);
  letter-spacing: 0;
}

/* AI message text */
.bubble.assistant .content {
  color: var(--ui-message-assistant-fg, var(--ai-text));
}

.bubble.user .content {
  line-height: var(--message-line-height-px, var(--type-chat-comfortable-line-height-px));
  color: var(--ui-message-user-fg, var(--text-user-primary));
}

/* ============ Text 淡入动画 ============ */

/* Text 内容淡入 - Waiting 状态由 MessageThinking 组件处理 */
.text-fade-enter-active {
  transition: opacity 0.3s ease;
}

.text-fade-enter-from {
  opacity: 0;
}

/* Generation waiting (工具执行后等待 AI 继续) */
.generation-waiting {
  --waiting-fg: var(--ui-message-thinking-fg);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 3px 0;
  color: var(--waiting-fg);
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
}

.waiting-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 28%, transparent);
  animation: waitingDotPulse 1.35s ease-in-out infinite;
}

.waiting-text {
  font-size: var(--type-body-strong-size);
  font-weight: var(--type-body-strong-weight);
  color: currentColor;
}

.waiting-text.flowing {
  animation: waitingTextPulse 1.6s ease-in-out infinite;
}

.inline-reasoning {
  --reasoning-fg: var(--ui-message-thinking-fg);
  margin: 3px 0;
  color: var(--reasoning-fg);
}

.inline-reasoning-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 22px;
  padding: 1px 0;
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--reasoning-fg) 88%, transparent);
  cursor: pointer;
  font: inherit;
  line-height: var(--type-meta-line-height);
}

.inline-reasoning-header:hover {
  color: var(--reasoning-fg);
}

.inline-reasoning-label {
  flex: 0 0 auto;
  font-size: var(--type-meta-size);
  font-weight: var(--type-meta-weight);
}

.inline-reasoning-summary {
  min-width: 0;
  max-width: min(72ch, 100%);
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  overflow: hidden;
  color: color-mix(in srgb, var(--reasoning-fg) 78%, transparent);
  font-size: var(--type-meta-size);
  font-weight: var(--type-meta-weight);
  line-height: var(--type-meta-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline-reasoning-summary-separator {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--reasoning-fg) 52%, transparent);
}

.inline-reasoning-summary-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline-reasoning-body {
  margin-top: 4px;
}

.inline-reasoning-content {
  min-height: 0;
  overflow: hidden;
  padding-left: 10px;
  border-left: 2px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 34%, var(--ui-border-default-border, var(--border)));
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
  color: var(--reasoning-fg);
}

.inline-reasoning-content :deep(p) {
  margin: 0 0 5px 0;
}

.inline-reasoning-content :deep(p:last-child) {
  margin-bottom: 0;
}

@keyframes waitingDotPulse {
  0%, 100% {
    opacity: 0.58;
    transform: scale(0.86);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes waitingTextPulse {
  0%, 100% { opacity: 0.76; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .waiting-dot,
  .waiting-text.flowing {
    animation: none;
  }
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

/* Markdown content styles — compact for chat context */
.content :deep(p) {
  margin: 0 0 var(--content-paragraph-gap, 8px) 0;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(ul),
.content :deep(ol) {
  margin: var(--content-list-gap, 6px) 0;
  padding-left: 1.5em;
}

.content :deep(li) {
  margin: var(--content-list-item-gap, 2px) 0;
}

.content :deep(h1),
.content :deep(h2),
.content :deep(h3),
.content :deep(h4) {
  max-width: 100%;
  margin: var(--content-heading-top-gap, 8px) 0 var(--content-heading-bottom-gap, 3px) 0;
  font-weight: 620;
  line-height: var(--content-heading-line-height-px, 20px);
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Chat context: headings are section markers, not page titles */
.content :deep(h1) { font-size: 1.08em; }
.content :deep(h2) { font-size: 1.04em; }
.content :deep(h3) { font-size: 1em; }

.content :deep(h1 + h1),
.content :deep(h1 + h2),
.content :deep(h1 + h3),
.content :deep(h2 + h1),
.content :deep(h2 + h2),
.content :deep(h2 + h3),
.content :deep(h3 + h1),
.content :deep(h3 + h2),
.content :deep(h3 + h3) {
  margin-top: var(--content-list-gap, 6px);
}

/* First heading has no top margin */
.content :deep(h1:first-child),
.content :deep(h2:first-child),
.content :deep(h3:first-child) {
  margin-top: 0;
}

.content :deep(blockquote) {
  margin: var(--content-paragraph-gap, 8px) 0;
  padding: 0.35em 0 0.35em 0.85em;
  border-left: 2px solid color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 42%, transparent);
  color: color-mix(in srgb, var(--ui-text-secondary-fg, var(--text-secondary)) 88%, var(--ui-text-muted-fg, var(--muted)) 12%);
  border-radius: 0;
}

.content :deep(a) {
  color: var(--ui-accent-primary-fg, var(--accent));
  text-decoration: none;
}

.content :deep(a:hover) {
  text-decoration: underline;
}

/* Horizontal rule */
.content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--ui-border-default-border, var(--border));
  margin: var(--content-spacing-px, 11px) 0;
  opacity: 0.3;
}

/* Generated images */
.content :deep(img) {
  max-width: 400px;
  max-height: 400px;
  width: auto;
  height: auto;
  border-radius: 12px;
  margin: 8px 0;
  box-shadow: var(--ui-message-media-shadow, 0 4px 16px rgba(0, 0, 0, 0.2));
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.content :deep(img:hover) {
  transform: scale(1.02);
  box-shadow: var(--ui-message-media-hover-shadow, 0 8px 24px rgba(0, 0, 0, 0.3));
}

html[data-theme='light'] .content :deep(img) {
  box-shadow: var(--ui-message-media-shadow, 0 4px 16px rgba(0, 0, 0, 0.1));
}

html[data-theme='light'] .content :deep(img:hover) {
  box-shadow: var(--ui-message-media-hover-shadow, 0 8px 24px rgba(0, 0, 0, 0.15));
}

/* Table styles */
.content :deep(table) {
  border-collapse: collapse;
  margin: var(--content-spacing-px, 11px) 0;
  width: 100%;
}

.content :deep(th),
.content :deep(td) {
  border: 1px solid var(--ui-border-default-border, var(--border));
  padding: 8px 12px;
  text-align: left;
}

.content :deep(th) {
  background: var(--ui-state-hover-bg, rgba(255, 255, 255, 0.05));
  font-weight: 600;
}

/* Code visuals are shared in styles/markdown.css via .md-code-block-scope and .md-inline-code-scope. */

/* MathJax / LaTeX styles */
.content :deep(mjx-container) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0;
}

.content :deep(mjx-container[display="true"]) {
  display: block;
  text-align: center;
  margin: var(--content-spacing-px, 11px) 0;
  padding: 8px 0;
}

.content :deep(mjx-container svg) {
  max-width: 100%;
  height: auto;
}

/* Dark theme: invert MathJax SVG colors */
.content :deep(mjx-container svg) {
  color: var(--ui-text-primary-fg, var(--text));
}

html[data-theme='light'] .content :deep(mjx-container svg) {
  color: var(--ui-text-primary-fg, #1a1a1a);
}

</style>
