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
          `tool-${activity.toolName}`,
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
            <span
              v-if="activity.targetMeta"
              class="activity-target-meta"
            >{{ activity.targetMeta }}</span>
          </span>

          <span class="activity-spacer" />

          <span
            v-if="activity.stats && activity.status !== 'failed' && activity.status !== 'rejected'"
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
            v-else-if="activity.status === 'queued'"
            class="activity-badge"
          >Queued</span>

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
  confirm: [toolCall: ToolCall, response: 'once']
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
  gap: 6px;
  margin: 4px 0 6px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
}

.tool-activity {
  position: relative;
  overflow: hidden;
  border: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 72%, var(--ui-tool-text-fg, var(--tool-ink)) 28%);
  border-radius: var(--tool-radius);
  background: var(--ui-tool-surface-bg, var(--tool-surface));
  transition:
    background var(--duration-fast, 0.15s) var(--ease-default, ease),
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.tool-activity.expanded,
.tool-activity:hover {
  background: var(--ui-tool-surface-bg, var(--tool-surface));
  border-color: color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 58%, var(--ui-tool-text-fg, var(--tool-ink)) 42%);
}

.tool-activity.awaiting {
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 7%, var(--ui-tool-surface-bg, var(--tool-surface)));
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 30%, var(--ui-tool-border-border, var(--tool-border)));
}

.activity-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 7px 10px;
  overflow: hidden;
  border-radius: inherit;
}

.tool-activity.interactive .activity-main {
  cursor: pointer;
}

.activity-main:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 64%, var(--ui-tool-text-fg, var(--tool-ink)) 36%);
}

.status-mark {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 999px;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  background: color-mix(in srgb, var(--ui-tool-text-fg, var(--tool-ink)) 7%, transparent);
  border: 0.5px solid var(--ui-tool-border-border, var(--tool-border));
}

.status-completed .status-mark {
  color: var(--ui-tool-success-text-fg, var(--tool-ok));
  background: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 18%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-success-text-fg, var(--tool-ok)) 28%, transparent);
}

.status-failed .status-mark {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 24%, transparent);
}

.tool-activity.status-failed {
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 5%, var(--ui-tool-surface-bg, var(--tool-surface)));
  box-shadow: inset 3px 0 0 var(--ui-tool-danger-text-fg, var(--tool-del-bar));
}

.status-rejected .status-mark,
.status-awaiting-confirmation .status-mark {
  color: var(--ui-tool-accent-fg, var(--tool-accent));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 13%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 28%, transparent);
}

.status-streaming-input .status-mark,
.status-executing .status-mark,
.status-pending .status-mark {
  color: var(--ui-tool-accent-fg, var(--tool-accent));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 11%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 24%, transparent);
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
  color: var(--ui-tool-text-fg, var(--tool-ink));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-title);
  font-weight: 500;
  white-space: nowrap;
}

.activity-target {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hg-syntax-string-fg, var(--syntax-string));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-title);
  font-weight: 400;
}

.activity-target-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-mono);
  font-size: var(--tool-font-size-body);
}

button.activity-target {
  border: 0;
  padding: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.activity-target.link {
  color: var(--hg-syntax-string-fg, var(--syntax-string));
}

.activity-target.link:hover {
  text-decoration: underline;
}

.tool-bash .activity-target,
.tool-bash .activity-target.link {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.activity-spacer {
  flex: 0 0 8px;
}

.activity-meta,
.activity-badge {
  flex: 0 0 auto;
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
}

.activity-meta.duration {
  padding: 2px 8px;
  border-radius: calc(var(--tool-radius) - 3px);
  background: color-mix(in srgb, var(--ui-tool-text-faint-fg, var(--tool-faint)) 16%, transparent);
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.activity-meta.stats {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.activity-badge {
  padding: 2px 7px;
  border-radius: 999px;
  border: 0.5px solid transparent;
}

.activity-badge.warning {
  color: var(--ui-tool-accent-fg, var(--tool-accent));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 11%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 24%, transparent);
}

.activity-badge.rejected {
  color: var(--ui-tool-accent-fg, var(--tool-accent));
  background: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-tool-accent-fg, var(--tool-accent)) 22%, transparent);
}

.activity-badge.danger {
  color: var(--ui-tool-accent-on-fg, var(--tool-accent-on));
  background: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
  border-color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
}

.confirm-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.btn-reject {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--tool-radius);
  border: 0.5px solid color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 20%, transparent);
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 5%, transparent);
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
  font-size: var(--tool-font-size-meta);
  font-weight: 500;
  cursor: pointer;
}

.btn-reject:hover {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--tool-del-bar)) 10%, transparent);
}

.expand-icon {
  flex: 0 0 auto;
  color: var(--ui-tool-text-faint-fg, var(--tool-faint));
  transition: transform 0.16s ease;
}

.expand-icon.open {
  transform: rotate(180deg);
}

.expand-icon.placeholder {
  opacity: 0;
}

.activity-details {
  margin: 0;
  border-top: 0.5px solid color-mix(in srgb, var(--ui-tool-border-border, var(--tool-border)) 70%, var(--ui-tool-text-fg, var(--tool-ink)) 30%);
  padding: 0;
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
