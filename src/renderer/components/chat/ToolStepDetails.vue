<template>
  <div class="tool-step-details">
    <div
      v-if="view.argsJson"
      class="detail-section args-section"
    >
      <button
        class="args-toggle"
        type="button"
        :aria-expanded="argsExpanded"
        @click="argsExpanded = !argsExpanded"
      >
        <ChevronRight
          :class="['args-toggle-icon', { open: argsExpanded }]"
          :size="13"
          :stroke-width="2.2"
        />
        <Code2 :size="13" />
        <span>{{ view.toolName === 'bash' ? 'Command' : 'Arguments' }}</span>
      </button>
      <div
        v-if="argsExpanded"
        class="terminal-card"
      >
        <div class="terminal-header">
          <span class="terminal-title">{{ view.toolName === 'bash' ? 'bash' : 'arguments.json' }}</span>
        </div>
        <pre
          class="code-block"
          :class="{ 'command-block': view.toolName === 'bash' }"
        >{{ view.argsJson }}</pre>
      </div>
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
        class="detail-section"
      >
        <pre>{{ compactOutput(view.liveOutput) }}</pre>
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
      v-if="view.step.error"
      class="detail-section error-section"
      :class="view.status === 'rejected' ? 'rejection' : 'error'"
    >
      <div class="detail-label">
        {{ view.status === 'rejected' ? 'Rejected' : 'Error' }}
      </div>
      <div class="error-summary">
        {{ errorSummary }}
      </div>
      <div
        v-if="errorNextAction"
        class="error-next-action"
      >
        <span>Next</span>
        <p>{{ errorNextAction }}</p>
      </div>
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
import { Check, ChevronRight, Code2, X } from 'lucide-vue-next'
import { summarizeToolFailureParameters } from '@shared/tool-failure-params'
import type { ToolPartialResult } from '@/types'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import { buildErrorSummary, buildNextAction } from '@/stores/helpers/tool-activity-view'
import ToolDiffPreview from './ToolDiffPreview.vue'
import ToolResultRenderer from './ToolResultRenderer.vue'

const props = defineProps<{
  view: ToolStepView
  /** Soft-wrap long diff lines (controlled by the outer tool-step header) */
  wrap?: boolean
}>()

const streamingPreviewRef = ref<InstanceType<typeof ToolDiffPreview> | null>(null)
const argsExpanded = ref(false)

const activeDiff = computed(() => props.view.diff || props.view.streamingDiff)
const activeDiffLines = computed(() => props.view.diff ? props.view.diffLines : props.view.streamingDiffLines)
const isFailedEdit = computed(() => props.view.toolName === 'edit' && (props.view.status === 'failed' || props.view.status === 'rejected'))
const resultRenderKind = computed(() => props.view.toolName === 'bash' ? 'bash' : 'text')
const resultForRenderer = computed<ToolPartialResult | null>(() => {
  if (!props.view.resultText) return null
  return { content: [{ type: 'text', text: props.view.resultText }] }
})
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
const errorSummary = computed(() => buildErrorSummary(
  props.view.step,
  props.view.toolCall,
  props.view.toolName,
  props.view.filePath,
  props.view.status,
))
const errorNextAction = computed(() => buildNextAction(props.view.toolName, props.view.status))
const failureParametersJson = computed(() => {
  const parameters = failureParameterSummary.value?.parameters
  return parameters ? JSON.stringify(parameters, null, 2) : ''
})

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
  padding: 10px 24px;
  border-top: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 60%, transparent);
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
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

pre {
  margin: 0;
  max-height: 280px;
  overflow: auto;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius-sm, 8px);
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
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, transparent);
  border-radius: var(--radius-xs, 4px);
}

.summary {
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 35%, transparent);
  border-radius: var(--radius-xs, 4px);
}

.error-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 30%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  border-radius: var(--radius-xs, 4px);
}

.rejection-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  border-radius: var(--radius-xs, 4px);
}

.error-section {
  padding-top: 12px;
  padding-bottom: 12px;
}

.error-summary {
  max-width: 62ch;
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-body);
  font-weight: 500;
  line-height: var(--tool-line-height);
}

.error-next-action {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  max-width: 72ch;
  margin-top: 8px;
  padding: 7px 9px;
  border-left: 2px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 46%, transparent);
  border-radius: var(--radius-xs, 4px);
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 5%, transparent);
}

.error-next-action span {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
  font-family: var(--tool-font-sans);
  font-size: 10px;
  font-weight: 650;
  line-height: var(--tool-line-height);
  text-transform: uppercase;
}

.error-next-action p {
  margin: 0;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
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
  padding: 0;
}

.args-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 8px 24px;
  border: 0;
  background: transparent;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
}

.args-toggle:hover {
  background: color-mix(in srgb, var(--ui-tool-text-fg, var(--tool-ink)) 4%, transparent);
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.args-toggle-icon {
  flex: 0 0 auto;
  transition: transform 0.14s ease;
}

.args-toggle-icon.open {
  transform: rotate(90deg);
}

/* macOS Terminal Console styling for JSON arguments */
.terminal-card {
  margin: 4px 24px 12px;
  background: color-mix(in srgb, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)) 64%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 42%, transparent);
  border-radius: 6px;
  overflow: hidden;
}

.terminal-header {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: transparent;
  border-bottom: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 34%, transparent);
}

.terminal-title {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--ui-tool-text-muted-fg);
}

.terminal-card .code-block {
  margin: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  border: 0 !important;
  padding: 10px 14px !important;
  font-size: var(--tool-font-size-line, 11.5px) !important;
  line-height: var(--tool-code-line-height, 1.7) !important;
}

.detail-note-row {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  max-width: calc(62ch + 28px);
  padding: 6px 10px 7px 12px;
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
