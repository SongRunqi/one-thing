<template>
  <div
    v-if="activities.length > 0"
    class="tool-activity-timeline"
    :data-depth="depth"
  >
    <template
      v-for="activity in activities"
      :key="activity.id"
    >
      <FartCallItem
        v-if="activity.isFart"
        :tool-call="activity.toolCall"
      />

      <section
        v-else
        class="tool-activity"
        :class="[
          `status-${activity.status}`,
          {
            expanded: isExpanded(activity),
            awaiting: activity.isAwaitingConfirmation,
            interactive: activity.hasDetails,
          },
        ]"
        data-tool-activity-row
      >
        <div
          class="activity-main"
          :role="activity.hasDetails ? 'button' : undefined"
          :tabindex="activity.hasDetails ? 0 : undefined"
          :aria-expanded="activity.hasDetails ? isExpanded(activity) : undefined"
          @click="toggleActivity(activity)"
          @keydown.enter.prevent="toggleActivity(activity)"
          @keydown.space.prevent="toggleActivity(activity)"
        >
          <span
            class="status-mark"
            :title="statusTitle(activity.status)"
          >
            <Loader2
              v-if="isLive(activity.status)"
              class="spin"
              :size="14"
              :stroke-width="2.2"
            />
            <Check
              v-else-if="activity.status === 'completed'"
              :size="14"
              :stroke-width="2.4"
            />
            <Ban
              v-else-if="activity.status === 'rejected'"
              :size="14"
              :stroke-width="2.2"
            />
            <X
              v-else-if="activity.status === 'failed'"
              :size="14"
              :stroke-width="2.4"
            />
            <Minus
              v-else-if="activity.status === 'cancelled'"
              :size="14"
              :stroke-width="2.4"
            />
            <AlertTriangle
              v-else-if="activity.status === 'awaiting-confirmation'"
              :size="14"
              :stroke-width="2.2"
            />
            <Circle
              v-else
              :size="10"
              :stroke-width="2.4"
            />
          </span>

          <span class="activity-copy">
            <span class="activity-verb">{{ activity.verb }}</span>
            <button
              v-if="activity.canOpenFile"
              class="activity-target link"
              type="button"
              :title="activity.filePath"
              @click.stop="emit('open-file', activity.filePath)"
              @keydown.stop
            >
              {{ activity.target }}
            </button>
            <span
              v-else
              class="activity-target"
            >{{ activity.target }}</span>
          </span>

          <span class="activity-spacer" />

          <span
            v-if="activity.stats"
            class="activity-meta stats"
          >{{ activity.stats }}</span>
          <span
            v-if="activity.duration"
            class="activity-meta duration"
          >{{ activity.duration }}</span>
          <span
            v-if="activity.status === 'awaiting-confirmation'"
            class="activity-badge warning"
          >Confirm</span>
          <span
            v-else-if="activity.status === 'rejected'"
            class="activity-badge rejected"
          >Rejected</span>
          <span
            v-else-if="activity.status === 'failed'"
            class="activity-badge danger"
          >Failed</span>

          <span
            v-if="activity.isAwaitingConfirmation"
            class="confirm-actions"
            @click.stop
          >
            <AllowSplitButton @confirm="(response) => emit('confirm', activity.toolCall, response)" />
            <button
              class="btn-reject"
              type="button"
              @click="emit('reject', activity.toolCall)"
            >
              Reject
            </button>
          </span>

          <ChevronDown
            class="expand-icon"
            :class="{ open: isExpanded(activity), placeholder: !activity.hasDetails }"
            :size="15"
            :stroke-width="2"
            :aria-hidden="!activity.hasDetails"
          />
        </div>

        <div
          v-if="activity.hasDetails && isExpanded(activity)"
          class="activity-details"
        >
          <ToolStepDetails
            :view="detailedView(activity)"
            @open-file="(filePath) => emit('open-file', filePath)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Ban, Check, ChevronDown, Circle, Loader2, Minus, X } from 'lucide-vue-next'
import type { Step, ToolCall } from '@/types'
import {
  buildDetailedToolStepView,
  buildToolActivityViews,
  type ToolActivityView,
} from '@/stores/helpers/tool-activity-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
import type { ToolStepView } from '@/stores/helpers/tool-step-view'
import AllowSplitButton from '../common/AllowSplitButton.vue'
import FartCallItem from './FartCallItem.vue'
import ToolStepDetails from './ToolStepDetails.vue'

const props = withDefaults(defineProps<{
  steps: Step[]
  depth?: number
  parentCollapsed?: boolean
  sessionId?: string
}>(), {
  depth: 0,
  parentCollapsed: false,
  sessionId: '',
})

const emit = defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once' | 'session' | 'workdir' | 'always']
  reject: [toolCall: ToolCall]
  'open-file': [filePath: string]
}>()

const userExpanded = ref<Set<string>>(new Set())
const userCollapsed = ref<Set<string>>(new Set())
const stickyExpanded = ref<Set<string>>(new Set())
const detailCache = new Map<string, { fingerprint: string; view: ToolStepView }>()

const activities = computed(() => buildToolActivityViews(props.steps))

watch(activities, (nextActivities) => {
  const nextIds = new Set(nextActivities.map(activity => activity.id))
  const sticky = new Set(stickyExpanded.value)
  for (const id of sticky) {
    if (!nextIds.has(id)) sticky.delete(id)
  }
  for (const activity of nextActivities) {
    if (activity.isAwaitingConfirmation || activity.status === 'failed' || activity.status === 'rejected') {
      sticky.add(activity.id)
    }
  }
  stickyExpanded.value = sticky
}, { immediate: true })

watch(() => props.parentCollapsed, (collapsed) => {
  if (!collapsed) return
  userExpanded.value = new Set()
  userCollapsed.value = new Set()
  stickyExpanded.value = new Set()
  detailCache.clear()
})

function isLive(status: ToolRenderStatus): boolean {
  return status === 'pending' || status === 'streaming-input' || status === 'executing'
}

function statusTitle(status: ToolRenderStatus): string {
  switch (status) {
    case 'streaming-input': return 'Reading tool input'
    case 'executing': return 'Running'
    case 'awaiting-confirmation': return 'Needs confirmation'
    case 'completed': return 'Completed'
    case 'rejected': return 'User rejected'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
}

function isExpanded(activity: ToolActivityView): boolean {
  if (userCollapsed.value.has(activity.id)) return false
  if (userExpanded.value.has(activity.id)) return true
  if (stickyExpanded.value.has(activity.id)) return true
  return activity.defaultExpanded
}

function toggleActivity(activity: ToolActivityView) {
  if (!activity.hasDetails) return
  const currentlyExpanded = isExpanded(activity)
  const expanded = new Set(userExpanded.value)
  const collapsed = new Set(userCollapsed.value)

  if (currentlyExpanded) {
    expanded.delete(activity.id)
    collapsed.add(activity.id)
    const sticky = new Set(stickyExpanded.value)
    sticky.delete(activity.id)
    stickyExpanded.value = sticky
  } else {
    collapsed.delete(activity.id)
    expanded.add(activity.id)
  }

  userExpanded.value = expanded
  userCollapsed.value = collapsed
}

function detailFingerprint(activity: ToolActivityView): string {
  const toolCall = activity.toolCall
  const changes = toolCall.changes
  return [
    activity.status,
    toolCall.streamingArgs?.length ?? 0,
    typeof activity.step.result === 'string' ? activity.step.result.length : 0,
    activity.step.error?.length ?? 0,
    changes?.diff?.length ?? 0,
    changes?.additions ?? 0,
    changes?.deletions ?? 0,
  ].join(':')
}

function detailedView(activity: ToolActivityView): ToolStepView {
  const fingerprint = detailFingerprint(activity)
  const cached = detailCache.get(activity.id)
  if (cached?.fingerprint === fingerprint) return cached.view
  const view = buildDetailedToolStepView(activity)
  detailCache.set(activity.id, { fingerprint, view })
  return view
}
</script>

<style scoped>
.tool-activity-timeline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 6px;
  color: var(--text-secondary);
}

.tool-activity {
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  transition:
    background var(--duration-fast, 0.15s) var(--ease-default, ease),
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.tool-activity.expanded,
.tool-activity:hover {
  background: color-mix(in srgb, var(--bg-tool-call) 76%, transparent);
  border-color: color-mix(in srgb, var(--border-subtle) 70%, transparent);
}

.tool-activity.awaiting {
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 28%, transparent);
}

.activity-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: inherit;
}

.tool-activity.interactive .activity-main {
  cursor: pointer;
}

.activity-main:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.status-mark {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 999px;
  color: var(--text-faint);
  background: color-mix(in srgb, var(--bg-elevated) 68%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 75%, transparent);
}

.status-completed .status-mark {
  color: var(--text-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  border-color: color-mix(in srgb, var(--border-success) 24%, transparent);
}

.status-failed .status-mark {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--border-error) 24%, transparent);
}

.status-rejected .status-mark {
  color: var(--text-warning);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 24%, transparent);
}

.status-awaiting-confirmation .status-mark {
  color: var(--text-warning);
  background: color-mix(in srgb, var(--color-warning) 13%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 30%, transparent);
}

.status-streaming-input .status-mark,
.status-executing .status-mark,
.status-pending .status-mark {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 11%, transparent);
  border-color: color-mix(in srgb, var(--accent) 24%, transparent);
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.activity-copy {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
  flex: 1 1 auto;
}

.activity-verb {
  color: var(--text-primary);
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  white-space: nowrap;
}

.activity-target {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm, 12px);
}

button.activity-target {
  border: 0;
  padding: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.activity-target.link {
  color: var(--text-link);
}

.activity-target.link:hover {
  text-decoration: underline;
}

.activity-spacer {
  flex: 0 0 8px;
}

.activity-meta,
.activity-badge {
  flex: 0 0 auto;
  font-size: var(--font-size-xs, 11px);
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}

.activity-meta.stats {
  color: var(--text-muted);
}

.activity-badge {
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.activity-badge.warning {
  color: var(--text-warning);
  background: color-mix(in srgb, var(--color-warning) 11%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 24%, transparent);
}

.activity-badge.rejected {
  color: var(--text-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border-color: color-mix(in srgb, var(--border-warning) 22%, transparent);
}

.activity-badge.danger {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border-color: color-mix(in srgb, var(--border-error) 20%, transparent);
}

.confirm-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.btn-reject {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm, 8px);
  border: 1px solid color-mix(in srgb, var(--border-error) 18%, transparent);
  background: color-mix(in srgb, var(--color-danger) 5%, transparent);
  color: var(--text-muted);
  font-size: var(--font-size-sm, 12px);
  cursor: pointer;
}

.btn-reject:hover {
  color: var(--text-error);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.expand-icon {
  flex: 0 0 auto;
  color: var(--text-faint);
  transition: transform 0.16s ease;
}

.expand-icon.open {
  transform: rotate(180deg);
}

.expand-icon.placeholder {
  opacity: 0;
}

.activity-details {
  margin: 2px 8px 8px 38px;
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }

  .expand-icon {
    transition: none;
  }
}
</style>
