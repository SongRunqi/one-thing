<template>
  <div
    v-if="stepGroups.length > 0"
    class="tool-activity-timeline"
    :data-depth="depth"
  >
    <template
      v-for="group in stepGroups"
      :key="group.id"
    >
      <FartCallItem
        v-if="group.category === 'fart'"
        :tool-call="group.activities[0].toolCall"
      />

      <div
        v-else-if="group.activities.length === 1"
        class="single-activity-container activity-group single-operation"
        :class="[group.category, group.status, { expanded: isActivityExpanded(group.activities[0]), collapsed: !isActivityExpanded(group.activities[0]) }]"
        data-tool-activity-row
      >
        <div class="operation-list single group-timeline-tree">
          <div
            v-for="activity in group.activities"
            :key="activity.id"
            class="operation-block"
          >
            <div
              class="operation-row single-activity-row"
              :class="[activity.status, `status-${activity.status}`, { 'is-expanded': isActivityExpanded(activity), 'file-tool-row': activity.canOpenFile, 'has-details': activity.hasDetails }]"
              role="button"
              :tabindex="activity.hasDetails ? 0 : -1"
              @click="toggleActivityExpanded(activity)"
              @keydown.enter.prevent="toggleActivityExpanded(activity)"
              @keydown.space.prevent="toggleActivityExpanded(activity)"
            >
              <span
                class="group-type-icon"
                :class="group.category"
                :title="getGroupTypeLabel(group)"
              >
                <component
                  :is="getGroupIcon(group)"
                  :size="13"
                />
              </span>

              <div class="operation-copy">
                <div class="operation-primary">
                  <span
                    class="node-target operation-target"
                    :title="activity.filePath || activity.target"
                    @click.stop="toggleActivityExpanded(activity)"
                  >
                    <span class="node-action">{{ `${getSingleActivityVerb(group, activity)} ` }}</span><span
                      class="node-target-name"
                      :class="{ 'file-link': activity.canOpenFile }"
                    >{{ getActivityTargetText(activity) }}</span>
                  </span>
                </div>
                <div
                  v-if="getActivityMetaText(activity)"
                  class="operation-secondary"
                >
                  <span
                    class="node-meta"
                  >{{ getActivityMetaText(activity) }}</span>
                </div>
              </div>

              <ChevronDown
                v-if="activity.hasDetails"
                class="operation-chevron"
                :class="{ open: isActivityExpanded(activity) }"
                :size="13"
              />
            </div>

            <div
              v-if="activity.errorSummary"
              class="operation-failure"
            >
              <span class="failure-title">{{ activity.errorSummary }}</span>
              <span
                v-if="activity.nextAction"
                class="failure-next"
              >{{ activity.nextAction }}</span>
            </div>

            <transition name="expand">
              <div
                v-if="isActivityExpanded(activity)"
                class="activity-inline-details flat"
              >
                <div class="details-content-wrapper">
                  <ToolStepDetails
                    :view="buildDetailedToolStepView(activity)"
                    :wrap="true"
                  />
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <div
        v-else
        class="workflow-group activity-group"
        :class="[group.category, group.status, { collapsed: !isGroupExpanded(group), expanded: isGroupExpanded(group) }]"
        data-tool-activity-row
      >
        <div class="group-header-anchor">
          <div
            class="group-header"
            role="button"
            tabindex="0"
            @click="setGroupExpanded(group, !isGroupExpanded(group))"
            @keydown.enter.prevent="setGroupExpanded(group, !isGroupExpanded(group))"
            @keydown.space.prevent="setGroupExpanded(group, !isGroupExpanded(group))"
          >
            <span
              class="group-type-icon"
              :class="group.category"
              :title="getGroupTypeLabel(group)"
            >
              <component
                :is="getGroupIcon(group)"
                :size="13"
              />
            </span>
            <div class="group-copy">
              <span class="group-summary-text">{{ getGroupSummaryText(group) }}</span>
              <span
                v-if="getGroupMetaText(group)"
                class="group-meta"
              >{{ getGroupMetaText(group) }}</span>
            </div>
            <ChevronDown
              class="group-chevron"
              :class="{ open: isGroupExpanded(group) }"
              :size="13"
            />
          </div>
        </div>

        <div
          v-if="isGroupExpanded(group)"
          class="operation-list group-timeline-tree"
        >
          <div
            v-for="activity in group.activities"
            :key="activity.id"
            class="operation-block"
          >
            <div
              class="operation-row tree-node-row"
              :class="[activity.status, `status-${activity.status}`, { 'is-expanded': isGroupActivityExpanded(activity), 'file-tool-row': activity.canOpenFile, 'has-details': activity.hasDetails }]"
              role="button"
              :tabindex="activity.hasDetails ? 0 : -1"
              @click="toggleGroupActivityExpanded(activity)"
              @keydown.enter.prevent="toggleGroupActivityExpanded(activity)"
              @keydown.space.prevent="toggleGroupActivityExpanded(activity)"
            >
              <span
                class="operation-indent"
                aria-hidden="true"
              />

              <div class="operation-copy tree-node-content">
                <div class="operation-primary">
                  <span
                    class="node-target operation-target"
                    :title="activity.filePath || activity.target"
                    @click.stop="toggleGroupActivityExpanded(activity)"
                  >
                    <span class="node-action">{{ `${getOperationVerb(activity)} ` }}</span><span
                      class="node-target-name"
                      :class="{ 'file-link': activity.canOpenFile }"
                    >{{ getActivityTargetText(activity) }}</span>
                  </span>
                </div>
                <div
                  v-if="getActivityMetaText(activity)"
                  class="operation-secondary"
                >
                  <span class="node-meta">{{ getActivityMetaText(activity) }}</span>
                </div>
              </div>

              <ChevronDown
                v-if="activity.hasDetails"
                class="operation-chevron"
                :class="{ open: isGroupActivityExpanded(activity) }"
                :size="13"
              />
            </div>

            <div
              v-if="activity.errorSummary && isGroupActivityExpanded(activity)"
              class="operation-failure"
            >
              <span class="failure-title">{{ activity.errorSummary }}</span>
              <span
                v-if="activity.nextAction"
                class="failure-next"
              >{{ activity.nextAction }}</span>
            </div>

            <transition name="expand">
              <div
                v-if="isGroupActivityExpanded(activity)"
                class="activity-inline-details"
              >
                <div class="details-content-wrapper">
                  <ToolStepDetails
                    :view="buildDetailedToolStepView(activity)"
                    :wrap="true"
                  />
                </div>
              </div>
            </transition>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ChevronDown,
  FilePlus2,
  FileText,
  Pencil,
  Search,
  Terminal,
  Wrench,
} from 'lucide-vue-next'
import type { Step, ToolCall } from '@/types'
import {
  buildDetailedToolStepView,
  buildToolActivityViews,
  type ToolActivityView,
} from '@/stores/helpers/tool-activity-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
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

defineEmits<{
  confirm: [toolCall: ToolCall, response: 'once']
  reject: [toolCall: ToolCall]
  'open-file': [filePath: string]
}>()

const durationNow = ref(Date.now())

const activities = computed(() => buildToolActivityViews(props.steps, durationNow.value))

interface StepGroup {
  id: string
  category: 'search' | 'edit' | 'write' | 'console' | 'read' | 'tool' | 'fart'
  activities: ToolActivityView[]
  status: ToolRenderStatus
}

function getToolCategory(toolName: string): StepGroup['category'] {
  const name = toolName.toLowerCase()
  if (name === 'fart') return 'fart'
  if (['web_search', 'web-search', 'websearch', 'web_open', 'web-open', 'webopen', 'web_find', 'web-find', 'webfind'].includes(name)) {
    return 'search'
  }
  if (['edit', 'edit_file', 'edit-file', 'editfile', 'replace_file_content', 'multi_replace_file_content'].includes(name)) return 'edit'
  if (['write', 'write_file', 'write-file', 'writefile', 'write_to_file', 'write-to-file', 'writetofile', 'create_file', 'create-file', 'createfile'].includes(name)) return 'write'
  if (name === 'bash') return 'console'
  if (['read', 'read_file', 'read-file', 'readfile', 'view_file', 'view-file', 'viewfile'].includes(name)) return 'read'
  return 'tool'
}

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

    const category = getToolCategory(activity.toolName || '')
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

const groupExpandedMap = ref<Record<string, boolean>>({})
const expandedActivitiesMap = ref<Record<string, boolean>>({})
const expandedGroupActivitiesMap = ref<Record<string, boolean>>({})

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

function isGroupExpanded(group: StepGroup): boolean {
  if (groupExpandedMap.value[group.id] === undefined) {
    return group.status !== 'completed' && group.status !== 'cancelled'
  }
  return groupExpandedMap.value[group.id]
}

function setGroupExpanded(group: StepGroup, val: boolean) {
  groupExpandedMap.value[group.id] = val
  if (val) {
    collapseGroupActivities(group)
  }
}

function isActivityExpanded(activity: ToolActivityView): boolean {
  const saved = expandedActivitiesMap.value[activity.id]
  return saved === undefined ? activity.defaultExpanded : saved
}

function isGroupActivityExpanded(activity: ToolActivityView): boolean {
  return expandedGroupActivitiesMap.value[activity.id] === true
}

function toggleActivityExpanded(activity: ToolActivityView) {
  if (!activity.hasDetails) return
  expandedActivitiesMap.value[activity.id] = !isActivityExpanded(activity)
}

function toggleGroupActivityExpanded(activity: ToolActivityView) {
  if (!activity.hasDetails) return
  expandedGroupActivitiesMap.value[activity.id] = !isGroupActivityExpanded(activity)
}

function collapseGroupActivities(group: StepGroup) {
  for (const activity of group.activities) {
    expandedGroupActivitiesMap.value[activity.id] = false
  }
}

function getStatusLabel(status: ToolRenderStatus): string {
  switch (status) {
    case 'queued': return 'Queued'
    case 'pending': return 'Pending'
    case 'streaming-input': return 'Preparing'
    case 'executing': return 'Running'
    case 'awaiting-confirmation': return 'Needs approval'
    case 'completed': return 'Done'
    case 'failed': return 'Failed'
    case 'rejected': return 'Rejected'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
}

function getGroupIcon(group: StepGroup) {
  switch (group.category) {
    case 'search': return Search
    case 'console': return Terminal
    case 'edit': return Pencil
    case 'write': return FilePlus2
    case 'read': return FileText
    default: return Wrench
  }
}

function getGroupTypeLabel(group: StepGroup): string {
  switch (group.category) {
    case 'search': return 'Search'
    case 'console': return 'Command'
    case 'edit': return 'Edit'
    case 'write': return 'Write'
    case 'read': return 'Read'
    default: return 'Tool'
  }
}

function getGroupSummaryText(group: StepGroup): string {
  const count = group.activities.length
  if (count === 1) return getSingleActivityText(group, group.activities[0])

  const failed = group.activities.filter(activity => activity.status === 'failed' || activity.status === 'rejected').length
  const succeeded = group.activities.filter(activity => activity.status === 'completed').length
  if (failed > 0 && succeeded > 0) {
    return `${getCompletedGroupVerb(group)} ${succeeded} ${getGroupNoun(group, succeeded)}, ${failed} failed`
  }
  if (failed > 0) return `${getBaseGroupVerb(group)} failed`

  const verb = getGroupVerb(group)
  return `${verb} ${count} ${getGroupNoun(group, count)}`
}

function getGroupMetaText(group: StepGroup): string {
  const parts = [
    getGroupStats(group),
    getGroupDuration(group),
    group.status !== 'completed' ? getStatusLabel(group.status) : '',
  ].filter(Boolean)

  return parts.join(' · ')
}

function getActivityMetaText(activity: ToolActivityView): string {
  const parts = [
    activity.stats,
    isDuplicateDiffMeta(activity.targetMeta, activity.stats) ? '' : activity.targetMeta,
    activity.duration,
    activity.statusLabel !== 'Done' ? activity.statusLabel : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function isDuplicateDiffMeta(meta: string, stats: string): boolean {
  if (!meta || !stats) return false
  const normalize = (value: string) => value.replace(/[()\s]/g, '')
  return normalize(meta) === normalize(stats)
}

function getSingleActivityText(group: StepGroup, activity: ToolActivityView): string {
  return `${getSingleActivityVerb(group, activity)} ${getActivityTargetText(activity)}`
}

function getSingleActivityVerb(group: StepGroup, activity: ToolActivityView): string {
  if (activity.status === 'failed') return `${getBaseGroupVerb(group)} failed:`
  if (activity.status === 'rejected') return `${getBaseGroupVerb(group)} rejected:`
  if (activity.status === 'awaiting-confirmation') return `${getBaseGroupVerb(group)} needs approval:`
  return activity.verb
}

function getOperationText(activity: ToolActivityView): string {
  return `${getOperationVerb(activity)} ${getActivityTargetText(activity)}`
}

function getOperationVerb(activity: ToolActivityView): string {
  const category = getToolCategory(activity.toolName || '')
  if (activity.status === 'failed') return `${getBaseGroupVerb({ category } as StepGroup)} failed:`
  if (activity.status === 'rejected') return `${getBaseGroupVerb({ category } as StepGroup)} rejected:`
  return getBaseGroupVerb({ category } as StepGroup)
}

function getActivityTargetText(activity: ToolActivityView): string {
  return activity.target || activity.toolName || 'tool'
}

function getGroupVerb(group: StepGroup): string {
  if (group.status === 'streaming-input' || group.status === 'executing' || group.status === 'pending') {
    switch (group.category) {
      case 'search': return 'Searching'
      case 'console': return 'Running'
      case 'edit': return 'Editing'
      case 'write': return 'Writing'
      case 'read': return 'Reading'
      default: return 'Calling'
    }
  }
  if (group.status === 'awaiting-confirmation') return getBaseGroupVerb(group)
  if (group.status === 'cancelled') return `Cancelled ${getBaseGroupVerb(group).toLowerCase()}`
  return getCompletedGroupVerb(group)
}

function getCompletedGroupVerb(group: StepGroup): string {
  switch (group.category) {
    case 'search': return 'Searched'
    case 'console': return 'Ran'
    case 'edit': return 'Edited'
    case 'write': return 'Wrote'
    case 'read': return 'Read'
    default: return 'Called'
  }
}

function getBaseGroupVerb(group: Pick<StepGroup, 'category'>): string {
  switch (group.category) {
    case 'search': return 'Search'
    case 'console': return 'Run'
    case 'edit': return 'Edit'
    case 'write': return 'Write'
    case 'read': return 'Read'
    default: return 'Call'
  }
}

function getGroupNoun(group: StepGroup, count: number): string {
  const plural = count !== 1
  switch (group.category) {
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

function getGroupStats(group: StepGroup): string {
  let additions = 0
  let deletions = 0

  for (const activity of group.activities) {
    const match = activity.stats.match(/\+(\d+)\s+-?(\d+)/)
    if (!match) continue
    additions += Number(match[1] || 0)
    deletions += Number(match[2] || 0)
  }

  return additions || deletions ? `+${additions} -${deletions}` : ''
}

function getGroupDuration(group: StepGroup): string {
  const durations = group.activities
    .map(activity => getActivityDurationMs(activity))
    .filter((duration): duration is number => duration !== null)
  if (durations.length === 0) return ''

  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return formatDuration(total)
}

function getActivityDurationMs(activity: ToolActivityView): number | null {
  const { startTime, endTime } = activity.toolCall
  if (!startTime || !endTime) return null
  return Math.max(0, endTime - startTime)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}
</script>

<style scoped>
.tool-activity-timeline {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  margin: 4px 0 6px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
}

.activity-group {
  --activity-header-max-width: min(440px, calc(100vw - 72px));
  --activity-body-width: min(560px, calc(100vw - 72px));
  --activity-title-fg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 82%, transparent);
  --activity-row-fg: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 68%, var(--ui-text-muted-fg, var(--muted)) 32%);
  --activity-link-fg: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 74%, var(--ui-text-muted-fg, var(--muted)) 26%);
  display: inline-grid;
  grid-template-columns: minmax(0, auto);
  justify-items: start;
  width: fit-content;
  max-width: 100%;
  overflow: visible;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-tool-surface-bg, var(--tool-surface)) 0%, transparent);
}

.activity-group.completed {
  background: transparent;
}

.activity-group.failed,
.activity-group.rejected {
  background: transparent;
  box-shadow: none;
}

.activity-group.awaiting-confirmation {
  background: transparent;
  box-shadow: none;
}

.group-header-anchor {
  display: inline-block;
  justify-self: start;
  width: max-content;
  max-width: var(--activity-header-max-width);
}

.group-header {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 26px;
  padding: 3px 5px;
  border-radius: 5px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.group-header:focus,
.operation-row:focus {
  outline: none;
}

.group-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  color: var(--activity-title-fg);
}

.activity-group.failed .group-type-icon,
.activity-group.rejected .group-type-icon {
  color: var(--activity-title-fg);
}

.group-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.group-summary-text {
  overflow: hidden;
  color: var(--activity-title-fg);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-meta {
  flex: 0 0 auto;
  overflow: hidden;
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 86%, transparent);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-chevron,
.operation-chevron {
  color: var(--activity-title-fg);
  transition: transform 0.16s ease, color 0.16s ease;
  transform: rotate(-90deg);
}

.group-header:hover .group-chevron,
.group-header:hover .group-type-icon,
.operation-row.has-details:hover .operation-chevron {
  color: var(--ui-text-muted-fg, var(--muted));
}

.group-header:hover .group-summary-text {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 560;
}

.group-header:hover .group-meta {
  color: var(--ui-text-muted-fg, var(--muted));
}

.group-chevron.open,
.operation-chevron.open {
  transform: rotate(0deg);
}

.operation-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: var(--activity-body-width);
  min-width: min(360px, calc(100vw - 72px));
  max-width: var(--activity-body-width);
  padding: 1px 0 3px;
  border-top: 0;
}

.operation-list.single {
  width: fit-content;
  min-width: 0;
  max-width: min(560px, 100%);
  padding: 0;
  border-top: 0;
}

.operation-list.single .operation-row {
  width: max-content;
  max-width: var(--activity-header-max-width);
  grid-template-columns: 18px minmax(0, 1fr) 14px;
}

.operation-block {
  width: 100%;
  min-width: 0;
}

.operation-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  min-height: 24px;
  padding: 2px 5px;
  border-radius: 5px;
  user-select: none;
  -webkit-user-select: none;
}

.operation-row.has-details {
  cursor: pointer;
}

.operation-row.failed,
.operation-row.rejected {
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--text-error)) 4%, transparent);
}

.operation-indent {
  width: 18px;
  height: 1px;
}

.operation-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.operation-primary,
.operation-secondary {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.operation-secondary {
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 88%, transparent);
}

.node-target {
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  color: var(--activity-row-fg);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-action,
.node-target-name {
  color: var(--activity-row-fg);
}

.node-target-name.file-link {
  color: var(--activity-link-fg);
}

.operation-row.has-details:hover .node-action,
.operation-row.has-details:hover .node-target-name {
  color: var(--ui-text-primary-fg, var(--text));
  font-weight: 560;
}

.operation-row.has-details:hover .node-target-name.file-link {
  color: var(--ui-accent-primary-fg, var(--accent));
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

.operation-failure {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0 5px 5px 29px;
  padding: 5px 7px;
  border-left: 0;
  border-radius: 5px;
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--text-error)) 5%, transparent);
}

.failure-title {
  color: var(--ui-tool-danger-text-fg, var(--text-error));
  font-size: 11px;
  font-weight: 560;
  line-height: 1.35;
}

.failure-next {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 10.5px;
  line-height: 1.35;
}

.activity-inline-details {
  box-sizing: border-box;
  width: calc(100% - 34px);
  max-width: calc(100% - 34px);
  min-width: 0;
  margin: 0 5px 7px 29px;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 26%, transparent);
  background: transparent;
}

.activity-inline-details.flat {
  margin-left: 29px;
}

.details-content-wrapper {
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.activity-inline-details :deep(.tool-step-details) {
  padding: 4px 0 0;
}

.activity-inline-details :deep(.detail-section) {
  padding: 6px 0;
}

.activity-inline-details :deep(.args-toggle) {
  min-height: 26px;
  padding: 5px 0;
}

.activity-inline-details :deep(.terminal-card) {
  margin: 3px 0 8px;
}

.activity-inline-details :deep(.detail-note-row) {
  padding: 6px 0 7px;
}

.activity-inline-details :deep(.diff-preview) {
  margin: 4px 0 8px;
}

.expand-enter-active,
.expand-leave-active {
  max-height: 900px;
  overflow: hidden;
  transition: max-height 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.16s ease;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
