<template>
  <div class="tool-step-details">
    <div
      v-if="failedEditDetails"
      class="detail-section failed-edit-section"
    >
      <div class="failed-edit-heading">
        <div class="detail-label">
          Failed edit parameters
        </div>
        <div
          v-if="failedEditDetails.summary"
          class="failed-edit-summary"
        >
          {{ failedEditDetails.summary }}
        </div>
      </div>

      <dl
        v-if="failedEditDetails.params.length"
        class="failed-edit-param-list"
      >
        <template
          v-for="param in failedEditDetails.params"
          :key="param.label"
        >
          <dt class="failed-edit-param-label">
            {{ param.label }}
          </dt>
          <dd
            class="failed-edit-param-value"
            :title="param.value"
          >
            {{ param.value }}
          </dd>
        </template>
      </dl>

      <div
        v-if="failedEditDetails.attempts.length"
        class="failed-edit-attempts"
      >
        <div
          v-for="attempt in failedEditDetails.attempts"
          :key="attempt.index"
          class="failed-edit-attempt"
        >
          <div class="failed-edit-attempt-title">
            {{ failedEditDetails.attempts.length > 1 ? `Edit ${attempt.index + 1}` : 'Edit' }}
          </div>

          <template v-if="attempt.oldTextPresent">
            <div class="failed-edit-snippet-label">
              Old string
            </div>
            <pre
              class="failed-edit-snippet"
              :class="{ 'is-empty': !attempt.oldText }"
            >{{ displayEditText(attempt.oldText) }}</pre>
          </template>

          <template v-if="attempt.newTextPresent">
            <div class="failed-edit-snippet-label">
              New string
            </div>
            <pre
              class="failed-edit-snippet replacement"
              :class="{ 'is-empty': !attempt.newText }"
            >{{ displayEditText(attempt.newText) }}</pre>
          </template>

          <dl
            v-if="attempt.extraParams.length"
            class="failed-edit-param-list compact"
          >
            <template
              v-for="param in attempt.extraParams"
              :key="param.label"
            >
              <dt class="failed-edit-param-label">
                {{ param.label }}
              </dt>
              <dd
                class="failed-edit-param-value"
                :title="param.value"
              >
                {{ param.value }}
              </dd>
            </template>
          </dl>
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
const showErrorSection = computed(() => !isFailedEdit.value && !!props.view.step.error && showErrorDetails.value)

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
  padding-top: 1px;
}

.failed-edit-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  max-width: 72ch;
  margin-bottom: 8px;
}

.failed-edit-heading .detail-label {
  margin-bottom: 0;
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

.failed-edit-param-list {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 9px;
  max-width: 72ch;
  margin: 0 0 9px;
}

.failed-edit-param-list.compact {
  margin: 7px 0 0;
}

.failed-edit-param-label {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  line-height: var(--tool-line-height);
}

.failed-edit-param-value {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-meta);
  line-height: var(--tool-line-height);
}

.failed-edit-attempts {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.failed-edit-attempt {
  max-width: 72ch;
  min-width: 0;
  padding-left: 10px;
  border-left: 2px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 48%, transparent);
}

.failed-edit-attempt-title,
.failed-edit-snippet-label {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  line-height: var(--tool-line-height);
}

.failed-edit-attempt-title {
  margin-bottom: 5px;
}

.failed-edit-snippet-label {
  margin: 6px 0 4px;
}

.failed-edit-snippet {
  max-width: 100%;
  max-height: calc(var(--tool-pane-max) * 0.62);
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
  font-size: var(--tool-font-size-line, 11.5px);
}

.failed-edit-snippet.replacement {
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-add-bar)) 4%, var(--ui-tool-surface-subtle-bg, var(--tool-surface-sub)));
}

.failed-edit-snippet.is-empty {
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  font-style: italic;
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
