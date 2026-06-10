<template>
  <div class="tool-step-details">
    <div
      v-if="failedEditOldTexts.length"
      class="detail-section failed-edit-section"
    >
      <div class="detail-label">
        Text not found in file
      </div>
      <pre
        v-for="(text, index) in failedEditOldTexts"
        :key="index"
        class="failed-edit-snippet"
      >{{ text }}</pre>
    </div>

    <ToolDiffPreview
      v-if="activeDiff && !isFailedEdit"
      ref="streamingPreviewRef"
      :diff="activeDiff"
      :lines="activeDiffLines"
      :status="view.status"
      :wrap="wrap !== false"
    />

    <div
      v-if="activeDiff && successNote && !isFailedEdit"
      class="detail-note-row"
      :class="{ failed: view.status === 'failed' || view.status === 'rejected' }"
    >
      <Check
        v-if="view.status !== 'failed' && view.status !== 'rejected'"
        :size="13"
        class="detail-note-icon"
      />
      <X
        v-else
        :size="13"
        class="detail-note-icon"
      />
      <div class="detail-note">
        {{ successNote }}
      </div>
    </div>

    <template v-else>
      <div
        v-if="view.step.partialResult"
        class="detail-section result-section"
      >
        <ToolResultRenderer
          :result="view.step.partialResult"
          :is-partial="view.step.partialResultIsPartial"
          :render-kind="resultRenderKind"
          :tool-name="view.toolName"
        />
      </div>

      <div
        v-else-if="view.liveOutput"
        class="detail-section result-section"
      >
        <ToolResultRenderer
          :result="liveResultForRenderer"
          :is-partial="true"
          :render-kind="resultRenderKind"
          :tool-name="view.toolName"
        />
      </div>

      <div
        v-else-if="resultForRenderer"
        class="detail-section result-section"
      >
        <ToolResultRenderer
          :result="resultForRenderer"
          :render-kind="resultRenderKind"
          :tool-name="view.toolName"
        />
      </div>
    </template>

    <div
      v-if="view.step.thinking"
      class="detail-section"
    >
      <div class="detail-label">
        Thinking
      </div>
      <pre class="thinking">{{ view.step.thinking }}</pre>
    </div>

    <div
      v-if="view.step.summary"
      class="detail-section"
    >
      <div class="detail-label">
        Analysis
      </div>
      <pre class="summary">{{ view.step.summary }}</pre>
    </div>

    <div
      v-if="showErrorSection"
      class="detail-section error-section"
      :class="view.status === 'rejected' ? 'rejection' : 'error'"
    >
      <div class="detail-label">
        {{ view.status === 'rejected' ? 'Rejected' : 'Error' }}
      </div>
      <details
        v-if="showErrorDetails"
        class="error-details"
      >
        <summary>Details</summary>
        <pre :class="view.status === 'rejected' ? 'rejection-text' : 'error-text'">{{ compactError }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import type { ToolPartialResult } from '@/types'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import ToolDiffPreview from './ToolDiffPreview.vue'
import ToolResultRenderer from './ToolResultRenderer.vue'

const props = defineProps<{
  view: ToolStepView
  /** Soft-wrap long diff lines (controlled by the outer tool-step header) */
  wrap?: boolean
}>()

const streamingPreviewRef = ref<InstanceType<typeof ToolDiffPreview> | null>(null)

const activeDiff = computed(() => props.view.diff || props.view.streamingDiff)
const activeDiffLines = computed(() => props.view.diff ? props.view.diffLines : props.view.streamingDiffLines)
const isFailedEdit = computed(() => props.view.toolName === 'edit' && (props.view.status === 'failed' || props.view.status === 'rejected'))
const failedEditOldTexts = computed<string[]>(() => {
  if (props.view.toolName !== 'edit' || props.view.status !== 'failed') return []
  const edits = props.view.toolCall.arguments?.edits
  if (!Array.isArray(edits)) return []
  return edits
    .map((edit: unknown) => {
      const oldText = (edit as { oldText?: unknown } | null)?.oldText
      return typeof oldText === 'string' ? oldText : ''
    })
    .filter(Boolean)
})
const resultRenderKind = computed(() => props.view.toolName === 'bash' ? 'bash' : 'text')
const resultForRenderer = computed<ToolPartialResult | null>(() => {
  if (!props.view.resultText) return null
  return { content: [{ type: 'text', text: props.view.resultText }] }
})
const liveResultForRenderer = computed<ToolPartialResult | null>(() => {
  if (!props.view.liveOutput) return null
  return { content: [{ type: 'text', text: props.view.liveOutput }] }
})
const partialResultText = computed(() => compactOutput(props.view.step.partialResult?.content
  ?.filter(part => part.type === 'text')
  .map(part => part.text ?? '')
  .filter(Boolean)
  .join('\n') || ''))
const successNote = computed(() => {
  if (!activeDiff.value) return ''
  if (props.view.status !== 'failed' && props.view.status !== 'rejected') return ''
  const fallback = partialResultText.value || compactOutput(props.view.resultText || '')
  const path = shortDisplayPath(activeDiff.value.filePath || props.view.filePath)
  const count = replacementCount()
  if (path) {
    if (props.view.toolName === 'edit') {
      return `Attempted edit ${path} · ${count} ${count === 1 ? 'replacement' : 'replacements'}`
    }
    if (props.view.toolName === 'write') {
      return `Attempted write ${path}`
    }
  }
  return fallback.replace(/^Successfully\s+/i, '')
})

const compactError = computed(() => compactErrorText(props.view.step.error || ''))
const compactErrorReason = computed(() => compactToolFailureReason(compactError.value))
const showErrorDetails = computed(() => {
  const error = compactError.value.trim()
  if (!error) return false
  const reason = compactErrorReason.value
  if (!reason) return error.includes('\n')
  if (normalizeErrorText(error) === normalizeErrorText(reason)) return false
  return error.split('\n').filter(line => line.trim()).length > 1
})
const showErrorSection = computed(() => !!props.view.step.error && showErrorDetails.value)

function compactOutput(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trimEnd()
}

function compactErrorText(value: string): string {
  const seenPaths = new Set<string>()
  return compactOutput(value)
    .replace(/\/[^\s:]+(?:\/[^\s:]+)+/g, (path) => {
      if (seenPaths.has(path)) return 'the same file'
      seenPaths.add(path)
      return path
    })
}

function compactToolFailureReason(value: string): string {
  let reason = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean) || ''

  for (let index = 0; index < 3; index++) {
    const stripped = reason
      .replace(/^error:\s*/i, '')
      .replace(/^failed:\s*/i, '')
      .replace(/^failed to\s+\w+\s+[^:]+:\s*/i, '')
      .replace(/^\w+\s+failed:\s*[^:]+:\s*/i, '')
    if (stripped === reason) break
    reason = stripped
  }

  return reason
}

function normalizeErrorText(value: string): string {
  return compactToolFailureReason(value).replace(/\s+/g, ' ').trim().toLowerCase()
}

function shortDisplayPath(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || normalized
}

function replacementCount(): number {
  const edits = props.view.toolCall.arguments?.edits
  return Array.isArray(edits) && edits.length > 0 ? edits.length : 1
}

watch(
  () => props.view.streamingContent?.content,
  () => {
    nextTick(() => {
      streamingPreviewRef.value?.scrollToBottom()
    })
  },
  { immediate: true },
)
</script>

<style scoped>
.tool-step-details {
  --tool-pane-max: clamp(148px, 28vh, 240px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 0;
  font-family: var(--tool-font-sans);
}

.detail-section {
  min-width: 0;
  padding: 0;
  border-top: 0;
}

.detail-section:has(.bash-output) {
  padding: 0;
}

.detail-section:first-child {
  border-top: 0;
}

.detail-section.live {
  padding: 0;
}

.detail-section.result-section {
  padding: 0;
}

.detail-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  letter-spacing: 0;
}

pre {
  margin: 0;
  max-height: var(--tool-pane-max);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 30%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)) 42%, transparent);
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking {
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, transparent);
  border-radius: 6px;
}

.summary {
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 35%, transparent);
  border-radius: 6px;
}

.error-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 30%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  border-radius: 6px;
}

.rejection-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  border-radius: 6px;
}

.error-section {
  padding-top: 12px;
  padding-bottom: 12px;
}

.error-details {
  max-width: 72ch;
  margin-top: 8px;
}

.error-details summary {
  cursor: pointer;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 400;
}

.error-details pre {
  margin-top: 6px;
  max-height: calc(var(--tool-pane-max) * 0.6);
  padding: 7px 9px;
}

.failed-edit-section {
  padding-top: 2px;
}

.failed-edit-snippet {
  max-width: 72ch;
  max-height: calc(var(--tool-pane-max) * 0.6);
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 30%, transparent);
  font-size: var(--tool-font-size-line, 11.5px);
}

.failed-edit-snippet + .failed-edit-snippet {
  margin-top: 6px;
}

.detail-note-row {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  max-width: calc(62ch + 28px);
  padding: 6px 0 7px;
  border-top: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 60%, transparent);
}

.detail-note-icon {
  flex: 0 0 auto;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  opacity: 0.72;
}

.detail-note-row.failed .detail-note-icon {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
}

.detail-note {
  max-width: 62ch;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 400;
  line-height: var(--tool-line-height);
  opacity: 0.82;
}
</style>
