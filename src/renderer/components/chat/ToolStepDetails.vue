<template>
  <div class="tool-step-details">
    <ToolDiffPreview
      v-if="activeDiff && !isFailedEdit"
      ref="streamingPreviewRef"
      :diff="activeDiff"
      :lines="activeDiffLines"
      :status="view.status"
      :wrap="wrap"
    />

    <div
      v-if="activeDiff && successNote && !isFailedEdit"
      class="detail-note-row"
      :class="{ failed: view.status === 'failed' || view.status === 'rejected' }"
    >
      <Check v-if="view.status !== 'failed' && view.status !== 'rejected'" :size="13" class="detail-note-icon" />
      <X v-else :size="13" class="detail-note-icon" />
      <div class="detail-note">{{ successNote }}</div>
    </div>

    <div
      v-else-if="view.step.partialResult"
      class="detail-section live"
    >
      <ToolResultRenderer
        :result="view.step.partialResult"
        :is-partial="view.step.partialResultIsPartial"
        :render-kind="view.toolName === 'bash' ? 'bash' : undefined"
        :tool-name="view.toolName"
      />
    </div>

    <div
      v-else-if="view.liveOutput"
      class="detail-section live"
    >
      <pre>{{ compactOutput(view.liveOutput) }}</pre>
    </div>

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
      v-if="view.argsJson"
      class="detail-section args-section"
    >
      <div class="detail-label">
        <Code2 :size="13" />
        {{ view.toolName === 'bash' ? 'Command' : 'Arguments' }}
      </div>
      <pre
        class="code-block"
        :class="{ 'command-block': view.toolName === 'bash' }"
      >{{ view.argsJson }}</pre>
    </div>

    <div
      v-if="view.resultText && !view.step.partialResult && activeDiff"
      class="detail-note-row"
    >
      <Check :size="13" class="detail-note-icon" />
      <div class="detail-note">{{ successNote || compactOutput(view.resultText) }}</div>
    </div>

    <div
      v-else-if="view.resultText && !view.step.partialResult"
      class="detail-section"
    >
      <pre class="code-block">{{ compactOutput(view.resultText) }}</pre>
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
      v-if="view.step.error"
      class="detail-section error-section"
      :class="view.status === 'rejected' ? 'rejection' : 'error'"
    >
      <div class="detail-label">
        {{ view.status === 'rejected' ? 'Rejected' : 'Error' }}
      </div>
      <div class="error-summary">{{ errorSummary }}</div>
      <pre
        v-if="failureParametersJson"
        class="error-params"
      >{{ failureParametersJson }}</pre>
      <details class="error-details">
        <summary>Details</summary>
        <pre :class="view.status === 'rejected' ? 'rejection-text' : 'error-text'">{{ compactError }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Code2, X } from 'lucide-vue-next'
import { summarizeToolFailureParameters } from '@shared/tool-failure-params'
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
const partialResultText = computed(() => compactOutput(props.view.step.partialResult?.content
  ?.filter(part => part.type === 'text')
  .map(part => part.text ?? '')
  .filter(Boolean)
  .join('\n') || ''))
const successNote = computed(() => {
  if (!activeDiff.value) return ''
  const fallback = partialResultText.value || compactOutput(props.view.resultText || '')
  const path = shortDisplayPath(activeDiff.value.filePath || props.view.filePath)
  const count = replacementCount()
  if (path) {
    const verb = props.view.status === 'failed' || props.view.status === 'rejected' ? 'Attempted edit' : 'Edited'
    return `${verb} ${path} · ${count} ${count === 1 ? 'replacement' : 'replacements'}`
  }
  return fallback.replace(/^Successfully\s+/i, '')
})

const compactError = computed(() => compactErrorText(props.view.step.error || ''))
const failureParameterSummary = computed(() => summarizeToolFailureParameters(
  props.view.toolName,
  props.view.toolCall.arguments,
))
const errorSummary = computed(() => failureParameterSummary.value?.summary || firstErrorLine(props.view.step.error || ''))
const failureParametersJson = computed(() => {
  const parameters = failureParameterSummary.value?.parameters
  return parameters ? JSON.stringify(parameters, null, 2) : ''
})

function compactOutput(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trimEnd()
}

function firstErrorLine(value: string): string {
  return compactOutput(value).split('\n').find(line => line.trim())?.trim() || 'Tool error'
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
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--tool-font-sans);
}

.detail-section {
  min-width: 0;
  padding: 10px 28px;
  border-top: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 70%, var(--ui-tool-text-fg, var(--tool-ink)) 30%);
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

.detail-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

pre {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  padding: 8px 10px;
  border: 0;
  border-radius: calc(var(--tool-radius) - 3px);
  background: var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub));
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking {
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 8%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
}

.summary {
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 8%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 45%, transparent);
}

.error-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 6%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 42%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}

.rejection-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 6%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}

.error-section {
  padding-top: 14px;
  padding-bottom: 14px;
}

.error-summary {
  max-width: 62ch;
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-body);
  font-weight: 500;
  line-height: var(--tool-line-height);
}

.error-params {
  max-width: 72ch;
  max-height: 220px;
  margin-top: 8px;
  padding: 7px 9px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub));
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
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
  max-height: 140px;
  padding: 7px 9px;
}

.args-section {
  padding: 8px 28px 10px;
}

.command-block {
  margin-top: 0;
  padding: 6px 14px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub));
  border-radius: calc(var(--tool-radius) - 3px);
  font-size: var(--tool-font-size-title);
  font-weight: 400;
  line-height: var(--tool-line-height);
}

.detail-note-row {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  max-width: calc(62ch + 28px);
  padding: 6px 10px 7px 12px;
  border-top: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 70%, var(--ui-tool-text-fg, var(--tool-ink)) 30%);
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
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 400;
  line-height: var(--tool-line-height);
  opacity: 0.82;
}

</style>
