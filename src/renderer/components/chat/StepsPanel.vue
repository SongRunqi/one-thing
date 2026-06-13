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
          <span
            v-if="getStatusIcon(getTimelineItemGroup(item).status)"
            class="operation-status-icon"
            :class="[`status-${getTimelineItemGroup(item).status}`]"
          >
            <component
              :is="getStatusIcon(getTimelineItemGroup(item).status)"
              :size="13"
            />
          </span>
          <div class="operation-copy tree-node-content">
            <div class="operation-primary">
              <span class="node-target operation-target">
                <span class="node-action">Played</span>
                <span class="node-target-name node-target-chip">fart</span>
              </span>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="isGroupTimelineItem(item)">
        <div class="group-header-anchor">
          <div class="group-header">
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
              <span
                v-if="getGroupDuration(getTimelineItemGroup(item))"
                class="group-meta"
              >{{ getGroupDuration(getTimelineItemGroup(item)) }}</span>
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
          <span
            v-if="getStatusIcon(getTimelineItemActivity(item).status)"
            class="operation-status-icon"
            :class="[`status-${getTimelineItemActivity(item).status}`]"
            :title="getTimelineItemActivity(item).statusLabel"
          >
            <Transition
              name="status-icon"
              mode="out-in"
            >
              <component
                :is="getStatusIcon(getTimelineItemActivity(item).status)"
                :key="getTimelineItemActivity(item).status"
                :size="13"
              />
            </Transition>
          </span>

          <div class="operation-copy tree-node-content">
            <div class="operation-primary">
              <span
                class="node-target operation-target"
                :title="getTimelineItemActivity(item).filePath || getTimelineItemActivity(item).target"
                :aria-label="getSingleActivityText(getTimelineItemGroup(item), getTimelineItemActivity(item))"
              >
                <span class="node-action">{{ getSingleActivityVerb(getTimelineItemGroup(item), getTimelineItemActivity(item)) }}</span>
                <span
                  class="node-target-name node-target-chip"
                  :class="{
                    'command-chip': getTimelineItemActivity(item).toolName === 'bash',
                    'file-link': getTimelineItemActivity(item).canOpenFile,
                    'file-opened': isFileOpenFlash(getTimelineItemActivity(item)),
                  }"
                  @click.stop="handleTargetClick(getTimelineItemActivity(item), toggle)"
                >{{ getActivityTargetText(getTimelineItemActivity(item)) }}</span>
              </span>
              <span
                v-if="getTimelineItemActivity(item).errorSummary"
                class="node-error-summary"
                :title="getTimelineItemActivity(item).errorSummary"
              >{{ getTimelineItemActivity(item).errorSummary }}</span>
            </div>
            <div
              v-if="getActivityMetaText(getTimelineItemActivity(item))"
              class="operation-secondary"
            >
              <span class="node-meta">{{ getActivityMetaText(getTimelineItemActivity(item)) }}</span>
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
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  LoaderCircle,
} from 'lucide-vue-next'
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
import {
  getCategoryVerbs,
  getToolUiCategory,
  type ToolUiCategory,
} from '@/stores/helpers/tool-ui-registry'
import FartCallItem from './FartCallItem.vue'
import ToolActivityDetails from './ToolActivityDetails.vue'

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
  'open-file': [filePath: string]
}>()

const durationNow = ref(Date.now())

const activities = computed(() => buildToolActivityViews(props.steps, durationNow.value))

interface StepGroup {
  id: string
  category: ToolUiCategory
  activities: ToolActivityView[]
  status: ToolRenderStatus
}

type ToolTimelineItemData =
  | { kind: 'fart'; group: StepGroup; activity: ToolActivityView }
  | { kind: 'group'; group: StepGroup }
  | { kind: 'single-container'; group: StepGroup }
  | { kind: 'activity'; group: StepGroup; activity: ToolActivityView; single: boolean }

type ToolTimelineItem = NestedCollapseItem<ToolTimelineItemData>

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
        category: 'fart',
        activities: [activity],
        status: activity.status,
      })
      continue
    }

    const category = getToolUiCategory(activity.toolName || '')
    if (currentGroup && currentGroup.category === category) {
      currentGroup.activities.push(activity)
      currentGroup.status = mergeStatuses(currentGroup.status, activity.status)
    } else {
      if (currentGroup) groups.push(currentGroup)
      currentGroup = {
        id: activity.id,
        category,
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

const hasRunning = computed(() =>
  activities.value.some(activity => activity.status === 'executing' || activity.status === 'streaming-input'),
)

let durationTimer: ReturnType<typeof setInterval> | null = null

watch(hasRunning, (running) => {
  if (running && !durationTimer) {
    durationTimer = setInterval(() => {
      durationNow.value = Date.now()
    }, 1000)
  } else if (!running && durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
}, { immediate: true })

onUnmounted(() => {
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
  for (const timer of fileOpenFlashTimers.values()) {
    clearTimeout(timer)
  }
  fileOpenFlashTimers.clear()
})

function isGrouped(group: StepGroup): boolean {
  return group.activities.length > 1
}

function createGroupTimelineItem(group: StepGroup): ToolTimelineItem {
  if (group.category === 'fart') {
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

  if (isGrouped(group)) {
    return {
      key: `group-${group.id}`,
      data: { kind: 'group', group },
      class: [
        'activity-group',
        'tool-group-panel',
        group.category,
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
    class: ['activity-group', 'single-operation', group.category, group.status],
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
    contentVariant: 'panel',
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

function getStatusIcon(status: ToolRenderStatus) {
  switch (status) {
    case 'streaming-input':
    case 'executing':
      return LoaderCircle
    case 'awaiting-confirmation':
      return AlertTriangle
    default:
      return null
  }
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

function getGroupSummaryText(group: StepGroup): string {
  const count = group.activities.length
  if (count === 1) return getSingleActivityText(group, group.activities[0])
  if (group.category === 'edit' && group.status === 'completed') {
    return `Edited ${count} ${getGroupActionNoun(group.category, count)}`
  }
  return `${getGroupActionVerb(group.category)} ${count} ${getGroupActionNoun(group.category, count)}`
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
    activity.duration,
  ].filter(Boolean)
  return parts.join(' · ')
}

function getSingleActivityText(group: StepGroup, activity: ToolActivityView): string {
  return `${getSingleActivityVerb(group, activity)} ${getActivityTargetText(activity)}`
}

function getSingleActivityVerb(group: StepGroup, activity: ToolActivityView): string {
  if (activity.status === 'failed') return `${getBaseGroupVerb(group.category)} failed:`
  if (activity.status === 'rejected') return `Rejected ${getBaseGroupVerb(group.category).toLowerCase()}:`
  if (activity.status === 'awaiting-confirmation') return getBaseGroupVerb(group.category)
  return activity.verb
}

function getActivityTargetText(activity: ToolActivityView): string {
  return activity.target || activity.toolName || 'tool'
}

function getBaseGroupVerb(category: ToolUiCategory): string {
  return getCategoryVerbs(category).base
}

function getGroupActionVerb(category: ToolUiCategory): string {
  switch (category) {
    case 'search': return 'Search'
    case 'console': return 'Run'
    case 'edit': return 'Edit'
    case 'write': return 'Write'
    case 'read': return 'Read'
    default: return 'Call'
  }
}

function getGroupActionNoun(category: ToolUiCategory, count: number): string {
  const plural = count !== 1
  switch (category) {
    case 'search': return plural ? 'searches' : 'search'
    case 'console': return plural ? 'commands' : 'command'
    case 'edit':
    case 'write':
    case 'read':
      return plural ? 'files' : 'file'
    default:
      return plural ? 'tools' : 'tool'
  }
}

function getGroupAdditions(group: StepGroup): number {
  if (group.category === 'edit') return 0
  return group.activities.reduce((sum, activity) => sum + activity.additions, 0)
}

function getGroupDeletions(group: StepGroup): number {
  if (group.category === 'edit') return 0
  return group.activities.reduce((sum, activity) => sum + activity.deletions, 0)
}

function getGroupDuration(group: StepGroup): string {
  if (group.status !== 'executing' && group.status !== 'streaming-input') return ''
  const durations = group.activities
    .map(activity => getActivityDurationMs(activity))
    .filter((duration): duration is number => duration !== null)
  if (durations.length === 0) return ''

  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return formatDuration(total)
}

function getActivityDurationMs(activity: ToolActivityView): number | null {
  if (activity.status !== 'executing' && activity.status !== 'streaming-input') return null
  const { startTime, endTime } = activity.toolCall
  if (!startTime) return null
  const end = endTime ?? durationNow.value
  if (!end) return null
  return Math.max(0, end - startTime)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
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
  /* Size expanded panes against this container, not the viewport, so details
     never overflow a narrow message column (e.g. with the inspector open). */
  container-type: inline-size;
  width: 100%;
  margin: 4px 0 6px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
}

.activity-group {
  --activity-title-fg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 82%, transparent);
  --activity-row-fg: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 68%, var(--ui-text-muted-fg, var(--muted)) 32%);
  --activity-link-fg: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 74%, var(--ui-text-muted-fg, var(--muted)) 26%);
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

.group-header:focus:not(:focus-visible),
.operation-row:focus:not(:focus-visible) {
  outline: none;
}

.group-header:focus-visible,
.operation-row:focus-visible {
  outline: 1.5px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: -1.5px;
}

.operation-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--activity-title-fg);
  transition: color 0.15s ease, opacity 0.15s ease, transform 0.12s ease;
}

.operation-status-icon.status-streaming-input,
.operation-status-icon.status-executing {
  color: var(--ui-accent-primary-fg, var(--accent));
  animation: tool-status-spin 0.9s linear infinite;
}

.operation-status-icon.status-awaiting-confirmation {
  color: var(--ui-status-warning-fg, var(--text-warning));
}

@keyframes tool-status-spin {
  to {
    transform: rotate(360deg);
  }
}

.status-icon-enter-active,
.status-icon-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.status-icon-enter-from,
.status-icon-leave-to {
  opacity: 0;
  transform: scale(0.85);
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
  color: var(--ui-text-primary-fg, var(--text));
}

.group-header:hover .group-meta {
  color: var(--ui-text-muted-fg, var(--muted));
}

.operation-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 1px 0 3px;
  border-top: 0;
}

.workflow-group .operation-list {
  padding-left: 20px;
}

.workflow-group .operation-list::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 6px;
  left: 13px;
  width: 1px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 40%, transparent);
}

.operation-list.single {
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

.operation-block {
  width: 100%;
  min-width: 0;
}

.operation-row {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 24px;
  padding: 2px 0;
  border-radius: 0;
  user-select: none;
  -webkit-user-select: none;
  transition: color 0.15s ease;
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
  align-items: center;
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
  flex: 0 1 auto;
  overflow: hidden;
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 88%, transparent);
}

.node-target {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--activity-row-fg);
  white-space: nowrap;
}

.node-action {
  flex: 0 0 auto;
  overflow: hidden;
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 84%, var(--activity-row-fg) 16%);
  font-size: 10.5px;
  font-weight: 560;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-target-name {
  display: block;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-target-chip {
  display: block;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  min-height: 18px;
  box-sizing: border-box;
  overflow: hidden;
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 52%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-surface-muted-bg, var(--surface-soft)) 52%, transparent);
  color: var(--activity-row-fg);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 520;
  line-height: 1.25;
}

.node-target-chip.command-chip {
  max-width: 100%;
}

.node-target-name.file-link {
  color: var(--activity-link-fg);
  cursor: pointer;
}

.operation-row.has-details:hover .node-action,
.operation-row.has-details:hover .node-target-chip {
  color: var(--ui-text-primary-fg, var(--text));
}

.operation-row.has-details:hover .node-target-chip.file-link {
  color: var(--ui-accent-primary-fg, var(--accent));
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 32%, transparent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.operation-row.is-expanded .node-action,
.operation-row.is-expanded .node-target-chip {
  color: var(--ui-text-primary-fg, var(--text));
}

.operation-list.single .node-action,
.operation-list.single .node-target-chip,
.operation-list.single .node-target-chip.file-link {
  color: var(--activity-title-fg);
}

.operation-list.single .operation-row.has-details:hover .node-action,
.operation-list.single .operation-row.has-details:hover .node-target-chip,
.operation-list.single .operation-row:focus-within .node-action,
.operation-list.single .operation-row:focus-within .node-target-chip {
  color: var(--ui-text-primary-fg, var(--text));
}

.operation-list.single .operation-row.has-details:hover .node-target-chip.file-link,
.operation-list.single .operation-row:focus-within .node-target-chip.file-link {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.node-error-summary {
  flex: 1 1 22ch;
  min-width: 0;
  max-width: min(56ch, 100%);
  overflow: hidden;
  color: color-mix(in srgb, var(--ui-status-danger-fg, var(--text-error)) 72%, var(--ui-text-muted-fg, var(--muted)) 28%);
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
  font-size: 10.5px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-verb {
  color: var(--ui-text-muted-fg, var(--muted));
  font-weight: 500;
}

:deep(.tool-operation-panel > .collapse-panel-content-shell > .activity-inline-details) {
  box-sizing: border-box;
  width: calc(100% - 34px);
  max-width: calc(100% - 34px);
  min-width: 0;
  margin: 2px 5px 7px 29px;
}
</style>
