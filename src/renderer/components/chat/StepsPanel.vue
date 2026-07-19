<template>
  <NestedCollapseGroup
    v-if="timelineItems.length > 0"
    class="tool-activity-timeline"
    :items="timelineItems"
    variant="plain"
    expand-icon-position="inline-end"
    spacing="3px"
    :data-depth="depth"
  >
    <template #title="{ item, expanded, toggle }">
      <template v-if="isFartTimelineItem(item)">
        <div class="operation-row tree-node-row">
          <ToolIcon
            tool-name="fart"
            :status="getTimelineItemGroup(item).status"
          />
          <div class="operation-copy tree-node-content">
            <div class="operation-primary">
              <span class="node-target operation-target">
                <span class="node-action">Fart</span>
                <span class="node-target-name">fart</span>
              </span>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="isGroupTimelineItem(item)">
        <div class="group-header-anchor">
          <div class="group-header">
            <span class="group-icons">
              <ToolIcon
                v-for="activity in getGroupIconActivities(getTimelineItemGroup(item))"
                :key="activity.id"
                :tool-name="activity.toolName"
                :status="activity.status"
              />
            </span>
            <div class="group-copy">
              <span class="group-summary-text">{{ getGroupSummaryText(getTimelineItemGroup(item)) }}</span>
              <span
                v-if="getGroupStatusText(getTimelineItemGroup(item))"
                class="group-status-badge"
                :class="getGroupStatusClass(getTimelineItemGroup(item))"
              >{{ getGroupStatusText(getTimelineItemGroup(item)) }}</span>
              <span
                v-if="getGroupAdditions(getTimelineItemGroup(item))"
                class="group-stat addition"
              >+{{ getGroupAdditions(getTimelineItemGroup(item)) }}</span>
              <span
                v-if="getGroupDeletions(getTimelineItemGroup(item))"
                class="group-stat deletion"
              >-{{ getGroupDeletions(getTimelineItemGroup(item)) }}</span>
              <LiveToolDuration
                v-if="getGroupLiveStart(getTimelineItemGroup(item)) !== undefined"
                class="group-meta"
                :start-time="getGroupLiveStart(getTimelineItemGroup(item))"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="isActivityTimelineItem(item)">
        <div
          class="operation-row tree-node-row"
          :class="[
            getTimelineItemActivity(item).status,
            `status-${getTimelineItemActivity(item).status}`,
            {
              'is-expanded': expanded,
              'file-tool-row': getTimelineItemActivity(item).canOpenFile,
              'has-details': getTimelineItemActivity(item).hasDetails,
            },
          ]"
        >
          <ToolIcon
            :tool-name="getTimelineItemActivity(item).toolName"
            :status="getTimelineItemActivity(item).status"
            :label="getTimelineItemActivity(item).statusLabel"
          />

          <div class="operation-copy tree-node-content">
            <div class="operation-primary">
              <span
                class="node-target operation-target"
                :title="getTimelineItemActivity(item).filePath || getTimelineItemActivity(item).target"
                :aria-label="getSingleActivityText(getTimelineItemActivity(item))"
              >
                <span
                  class="node-action"
                  :class="{ 'is-flowing': isFlowingStatus(getTimelineItemActivity(item).status) }"
                >{{ getTimelineItemActivity(item).toolLabel }}</span><span
                  v-if="getTimelineItemActivity(item).target"
                  class="node-target-name"
                  :class="{
                    'command-chip': getTimelineItemActivity(item).toolName === 'bash',
                    'file-link': getTimelineItemActivity(item).canOpenFile,
                    'file-opened': isFileOpenFlash(getTimelineItemActivity(item)),
                  }"
                  @click.stop="handleTargetClick(getTimelineItemActivity(item), toggle)"
                >{{ getTimelineItemActivity(item).target }}</span>
              </span>
              <span
                v-if="getStatusBadgeText(getTimelineItemActivity(item))"
                class="node-status-badge"
                :class="`badge-${getTimelineItemActivity(item).status}`"
              >{{ getStatusBadgeText(getTimelineItemActivity(item)) }}</span>
              <span
                v-if="getTimelineItemActivity(item).errorSummary"
                class="node-error-summary"
                :title="getTimelineItemActivity(item).errorSummary"
              >{{ getTimelineItemActivity(item).errorSummary }}</span>
            </div>
            <div
              v-if="getActivityMetaText(getTimelineItemActivity(item)) || hasLiveDuration(getTimelineItemActivity(item))"
              class="operation-secondary"
            >
              <span class="node-meta">{{ getActivityMetaText(getTimelineItemActivity(item)) }}<LiveToolDuration
                v-if="hasLiveDuration(getTimelineItemActivity(item))"
                :start-time="getTimelineItemActivity(item).toolCall.startTime"
                :separator="getActivityMetaText(getTimelineItemActivity(item)) ? ' · ' : ''"
              /></span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <template #content="{ item }">
      <FartCallItem
        v-if="isFartTimelineItem(item)"
        :tool-call="getTimelineItemActivity(item).toolCall"
      />

      <template v-else-if="isActivityTimelineItem(item)">
        <ToolActivityDetails :activity="getTimelineItemActivity(item)" />
      </template>
    </template>
  </NestedCollapseGroup>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { Step } from '@/types'
import NestedCollapseGroup from '@/components/common/NestedCollapseGroup.vue'
import type {
  CollapsePanelStatus,
  NestedCollapseItem,
} from '@/components/common/collapse'
import {
  buildToolActivityViews,
  type ToolActivityView,
} from '@/stores/helpers/tool-activity-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
import FartCallItem from './FartCallItem.vue'
import LiveToolDuration from './LiveToolDuration.vue'
import ToolActivityDetails from './ToolActivityDetails.vue'
import ToolIcon from './ToolIcon.vue'

const props = withDefaults(defineProps<{
  steps: Step[]
  depth?: number
  parentCollapsed?: boolean
  sessionId?: string
  /**
   * Flat timeline mode (inside ProcessRail): parallel batches render as
   * plain rows without the "N tools" group header — the rail summary
   * already carries the aggregate counts.
   */
  flat?: boolean
}>(), {
  depth: 0,
  parentCollapsed: false,
  sessionId: '',
  flat: false,
})

const emit = defineEmits<{
  'open-file': [filePath: string]
}>()

// Live durations tick inside LiveToolDuration leaves; the activity views
// themselves only rebuild when the steps actually change.
const activities = computed(() => buildToolActivityViews(props.steps))

interface StepGroup {
  id: string
  /** Model generation round that issued this parallel batch (Step.turnIndex). */
  turnIndex: number | undefined
  isFart: boolean
  activities: ToolActivityView[]
  status: ToolRenderStatus
}

type ToolTimelineItemData =
  | { kind: 'fart'; group: StepGroup; activity: ToolActivityView }
  | { kind: 'group'; group: StepGroup }
  | { kind: 'single-container'; group: StepGroup }
  | { kind: 'activity'; group: StepGroup; activity: ToolActivityView; single: boolean }

type ToolTimelineItem = NestedCollapseItem<ToolTimelineItemData>

/**
 * Grouping: only tool calls issued together in ONE model turn (a parallel
 * tool_calls array) form a group. Sequential calls — even of the same tool —
 * always render as independent rows. Steps without a turnIndex never group.
 */
const stepGroups = computed<StepGroup[]>(() => {
  const groups: StepGroup[] = []
  let currentGroup: StepGroup | null = null

  for (const activity of activities.value) {
    if (activity.isFart) {
      if (currentGroup) {
        groups.push(currentGroup)
        currentGroup = null
      }
      groups.push({
        id: activity.id,
        turnIndex: undefined,
        isFart: true,
        activities: [activity],
        status: activity.status,
      })
      continue
    }

    const turnIndex = activity.step.turnIndex
    if (
      currentGroup &&
      !currentGroup.isFart &&
      currentGroup.turnIndex !== undefined &&
      turnIndex !== undefined &&
      turnIndex === currentGroup.turnIndex
    ) {
      currentGroup.activities.push(activity)
      currentGroup.status = mergeStatuses(currentGroup.status, activity.status)
    } else {
      if (currentGroup) groups.push(currentGroup)
      currentGroup = {
        id: activity.id,
        turnIndex,
        isFart: false,
        activities: [activity],
        status: activity.status,
      }
    }
  }

  if (currentGroup) groups.push(currentGroup)
  return groups
})

const timelineItems = computed<ToolTimelineItem[]>(() =>
  stepGroups.value.map(group => createGroupTimelineItem(group)),
)

const fileOpenFlashMap = ref<Record<string, boolean>>({})
const fileOpenFlashTimers = new Map<string, ReturnType<typeof setTimeout>>()

onUnmounted(() => {
  for (const timer of fileOpenFlashTimers.values()) {
    clearTimeout(timer)
  }
  fileOpenFlashTimers.clear()
})

function isGrouped(group: StepGroup): boolean {
  return group.activities.length > 1
}

function createGroupTimelineItem(group: StepGroup): ToolTimelineItem {
  if (group.isFart) {
    const activity = group.activities[0]
    return {
      key: `fart-${group.id}`,
      data: { kind: 'fart', group, activity },
      class: ['activity-group', 'single-operation', 'fart-panel', 'tool-operation-panel', group.status],
      attrs: { 'data-tool-activity-row': true },
      collapsible: false,
      status: getCollapsePanelStatus(group.status),
      streaming: isStreamingToolStatus(group.status),
    }
  }

  if (isGrouped(group) && !props.flat) {
    return {
      key: `group-${group.id}`,
      data: { kind: 'group', group },
      class: [
        'activity-group',
        'tool-group-panel',
        group.status,
        { 'workflow-group': true },
      ],
      attrs: { 'data-tool-activity-row': true },
      defaultCollapsed: !isGroupDefaultExpanded(group),
      status: getCollapsePanelStatus(group.status),
      streaming: isStreamingToolStatus(group.status),
      expandIconDisplay: 'hover',
      childrenClass: ['operation-list', 'group-timeline-tree'],
      children: group.activities.map(activity => createActivityTimelineItem(group, activity, false)),
    }
  }

  return {
    key: `single-${group.id}`,
    panel: false,
    data: { kind: 'single-container', group },
    class: ['activity-group', 'single-operation', group.status],
    attrs: { 'data-tool-activity-row': true },
    childrenClass: ['operation-list', 'group-timeline-tree', 'single'],
    children: group.activities.map(activity => createActivityTimelineItem(group, activity, true)),
  }
}

function createActivityTimelineItem(
  group: StepGroup,
  activity: ToolActivityView,
  single: boolean,
): ToolTimelineItem {
  return {
    key: `activity-${activity.id}`,
    data: { kind: 'activity', group, activity, single },
    class: [
      'operation-block',
      'tool-operation-panel',
      activity.status,
      `status-${activity.status}`,
      {
        'file-tool-row': activity.canOpenFile,
        'has-details': activity.hasDetails,
      },
    ],
    defaultCollapsed: !activity.defaultExpanded,
    collapsible: activity.hasDetails,
    status: getCollapsePanelStatus(activity.status),
    streaming: isStreamingToolStatus(activity.status),
    contentVariant: 'plain',
    contentClass: 'activity-inline-details',
    contentAttrs: { 'data-tool-activity-details': activity.id },
    expandIconDisplay: 'hover',
  }
}

function mergeStatuses(current: ToolRenderStatus, next: ToolRenderStatus): ToolRenderStatus {
  const precedence: ToolRenderStatus[] = [
    'failed',
    'rejected',
    'awaiting-confirmation',
    'executing',
    'streaming-input',
    'pending',
    'queued',
    'cancelled',
    'completed',
  ]
  return precedence.find(status => current === status || next === status) || next
}

function isGroupDefaultExpanded(group: StepGroup): boolean {
  return group.activities.some(activity => activity.defaultExpanded) ||
    (group.status !== 'completed' && group.status !== 'cancelled')
}

function handleTargetClick(activity: ToolActivityView, togglePanel?: () => void) {
  if (activity.hasDetails) {
    togglePanel?.()
    return
  }
  if (activity.canOpenFile) {
    emit('open-file', activity.filePath)
    flashFileOpen(activity.id)
    return
  }
}

function isFileOpenFlash(activity: ToolActivityView): boolean {
  return fileOpenFlashMap.value[activity.id] === true
}

function flashFileOpen(activityId: string) {
  if (fileOpenFlashTimers.has(activityId)) {
    clearTimeout(fileOpenFlashTimers.get(activityId)!)
  }
  fileOpenFlashMap.value[activityId] = true
  const timer = setTimeout(() => {
    delete fileOpenFlashMap.value[activityId]
    fileOpenFlashTimers.delete(activityId)
  }, 300)
  fileOpenFlashTimers.set(activityId, timer)
}

function isFlowingStatus(status: ToolRenderStatus): boolean {
  return status === 'executing' || status === 'streaming-input'
}

function getStatusBadgeText(activity: ToolActivityView): string {
  // Queued behind another prompt in the session's permission queue: waiting,
  // not actionable yet (no respond card).
  if (activity.status === 'awaiting-confirmation' && activity.toolCall.permissionQueued) {
    return 'Waiting for approval'
  }
  if (activity.status === 'awaiting-confirmation') return 'Needs approval'
  if (activity.status === 'cancelled') return 'Cancelled'
  if (activity.status === 'rejected') return 'Rejected'
  return ''
}

function getCollapsePanelStatus(status: ToolRenderStatus): CollapsePanelStatus {
  switch (status) {
    case 'executing':
      return 'executing'
    case 'streaming-input':
      return 'streaming'
    case 'completed':
      return 'completed'
    case 'failed':
    case 'rejected':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'awaiting-confirmation':
    case 'pending':
    case 'queued':
      return 'pending'
    default:
      return 'idle'
  }
}

function isStreamingToolStatus(status: ToolRenderStatus): boolean {
  return status === 'streaming-input'
}

function getGroupIconActivities(group: StepGroup): ToolActivityView[] {
  const seen = new Set<string>()
  const picked: ToolActivityView[] = []
  for (const activity of group.activities) {
    if (seen.has(activity.toolName)) continue
    seen.add(activity.toolName)
    picked.push(activity)
    if (picked.length === 3) break
  }
  return picked
}

function getGroupSummaryText(group: StepGroup): string {
  const count = group.activities.length
  if (count === 1) return getSingleActivityText(group.activities[0])
  return `${count} tools`
}

function getGroupStatusText(group: StepGroup): string {
  if (group.status === 'failed' || group.status === 'rejected') return 'Failed'
  if (group.status === 'cancelled') return 'Cancelled'
  return ''
}

function getGroupStatusClass(group: StepGroup): string {
  if (group.status === 'failed' || group.status === 'rejected') return 'failed'
  if (group.status === 'cancelled') return 'cancelled'
  return 'ok'
}

function getActivityMetaText(activity: ToolActivityView): string {
  if (activity.status === 'awaiting-confirmation') return ''
  const parts = [
    activity.stats,
    activity.toolName === 'variable' ? activity.targetMeta : '',
    // Live durations render via LiveToolDuration so the row meta stays static.
    hasLiveDuration(activity) ? '' : activity.duration,
  ].filter(Boolean)
  return parts.join(' · ')
}

function hasLiveDuration(activity: ToolActivityView): boolean {
  return (activity.status === 'executing' || activity.status === 'streaming-input') &&
    typeof activity.toolCall.startTime === 'number'
}

function getSingleActivityText(activity: ToolActivityView): string {
  return activity.target ? `${activity.toolLabel}(${activity.target})` : activity.toolLabel
}

function getGroupAdditions(group: StepGroup): number {
  return group.activities.reduce((sum, activity) => sum + activity.additions, 0)
}

function getGroupDeletions(group: StepGroup): number {
  return group.activities.reduce((sum, activity) => sum + activity.deletions, 0)
}

/**
 * Parallel batch: the batch runs as long as its slowest member, i.e. from the
 * earliest running start time. LiveToolDuration ticks from that instant.
 */
function getGroupLiveStart(group: StepGroup): number | undefined {
  if (group.status !== 'executing' && group.status !== 'streaming-input') return undefined
  const starts = group.activities
    .filter(activity => hasLiveDuration(activity))
    .map(activity => activity.toolCall.startTime as number)
  if (starts.length === 0) return undefined
  return Math.min(...starts)
}

function getTimelineItemData(item: NestedCollapseItem): ToolTimelineItemData | null {
  return (item.data as ToolTimelineItemData | undefined) ?? null
}

function isFartTimelineItem(item: NestedCollapseItem): boolean {
  return getTimelineItemData(item)?.kind === 'fart'
}

function isGroupTimelineItem(item: NestedCollapseItem): boolean {
  return getTimelineItemData(item)?.kind === 'group'
}

function isActivityTimelineItem(item: NestedCollapseItem): boolean {
  return getTimelineItemData(item)?.kind === 'activity'
}

function getTimelineItemGroup(item: NestedCollapseItem): StepGroup {
  return getTimelineItemData(item)!.group
}

function getTimelineItemActivity(item: NestedCollapseItem): ToolActivityView {
  const data = getTimelineItemData(item)!
  if (data.kind === 'activity' || data.kind === 'fart') return data.activity
  return data.group.activities[0]
}
</script>

<style scoped>
.tool-activity-timeline {
  /* NOTE: no container-type here — its style containment would trap the
     ledger counter below. The @container ancestor is .process-rail (the
     normal mount); the legacy fallback merely loses narrow-column tweaks. */
  /* Defined here (StepsPanel's own root) so they inherit into slot content;
     panel/list containers are rendered by NestedCollapseGroup/CollapsePanel
     and never carry this component's scope attribute. */
  --activity-title-fg: var(--ui-tool-text-faint-fg, var(--tool-faint));
  --activity-row-fg: var(--ui-tool-text-muted-fg, var(--tool-soft));
  --activity-hover-fg: var(--ui-tool-text-fg, var(--tool-ink));
  --activity-link-fg: color-mix(in srgb, var(--ui-tool-accent-fg, var(--accent)) 60%, var(--ui-tool-text-muted-fg, var(--tool-soft)));
  width: 100%;
  margin: 4px 0 6px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
  /* Blueprint ledger: rows are numbered like figures on a sheet. */
  counter-reset: tool-fig;
}

.tool-activity-timeline :deep(.activity-group) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: 100%;
}

.group-header-anchor {
  display: flex;
  justify-self: start;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 22px;
  padding: 1px 0;
  border-radius: 0;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.15s ease;
}

.group-icons {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.group-header:focus:not(:focus-visible),
.operation-row:focus:not(:focus-visible) {
  outline: none;
}

.group-header:focus-visible,
.operation-row:focus-visible {
  outline: 1.5px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: -1.5px;
}

.group-copy {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.group-summary-text {
  color: var(--activity-title-fg);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: normal;
}

.group-meta {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 86%, transparent);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  white-space: nowrap;
}

.group-status-badge,
.group-stat {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 560;
  line-height: 1.25;
  white-space: nowrap;
}

.group-status-badge.ok {
  color: var(--ui-status-success-fg, var(--text-success));
}

.group-status-badge.failed {
  color: var(--ui-status-danger-fg, var(--text-error));
}

.group-status-badge.cancelled {
  color: var(--ui-text-faint-fg, var(--muted));
}

.group-stat.addition {
  color: var(--ui-tool-success-text-fg, var(--tool-add-bar));
}

.group-stat.deletion {
  color: var(--ui-tool-danger-text-fg, var(--tool-del-bar));
}

.group-header:hover .group-summary-text {
  color: var(--activity-hover-fg);
}

.group-header:hover .group-meta {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.tool-activity-timeline :deep(.operation-list) {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 1px 0 3px;
  border-top: 0;
}

/* Hairline rules between ledger rows. */
.tool-activity-timeline :deep(.operation-list > * + *) {
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 32%, transparent);
}

.tool-activity-timeline :deep(.workflow-group .operation-list) {
  padding-left: 20px;
}

.tool-activity-timeline :deep(.workflow-group .operation-list)::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 6px;
  left: 6px;
  width: 1px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 28%, transparent);
}

.tool-activity-timeline :deep(.operation-list.single) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border-top: 0;
}

.operation-list.single .operation-row {
  width: 100%;
  max-width: 100%;
}

.tool-activity-timeline :deep(.operation-block) {
  width: 100%;
  min-width: 0;
}

.operation-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 26px;
  padding: 4px 8px 4px 4px;
  border-radius: 0;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.15s ease;
}

/* Ledger row number (01, 02, …), counted in DOM order per timeline. */
.operation-row::before {
  counter-increment: tool-fig;
  content: counter(tool-fig, decimal-leading-zero);
  flex: 0 0 auto;
  width: 20px;
  padding-top: 1px;
  color: var(--ui-text-faint-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.75;
  text-align: left;
}

/* The op name is the identity — no icons on the sheet. */
.operation-row :deep(.tool-icon) {
  display: none;
}

.operation-row.has-details {
  cursor: pointer;
}

.operation-row:focus:not(:focus-visible),
.group-header:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
}

.operation-copy {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  gap: 6px;
}

.operation-primary,
.operation-secondary {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.operation-primary {
  flex: 1 1 auto;
  max-width: 100%;
  overflow: hidden;
  flex-wrap: nowrap;
}

.operation-secondary {
  /* Never crushed by a long title/error: the timing readout stays legible. */
  flex: 0 0 auto;
  overflow: hidden;
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 88%, transparent);
}

/* Title: `ToolName(primary arg)` — one line like every other row, ellipsis
   when long; the expanded details always carry the full arguments. */
.node-target {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--activity-row-fg);
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1.45;
}

/* Ledger op column: lowercase mono, fixed width so targets align. */
.node-action {
  display: inline-block;
  min-width: 46px;
  color: var(--activity-title-fg);
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 620;
  line-height: inherit;
  text-transform: lowercase;
}

.operation-row.status-failed .node-action,
.operation-row.status-rejected .node-action {
  color: var(--ui-status-danger-fg, var(--text-error));
}

.node-target-name {
  min-width: 0;
  margin-left: 10px;
  color: var(--activity-row-fg);
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 450;
  line-height: inherit;
}

.node-target-name.command-chip {
  font-weight: 420;
}

.node-target-name.file-link {
  color: var(--activity-link-fg);
  cursor: pointer;
}

/* Flowing shimmer on the tool name while the call is live. */
.node-action.is-flowing {
  background: linear-gradient(
    90deg,
    var(--activity-row-fg) 32%,
    var(--activity-hover-fg) 50%,
    var(--activity-row-fg) 68%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: tool-name-flow 1.8s linear infinite;
}

@keyframes tool-name-flow {
  from {
    background-position: 130% 0;
  }
  to {
    background-position: -90% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-action.is-flowing {
    animation: none;
    background: none;
    -webkit-text-fill-color: initial;
    color: var(--ui-tool-accent-fg, var(--accent));
  }
}

.operation-row.has-details:hover .node-action:not(.is-flowing),
.operation-row.has-details:hover .node-target-name {
  color: var(--activity-hover-fg);
}

.operation-row.has-details:hover .node-target-name.file-link {
  color: var(--ui-accent-primary-fg, var(--accent));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.operation-row.is-expanded .node-action:not(.is-flowing),
.operation-row.is-expanded .node-target-name {
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
}

.operation-list.single .operation-row.has-details:hover .node-target-name.file-link,
.operation-list.single .operation-row:focus-within .node-target-name.file-link {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.node-status-badge {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 540;
  line-height: 1.3;
  white-space: nowrap;
  color: var(--ui-text-faint-fg, var(--muted));
}

.node-status-badge.badge-awaiting-confirmation {
  color: var(--ui-status-warning-fg, var(--text-warning));
}

.node-status-badge.badge-rejected {
  color: var(--ui-tool-danger-text-fg, var(--text-error));
}

.node-error-summary {
  flex: 1 1 22ch;
  min-width: 0;
  max-width: min(56ch, 100%);
  overflow: hidden;
  color: var(--ui-status-danger-fg, var(--text-error));
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-target-name.file-link.file-opened {
  animation: file-open-flash 0.3s ease;
}

@keyframes file-open-flash {
  0%,
  100% {
    background: transparent;
  }
  45% {
    background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 8%, transparent);
  }
}

.diff-stats-inline {
  flex: 0 0 auto;
  color: var(--ui-text-faint-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.25;
}

.node-verb,
.node-meta,
.node-duration {
  flex: 0 0 auto;
  overflow: hidden;
  color: var(--ui-text-faint-fg, var(--muted));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.6px;
  line-height: 1.25;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

:deep(.tool-operation-panel > .collapse-panel-content-shell > .activity-inline-details) {
  box-sizing: border-box;
  width: calc(100% - 25px);
  max-width: calc(100% - 25px);
  min-width: 0;
  margin: 2px 5px 7px 20px;
}

/* Narrow message column: give content width priority over indentation. */
@container (max-width: 480px) {
  .tool-activity-timeline :deep(.workflow-group .operation-list) {
    padding-left: 10px;
  }

  :deep(.tool-operation-panel > .collapse-panel-content-shell > .activity-inline-details) {
    width: calc(100% - 12px);
    max-width: calc(100% - 12px);
    margin: 2px 2px 7px 10px;
  }
}
</style>
