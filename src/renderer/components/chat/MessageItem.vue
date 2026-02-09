<template>
  <div class="message-item-wrapper">
    <!-- Selection toolbar (floating) -->
    <Teleport to="body">
      <SelectionToolbar
        :visible="showSelectionToolbar"
        :position="selectionToolbarPosition"
        :selected-text="selectedText"
        @copy="handleSelectionCopy"
        @quote="handleSelectionQuote"
        @branch="handleSelectionBranch"
        @close="showSelectionToolbar = false"
      />
    </Teleport>

    <!-- Error message -->
    <MessageError
      v-if="msgErrorDetails"
      :content="msgText"
      :error-details="msgErrorDetails"
      :error-category="msgErrorCategory"
      :retryable="msgRetryable"
      :timestamp="msgTimestamp"
      @retry="handleRetry"
    />

    <!-- System message (e.g., /files command output) -->
    <MessageSystem
      v-else-if="message.role === 'system'"
      :content="msgText"
      :timestamp="msgTimestamp"
      :message-id="message.id"
    />

    <!-- Normal user/assistant message -->
    <div
      v-else
      :class="['message', message.role, { highlighted: isHighlighted }]"
      :data-message-id="message.id"
    >
      <div
        class="message-content-wrapper"
        @mouseenter="showActions = true"
        @mouseleave="handleMouseLeave"
      >
        <!-- Thinking/Waiting status -->
        <MessageThinking
          v-if="message.role === 'assistant'"
          :is-streaming="msgIsStreaming"
          :has-content="msgHasContent"
          :reasoning="msgReasoning"
          :thinking-start-time="msgThinkingStartTime"
          :thinking-time="msgThinkingTime"
          :loading-memory="isLoadingMemory"
          @update-thinking-time="handleUpdateThinkingTime"
        />

        <!-- Message bubble -->
        <MessageBubble
          :role="message.role"
          :content="msgText"
          :content-parts="msgContentParts"
          :attachments="msgAttachments"
          :tool-calls="msgToolCalls"
          :steps="msgSteps"
          :skill-used="msgSkillUsed"
          :is-streaming="msgIsStreaming"
          :is-editing="isEditing"
          :edit-content="editContent"
          :model="msgModel"
          :usage="msgUsage"
          @submit-edit="handleSubmitEdit"
          @cancel-edit="handleCancelEdit"
          @open-image="handleOpenImage"
          @text-selection="handleTextSelection"
          @execute-tool="handleToolExecute"
          @confirm-tool="handleToolConfirm"
          @reject-tool="handleToolReject"
        />

        <!-- Inline error for assistant messages that failed mid-stream -->
        <div
          v-if="message.role === 'assistant' && msgErrorDetails"
          class="inline-error"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <line
              x1="12"
              y1="8"
              x2="12"
              y2="12"
            />
            <line
              x1="12"
              y1="16"
              x2="12.01"
              y2="16"
            />
          </svg>
          <span class="inline-error-text">{{ msgErrorDetails }}</span>
        </div>

        <!-- Steps panel fallback - only for messages without data-steps parts -->
        <StepsPanel
          v-if="message.role === 'assistant' && msgSteps.length > 0 && !message.parts.some(p => p.type === 'data-steps')"
          :steps="msgSteps"
          @confirm="handleToolConfirm"
          @reject="handleToolReject"
        />

        <!-- Message footer -->
        <div class="message-footer">
          <div
            v-if="message.role !== 'user'"
            class="meta"
          >
            {{ formatTime(msgTimestamp) }}
          </div>
          <MessageActions
            :role="message.role"
            :content="msgText"
            :visible="showActions"
            :branches="branches"
            :usage="msgUsage"
            :model="msgModel"
            :voice-config="voiceConfig"
            :message-id="message.id"
            @edit="startEdit"
            @regenerate="handleRegenerate"
            @branch="handleBranch"
            @go-to-branch="handleGoToBranch"
            @menu-open="handleMenuOpen"
          />
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <ImagePreview
      :visible="previewVisible"
      :src="previewImage.src"
      :alt="previewImage.alt"
      @close="closeImagePreview"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { UIMessage, ToolCall, AgentVoice, MessageAttachment, ToolUIPart, TextUIPart } from '@/types'
import StepsPanel from './StepsPanel.vue'
import ImagePreview from '../common/ImagePreview.vue'
import MessageError from './message/MessageError.vue'
import MessageSystem from './message/MessageSystem.vue'
import MessageThinking from './message/MessageThinking.vue'
import MessageBubble from './message/MessageBubble.vue'
import MessageActions from './message/MessageActions.vue'
import SelectionToolbar from './message/SelectionToolbar.vue'
import { getMessageText, getMessageReasoning, getToolParts } from '@shared/message-converters'

interface BranchInfo {
  id: string
  name: string
}

interface Props {
  message: UIMessage
  branches?: BranchInfo[]
  canBranch?: boolean
  isHighlighted?: boolean
  voiceConfig?: AgentVoice
}

const props = defineProps<Props>()

const emit = defineEmits<{
  regenerate: [messageId: string]
  edit: [messageId: string, newContent: string]
  branch: [messageId: string, quotedText?: string]
  goToBranch: [sessionId: string]
  quote: [quotedText: string]
  executeTool: [toolCall: ToolCall]
  confirmTool: [toolCall: ToolCall, response: 'once' | 'session' | 'workspace' | 'always']
  rejectTool: [toolCall: ToolCall]
  updateThinkingTime: [messageId: string, thinkingTime: number]
}>()

// UI State
const showActions = ref(false)
const menuIsOpen = ref(false)  // Track if a dropdown menu is open
const isEditing = ref(false)
const editContent = ref('')

// Handle mouse leave - don't hide actions if a menu is open
function handleMouseLeave(event: MouseEvent) {
  // Don't hide actions if a menu is currently open
  if (menuIsOpen.value) return

  const relatedTarget = event.relatedTarget as HTMLElement | null
  // Check if mouse is moving to a teleported menu (more-menu or branch-menu)
  if (relatedTarget?.closest('.more-menu') || relatedTarget?.closest('.branch-menu')) {
    return // Don't hide actions
  }
  showActions.value = false
}

// Handle menu open/close events from MessageActions
function handleMenuOpen(isOpen: boolean) {
  menuIsOpen.value = isOpen
  if (isOpen) {
    showActions.value = true
  }
}

// Image preview state
const previewVisible = ref(false)
const previewImage = ref({ src: '', alt: '' })

// Selection toolbar state
const showSelectionToolbar = ref(false)
const selectedText = ref('')
const selectionToolbarPosition = ref({ top: 0, left: 0 })

// Computed — extract UIMessage data for child components
const isHighlighted = computed(() => props.isHighlighted || false)

const msgText = computed(() => getMessageText(props.message))
const msgReasoning = computed(() => getMessageReasoning(props.message))
const msgToolParts = computed(() => getToolParts(props.message))
const msgTimestamp = computed(() => props.message.metadata?.timestamp ?? 0)
const msgModel = computed(() => props.message.metadata?.model)
const msgUsage = computed(() => props.message.metadata?.usage)
const msgSkillUsed = computed(() => props.message.metadata?.skillUsed)
const msgAttachments = computed(() => props.message.metadata?.attachments)
const msgErrorDetails = computed(() => props.message.metadata?.errorDetails)
const msgErrorCategory = computed(() => props.message.metadata?.errorCategory)
const msgRetryable = computed(() => props.message.metadata?.retryable)
const msgThinkingTime = computed(() => props.message.metadata?.thinkingTime)
const msgThinkingStartTime = computed(() => props.message.metadata?.thinkingStartTime)

// Check streaming state from text parts
const msgIsStreaming = computed(() => {
  return props.message.parts.some(
    p => (p.type === 'text' && (p as TextUIPart).state === 'streaming') ||
         (p.type === 'reasoning' && (p as any).state === 'streaming')
  )
})

// Check if message has meaningful content (text, tools, or steps)
const msgHasContent = computed(() => {
  return !!msgText.value || msgToolParts.value.length > 0 ||
    props.message.parts.some(p => p.type === 'data-steps')
})

// Steps extracted from data-steps parts
const msgSteps = computed(() => {
  const stepParts = props.message.parts.filter(p => p.type === 'data-steps') as Array<{ type: 'data-steps'; steps: any[]; turnIndex: number }>
  return stepParts.flatMap(p => p.steps)
})

// ContentParts for MessageBubble (pass parts directly — MessageBubble will handle rendering)
// MessageBubble uses the old ContentPart[] interface via its contentParts prop.
// For UIMessage, we pass the parts array and let MessageBubble use its contentParts-based rendering path.
const msgContentParts = computed(() => {
  // Convert UIMessage parts to legacy ContentPart format for MessageBubble
  const parts: any[] = []
  for (const part of props.message.parts) {
    if (part.type === 'text') {
      parts.push({ type: 'text', content: (part as TextUIPart).text })
    } else if (part.type.startsWith('tool-')) {
      // Group tool parts into tool-call ContentPart
      // Find existing tool-call group or create new one
      const lastPart = parts[parts.length - 1]
      const toolPart = part as ToolUIPart
      const toolCall: any = {
        id: toolPart.toolCallId,
        toolId: toolPart.toolName || toolPart.type.replace('tool-', ''),
        toolName: toolPart.toolName || toolPart.type.replace('tool-', ''),
        arguments: toolPart.input || {},
        status: toolPart.state === 'output-available' ? 'completed'
          : toolPart.state === 'output-error' ? 'failed'
          : toolPart.state === 'input-streaming' ? 'input-streaming'
          : 'pending',
        result: toolPart.output,
        error: toolPart.errorText,
        requiresConfirmation: toolPart.requiresConfirmation,
        commandType: toolPart.commandType,
        startTime: toolPart.startTime,
        endTime: toolPart.endTime,
      }
      if (lastPart?.type === 'tool-call') {
        lastPart.toolCalls.push(toolCall)
      } else {
        parts.push({ type: 'tool-call', toolCalls: [toolCall] })
      }
    } else if (part.type === 'data-steps') {
      const stepPart = part as any
      parts.push({ type: 'data-steps', turnIndex: stepPart.turnIndex })
    }
  }
  return parts.length > 0 ? parts : undefined
})

// Legacy ToolCall[] derived from ToolUIPart[] for sub-components that still expect ToolCall
const msgToolCalls = computed(() => {
  return msgToolParts.value.map(tp => ({
    id: tp.toolCallId,
    toolId: tp.toolName || tp.type.replace('tool-', ''),
    toolName: tp.toolName || tp.type.replace('tool-', ''),
    arguments: tp.input || {},
    status: tp.state === 'output-available' ? 'completed' as const
      : tp.state === 'output-error' ? 'failed' as const
      : tp.state === 'input-streaming' ? 'input-streaming' as const
      : tp.state === 'input-available' ? 'pending' as const
      : 'pending' as const,
    result: tp.output,
    error: tp.errorText,
    requiresConfirmation: tp.requiresConfirmation,
    commandType: tp.commandType,
    startTime: tp.startTime,
    endTime: tp.endTime,
    timestamp: props.message.metadata?.timestamp ?? 0,
  })) as any as ToolCall[]
})

// Check if message is loading memory
const isLoadingMemory = computed(() => {
  // In UIMessage, there's no 'loading-memory' part type, but check contentParts compat
  return false
})

// Format time
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Edit handlers
function startEdit() {
  editContent.value = msgText.value
  isEditing.value = true
}

function handleSubmitEdit(content: string) {
  emit('edit', props.message.id, content)
  isEditing.value = false
  editContent.value = ''
}

function handleCancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

// Image preview handlers
function handleOpenImage(attachment: MessageAttachment) {
  if (attachment.base64Data) {
    const src = `data:${attachment.mimeType};base64,${attachment.base64Data}`
    window.electronAPI?.openImagePreview(src, attachment.fileName)
  }
}

function closeImagePreview() {
  previewVisible.value = false
}

// Regenerate handler
function handleRegenerate() {
  emit('regenerate', props.message.id)
}

// Retry handler (for error messages)
function handleRetry() {
  emit('regenerate', props.message.id)
}

// Branch handlers
function handleBranch() {
  emit('branch', props.message.id)
}

function handleGoToBranch(sessionId: string) {
  emit('goToBranch', sessionId)
}

// Selection toolbar handlers
function handleTextSelection(text: string, position: { top: number; left: number }) {
  selectedText.value = text
  selectionToolbarPosition.value = position
  showSelectionToolbar.value = true
}

function handleSelectionCopy() {
  // Copy is handled by SelectionToolbar component
}

function handleSelectionQuote(text: string) {
  emit('quote', text)
  showSelectionToolbar.value = false
}

function handleSelectionBranch(text: string) {
  emit('branch', props.message.id, text)
  showSelectionToolbar.value = false
}

// Tool handlers
function handleToolExecute(toolCall: ToolCall) {
  emit('executeTool', toolCall)
}

function handleToolConfirm(toolCall: ToolCall, response: 'once' | 'session' | 'workspace' | 'always') {
  emit('confirmTool', toolCall, response)
}

function handleToolReject(toolCall: ToolCall) {
  emit('rejectTool', toolCall)
}

// Thinking time handler
function handleUpdateThinkingTime(time: number) {
  emit('updateThinkingTime', props.message.id, time)
}

// Click outside handler
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  // Close toolbar if clicking outside of it (including inside bubble)
  if (!target.closest('.selection-toolbar')) {
    showSelectionToolbar.value = false
  }
  if (isEditing.value && !target.closest('.bubble')) {
    handleCancelEdit()
  }
}

// Selection change handler - hide toolbar when selection is cleared
function handleSelectionChange() {
  const selection = window.getSelection()
  const text = selection?.toString().trim()
  // If selection is empty or cleared, hide toolbar
  if (!text || text.length === 0) {
    showSelectionToolbar.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('selectionchange', handleSelectionChange)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('selectionchange', handleSelectionChange)
})
</script>

<style scoped>
/* Wrapper for TransitionGroup compatibility */
.message-item-wrapper {
  width: 91%;
  display: flex;
  flex-direction: column;
}

.message {
  display: flex;
  gap: var(--message-gap, 10px);
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

/* Navigation highlight effect */
.message.user.highlighted :deep(.bubble) {
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
  margin: 0;
}

/* Message footer */
.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding: 0 4px;
}

/* User messages: position actions at bottom-right */
.message.user .message-footer {
  position: relative;
  margin-top: 6px;
  margin-right: 8px;
  justify-content: flex-end;
  padding: 0;
}

/* AI messages: adjust footer for clean layout */
.message.assistant .message-footer {
  margin-top: 12px;
  padding-left: 0;
  flex-direction: row-reverse;
}

.meta {
  font-size: 12px;
  color: var(--muted);
  user-select: none;
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

/* User message edit mode - inline editing styles */
.message.user :deep(.edit-textarea) {
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

.message.user :deep(.edit-textarea)::-webkit-scrollbar {
  width: 4px;
}

.message.user :deep(.edit-textarea)::-webkit-scrollbar-track {
  background: transparent;
}

.message.user :deep(.edit-textarea)::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

html[data-theme='light'] .message.user :deep(.edit-textarea) {
  color: rgba(0, 0, 0, 0.9);
}

html[data-theme='light'] .message.user :deep(.edit-textarea)::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

/* Editing state bubble */
.message.user :deep(.bubble.editing) {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    0 0 0 2px rgba(59, 130, 246, 0.4);
}

html[data-theme='light'] .message.user :deep(.bubble.editing) {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.04),
    0 0 0 2px rgba(59, 130, 246, 0.3);
}

/* Regenerate button animation */
:deep(.regenerate-btn svg) {
  transition: transform 0.3s ease;
}

:deep(.regenerate-btn:hover svg) {
  transform: rotate(180deg);
}

/* Inline error for failed assistant messages */
.inline-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-top: 8px;
  background: rgba(var(--color-danger-rgb), 0.1);
  border: 1px solid rgba(var(--color-danger-rgb), 0.3);
  border-radius: 8px;
  color: var(--text-error);
  font-size: 13px;
  line-height: 1.5;
}

.inline-error svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.inline-error-text {
  flex: 1;
  word-break: break-word;
}
</style>
