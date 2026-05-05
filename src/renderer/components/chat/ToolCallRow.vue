<template>
  <div
    :class="[
      'tool-row',
      `render-${status}`,
      { expanded, 'needs-confirm': status === 'awaiting-confirmation' },
    ]"
  >
    <div
      class="tool-row-main"
      :class="{ clickable: hasDetails }"
      @click="onMainClick"
    >
      <!-- Status icon — wrapped in mode=out-in so each state change scales
           in via the status-swap transition. Spinner shares one key across
           streaming-input ↔ executing so it doesn't blink between those
           visually-identical phases. -->
      <span
        class="status-icon"
        :class="status"
      >
        <Transition
          name="status-swap"
          mode="out-in"
        >
          <span
            v-if="status === 'streaming-input' || status === 'executing'"
            key="spinner"
            class="spinner"
          />
          <span
            v-else-if="status === 'completed'"
            key="completed"
          >✓</span>
          <span
            v-else-if="status === 'failed'"
            key="failed"
          >✗</span>
          <span
            v-else-if="status === 'cancelled'"
            key="cancelled"
          >—</span>
          <span
            v-else-if="status === 'awaiting-confirmation'"
            key="awaiting"
          >⏳</span>
          <span
            v-else
            key="pending"
          >○</span>
        </Transition>
      </span>

      <!-- Tool name + preview -->
      <span class="tool-name">{{ displayName }}</span>
      <span class="tool-preview">{{ preview }}</span>

      <span class="spacer" />

      <!-- Consumer-supplied right-side meta (inline result, exec time, error tag) -->
      <slot name="meta" />

      <!-- Right-side controls: confirm buttons OR expand chevron — swap
           via opacity fade with mode=out-in. Enter timing kept short so
           confirm buttons stay quickly clickable for keyboard shortcuts. -->
      <Transition
        name="ctrl-swap"
        mode="out-in"
      >
        <div
          v-if="status === 'awaiting-confirmation'"
          key="confirm"
          class="confirm-buttons"
          @click.stop
        >
          <AllowSplitButton @confirm="(r) => emit('confirm', toolCall, r)" />
          <button
            class="btn-reject"
            title="Reject (D/Esc)"
            @click="emit('reject', toolCall)"
          >
            Reject
          </button>
        </div>
        <svg
          v-else-if="hasDetails"
          key="chevron"
          :class="['expand-icon', { rotated: expanded }]"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Transition>
    </div>

    <Transition name="slide">
      <div
        v-if="expanded"
        class="tool-row-details"
      >
        <slot name="details" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Step, ToolCall } from '@/types'
import AllowSplitButton from '../common/AllowSplitButton.vue'
import { getToolRenderStatus, type ToolRenderStatus } from '@/stores/helpers/tool-status'
import { formatToolCallPreview } from '@/stores/helpers/tool-preview'

interface Props {
  toolCall: ToolCall
  step?: Step
  expanded?: boolean
  hasDetails?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false,
  hasDetails: false,
})

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once' | 'session' | 'workspace' | 'always']
  reject: [toolCall: ToolCall]
  'toggle-expand': []
}>()

const status = computed<ToolRenderStatus>(() =>
  getToolRenderStatus(props.toolCall, props.step),
)

const preview = computed(() => formatToolCallPreview(props.toolCall))

const displayName = computed(
  () => props.toolCall.toolName || props.step?.title?.split(':')[0] || 'tool',
)

function onMainClick() {
  if (props.hasDetails) emit('toggle-expand')
}
</script>

<style scoped>
.tool-row {
  font-size: 13px;
  /* Default transparent border so toggling needs-confirm doesn't shift the
     row by 1px. Background, border-color, and border-radius all transition
     together so the awaiting-confirmation tint arrives as one motion. */
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  transition: background 0.15s ease, border-color 0.15s ease, border-radius 0.15s ease;
  margin: 2px 0;
}

.tool-row.needs-confirm {
  background: rgba(208, 162, 21, 0.06);
  border-color: rgba(208, 162, 21, 0.15);
  border-radius: var(--radius-sm, 8px);
}

.tool-row.needs-confirm:hover {
  background: rgba(208, 162, 21, 0.1);
  border-color: rgba(208, 162, 21, 0.25);
}

.tool-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  height: 32px;
  overflow: hidden;
  user-select: none;
}

.tool-row-main.clickable {
  cursor: pointer;
}

.status-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}

.status-icon.completed { color: var(--text-success); }
.status-icon.failed { color: var(--text-error); }
.status-icon.executing { color: var(--accent); }
.status-icon.streaming-input { color: var(--accent); }
.status-icon.cancelled { color: var(--text-muted); opacity: 0.6; }
.status-icon.awaiting-confirmation { color: var(--warning); }
.status-icon.pending { color: var(--text-muted); }

.status-icon .spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
  min-width: 50px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.tool-preview {
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  opacity: 0.8;
}

.spacer {
  flex: 1;
  min-width: 8px;
}

.confirm-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  align-items: center;
}

.btn-reject {
  padding: 4px 10px;
  border-radius: var(--radius-sm, 8px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted, #9F9D96);
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-reject:hover {
  color: var(--text-error, #D14D41);
  background: rgba(209, 77, 65, 0.08);
}

.expand-icon {
  color: var(--text-tertiary, #666);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.tool-row-details {
  padding: 0 10px 8px 34px;
}

/* Slide transition for details */
.slide-enter-active {
  transition: opacity 0.2s ease;
}

.slide-leave-active {
  transition: opacity 0.15s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

/* Status icon swap — scaling page-flip across status changes. Spinner
   shares one key across streaming-input ↔ executing so it doesn't
   blink during that intra-busy transition. */
.status-swap-enter-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.status-swap-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.status-swap-enter-from {
  opacity: 0;
  transform: scale(0.5);
}
.status-swap-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* Right-side control swap — opacity-only fade between confirm buttons
   and expand chevron. Enter is short so confirm buttons stay quickly
   clickable / keyboard-shortcut responsive. */
.ctrl-swap-enter-active {
  transition: opacity 0.18s ease;
}
.ctrl-swap-leave-active {
  transition: opacity 0.12s ease;
}
.ctrl-swap-enter-from,
.ctrl-swap-leave-to {
  opacity: 0;
}

/* Light theme */
html[data-theme='light'] .tool-row.needs-confirm {
  background: rgba(173, 131, 1, 0.06);
  border-color: rgba(173, 131, 1, 0.15);
}

html[data-theme='light'] .tool-row.needs-confirm:hover {
  background: rgba(173, 131, 1, 0.1);
  border-color: rgba(173, 131, 1, 0.25);
}

html[data-theme='light'] .btn-reject {
  color: #878580;
}

html[data-theme='light'] .btn-reject:hover {
  color: #AF3029;
  background: rgba(175, 48, 41, 0.08);
}
</style>
