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

    <!-- Goal declaration: the /goal command's user message, framed -->
    <GoalSetMessage
      v-else-if="isGoalSet"
      :message="message"
    />

    <!-- Goal continuation: engine-injected user message, a blueprint tick -->
    <GoalContinuationLine
      v-else-if="isGoalInjected"
      :content="message.content"
      :timestamp="message.timestamp"
    />

    <!-- Normal user/assistant message -->
    <div
      v-else
      :class="['message', message.role, { highlighted: isHighlighted, steered: isSteered }]"
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

        <!-- Steering identity line: marks the message as an interjection
             into a running response. While still queued it also carries the
             delivery state and the retract affordance. -->
        <div
          v-if="isSteered"
          class="steer-line"
        >
          <span class="steer-flag">插话</span>
          <template v-if="steeringPending">
            <span class="steer-pending-hint">待送达 · 下一轮注入</span>
            <button
              type="button"
              class="steer-retract-btn"
              @click="handleRetractSteer"
            >
              撤回
            </button>
          </template>
        </div>

        <!-- Turn-volatile state board captured at send time. Rendered into
             the model request as a <context-update> block; shown here so the
             user can see exactly what state the model was told. -->
        <div
          v-if="message.role === 'user' && message.contextUpdate"
          class="message-context-update"
        >
          <button
            type="button"
            class="context-update-toggle"
            :aria-expanded="contextUpdateExpanded"
            @click="contextUpdateExpanded = !contextUpdateExpanded"
          >
            context-update
          </button>
          <pre
            v-if="contextUpdateExpanded"
            class="context-update-body"
          >{{ message.contextUpdate }}</pre>
        </div>

        <!-- Inline error for assistant messages that failed mid-stream -->
        <ErrorNote
          v-if="message.role === 'assistant' && message.errorDetails"
          class="inline-error"
          :message="inlineErrorText"
        />

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
import ErrorNote from '@/components/common/ErrorNote.vue'
import FileChip from '@/components/common/FileChip.vue'
import { formatFileSize } from '@/utils/format'
import MessageError from './message/MessageError.vue'
import MessageSystem from './message/MessageSystem.vue'
import GoalContinuationLine from './message/GoalContinuationLine.vue'
import GoalSetMessage from './message/GoalSetMessage.vue'
import MessageThinking from './message/MessageThinking.vue'
import MessageBubble from './message/MessageBubble.vue'
import MessageActions from './message/MessageActions.vue'
import { humanizeStreamError } from './message/error-humanizer'
import { rawTextFromPromptParts } from '@shared/prompt-references'
import { platformApi } from '@/platform'
import { useChatStore } from '@/stores/chat'

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
const contextUpdateExpanded = ref(false)

// Steering identity + retraction. `steered` is the persisted marker (also
// true for historical messages); the pending set only tracks messages still
// waiting in the queue (retractable until the next loop turn drains them).
const chatStore = useChatStore()
const isSteered = computed(() =>
  props.message.role === 'user' &&
  (props.message.steered === true ||
    chatStore.pendingSteeringByMessageId.has(props.message.id)),
)
const steeringPending = computed(() =>
  props.message.role === 'user' &&
  chatStore.pendingSteeringByMessageId.has(props.message.id),
)

async function handleRetractSteer() {
  await chatStore.retractSteerMessage(props.message.id)
}

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

// Engine-injected goal continuation prompts persist as user messages so
// history rebuilds replay them; the UI renders them as a hairline tick.
const isGoalInjected = computed(
  () => props.message.role === 'user' && props.message.origin?.source === 'goal',
)

// The /goal command's own declaration message — a real user message marked
// at send time; rendered as the framed GOAL block.
const isGoalSet = computed(
  () => props.message.role === 'user' && props.message.source === 'goal-set',
)

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
  /* The turn gap lives here as padding (not margin on .message) so the
     hover-revealed footer can paint inside it and hovering the gap keeps
     the footer open. One token = one rhythm for the whole stream. */
  position: relative;
  padding-bottom: var(--chat-turn-gap, 34px);
}

.message {
  display: flex;
  gap: var(--message-gap, 10px);
  align-items: flex-start;
  animation: fadeIn 0.18s ease-out;
  width: 100%;
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
.message-context-update {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-top: 2px;
}

.context-update-toggle {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  letter-spacing: 0.03em;
  cursor: pointer;
  opacity: 0.75;
}

.context-update-toggle:hover {
  opacity: 1;
  text-decoration: underline;
}

.context-update-body {
  margin: 0;
  padding: 6px 8px;
  max-width: min(74%, 680px);
  overflow-x: auto;
  border-left: 1px solid var(--ui-border-subtle, var(--border));
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  white-space: pre-wrap;
}

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

/* Message footer — an overlay in the turn gap, not a layout row. Reserving
   28px under every message made the stream's rhythm read as slack; painting
   it inside the wrapper's padding keeps reveal shift-free at zero cost. */
.message-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 3px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
  min-height: 28px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.message-item-wrapper:hover .message-footer,
.message-footer:focus-within,
.message.highlighted .message-footer {
  opacity: 1;
  pointer-events: auto;
}

/* User messages: position actions at bottom-right */
.message.user .message-footer {
  justify-content: flex-end;
  padding: 0 8px 0 0;
}

/* AI messages: adjust footer for clean layout */
.message.assistant .message-footer {
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

/* Steered message: dashed frame marks an interjection into a running
   response, distinct from the solid outline of a normal user entry. */
.message.user.steered :deep(.bubble.user) {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 45%, transparent);
}

/* Steering identity line: always visible on steered messages; carries the
   delivery state and retract affordance while the message is still queued. */
.steer-line {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding-right: 4px;
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  user-select: none;
}

.steer-flag {
  font-size: 11px;
  line-height: 16px;
  padding: 0 5px;
  letter-spacing: 0.08em;
  border: 1px dashed color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 40%, transparent);
  border-radius: 3px;
  color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 75%, var(--ui-text-muted-fg, var(--muted)));
}

.steer-pending-hint {
  letter-spacing: 0.02em;
}

.steer-retract-btn {
  border: none;
  background: transparent;
  padding: 0 2px;
  font-size: 11.5px;
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.steer-retract-btn:hover {
  color: var(--ui-accent-primary-fg, var(--accent));
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

/* Inline error for failed assistant messages — positioning only; the ledger
   ink rule itself lives in ErrorNote. */
.inline-error {
  margin-top: 8px;
}
</style>
