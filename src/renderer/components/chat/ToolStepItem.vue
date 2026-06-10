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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Ban, Check, Circle, Minus, X } from 'lucide-vue-next'
import type { ToolCall } from '@/types'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import { getActivePinia } from 'pinia'
import { useChatStore } from '@/stores/chat'

import { getFileToolCategory } from '@/stores/helpers/tool-display'

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

const chatStore = getActivePinia() ? useChatStore() : null

const canOpenFile = computed(() =>
  !!props.view.filePath && getFileToolCategory(props.view.toolName) !== null,
)

function onMainClick() {
  const name = props.view.toolName.toLowerCase()
  let tab: 'context' | 'request' | 'browser' | 'diff' | 'console' = 'console'
  if (['web_search', 'web-search', 'websearch', 'web_open', 'web-open', 'webopen', 'web_find', 'web-find', 'webfind'].includes(name)) {
    tab = 'browser'
  } else if (['edit', 'write'].includes(name)) {
    tab = 'diff'
  } else {
    tab = (name === 'read') ? 'diff' : 'console'
  }
  if (chatStore) {
    chatStore.openInspectorToTab(tab, props.view.id)
  }
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
  --tool-step-surface: color-mix(in srgb, var(--ui-tool-surface-bg, var(--bg-tool-call)) 60%, transparent);
  --tool-step-surface-hover: color-mix(in srgb, var(--ui-tool-surface-hover-bg, var(--bg-tool-call-hover)) 75%, transparent);
  --tool-step-border: color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 45%, transparent);
  --tool-step-shadow: 0 4px 12px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.02);
  position: relative;
  font-size: var(--type-label-size, 13px);
  border: 1px solid transparent;
  border-radius: var(--radius-md, 12px);
  background: transparent;
  margin: 6px 0;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition:
    background var(--duration-fast, 0.15s) var(--ease-default, ease),
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease),
    transform var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.tool-step:hover {
  background: var(--tool-step-surface-hover);
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg) 30%, var(--tool-step-border));
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05), 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg) 15%, transparent);
  transform: translateY(-0.5px);
}

.tool-step.expanded {
  background: var(--tool-step-surface);
  border-color: var(--tool-step-border);
  box-shadow: var(--tool-step-shadow);
  transform: none;
}

.tool-step.needs-confirm {
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 8%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 35%, transparent);
  animation: tool-warning-pulse 2s infinite ease-in-out;
}

.tool-step.needs-confirm:hover,
.tool-step.needs-confirm.expanded {
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 11%, transparent);
}

@keyframes tool-warning-pulse {
  0%, 100% {
    box-shadow: 0 0 8px color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 10%, transparent);
    border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 30%, transparent);
  }
  50% {
    box-shadow: 0 0 16px color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 25%, transparent);
    border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 60%, transparent);
  }
}

.tool-step.render-executing,
.tool-step.render-streaming-input {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg) 50%, transparent);
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 2%, var(--tool-step-surface));
  animation: tool-pulse-glow 2s infinite ease-in-out;
}

@keyframes tool-pulse-glow {
  0%, 100% {
    box-shadow: 0 0 8px color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent);
    border-color: color-mix(in srgb, var(--ui-accent-primary-fg) 40%, transparent);
  }
  50% {
    box-shadow: 0 0 16px color-mix(in srgb, var(--ui-accent-primary-fg) 25%, transparent);
    border-color: color-mix(in srgb, var(--ui-accent-primary-fg) 70%, transparent);
  }
}

.tool-step.render-failed {
  background: color-mix(in srgb, var(--ui-status-danger-fg) 4%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-danger-fg) 22%, transparent);
}

.tool-step.render-failed:hover {
  border-color: color-mix(in srgb, var(--ui-status-danger-fg) 45%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--ui-status-danger-fg) 15%, transparent);
}

.tool-step-main {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 6px 12px;
  min-height: 36px;
  overflow: hidden;
  user-select: none;
}

.tool-step-main.clickable {
  cursor: pointer;
}

.status-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-full, 999px);
  background: color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 60%, transparent);
  transition: all 0.2s ease;
}

.status-icon.completed {
  color: var(--ui-status-success-fg, var(--text-success));
  background: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 14%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-success-border, var(--border-success)) 30%, transparent);
}

.status-icon.failed {
  color: var(--ui-status-danger-fg, var(--text-error));
  background: color-mix(in srgb, var(--ui-status-danger-fg) 14%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-danger-border, var(--border-error)) 30%, transparent);
}

.status-icon.rejected {
  color: var(--ui-status-warning-fg, var(--text-warning));
  background: color-mix(in srgb, var(--ui-status-warning-fg) 14%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 30%, transparent);
}

.status-icon.executing,
.status-icon.streaming-input {
  color: var(--ui-tool-accent-fg, var(--ui-accent-primary-fg));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--ui-accent-primary-fg)) 14%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--ui-accent-primary-fg)) 30%, transparent);
}

.status-icon.cancelled {
  color: var(--ui-text-faint-fg, var(--text-faint));
  opacity: 0.75;
}

.status-icon.awaiting-confirmation {
  color: var(--ui-status-warning-fg, var(--text-warning));
  background: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 15%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 34%, transparent);
}

.status-icon.pending,
.status-icon.queued {
  color: var(--ui-text-faint-fg, var(--text-faint));
}

.spinner {
  width: 12px;
  height: 12px;
  border: 1.8px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-copy {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-width: 0;
  flex: 1 1 auto;
}

.tool-name {
  color: var(--ui-tool-text-fg, var(--text-tool-name));
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--font-weight-bold, 700);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: color-mix(in srgb, var(--ui-tool-text-fg) 8%, transparent);
  padding: 2px 6px;
  border-radius: var(--radius-xs, 4px);
}

.tool-preview {
  min-width: 0;
  color: var(--ui-tool-text-muted-fg, var(--text-tool-args));
  font-family: var(--font-mono);
  font-size: var(--font-size-sm, 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
  padding-left: 4px;
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
  background: color-mix(in srgb, var(--ui-status-danger-fg) 10%, transparent);
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
  background: color-mix(in srgb, var(--ui-status-warning-fg) 10%, transparent);
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
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--ui-accent-primary-fg)) 12%, transparent);
  color: var(--ui-tool-accent-fg, var(--ui-accent-primary-fg));
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--ui-accent-primary-fg)) 20%, transparent);
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
  background: color-mix(in srgb, var(--ui-status-danger-fg) 5%, transparent);
  color: var(--ui-text-muted-fg, var(--text-muted));
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
  white-space: nowrap;
}

.btn-reject:hover {
  color: var(--ui-status-danger-fg, var(--text-error));
  background: color-mix(in srgb, var(--ui-status-danger-fg) 10%, transparent);
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

/* Height Transition for Expanded details */
.expand-enter-active,
.expand-leave-active {
  transition: max-height 0.28s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease;
  max-height: 1200px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
