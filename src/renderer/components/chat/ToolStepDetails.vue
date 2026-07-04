<template>
  <div
    ref="detailsRef"
    class="tool-step-details"
    @wheel="handleWheel"
  >
    <dl
      v-if="argEntries.length"
      class="detail-args"
    >
      <template
        v-for="entry in argEntries"
        :key="entry.key"
      >
        <dt class="detail-arg-key">
          {{ entry.key }}
        </dt>
        <dd
          class="detail-arg-value"
          :title="entry.value"
        >
          {{ entry.value }}
        </dd>
      </template>
    </dl>

    <!-- Failed edit: old/new merged into one compact "intent diff" —
         the change the model wanted to make but couldn't apply. -->
    <div
      v-if="failedEditDetails"
      class="detail-section failed-edit-section"
    >
      <div
        v-if="failedEditDetails.summary"
        class="failed-edit-summary"
      >
        {{ failedEditDetails.summary }}
      </div>
      <div
        v-for="attempt in failedEditDetails.attempts"
        :key="attempt.index"
        class="intent-diff"
      >
        <div
          v-for="(line, lineIndex) in buildIntentLines(attempt)"
          :key="`${attempt.index}-${lineIndex}`"
          class="intent-line"
          :class="line.kind"
        >
          <span class="intent-sign">{{ line.kind === 'del' ? '-' : '+' }}</span><span class="intent-text">{{ line.text }}</span>
        </div>
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

    <!-- Result output only when the diff doesn't already tell the story:
         successful edit/write results ("Successfully edited …") duplicate
         the row title + diff and are suppressed. -->
    <template v-if="!activeDiff && !isFailedEdit">
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
import type { ToolPartialResult } from '@/types'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import { getToolUiCategory } from '@/stores/helpers/tool-ui-registry'
import { chainWheelToScrollableAncestor, findScrollableWheelSource } from '@/utils/scroll-chain'
import ToolDiffPreview from './ToolDiffPreview.vue'
import ToolResultRenderer from './ToolResultRenderer.vue'

interface FailedEditParam {
  label: string
  value: string
}

interface FailedEditAttempt {
  index: number
  oldText: string
  oldTextPresent: boolean
  newText: string
  newTextPresent: boolean
  extraParams: FailedEditParam[]
}

interface FailedEditDetails {
  summary: string
  params: FailedEditParam[]
  attempts: FailedEditAttempt[]
}

const props = defineProps<{
  view: ToolStepView
  /** Soft-wrap long diff lines (controlled by the outer tool-step header) */
  wrap?: boolean
}>()

const streamingPreviewRef = ref<InstanceType<typeof ToolDiffPreview> | null>(null)
const detailsRef = ref<HTMLElement | null>(null)

const activeDiff = computed(() => props.view.diff || props.view.streamingDiff)
const activeDiffLines = computed(() => props.view.diff ? props.view.diffLines : props.view.streamingDiffLines)
const isFailedEdit = computed(() => props.view.toolName === 'edit' && (props.view.status === 'failed' || props.view.status === 'rejected'))
const failedEditDetails = computed<FailedEditDetails | null>(() => {
  if (props.view.toolName !== 'edit' || props.view.status !== 'failed') return null
  const args = props.view.toolCall.arguments || {}
  const edits = Array.isArray(args.edits) ? args.edits : []
  const params: FailedEditParam[] = []
  const path = typeof args.path === 'string' ? args.path : ''

  if (path) {
    params.push({ label: 'Path', value: path })
  }
  if (edits.length) {
    params.push({ label: 'Edits', value: String(edits.length) })
  }

  for (const [key, value] of Object.entries(args)) {
    if (key === 'path' || key === 'edits') continue
    params.push({ label: key, value: formatParamValue(value) })
  }

  const attempts = edits
    .map((edit: unknown, index): FailedEditAttempt | null => {
      if (!isRecord(edit)) return null
      const oldTextPresent = hasOwn(edit, 'oldText')
      const newTextPresent = hasOwn(edit, 'newText')
      const extraParams = Object.entries(edit)
        .filter(([key]) => key !== 'oldText' && key !== 'newText')
        .map(([key, value]) => ({ label: key, value: formatParamValue(value) }))

      return {
        index,
        oldText: oldTextPresent ? formatEditText(edit.oldText) : '',
        oldTextPresent,
        newText: newTextPresent ? formatEditText(edit.newText) : '',
        newTextPresent,
        extraParams,
      }
    })
    .filter((attempt): attempt is FailedEditAttempt => attempt !== null)

  if (!params.length && !attempts.length) return null

  const summary = [
    path ? shortDisplayPath(path) : '',
    attempts.length ? `${attempts.length} ${attempts.length === 1 ? 'edit' : 'edits'}` : '',
  ].filter(Boolean).join(' · ')

  return { summary, params, attempts }
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
interface IntentDiffLine {
  kind: 'del' | 'add'
  text: string
}

function buildIntentLines(attempt: FailedEditAttempt): IntentDiffLine[] {
  const lines: IntentDiffLine[] = []
  if (attempt.oldTextPresent) {
    for (const text of displayEditText(attempt.oldText).split('\n')) {
      lines.push({ kind: 'del', text })
    }
  }
  if (attempt.newTextPresent) {
    for (const text of displayEditText(attempt.newText).split('\n')) {
      lines.push({ kind: 'add', text })
    }
  }
  return lines
}

interface ArgEntry {
  key: string
  value: string
}

const ARG_VALUE_MAX = 600

/**
 * Structured arguments for tools whose parameters carry information beyond
 * the row title (console/search/mcp/unknown). File tools skip this — their
 * path is the title and their content is the diff. The bash command is
 * always included IN FULL: the single-line row title truncates, so the
 * expanded details are the guaranteed place to read the whole command.
 */
const argEntries = computed<ArgEntry[]>(() => {
  const category = getToolUiCategory(props.view.toolName)
  if (category === 'read' || category === 'write' || category === 'edit' || category === 'fart') return []
  const args = props.view.toolCall.arguments || {}
  return Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => {
      const text = formatParamValue(value)
      const isFullValueKey = props.view.toolName === 'bash' && key === 'command'
      return {
        key,
        value: !isFullValueKey && text.length > ARG_VALUE_MAX
          ? `${text.slice(0, ARG_VALUE_MAX - 1)}…`
          : text,
      }
    })
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatEditText(value: unknown): string {
  return typeof value === 'string' ? value : formatParamValue(value)
}

function displayEditText(value: string): string {
  return value.length ? value : '(empty string)'
}

function handleWheel(event: WheelEvent) {
  chainWheelToScrollableAncestor(event, findScrollableWheelSource(event, detailsRef.value))
}

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
  padding: 2px 0 2px 10px;
  border-left: 2px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 60%, transparent);
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
  padding: 2px 0;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
  font-weight: 400;
  line-height: var(--tool-code-line-height);
  white-space: pre-wrap;
  word-break: break-word;
}

.thinking {
  padding: 4px 0 4px 10px;
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 4%, transparent);
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, transparent);
}

.summary {
  padding: 4px 0 4px 10px;
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 4%, transparent);
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 35%, transparent);
}

.error-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  padding: 4px 0 4px 10px;
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 4%, transparent);
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 30%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}

.rejection-text {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  padding: 4px 0 4px 10px;
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 4%, transparent);
  border-left: 3px solid color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, transparent);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
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
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 1px;
}

.failed-edit-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Intent diff: the edit the model wanted (old = -, new = +) in one block. */
.intent-diff {
  max-width: 100%;
  max-height: clamp(96px, 20vh, 160px);
  overflow: auto;
  overscroll-behavior: contain;
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-line, 11.5px);
  line-height: var(--tool-code-line-height);
}

.intent-line {
  display: flex;
  align-items: baseline;
  white-space: pre-wrap;
  word-break: break-word;
}

.intent-sign {
  flex: 0 0 auto;
  width: 14px;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
}

.intent-line.del {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 5%, transparent);
}

.intent-line.del .intent-sign {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
}

.intent-line.add {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-add-bar)) 5%, transparent);
}

.intent-line.add .intent-sign {
  color: var(--ui-tool-success-text-fg, var(--tool-add-bar));
}

/* Structured arguments (console/search/mcp/unknown tools). */
.detail-args {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 9px;
  max-width: 100%;
  margin: 0;
}

.detail-arg-key {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  line-height: var(--tool-line-height);
}

.detail-arg-value {
  min-width: 0;
  max-height: clamp(48px, 12vh, 96px);
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}
</style>
