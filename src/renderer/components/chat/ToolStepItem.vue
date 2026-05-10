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
        <span
          v-if="view.preview"
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
      >{{ view.errorPreview }}</span>

      <div
        v-if="view.isAwaitingConfirmation"
        class="confirm-buttons"
        @click.stop
      >
        <AllowSplitButton @confirm="(response) => emit('confirm', view.toolCall, response)" />
        <button
          class="btn-reject"
          title="Reject (D/Esc)"
          @click="emit('reject', view.toolCall)"
        >
          Reject
        </button>
      </div>

      <ChevronDown
        v-else-if="view.hasDetails"
        :class="['expand-icon', { rotated: expanded }]"
        :size="14"
        :stroke-width="2"
      />
    </div>

    <div
      v-show="expanded"
      class="tool-step-details"
    >
      <ToolStepDetails :view="view" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Check, ChevronDown, Circle, Minus, X } from 'lucide-vue-next'
import type { ToolCall } from '@/types'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import AllowSplitButton from '../common/AllowSplitButton.vue'
import ToolStepDetails from './ToolStepDetails.vue'

const props = defineProps<{
  view: ToolStepView
  expanded: boolean
}>()

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once' | 'session' | 'workdir' | 'always']
  reject: [toolCall: ToolCall]
  'toggle-expand': []
}>()

function onMainClick() {
  if (props.view.hasDetails) emit('toggle-expand')
}

const statusTitle = computed(() => {
  switch (props.view.status) {
    case 'streaming-input': return 'Reading tool input'
    case 'executing': return 'Running'
    case 'awaiting-confirmation': return 'Needs confirmation'
    case 'completed': return 'Completed'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
})
</script>

<style scoped>
.tool-step {
  --tool-step-surface: color-mix(in srgb, var(--bg-tool-call) 78%, transparent);
  --tool-step-surface-hover: color-mix(in srgb, var(--bg-tool-call-hover) 72%, transparent);
  --tool-step-border: color-mix(in srgb, var(--border-subtle) 72%, transparent);
  --tool-step-shadow: 0 1px 0 color-mix(in srgb, var(--border-subtle) 52%, transparent);
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
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 26%, transparent);
}

.tool-step.needs-confirm:hover,
.tool-step.needs-confirm.expanded {
  background: color-mix(in srgb, var(--color-warning) 11%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 34%, transparent);
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
  background: color-mix(in srgb, var(--bg-elevated) 66%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent);
}

.status-icon.completed {
  color: var(--text-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  border-color: color-mix(in srgb, var(--border-success) 26%, transparent);
}

.status-icon.failed {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--border-error) 26%, transparent);
}

.status-icon.executing,
.status-icon.streaming-input {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
}

.status-icon.cancelled {
  color: var(--text-faint);
  opacity: 0.75;
}

.status-icon.awaiting-confirmation {
  color: var(--text-warning);
  background: color-mix(in srgb, var(--color-warning) 13%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 30%, transparent);
}

.status-icon.pending {
  color: var(--text-faint);
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
  color: var(--text-tool-name);
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0;
}

.tool-preview {
  min-width: 0;
  color: var(--text-tool-args);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm, 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.9;
}

.spacer {
  flex: 0 0 auto;
  min-width: 8px;
}

.step-result {
  font-size: var(--font-size-xs, 11px);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
  flex-shrink: 1;
  opacity: 0.5;
}

.error-tag {
  font-size: var(--font-size-xs, 11px);
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-error) 18%, transparent);
  padding: 2px 7px;
  border-radius: var(--radius-xs, 4px);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
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
  border: 1px solid color-mix(in srgb, var(--border-error) 18%, transparent);
  background: color-mix(in srgb, var(--color-danger) 5%, transparent);
  color: var(--text-muted);
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
  white-space: nowrap;
}

.btn-reject:hover {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--border-error) 28%, transparent);
}

.expand-icon {
  color: var(--text-faint);
  flex-shrink: 0;
  transition:
    transform var(--duration-normal, 0.2s) var(--ease-default, ease),
    color var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.tool-step:hover .expand-icon {
  color: var(--text-muted);
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.tool-step-details {
  padding: 0 8px 8px 38px;
}
</style>
