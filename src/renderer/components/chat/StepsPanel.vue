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
        v-else
        class="activity-group"
        :class="[
          group.category,
          group.status,
          {
            'workflow-group': isGrouped(group),
            'single-operation': !isGrouped(group),
            collapsed: isGrouped(group) && !isGroupExpanded(group),
            expanded: isGrouped(group) ? isGroupExpanded(group) : isActivityExpanded(group.activities[0]),
          },
        ]"
        data-tool-activity-row
      >
        <div
          v-if="isGrouped(group)"
          class="group-header-anchor"
        >
          <div
            class="group-header"
            role="button"
            tabindex="0"
            :aria-expanded="isGroupExpanded(group)"
            :aria-label="`${isGroupExpanded(group) ? 'Collapse' : 'Expand'} ${getGroupSummaryText(group)}`"
            @click="setGroupExpanded(group, !isGroupExpanded(group))"
            @keydown.enter.prevent="setGroupExpanded(group, !isGroupExpanded(group))"
            @keydown.space.prevent="setGroupExpanded(group, !isGroupExpanded(group))"
          >
            <ChevronDown
              class="group-chevron group-leading-chevron"
              :class="{ open: isGroupExpanded(group) }"
              :size="13"
            />
            <div class="group-copy">
              <span class="group-summary-text">{{ getGroupSummaryText(group) }}</span>
              <span
                v-if="getGroupMetaText(group)"
                class="group-meta"
              >{{ getGroupMetaText(group) }}</span>
              <span
                v-if="getGroupFailureCount(group)"
                class="group-failure-badge"
              >{{ getGroupFailureCount(group) }} failed</span>
            </div>
          </div>
        </div>

        <div
          v-if="!isGrouped(group) || isGroupExpanded(group)"
          class="operation-list group-timeline-tree"
          :class="{ single: !isGrouped(group) }"
        >
          <div
            v-for="activity in group.activities"
            :key="activity.id"
            class="operation-block"
          >
            <div
              class="operation-row tree-node-row"
              :class="[
                activity.status,
                `status-${activity.status}`,
                {
                  'is-expanded': isActivityExpanded(activity),
                  'file-tool-row': activity.canOpenFile,
                  'has-details': activity.hasDetails,
                },
              ]"
              role="button"
              :tabindex="activity.hasDetails ? 0 : -1"
              @click="toggleActivityExpanded(activity)"
              @keydown.enter.prevent="toggleActivityExpanded(activity)"
              @keydown.space.prevent="toggleActivityExpanded(activity)"
            >
              <span
                class="operation-status-icon"
                :class="[`status-${activity.status}`]"
                :title="activity.statusLabel"
              >
                <Transition
                  name="status-icon"
                  mode="out-in"
                >
                  <component
                    :is="getStatusIcon(activity.status)"
                    :key="activity.status"
                    :size="13"
                  />
                </Transition>
              </span>

              <div class="operation-copy tree-node-content">
                <div class="operation-primary">
                  <span
                    class="node-target operation-target"
                    :title="activity.filePath || activity.target"
                  >
                    <span class="node-action">{{ `${getSingleActivityVerb(group, activity)} ` }}</span><span
                      class="node-target-name"
                      :class="{ 'file-link': activity.canOpenFile, 'file-opened': isFileOpenFlash(activity) }"
                      @click.stop="handleTargetClick(activity)"
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

              <div class="operation-actions">
                <button
                  class="operation-action-btn operation-inspector-btn"
                  type="button"
                  :aria-label="`Open ${activity.toolName || 'tool'} in inspector`"
                  title="Open in Inspector"
                  @click.stop="openInspector(activity)"
                >
                  <ExternalLink :size="12" />
                </button>
                <button
                  v-if="activity.hasDetails"
                  class="operation-action-btn operation-chevron-btn"
                  :class="{ open: isActivityExpanded(activity) }"
                  type="button"
                  :aria-label="isActivityExpanded(activity) ? 'Collapse details' : 'Expand details'"
                  @click.stop="toggleActivityExpanded(activity)"
                >
                  <ChevronDown
                    class="operation-chevron"
                    :class="{ open: isActivityExpanded(activity) }"
                    :size="13"
                  />
                </button>
              </div>
            </div>

            <div
              v-if="activity.errorSummary"
              class="operation-failure"
            >
              <span class="failure-title">{{ activity.errorSummary }}</span>
            </div>

            <transition name="expand">
              <div
                v-if="isActivityExpanded(activity)"
                class="activity-inline-details"
                :class="{ open: isActivityExpanded(activity) }"
                :data-tool-activity-details="activity.id"
              >
                <div class="details-content-wrapper">
                  <ToolActivityDetails :activity="activity" />
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
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Check,
  Circle,
  CircleX,
  ExternalLink,
  LoaderCircle,
  Minus,
} from 'lucide-vue-next'
import { getActivePinia } from 'pinia'
import type { Step } from '@/types'
import { useChatStore } from '@/stores/chat'
import {
  buildToolActivityViews,
  type ToolActivityView,
} from '@/stores/helpers/tool-activity-view'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
import {
  getCategoryVerbs,
  getInspectorTab,
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

const groupExpandedMap = ref<Record<string, boolean>>({})
const expandedMap = ref<Record<string, boolean>>({})
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
    return group.activities.some(activity => isActivityExpanded(activity)) ||
      (group.status !== 'completed' && group.status !== 'cancelled')
  }
  return groupExpandedMap.value[group.id]
}

function setGroupExpanded(group: StepGroup, val: boolean) {
  groupExpandedMap.value[group.id] = val
}

function isActivityExpanded(activity: ToolActivityView): boolean {
  const saved = expandedMap.value[activity.id]
  return saved === undefined ? activity.defaultExpanded : saved
}

function toggleActivityExpanded(activity: ToolActivityView) {
  if (!activity.hasDetails) return
  const next = !isActivityExpanded(activity)
  expandedMap.value[activity.id] = next
  if (next) {
    nextTick(() => scrollActivityDetailsIntoView(activity.id))
  }
}

function handleTargetClick(activity: ToolActivityView) {
  if (activity.canOpenFile) {
    emit('open-file', activity.filePath)
    flashFileOpen(activity.id)
    return
  }
  toggleActivityExpanded(activity)
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

function scrollActivityDetailsIntoView(activityId: string) {
  const details = Array.from(document.querySelectorAll<HTMLElement>('[data-tool-activity-details]'))
    .find(element => element.dataset.toolActivityDetails === activityId)
  details?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function openInspector(activity: ToolActivityView) {
  try {
    const store = getActivePinia() ? useChatStore() : null
    store?.openInspectorToTab(getInspectorTab(activity.toolName), activity.toolCall.id || activity.id)
  } catch {
    // Unit tests can mount the row without a Pinia app; the real app always provides one.
  }
}

function getStatusIcon(status: ToolRenderStatus) {
  switch (status) {
    case 'streaming-input':
    case 'executing':
      return LoaderCircle
    case 'awaiting-confirmation':
      return AlertTriangle
    case 'completed':
      return Check
    case 'failed':
      return CircleX
    case 'rejected':
      return Ban
    case 'cancelled':
      return Minus
    default:
      return Circle
  }
}

function getGroupSummaryText(group: StepGroup): string {
  const count = group.activities.length
  if (count === 1) return getSingleActivityText(group, group.activities[0])
  return `${count} ${getGroupActionNoun(group.category, count)}`
}

function getGroupMetaText(group: StepGroup): string {
  const parts = [
    getGroupStats(group),
    getGroupDuration(group),
  ].filter(Boolean)

  return parts.join(' · ')
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

function getGroupActionNoun(category: ToolUiCategory, count: number): string {
  const plural = count !== 1
  switch (category) {
    case 'search': return plural ? 'searches' : 'search'
    case 'console': return plural ? 'commands' : 'command'
    case 'edit': return plural ? 'edits' : 'edit'
    case 'write': return plural ? 'writes' : 'write'
    case 'read': return plural ? 'reads' : 'read'
    default:
      return plural ? 'tools' : 'tool'
  }
}

function getGroupFailureCount(group: StepGroup): number {
  return group.activities.filter(activity => activity.status === 'failed' || activity.status === 'rejected').length
}

function getGroupStats(group: StepGroup): string {
  let additions = 0
  let deletions = 0

  for (const activity of group.activities) {
    additions += activity.additions
    deletions += activity.deletions
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
  if (!startTime) return null
  const end = endTime ?? (activity.status === 'executing' || activity.status === 'streaming-input' ? durationNow.value : 0)
  if (!end) return null
  return Math.max(0, end - startTime)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}
</script>

<style scoped>
.tool-activity-timeline {
  /* Size expanded panes against this container, not the viewport, so details
     never overflow a narrow message column (e.g. with the inspector open). */
  container-type: inline-size;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  margin: 4px 0 6px;
  color: var(--ui-tool-text-muted-fg, var(--tool-soft));
  font-family: var(--tool-font-sans);
}

.activity-group {
  --activity-header-max-width: min(440px, 100cqw);
  --activity-body-width: min(560px, 100cqw);
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
  grid-template-columns: 18px minmax(0, 1fr);
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

.group-header:focus:not(:focus-visible),
.operation-row:focus:not(:focus-visible) {
  outline: none;
}

.group-header:focus-visible,
.operation-row:focus-visible,
.operation-action-btn:focus-visible {
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

.operation-status-icon.status-completed {
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 80%, transparent);
}

.operation-status-icon.status-failed {
  color: var(--ui-tool-danger-text-fg, var(--text-error));
}

.operation-status-icon.status-rejected {
  color: var(--ui-status-warning-fg, var(--text-warning));
}

.operation-status-icon.status-cancelled {
  color: color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 76%, transparent);
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

.group-failure-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-tool-danger-text-fg, var(--text-error)) 8%, transparent);
  color: var(--ui-tool-danger-text-fg, var(--text-error));
  font-size: 10.5px;
  font-weight: 560;
  line-height: 1.25;
  white-space: nowrap;
}

.group-chevron,
.operation-chevron {
  color: var(--activity-title-fg);
  transition: transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), color 0.15s ease;
  transform: rotate(-90deg);
}

.group-leading-chevron {
  justify-self: center;
}

.group-header:hover .group-chevron,
.operation-row:hover .operation-chevron {
  color: var(--ui-text-muted-fg, var(--muted));
}

.group-header:hover .group-summary-text {
  color: var(--ui-text-primary-fg, var(--text));
}

.group-header:hover .group-meta {
  color: var(--ui-text-muted-fg, var(--muted));
}

.group-chevron.open,
.operation-chevron.open {
  transform: rotate(0deg);
}

.operation-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  box-sizing: border-box;
  width: var(--activity-body-width);
  min-width: min(360px, 100cqw);
  max-width: var(--activity-body-width);
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
  width: var(--activity-body-width);
  min-width: min(360px, 100cqw);
  max-width: var(--activity-body-width);
  padding: 0;
  border-top: 0;
}

.operation-list.single .operation-row {
  width: max-content;
  max-width: var(--activity-header-max-width);
  grid-template-columns: 18px minmax(0, 1fr) auto;
}

.operation-block {
  width: 100%;
  min-width: 0;
}

.operation-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  min-height: 24px;
  padding: 2px 5px;
  border-radius: 5px;
  user-select: none;
  -webkit-user-select: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.operation-row.has-details {
  cursor: pointer;
}

.operation-row.has-details:hover,
.group-header:hover {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3%, transparent);
}

.operation-row.has-details:active,
.group-header:active {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 6%, transparent);
  transition: none;
}

.operation-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-width: 42px;
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.operation-row:hover .operation-actions,
.operation-row:focus-within .operation-actions,
.operation-row.is-expanded .operation-actions {
  opacity: 1;
}

.operation-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--activity-title-fg);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease, transform 0.08s ease;
}

.operation-action-btn:hover,
.operation-action-btn:focus-visible {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 6%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.operation-action-btn:active {
  transform: scale(0.96);
}

.operation-row:focus:not(:focus-visible),
.group-header:focus:not(:focus-visible),
.operation-action-btn:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
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
  cursor: pointer;
}

.operation-row.has-details:hover .node-action,
.operation-row.has-details:hover .node-target-name {
  color: var(--ui-text-primary-fg, var(--text));
}

.operation-row.has-details:hover .node-target-name.file-link {
  color: var(--ui-accent-primary-fg, var(--accent));
  text-decoration: underline;
  text-underline-offset: 2px;
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

.operation-failure {
  display: flex;
  flex-direction: column;
  margin: 0 5px 5px 29px;
  padding: 3px 0 4px 8px;
  border-left: 2px solid var(--ui-tool-danger-text-fg, var(--text-error));
  border-radius: 0;
  background: transparent;
}

.failure-title {
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-inline-details {
  interpolate-size: allow-keywords;
  box-sizing: border-box;
  width: calc(100% - 34px);
  max-width: calc(100% - 34px);
  height: auto;
  min-width: 0;
  margin: 0 5px 7px 29px;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle)) 26%, transparent);
  background: transparent;
  overflow: clip;
  opacity: 1;
  transform: translateY(0);
  transition: height 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.16s ease, transform 0.16s ease;
}

.activity-inline-details.flat {
  margin-left: 29px;
}

.details-content-wrapper {
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.expand-enter-active,
.expand-leave-active {
  overflow: clip;
}

.expand-leave-active {
  transition-duration: 0.18s, 0.14s, 0.14s;
}

.expand-enter-from,
.expand-leave-to {
  height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.expand-enter-to,
.expand-leave-from {
  height: auto;
  opacity: 1;
  transform: translateY(0);
}
</style>
