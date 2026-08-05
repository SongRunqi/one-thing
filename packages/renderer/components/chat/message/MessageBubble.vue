<template>
  <div
    v-if="hasVisibleContent"
    ref="bubbleRef"
    class="bubble"
    :class="{ editing: isEditing, [role]: true }"
    @mouseup="handleTextSelection"
  >
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
    <MessageInlineEdit
      v-if="isEditing"
      :initial-content="editContent || content"
      :boundary="bubbleRef"
      @submit="emit('submitEdit', $event)"
      @cancel="emit('cancelEdit')"
    />

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
        :style="role === 'user' && isCollapsed && isOverflowing && !isStreaming ? { maxHeight: maxCollapsedHeight + 'px' } : {}"
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
              <MessageMarkdown
                :content="firstTextPart.content"
                :is-user="role === 'user'"
                :live="shouldUseStreamingMarkdown(role === 'user')"
                :is-streaming="Boolean(isStreaming)"
              />
            </div>
          </Transition>

          <div
            v-if="partGroups.length > 0"
            class="other-parts-container"
          >
            <template
              v-for="group in partGroups"
              :key="group.key"
            >
              <!-- Process rail: a run of reasoning/tool parts collapses
                   behind one summary line, indented off the answer column -->
              <ProcessRail
                v-if="group.kind === 'process'"
                :summary="processGroupSummary(group)"
                :duration="processGroupDuration(group)"
                :streaming="isProcessGroupLive(group)"
                :solo="isSoloProcessGroup(group)"
                :failed-count="processGroupFailedCount(group)"
              >
                <template
                  v-for="{ part, key } in group.entries"
                  :key="key"
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
                  <!-- Inline reasoning parts -->
                  <CollapsePanel
                    v-else-if="part.type === 'reasoning'"
                    class="inline-reasoning"
                    :name="key"
                    default-collapsed
                    :status="isProcessGroupLive(group) ? 'streaming' : 'completed'"
                    :streaming="isProcessGroupLive(group)"
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
                        <MessageMarkdown
                          :content="cleanReasoningContent(part.content)"
                          :is-user="false"
                          :live="shouldUseStreamingMarkdown(false)"
                          :is-streaming="Boolean(isStreaming)"
                        />
                      </div>
                    </div>
                  </CollapsePanel>
                  <!-- Tool call part - show only for streaming input that doesn't have a step yet -->
                  <StepsPanel
                    v-else-if="part.type === 'tool-call' && streamingOnlySteps(part.toolCalls).length > 0"
                    :steps="streamingOnlySteps(part.toolCalls)"
                    :session-id="sessionId"
                    flat
                    @open-file="(filePath) => emit('openFile', filePath)"
                  />
                  <!-- Steps panel - rendered inline -->
                  <StepsPanel
                    v-else-if="part.type === 'data-steps' && steps && steps.length > 0"
                    :steps="getStepsForTurn(part.turnIndex)"
                    :session-id="sessionId"
                    flat
                    @open-file="(filePath) => emit('openFile', filePath)"
                  />
                </template>
              </ProcessRail>
              <template v-else>
                <template
                  v-for="{ part, key } in group.entries"
                  :key="key"
                >
                  <div
                    v-if="part.type === 'image-loading'"
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
                    <MessageMarkdown
                      :content="part.content"
                      :is-user="role === 'user'"
                      :live="shouldUseStreamingMarkdown(role === 'user')"
                      :is-streaming="Boolean(isStreaming)"
                    />
                  </div>
                </template>
              </template>
            </template>
          </div>
        </template>

        <!-- Fallback for messages without contentParts (user messages and
             empty edge cases). Assistant messages always have contentParts
             populated by rebuildContentParts before reaching here, so no
             tool-call rendering is needed in this branch. -->
        <div
          v-else
          class="content md-code-block-scope md-inline-code-scope"
        >
          <MessageMarkdown
            :content="content"
            :is-user="role === 'user'"
            :live="shouldUseStreamingMarkdown(role === 'user')"
            :is-streaming="Boolean(isStreaming)"
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
import { ref, computed, watch } from 'vue'
import StepsPanel from '../StepsPanel.vue'
import CollapsePanel from '@/components/common/CollapsePanel.vue'
import PromptReferenceCard from '@/components/common/PromptReferenceCard.vue'
import MessageMarkdown from './MessageMarkdown.vue'
import MessageInlineEdit from './MessageInlineEdit.vue'
import ProcessRail from './ProcessRail.vue'
import type { ToolCall, Step, ContentPart } from '@/types'
import { stepFromToolCall } from '@/stores/helpers/tool-step-view'
import { cleanReasoningContent } from '@/composables/useMarkdownRenderer'
import { useCollapsibleContent } from '@/composables/useCollapsibleContent'
import { hasVisibleReasoningContent, summarizeReasoningContent } from './reasoning-summary'

interface Props {
  role: 'user' | 'assistant'
  content: string
  contentParts?: ContentPart[]
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
  openMedia: [payload: { src: string; alt?: string; fileName?: string; mediaId?: string }]
  textSelection: [text: string, position: { top: number; left: number }]
  executeTool: [toolCall: ToolCall]
  openFile: [filePath: string]
}>()

const bubbleRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const hasBeenStreaming = ref(Boolean(props.isStreaming))

// Collapsible content (only user messages collapse)
const shouldTrackOverflow = computed(() => props.role === 'user')
const { isCollapsed, isOverflowing, toggleCollapse, maxCollapsedHeight } = useCollapsibleContent({
  contentRef,
  enabled: shouldTrackOverflow,
  isStreaming: () => Boolean(props.isStreaming),
  content: () => props.content,
})

// ============ New overlay-based transition system ============

// Extract the first text part (rendered separately for smooth transition)
// Only treat the first part as "firstTextPart" if it's actually a text part.
// If the first part is a tool-call/data-steps, all parts go through otherParts in order.
const firstTextPart = computed(() => {
  const parts = props.contentParts
  if (!parts || parts.length === 0) return null
  return parts[0].type === 'text' ? parts[0] : null
})

// Parts rendered after the first text part, paired with render keys.
// Keys derive from the part's position in the ORIGINAL contentParts array
// (or its turnIndex): during streaming, transient parts (e.g. waiting) get
// filtered in and out, so a filtered-array index would shift and remount
// every part behind it. If firstTextPart captured parts[0], skip it here;
// otherwise keep all parts in order.
const otherPartEntries = computed(() => {
  const parts = props.contentParts
  if (!parts) return []
  const hasFirstText = !!firstTextPart.value
  let skippedFirstText = false
  let sawVisiblePartBeforeWaiting = false
  const entries: { part: ContentPart; key: string }[] = []

  parts.forEach((p, sourceIndex) => {
    if (p.type === 'loading-memory' || p.type === 'provider-data') {
      return
    }

    if (p.type === 'reasoning' && !hasVisibleReasoningContent(p.content)) {
      return
    }

    // Skip the initial waiting (handled by MessageThinking)
    if (p.type === 'waiting' && !sawVisiblePartBeforeWaiting) {
      return
    }

    // Only skip the first text if firstTextPart is rendering it
    if (p.type === 'text' && hasFirstText && !skippedFirstText) {
      skippedFirstText = true
      sawVisiblePartBeforeWaiting = true
      return
    }

    if (p.type !== 'waiting') {
      sawVisiblePartBeforeWaiting = true
    }
    entries.push({ part: p, key: getOtherPartKey(p, sourceIndex) })
  })

  return entries
})

// ============ Process rail grouping ============
// Consecutive "process" parts (thinking + tool activity) collapse behind a
// single ProcessRail; content parts (answer text, references) stay at full
// volume on the main column.

type PartEntry = { part: ContentPart; key: string }
type PartGroup = { kind: 'process' | 'content'; key: string; entries: PartEntry[] }

const PROCESS_PART_TYPES = new Set<ContentPart['type']>(['reasoning', 'tool-call', 'data-steps', 'waiting'])

// Group key reuses the first entry's key: contentParts is append-only during
// streaming, so extending a run never remounts what is already rendered.
const partGroups = computed<PartGroup[]>(() => {
  const groups: PartGroup[] = []
  for (const entry of otherPartEntries.value) {
    const isProcess = PROCESS_PART_TYPES.has(entry.part.type)
    const last = groups[groups.length - 1]
    if (isProcess && last?.kind === 'process') {
      last.entries.push(entry)
      continue
    }
    if (!isProcess && last?.kind === 'content') {
      last.entries.push(entry)
      continue
    }
    groups.push({
      kind: isProcess ? 'process' : 'content',
      key: `${isProcess ? 'process' : 'content'}-${entry.key}`,
      entries: [entry],
    })
  }
  return groups
})

interface ProcessGroupStats {
  reasoningCount: number
  toolCount: number
  failedCount: number
  toolCounts: Map<string, number>
  durationMs: number
}

function processGroupStats(group: PartGroup): ProcessGroupStats {
  let reasoningCount = 0
  let toolCount = 0
  let failedCount = 0
  const toolCounts = new Map<string, number>()
  let durationMs = 0

  for (const { part } of group.entries) {
    if (part.type === 'reasoning') {
      reasoningCount++
    } else if (part.type === 'data-steps') {
      for (const step of getStepsForTurn(part.turnIndex)) {
        const name = step.toolCall?.toolName || step.title || 'tool'
        toolCount++
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1)
        durationMs += step.toolCall?.durationMs ?? 0
        if (step.status === 'failed') failedCount++
      }
    }
  }

  return { reasoningCount, toolCount, failedCount, toolCounts, durationMs }
}

function processGroupSummary(group: PartGroup): string {
  const stats = processGroupStats(group)

  const bits: string[] = []
  if (stats.reasoningCount > 0) bits.push(`思考 ${stats.reasoningCount} 步`)

  const toolBits = [...stats.toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
  if (toolBits.length > 4) {
    const extra = toolBits.length - 4
    toolBits.length = 4
    toolBits.push(`+${extra}`)
  }
  bits.push(...toolBits)

  return bits.length > 0 ? bits.join(' · ') : '过程'
}

// Rendered outside the uppercased summary span so the seconds unit keeps its
// lowercase "s".
function processGroupDuration(group: PartGroup): string {
  const { durationMs } = processGroupStats(group)
  if (durationMs < 1000) return ''
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`
}

/** A one-item process reads better as a bare timeline row than as a
 *  summary header that merely repeats it. */
function isSoloProcessGroup(group: PartGroup): boolean {
  const stats = processGroupStats(group)
  return stats.reasoningCount + stats.toolCount <= 1
}

function processGroupFailedCount(group: PartGroup): number {
  return processGroupStats(group).failedCount
}

const LIVE_STEP_STATUSES = new Set(['pending', 'running', 'awaiting-confirmation'])
const LIVE_TOOL_STATUSES = new Set(['pending', 'queued', 'executing', 'input-streaming'])

/**
 * A rail animates only while ITS OWN work is in flight — earlier, finished
 * process groups must settle even though the message as a whole is still
 * streaming. "Live" = an in-flight step inside the group, or being the
 * trailing process group of an actively streaming message (the turn that
 * is thinking / about to call tools).
 */
function isProcessGroupLive(group: PartGroup): boolean {
  if (!props.isStreaming) return false

  for (const { part } of group.entries) {
    if (part.type === 'data-steps') {
      for (const step of getStepsForTurn(part.turnIndex)) {
        if (LIVE_STEP_STATUSES.has(step.status)) return true
      }
    } else if (part.type === 'tool-call') {
      if (part.toolCalls.some(tc => LIVE_TOOL_STATUSES.has(tc.status))) return true
    }
  }

  const groups = partGroups.value
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].kind === 'process') return groups[i] === group
  }
  return false
}

const useLiveAssistantMarkdown = computed(() =>
  props.role === 'assistant' && hasBeenStreaming.value,
)

function shouldUseStreamingMarkdown(isUser: boolean): boolean {
  return Boolean(props.isStreaming || (!isUser && useLiveAssistantMarkdown.value))
}

// Generate render keys for other parts. `sourceIndex` is the part's index
// in the original (unfiltered) contentParts array, which is append-only
// during streaming and therefore stable.
function getOtherPartKey(part: ContentPart, sourceIndex: number): string {
  if (part.type === 'text') return `text-other-${sourceIndex}`
  if (part.type === 'reasoning') return inlineReasoningKey(part, sourceIndex)
  if (part.type === 'prompt-ref') return `prompt-ref-${part.promptId}-${part.bodyHash || sourceIndex}`
  if (part.type === 'skill-ref') return `skill-ref-${part.skillId}-${part.bodyHash || sourceIndex}`
  if (part.type === 'tool-call') return `tool-call-${part.toolCalls.map(tc => tc.id).join('-') || sourceIndex}`
  if (part.type === 'data-steps') return `steps-${part.turnIndex ?? sourceIndex}`
  if (part.type === 'waiting') return `waiting-${part.turnIndex ?? sourceIndex}`
  if (part.type === 'image-loading') return `image-loading-${part.turnIndex ?? sourceIndex}`
  return `part-${sourceIndex}`
}

function inlineReasoningKey(part: Extract<ContentPart, { type: 'reasoning' }>, index: number): string {
  // Stable across streaming: a reasoning part keeps its position while its
  // content grows. Keying on the content fingerprint changed the key on every
  // chunk, so an expanded streaming block lost its state and snapped shut —
  // making it impossible to keep the last (still-streaming) thought open.
  return `reasoning-${part.turnIndex ?? index}`
}

function getInlineReasoningSummary(part: Extract<ContentPart, { type: 'reasoning' }>): string {
  return summarizeReasoningContent(part.content)
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
  // Attachments render outside the bubble (in MessageItem), so an
  // attachment-only user message has no bubble shell at all.
  if (props.isEditing) return true
  if (props.role === 'user') {
    return Boolean(props.content || props.contentParts?.length)
  }
  // The !isStreaming fallback keeps persisted (historical) messages visible
  // even when they carry no content; only a still-empty streaming message
  // hides the bubble.
  return Boolean(
    props.content ||
    props.contentParts?.length ||
    !props.isStreaming,
  )
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
      emit('openMedia', { src, alt, mediaId: mediaIdMatch[1] })
    } else {
      // Non-media image (attachment, external URL, old format)
      emit('openMedia', { src, alt })
    }
  }
}
</script>

<style scoped>
.bubble {
  max-width: 80%;
  padding: var(--message-padding, 14px 18px);
  border-radius: 18px;
  border: 1px solid var(--ui-border-default-border);
  background: var(--ui-surface-elevated-bg);
  position: relative;
  transition: all 0.2s ease;
  box-shadow: var(--ui-message-surface-shadow, var(--shadow));
}

.bubble.editing {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.bubble.user.editing {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.3),
    0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 40%, transparent);
}

html[data-theme='light'] .bubble.user.editing {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.04),
    0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 30%, transparent);
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
  /* Blueprint frame: zero fill, one outline. The surface variable stays a
     solid color for the collapse fade mask; behind a transparent bubble the
     visible surface is the chat background, with the solid bubble token as
     fallback (--ui-message-user-solid-bg keeps gradients out of color-mix). */
  --user-bubble-surface: var(--ui-surface-chat-bg, var(--ui-message-user-solid-bg));

  max-width: min(74%, 680px);
  /* A light ink wash inside the frame: the user's voice must be findable
     when scanning — a fully transparent box reads as an empty input, not a
     said thing. */
  background: color-mix(in srgb, var(--ui-text-primary-fg) 4%, transparent);
  border-radius: var(--radius-xs, 4px);
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent);
  box-shadow: var(--ui-message-user-shadow, none);
  width: fit-content;
  /* Single-character messages ("?") must stay a short entry, not collapse
     into a tall empty square. */
  min-width: 3.5em;
}

html[data-theme='light'] .bubble.user {
  box-shadow: var(--ui-message-user-shadow, 0 4px 12px rgba(0, 0, 0, 0.04));
}

/* Custom text selection highlight for AI messages */
.bubble.assistant ::selection {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 35%, transparent);
  color: inherit;
}

.bubble.assistant ::-moz-selection {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 35%, transparent);
  color: inherit;
}

html[data-theme='light'] .bubble.assistant ::selection {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 25%, transparent);
}

/* Skill badge */
.skill-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent);
  border-radius: 12px;
  margin-bottom: 8px;
  font-size: var(--type-caption-muted-size);
  line-height: var(--type-caption-muted-line-height);
  color: var(--ui-accent-primary-fg);
}

.skill-icon {
  width: 14px;
  height: 14px;
}

.skill-name {
  font-weight: var(--type-meta-weight);
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
  border: 1px solid var(--ui-border-default-border);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-accent-primary-fg) 8%, transparent), transparent 36%),
    var(--ui-surface-elevated-bg);
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

/* Gradient mask at bottom when collapsed */
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
    var(--user-bubble-surface, var(--ui-message-user-solid-bg, var(--ui-surface-chat-bg)))
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
  color: color-mix(in srgb, var(--ui-text-muted-fg) 82%, transparent);
  font-size: var(--type-meta-size);
  font-weight: var(--type-meta-weight);
  line-height: var(--type-meta-line-height);
  cursor: pointer;
  transition: color 0.2s ease;
}

.collapse-toggle:hover {
  color: var(--ui-accent-primary-fg);
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
  /* copy/copied icon visibility now comes from the shared defaults in markdown.css */
  --md-code-line-height: var(--type-code-line-height-px);
  --md-code-plain-fg: var(--hg-syntax-plain-fg, var(--text-code-block));

  display: flow-root;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  font-family: var(--font-body);
  line-height: var(--message-line-height-px, var(--type-chat-comfortable-line-height-px));
  font-size: var(--message-font-size, var(--type-chat-comfortable-size));
  color: color-mix(in srgb, var(--ui-text-primary-fg) 96%, var(--ui-text-secondary-fg) 4%);
  letter-spacing: 0;
}

/* AI message text */
.bubble.assistant .content {
  color: var(--ui-message-assistant-fg);
}

.bubble.user .content {
  line-height: var(--message-line-height-px, var(--type-chat-comfortable-line-height-px));
  color: var(--ui-message-user-fg);
  /* Manuscript voice: the user's words are set in the display serif,
     independent of the chat reading-font setting. */
  font-family: var(--font-display, var(--font-sans));
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
  background: var(--ui-accent-primary-fg);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--ui-accent-primary-fg) 28%, transparent);
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
  border-left: 2px solid color-mix(in srgb, var(--ui-accent-primary-fg) 34%, var(--ui-border-default-border));
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

/* 同 MessageThinking:小字号下 1.5em 装不下两位数 marker,会被自身 overflow: hidden 裁掉 */
.inline-reasoning-content :deep(ol) {
  padding-left: 2.4em;
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

/* Container for tool-calls, steps, and additional text parts */
.other-parts-container {
  position: relative;
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
  border-left: 2px solid color-mix(in srgb, var(--ui-text-muted-fg) 42%, transparent);
  color: color-mix(in srgb, var(--ui-text-secondary-fg) 88%, var(--ui-text-muted-fg) 12%);
  border-radius: 0;
}

.content :deep(a) {
  color: var(--ui-accent-primary-fg);
  text-decoration: none;
}

.content :deep(a:hover) {
  text-decoration: underline;
}

/* Horizontal rule */
.content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--ui-border-default-border);
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
/* Grid table (稿纸): a full but whisper-faint grid — subtle inner lines,
   a slightly darker outer frame, a paper-tinted header band and whisper
   zebra rows. Chosen from the four-scheme mockup in
   docs/design/table-styles/index.html (案三). */
/* The renderer wraps every table in .md-table-scroll; the wrapper scrolls,
   the table keeps real table layout at full column width. */
.content :deep(.md-table-scroll) {
  max-width: 100%;
  overflow-x: auto;
  margin: var(--content-spacing-px, 11px) 0;
}

.content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: var(--content-spacing-px, 11px) 0;
  border: 1px solid var(--ui-table-border, var(--ui-border-default-border));
}

.content :deep(.md-table-scroll > table) {
  margin: 0;
}

.content :deep(th),
.content :deep(td) {
  border: 1px solid var(--ui-border-subtle-border);
  padding: 7px 12px;
  text-align: left;
}

/* Numeric cells (classed by the markdown renderer) never wrap — a broken
   phone number reads as two numbers. Prose cells keep the body's anywhere
   wrapping, so no long-token column can starve the others into single-
   character vertical text. */
.content :deep(.md-cell-numeric) {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.content :deep(td) {
  background: var(--ui-table-row-bg, transparent);
}

.content :deep(tbody tr:nth-child(even) td) {
  background: color-mix(in srgb, var(--ui-table-header-bg, var(--ui-state-hover-bg)) 40%, transparent);
}

.content :deep(th) {
  background: var(--ui-table-header-bg, var(--ui-state-hover-bg));
  border-bottom: 1px solid var(--ui-table-border, var(--ui-border-default-border));
  font-size: 0.9em;
  font-weight: var(--type-body-strong-weight, 600);
  color: var(--ui-text-secondary-fg);
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

/* MathJax SVGs render via currentColor; the semantic token resolves per theme */
.content :deep(mjx-container svg) {
  color: var(--ui-text-primary-fg);
}

</style>
