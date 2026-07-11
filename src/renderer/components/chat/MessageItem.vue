<template>
  <div class="message-item-wrapper">
    <!-- Error message -->
    <MessageError
      v-if="message.role === 'error'"
      :content="message.content"
      :error-details="message.errorDetails"
      :timestamp="message.timestamp"
      :session-id="message.sessionId"
      :message-id="message.id"
    />

    <!-- System message (e.g., /files command output) -->
    <MessageSystem
      v-else-if="message.role === 'system'"
      :content="message.content"
      :timestamp="message.timestamp"
      :session-id="message.sessionId"
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
      >
        <!-- Thinking/Waiting status -->
        <MessageThinking
          v-if="message.role === 'assistant'"
          :is-streaming="message.isStreaming || false"
          :has-content="messageHasContent"
          :reasoning="topReasoning"
          :thinking-start-time="message.thinkingStartTime"
          :thinking-time="message.thinkingTime"
          :loading-memory="isLoadingMemory"
          @update-thinking-time="handleUpdateThinkingTime"
        />

        <!-- Attachments live outside the bubble: bare thumbnails for
             images, compact chips for files. -->
        <div
          v-if="message.attachments?.length"
          class="message-attachments"
        >
          <div
            v-if="imageAttachments.length > 0"
            class="message-attachment-images"
            :class="{ grid: imageAttachments.length > 1 }"
          >
            <figure
              v-for="attachment in imageAttachments"
              :key="attachment.id"
              class="message-figure"
            >
              <AttachmentThumb
                size="md"
                clickable
                :src="attachmentImageSrc(attachment)"
                :alt="attachment.fileName"
                @open="openAttachmentImage(attachment)"
              />
              <figcaption class="message-figure-caption">
                {{ attachment.fileName }} · {{ formatFileSize(attachment.size) }}
              </figcaption>
            </figure>
          </div>
          <div
            v-if="fileAttachments.length > 0"
            class="message-attachment-files"
          >
            <FileChip
              v-for="attachment in fileAttachments"
              :key="attachment.id"
              :file-name="attachment.fileName"
              :size-bytes="attachment.size"
            />
          </div>
        </div>

        <!-- Message bubble -->
        <MessageBubble
          :role="message.role"
          :content="message.content"
          :content-parts="message.contentParts"
          :tool-calls="message.toolCalls"
          :steps="message.steps"
          :skill-used="message.skillUsed"
          :is-streaming="message.isStreaming"
          :is-editing="isEditing"
          :edit-content="editContent"
          :session-id="message.sessionId"
          @submit-edit="handleSubmitEdit"
          @cancel-edit="handleCancelEdit"
          @open-media="handleOpenMedia"
          @text-selection="handleTextSelection"
          @execute-tool="handleToolExecute"
          @open-file="(filePath) => emit('openFile', filePath)"
        />

        <!-- Inline error for assistant messages that failed mid-stream -->
        <div
          v-if="message.role === 'assistant' && message.errorDetails"
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
          <span class="inline-error-text">{{ inlineErrorText }}</span>
        </div>

        <!-- Steps panel fallback - only for legacy messages without contentParts -->
        <StepsPanel
          v-if="showLegacyStepsPanel"
          :steps="message.steps ?? []"
          :session-id="message.sessionId"
          @open-file="(filePath) => emit('openFile', filePath)"
        />

        <!-- Message footer -->
        <div
          class="message-footer"
          data-message-footer
        >
          <div
            class="meta"
          >
            {{ formatTime(message.timestamp) }}
          </div>
          <MessageActions
            :role="message.role"
            :content="message.content"
            :visible="true"
            :is-streaming="message.isStreaming || false"
            :branches="branches"
            :can-branch="canBranch"
            :usage="message.usage"
            :model="message.model"
            :message-id="message.id"
            :session-id="message.sessionId"
            @edit="startEdit"
            @regenerate="handleRegenerate"
            @branch="handleBranch"
            @go-to-branch="handleGoToBranch"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatMessage, MessageAttachment, ToolCall } from '@/types'
import StepsPanel from './StepsPanel.vue'
import AttachmentThumb from '@/components/common/AttachmentThumb.vue'
import FileChip from '@/components/common/FileChip.vue'
import { formatFileSize } from '@/utils/format'
import MessageError from './message/MessageError.vue'
import MessageSystem from './message/MessageSystem.vue'
import MessageThinking from './message/MessageThinking.vue'
import MessageBubble from './message/MessageBubble.vue'
import MessageActions from './message/MessageActions.vue'
import { humanizeStreamError } from './message/error-humanizer'
import { rawTextFromPromptParts } from '@shared/prompt-references'
import { platformApi } from '@/platform'

interface BranchInfo {
  id: string
  name: string
}

interface Props {
  message: ChatMessage
  branches?: BranchInfo[]
  canBranch?: boolean
  isHighlighted?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canBranch: true,
  isHighlighted: false,
})

const inlineErrorText = computed(() => {
  const raw = props.message.errorDetails
  if (!raw) return ''
  const humanized = humanizeStreamError(raw)
  return humanized.title === '生成失败' ? raw : humanized.title
})

interface MessageMediaOpenPayload {
  src: string
  alt?: string
  fileName?: string
  mediaId?: string
}

const emit = defineEmits<{
  regenerate: [messageId: string]
  edit: [messageId: string, newContent: string]
  branch: [messageId: string, quotedText?: string]
  goToBranch: [sessionId: string]
  textSelection: [messageId: string, text: string, position: { top: number; left: number }]
  executeTool: [toolCall: ToolCall]
  openFile: [filePath: string]
  updateThinkingTime: [messageId: string, thinkingTime: number]
}>()

// UI State
const isEditing = ref(false)
const editContent = ref('')

// Legacy messages carry steps without a data-steps contentPart placeholder;
// only those need the standalone StepsPanel below the bubble.
const showLegacyStepsPanel = computed(() =>
  props.message.role === 'assistant' &&
  (props.message.steps?.length ?? 0) > 0 &&
  !props.message.contentParts?.some(p => p.type === 'data-steps')
)

// Check if message is loading memory (has loading-memory contentPart)
const isLoadingMemory = computed(() => {
  if (!props.message.contentParts) return false
  return props.message.contentParts.some(part => part.type === 'loading-memory')
})

const messageHasContent = computed(() => {
  if (props.message.content) return true
  if (props.message.toolCalls?.length || props.message.steps?.length) return true
  return props.message.contentParts?.some(part =>
    part.type !== 'waiting' &&
    part.type !== 'loading-memory' &&
    part.type !== 'image-loading'
  ) ?? false
})

const topReasoning = computed(() => {
  return props.message.reasoning || ''
})

// Attachments render outside the bubble: images as bare thumbnails,
// everything else (including images without a resolvable source) as chips.
const imageAttachments = computed(() =>
  (props.message.attachments ?? []).filter(
    attachment => attachment.mediaType === 'image' && attachmentImageSrc(attachment),
  ),
)

const fileAttachments = computed(() =>
  (props.message.attachments ?? []).filter(
    attachment => !(attachment.mediaType === 'image' && attachmentImageSrc(attachment)),
  ),
)

function attachmentImageSrc(attachment: MessageAttachment): string {
  if (attachment.base64Data) {
    return `data:${attachment.mimeType};base64,${attachment.base64Data}`
  }
  return attachment.url || ''
}

function openAttachmentImage(attachment: MessageAttachment) {
  const src = attachmentImageSrc(attachment)
  if (!src) return
  handleOpenMedia({ src, fileName: attachment.fileName })
}

// Format time
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Edit handlers
function startEdit() {
  editContent.value = rawTextFromPromptParts(props.message.content, props.message.contentParts)
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
function handleOpenMedia(payload: MessageMediaOpenPayload) {
  const { src, alt, fileName, mediaId } = payload
  if (!src) return
  if (mediaId) {
    platformApi?.openImageGallery(mediaId)
    return
  }
  platformApi?.openImagePreview(src, fileName || alt)
}

// Regenerate handler
function handleRegenerate() {
  emit('regenerate', props.message.id)
}

// Branch handlers
function handleBranch() {
  if (!props.canBranch) return
  emit('branch', props.message.id)
}

function handleGoToBranch(sessionId: string) {
  emit('goToBranch', sessionId)
}

// Text selection: the toolbar itself is owned by MessageList (one instance
// for the whole list); this component only reports where the selection is.
function handleTextSelection(text: string, position: { top: number; left: number }) {
  emit('textSelection', props.message.id, text, position)
}

// Tool handlers
function handleToolExecute(toolCall: ToolCall) {
  emit('executeTool', toolCall)
}

// Thinking time handler
function handleUpdateThinkingTime(time: number) {
  emit('updateThinkingTime', props.message.id, time)
}
</script>

<style scoped>
/* Wrapper for TransitionGroup compatibility */
.message-item-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.message {
  display: flex;
  gap: var(--message-gap, 10px);
  align-items: flex-start;
  animation: fadeIn 0.18s ease-out;
  width: 100%;
  margin-bottom: 12px;
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
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 60%, transparent),
      0 0 20px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 30%, transparent);
  }
  50% {
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 40%, transparent),
      0 0 15px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 20%, transparent);
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

/* Attachment layer above the bubble: no shell of its own, each thumb/chip
   carries its own surface. */
.message-attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: min(74%, 680px);
  margin-bottom: 4px;
}

.message-attachment-images,
.message-attachment-files {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.message.user .message-attachment-images,
.message.user .message-attachment-files {
  justify-content: flex-end;
}

/* Multiple images shrink into a uniform thumbnail grid. */
.message-attachment-images.grid :deep(.attachment-thumb-img) {
  width: 116px;
  height: 116px;
  object-fit: cover;
}

/* Plate captions: filename set like a figure label under each image. */
.message-figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 0;
  min-width: 0;
}

.message-figure-caption {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 9.5px;
  letter-spacing: 0.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.message.assistant .message-content-wrapper {
  gap: 4px;
  max-width: 100%;
  margin: 0;
}

/* Message footer */
.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 5px;
  padding: 0 4px;
  min-height: 28px;
  /* Keep the footer (timestamp + actions) quiet until the message is
     hovered or a control inside it is focused. min-height reserves the
     space so revealing it never shifts layout. */
  opacity: 0;
  transition: opacity 0.15s ease;
}

.message:hover .message-footer,
.message:focus-within .message-footer,
.message.highlighted .message-footer {
  opacity: 1;
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
  margin-top: 9px;
  padding-left: 0;
  flex-direction: row-reverse;
}

.meta {
  font-size: 11.5px;
  line-height: 28px;
  color: var(--ui-text-muted-fg, var(--muted));
  user-select: none;
  font-variant-numeric: tabular-nums;
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

/* Inline error for failed assistant messages */
.inline-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-top: 8px;
  background: var(--ui-status-danger-bg, transparent);
  border: 1px solid var(--ui-status-danger-border, var(--color-danger));
  border-radius: 8px;
  color: var(--ui-status-danger-fg, var(--text-error));
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
