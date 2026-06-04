<template>
  <div
    :class="[
      'tool-step',
      `render-${view.status}`,
      { expanded, 'needs-confirm': view.isAwaitingConfirmation },
    ]"
  >
    <div
      class="tool-step-main"
      :class="{ clickable: view.hasDetails }"
      @click="onMainClick"
    >
      <span
        class="status-icon"
        :class="view.status"
        :title="statusTitle"
      >
        <span
          v-if="view.status === 'streaming-input' || view.status === 'executing'"
          class="spinner"
        />
        <Check
          v-else-if="view.status === 'completed'"
          :size="13"
          :stroke-width="2.4"
        />
        <Ban
          v-else-if="view.status === 'rejected'"
          :size="13"
          :stroke-width="2.2"
        />
        <X
          v-else-if="view.status === 'failed'"
          :size="13"
          :stroke-width="2.4"
        />
        <Minus
          v-else-if="view.status === 'cancelled'"
          :size="13"
          :stroke-width="2.4"
        />
        <AlertTriangle
          v-else-if="view.status === 'awaiting-confirmation'"
          :size="13"
          :stroke-width="2.2"
        />
        <Circle
          v-else
          :size="10"
          :stroke-width="2.4"
        />
      </span>

      <span class="tool-copy">
        <span class="tool-name">{{ view.displayName }}</span>
        <button
          v-if="view.preview && canOpenFile"
          class="tool-preview"
          type="button"
          :title="view.filePath"
          @click.stop="emit('open-file', view.filePath)"
          @keydown.stop
        >
          {{ view.preview }}
        </button>
        <span
          v-else-if="view.preview"
          class="tool-preview"
        >{{ view.preview }}</span>
      </span>

      <span class="spacer" />

      <span
        v-if="view.inlineResult && !view.errorPreview"
        class="step-result"
      >{{ view.inlineResult }}</span>
      <span
        v-if="view.errorPreview"
        class="error-tag"
        :class="{ rejected: view.status === 'rejected' }"
      >{{ view.errorPreview }}</span>

      <!-- Diff header controls (single fixed header for the expanded diff) -->
      <div
        v-if="showDiffMeta"
        class="diff-meta"
        @click.stop
      >
        <span class="diff-meta-stats">
          <span class="additions">+{{ activeDiff?.additions || 0 }}</span>
          <span class="deletions">-{{ activeDiff?.deletions || 0 }}</span>
        </span>
        <span
          v-if="view.status === 'executing'"
          class="diff-meta-badge applying"
        >Applying</span>
        <span
          v-else-if="view.status === 'completed'"
          class="diff-meta-badge"
        >Applied</span>
        <button
          class="diff-meta-btn"
          :class="{ active: wrap }"
          type="button"
          :title="wrap ? 'Disable soft wrap' : 'Wrap long lines'"
          :aria-pressed="wrap"
          @click="wrap = !wrap"
        >
          <WrapText
            :size="13"
            :stroke-width="2"
          />
        </button>
        <button
          v-if="canRollback"
          class="diff-meta-btn rollback-btn"
          :class="{ done: rollbackState === 'done', failed: rollbackState === 'failed' }"
          type="button"
          :disabled="rollbackState === 'running' || rollbackState === 'done'"
          :title="rollbackTitle"
          @click="rollbackDiff"
        >
          <RotateCcw
            :size="13"
            :stroke-width="2"
          />
        </button>
        <span
          v-if="rollbackState === 'done'"
          class="rollback-status done"
        >Rolled back</span>
        <span
          v-else-if="rollbackState === 'failed'"
          class="rollback-status failed"
        >{{ rollbackError }}</span>
        <button
          class="diff-meta-btn"
          type="button"
          :title="copied ? 'Copied!' : 'Copy diff'"
          @click="copyDiff"
        >
          <Check
            v-if="copied"
            :size="13"
            :stroke-width="2"
          />
          <Copy
            v-else
            :size="13"
            :stroke-width="2"
          />
        </button>
      </div>

      <ChevronDown
        :class="['expand-icon', { rotated: expanded, placeholder: view.isAwaitingConfirmation || !view.hasDetails }]"
        :size="14"
        :stroke-width="2"
        :aria-hidden="view.isAwaitingConfirmation || !view.hasDetails"
      />
    </div>

    <div
      v-show="expanded"
      class="tool-step-details"
    >
      <ToolStepDetails
        :view="view"
        :wrap="wrap"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, Ban, Check, ChevronDown, Circle, Copy, Minus, RotateCcw, WrapText, X } from 'lucide-vue-next'
import type { ToolCall } from '@/types'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import { copyTextToClipboard } from '@/utils/clipboard'
import ToolStepDetails from './ToolStepDetails.vue'

const props = defineProps<{
  view: ToolStepView
  expanded: boolean
}>()

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once']
  reject: [toolCall: ToolCall]
  'open-file': [filePath: string]
  'toggle-expand': []
}>()

const canOpenFile = computed(() =>
  !!props.view.filePath && ['read', 'write', 'edit'].includes(props.view.toolName),
)

// Diff header lives on this outer row when expanded (single fixed header for
// the diff). The expanded diff card below only renders content.
const wrap = ref(false)
const copied = ref(false)
const rollbackState = ref<'idle' | 'running' | 'done' | 'failed'>('idle')
const rollbackError = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let rollbackTimer: ReturnType<typeof setTimeout> | null = null

const activeDiff = computed(() => props.view.diff || props.view.streamingDiff)
const activeDiffLines = computed(() =>
  props.view.diff ? props.view.diffLines : props.view.streamingDiffLines,
)
const showDiffMeta = computed(() => props.expanded && !!activeDiff.value)
const canRollback = computed(() =>
  props.view.status === 'completed' &&
  !!props.view.diff?.auditPath &&
  ['edit', 'write'].includes(props.view.toolName),
)
const rollbackTitle = computed(() => {
  if (rollbackState.value === 'running') return 'Rolling back...'
  if (rollbackState.value === 'done') return 'Rolled back'
  if (rollbackState.value === 'failed') return rollbackError.value || 'Rollback failed'
  return 'Rollback this file change'
})

async function rollbackDiff() {
  const auditPath = props.view.diff?.auditPath
  if (!auditPath || rollbackState.value === 'running' || rollbackState.value === 'done') return
  const fileName = props.view.filePath || 'this file'
  const confirmed = window.confirm(`Rollback changes to ${fileName}? This only succeeds if the file still matches the audited post-change content.`)
  if (!confirmed) return

  rollbackState.value = 'running'
  rollbackError.value = ''
  if (rollbackTimer) clearTimeout(rollbackTimer)
  try {
    const result = await window.electronAPI.rollbackFile({ auditPath })
    if (!result.success) throw new Error(result.error || 'Rollback failed')
    rollbackState.value = 'done'
  } catch (error: any) {
    rollbackError.value = error?.message || 'Rollback failed'
    rollbackState.value = 'failed'
  }
}

async function copyDiff() {
  const text = activeDiffLines.value
    .filter(line => line.class !== 'diff-hunk')
    .map(line => `${line.prefix}${line.content}`)
    .join('\n')
  if (!text) return
  if (!(await copyTextToClipboard(text))) return
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

function onMainClick() {
  if (props.view.hasDetails) emit('toggle-expand')
}

const statusTitle = computed(() => {
  switch (props.view.status) {
    case 'queued': return 'Queued'
    case 'streaming-input': return 'Reading tool input'
    case 'executing': return 'Running'
    case 'awaiting-confirmation': return 'Needs confirmation'
    case 'completed': return 'Completed'
    case 'rejected': return 'User rejected'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
})
</script>

<style scoped>
.tool-step {
  --tool-step-surface: color-mix(in srgb, var(--ui-tool-surface-bg, var(--bg-tool-call)) 78%, transparent);
  --tool-step-surface-hover: color-mix(in srgb, var(--ui-tool-surface-hover-bg, var(--bg-tool-call-hover)) 72%, transparent);
  --tool-step-border: color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 72%, transparent);
  --tool-step-shadow: 0 1px 0 color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 52%, transparent);
  position: relative;
  font-size: var(--type-label-size, 13px);
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  margin: 3px 0;
  transition:
    background var(--duration-fast, 0.15s) var(--ease-default, ease),
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.tool-step:hover,
.tool-step.expanded {
  background: var(--tool-step-surface);
  border-color: var(--tool-step-border);
  box-shadow: var(--tool-step-shadow);
}

.tool-step.needs-confirm {
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 8%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 26%, transparent);
}

.tool-step.needs-confirm:hover,
.tool-step.needs-confirm.expanded {
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 11%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 34%, transparent);
}

.tool-step-main {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 5px 8px;
  min-height: 34px;
  overflow: hidden;
  user-select: none;
}

.tool-step-main.clickable {
  cursor: pointer;
}

.status-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-full, 999px);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 66%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 78%, transparent);
}

.status-icon.completed {
  color: var(--ui-status-success-fg, var(--text-success));
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-success-border, var(--border-success)) 26%, transparent);
}

.status-icon.failed {
  color: var(--ui-status-danger-fg, var(--text-error));
  background: color-mix(in srgb, var(--ui-status-danger-fg, var(--color-danger)) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-danger-border, var(--border-error)) 26%, transparent);
}

.status-icon.rejected {
  color: var(--ui-status-warning-fg, var(--text-warning));
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 26%, transparent);
}

.status-icon.executing,
.status-icon.streaming-input {
  color: var(--ui-tool-accent-fg, var(--accent));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--accent)) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--accent)) 26%, transparent);
}

.status-icon.cancelled {
  color: var(--ui-text-faint-fg, var(--text-faint));
  opacity: 0.75;
}

.status-icon.awaiting-confirmation {
  color: var(--ui-status-warning-fg, var(--text-warning));
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 13%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 30%, transparent);
}

.status-icon.pending,
.status-icon.queued {
  color: var(--ui-text-faint-fg, var(--text-faint));
}

.spinner {
  width: 11px;
  height: 11px;
  border: 1.7px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-copy {
  display: flex;
  align-items: baseline;
  gap: var(--space-2, 8px);
  min-width: 0;
  flex: 1 1 auto;
}

.tool-name {
  color: var(--ui-tool-text-fg, var(--text-tool-name));
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0;
}

.tool-preview {
  min-width: 0;
  color: var(--ui-tool-text-muted-fg, var(--text-tool-args));
  font-family: var(--font-mono);
  font-size: var(--font-size-sm, 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.9;
}

button.tool-preview {
  border: 0;
  padding: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

button.tool-preview:hover {
  color: var(--ui-text-link-fg, var(--text-link));
  text-decoration: underline;
}

.spacer {
  flex: 0 0 auto;
  min-width: 8px;
}

.step-result {
  font-size: var(--font-size-xs, 11px);
  color: var(--ui-text-muted-fg, var(--text-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
  flex-shrink: 1;
  opacity: 0.5;
}

.error-tag {
  font-size: var(--font-size-xs, 11px);
  color: var(--ui-status-danger-fg, var(--text-error));
  background: color-mix(in srgb, var(--ui-status-danger-fg, var(--color-danger)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-status-danger-border, var(--border-error)) 18%, transparent);
  padding: 2px 7px;
  border-radius: var(--radius-xs, 4px);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.error-tag.rejected {
  color: var(--ui-status-warning-fg, var(--text-warning));
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 20%, transparent);
}

/* Diff header controls — fixed (non-scrolling) header for the expanded diff */
.diff-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-shrink: 0;
}

.diff-meta-stats {
  display: flex;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-semibold, 600);
}

.diff-meta-stats .additions {
  color: var(--ui-status-success-fg, var(--text-success));
}

.diff-meta-stats .deletions {
  color: var(--ui-status-danger-fg, var(--text-error));
}

.diff-meta-badge {
  font-size: 10px;
  font-weight: var(--font-weight-semibold, 600);
  padding: 2px 6px;
  border-radius: var(--radius-full, 999px);
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 12%, transparent);
  color: var(--ui-status-success-fg, var(--text-success));
  border: 1px solid color-mix(in srgb, var(--ui-status-success-border, var(--border-success)) 18%, transparent);
}

.diff-meta-badge.applying {
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--accent)) 12%, transparent);
  color: var(--ui-tool-accent-fg, var(--accent));
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--accent)) 20%, transparent);
}

.diff-meta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  border-radius: var(--radius-xs, 4px);
  color: var(--ui-text-faint-fg, var(--text-faint));
  cursor: pointer;
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.diff-meta-btn:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--bg-hover));
  border-color: var(--ui-border-default-border, var(--border-default, var(--border)));
  color: var(--ui-tool-text-fg, var(--text-tool-name));
}

.diff-meta-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.diff-meta-btn.rollback-btn {
  color: var(--ui-status-warning-fg, var(--text-warning, var(--text-faint)));
}

.diff-meta-btn.rollback-btn.done {
  color: var(--ui-status-success-fg, var(--text-success));
}

.diff-meta-btn.rollback-btn.failed {
  color: var(--ui-status-danger-fg, var(--text-danger, var(--text-error)));
}

.rollback-status {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.rollback-status.done {
  color: var(--ui-status-success-fg, var(--text-success));
}

.rollback-status.failed {
  color: var(--ui-status-danger-fg, var(--text-danger, var(--text-error)));
}

.diff-meta-btn.active {
  background: var(--ui-state-selected-bg, var(--bg-selected));
  border-color: var(--ui-state-selected-border, var(--border-accent));
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.confirm-buttons {
  display: flex;
  gap: var(--space-1, 4px);
  flex-shrink: 0;
  align-items: center;
}

.btn-reject {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm, 8px);
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--ui-status-danger-border, var(--border-error)) 18%, transparent);
  background: color-mix(in srgb, var(--ui-status-danger-fg, var(--color-danger)) 5%, transparent);
  color: var(--ui-text-muted-fg, var(--text-muted));
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
  white-space: nowrap;
}

.btn-reject:hover {
  color: var(--ui-status-danger-fg, var(--text-error));
  background: color-mix(in srgb, var(--ui-status-danger-fg, var(--color-danger)) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-danger-border, var(--border-error)) 28%, transparent);
}

.expand-icon {
  color: var(--ui-text-faint-fg, var(--text-faint));
  flex-shrink: 0;
  transition:
    transform var(--duration-normal, 0.2s) var(--ease-default, ease),
    color var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.tool-step:hover .expand-icon {
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.expand-icon.placeholder {
  opacity: 0;
}

.tool-step-details {
  padding: 0 8px 8px 38px;
}
</style>
