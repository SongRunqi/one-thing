<template>
  <div
    v-if="views.length > 0"
    class="steps-panel"
    :data-depth="depth"
  >
    <template
      v-for="run in displayRuns"
      :key="run.id"
    >
      <FartCallItem
        v-if="run.kind === 'fart'"
        :tool-call="run.views[0].toolCall"
      />

      <section
        v-else-if="run.kind === 'edited'"
        class="activity"
        :class="{ open: isEditedRunOpen(run) }"
      >
        <button
          class="activity-summary"
          type="button"
          @click="toggleEdited(run.id)"
        >
          <Pencil
            class="activity-icon"
            :size="18"
            :stroke-width="1.8"
          />
          <span
            class="activity-title"
            :class="{ flowing: isRunFlowing(run) }"
          >{{ editedRunTitle(run) }}</span>
          <ChevronDown
            class="activity-chevron"
            :class="{ open: isEditedRunOpen(run) }"
            :size="18"
            :stroke-width="1.8"
          />
        </button>

        <div
          v-if="isEditedRunOpen(run)"
          class="activity-body"
        >
          <div
            v-if="run.views.length > 1"
            class="edited-list"
          >
            <div
              v-for="view in run.views"
              :key="view.id"
              class="edited-item"
            >
              <div
                class="edited-row"
                role="button"
                tabindex="0"
                :aria-expanded="isEditedExpanded(view)"
                @click="selectEdited(view.id)"
                @keydown.enter.prevent="selectEdited(view.id)"
                @keydown.space.prevent="selectEdited(view.id)"
              >
                <span class="edited-action">Edited</span>
                <button
                  v-if="canOpenFile(view)"
                  class="edited-file file-link"
                  type="button"
                  :title="view.filePath"
                  @click.stop="openFile(view)"
                  @keydown.stop
                >
                  {{ fileLabel(view) }}
                </button>
                <span
                  v-else
                  class="edited-file"
                >{{ fileLabel(view) }}</span>
                <span
                  v-if="editStats(view)"
                  class="edited-stats"
                >
                  <span class="stat-add">+{{ editStats(view)!.additions }}</span>
                  <span class="stat-del">-{{ editStats(view)!.deletions }}</span>
                </span>
                <ChevronDown
                  class="row-chevron"
                  :class="{ open: isEditedExpanded(view) }"
                  :size="15"
                  :stroke-width="1.9"
                />
              </div>

              <div
                v-if="isEditedExpanded(view)"
                class="active-edit nested"
              >
                <div class="diff-shell">
                  <div class="diff-shell-header">
                    <button
                      v-if="canOpenFile(view)"
                      class="diff-file file-link"
                      type="button"
                      :title="view.filePath"
                      @click.stop="openFile(view)"
                      @keydown.stop
                    >
                      {{ fileLabel(view) }}
                    </button>
                    <span
                      v-else
                      class="diff-file"
                    >{{ fileLabel(view) }}</span>
                    <span
                      v-if="editStats(view)"
                      class="edited-stats"
                    >
                      <span class="stat-add">+{{ editStats(view)!.additions }}</span>
                      <span class="stat-del">-{{ editStats(view)!.deletions }}</span>
                    </span>
                    <span class="diff-spacer" />
                    <span
                      v-if="view.isAwaitingConfirmation"
                      class="row-confirm"
                    >
                      <AllowSplitButton @confirm="(response) => confirmEdited(view, response)" />
                      <button
                        class="btn-reject"
                        type="button"
                        @click="rejectEdited(view)"
                      >
                        Reject
                      </button>
                    </span>
                    <Copy
                      v-else
                      class="diff-copy"
                      :size="17"
                      :stroke-width="1.8"
                    />
                  </div>
                  <ToolDiffPreview
                    v-if="activeDiff(view)"
                    class="embedded-diff"
                    :diff="activeDiff(view)!"
                    :lines="activeDiffLines(view)"
                    :status="view.status"
                    :hide-header="true"
                    @open-file="(filePath) => emit('open-file', filePath)"
                  />
                  <ToolStepDetails
                    v-else
                    class="embedded-details"
                    :view="view"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="activeEditedViewFor(run) && run.views.length === 1"
            class="active-edit"
          >
            <div class="diff-shell">
              <div class="diff-shell-header">
                <button
                  v-if="canOpenFile(activeEditedViewFor(run)!)"
                  class="diff-file file-link"
                  type="button"
                  :title="activeEditedViewFor(run)!.filePath"
                  @click.stop="openFile(activeEditedViewFor(run)!)"
                  @keydown.stop
                >
                  {{ fileLabel(activeEditedViewFor(run)!) }}
                </button>
                <span
                  v-else
                  class="diff-file"
                >{{ fileLabel(activeEditedViewFor(run)!) }}</span>
                <span
                  v-if="editStats(activeEditedViewFor(run)!)"
                  class="edited-stats"
                >
                  <span class="stat-add">+{{ editStats(activeEditedViewFor(run)!)!.additions }}</span>
                  <span class="stat-del">-{{ editStats(activeEditedViewFor(run)!)!.deletions }}</span>
                </span>
                <span class="diff-spacer" />
                <span
                  v-if="activeEditedViewFor(run)!.isAwaitingConfirmation"
                  class="row-confirm"
                >
                  <AllowSplitButton @confirm="(response) => confirmEdited(activeEditedViewFor(run)!, response)" />
                  <button
                    class="btn-reject"
                    type="button"
                    @click="rejectEdited(activeEditedViewFor(run)!)"
                  >
                    Reject
                  </button>
                </span>
                <Copy
                  v-else
                  class="diff-copy"
                  :size="17"
                  :stroke-width="1.8"
                />
              </div>
              <ToolDiffPreview
                v-if="activeDiff(activeEditedViewFor(run)!)"
                class="embedded-diff"
                :diff="activeDiff(activeEditedViewFor(run)!)!"
                :lines="activeDiffLines(activeEditedViewFor(run)!)"
                :status="activeEditedViewFor(run)!.status"
                :hide-header="true"
                @open-file="(filePath) => emit('open-file', filePath)"
              />
              <ToolStepDetails
                v-else
                class="embedded-details"
                :view="activeEditedViewFor(run)!"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="run.kind === 'utility'"
        class="activity muted"
        :class="{ attention: runNeedsConfirmation(run) }"
      >
        <button
          class="activity-summary"
          type="button"
          @click="toggleExplore(run.id)"
        >
          <SquareTerminal
            class="activity-icon"
            :size="18"
            :stroke-width="1.8"
          />
          <span
            class="activity-title"
            :class="{ flowing: isRunFlowing(run) }"
          >{{ utilityRunTitle(run) }}</span>
        </button>
        <div
          v-if="isUtilityRunOpen(run)"
          class="activity-body compact-list"
        >
          <div
            v-for="view in run.views"
            :key="view.id"
            class="compact-row"
            :class="{ awaiting: view.isAwaitingConfirmation }"
          >
            <span>{{ compactVerb(view) }}</span>
            <button
              v-if="canOpenFile(view)"
              class="compact-value file-link"
              type="button"
              :title="view.filePath"
              @click.stop="openFile(view)"
              @keydown.stop
            >
              {{ compactValue(view) }}
            </button>
            <span
              v-else
              class="compact-value"
            >{{ compactValue(view) }}</span>
            <span class="compact-spacer" />
            <span
              v-if="view.isAwaitingConfirmation"
              class="row-confirm"
              @click.stop
            >
              <AllowSplitButton @confirm="(response) => emit('confirm', view.toolCall, response)" />
              <button
                class="btn-reject"
                type="button"
                @click="emit('reject', view.toolCall)"
              >
                Reject
              </button>
            </span>
          </div>
        </div>
      </section>

      <ToolStepItem
        v-else
        :view="run.views[0]"
        :expanded="isExpanded(run.views[0])"
        @toggle-expand="toggleExpand(run.views[0].id)"
        @confirm="(toolCall, response) => emit('confirm', toolCall, response)"
        @reject="(toolCall) => emit('reject', toolCall)"
        @open-file="(filePath) => emit('open-file', filePath)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, Copy, Pencil, SquareTerminal } from 'lucide-vue-next'
import type { Step, ToolCall } from '@/types'
import { buildToolStepView, type ToolDiffData, type ToolDiffLine, type ToolStepView } from '@/stores/helpers/tool-step-view'
import {
  buildStepActivityRuns,
  isEditedStepView,
  isExploreStepView,
  shouldFlowStepActivityTitle,
  type StepActivityRun,
} from '@/stores/helpers/steps-panel-runs'
import { useSessionsStore } from '@/stores/sessions'
import AllowSplitButton from '../common/AllowSplitButton.vue'
import FartCallItem from './FartCallItem.vue'
import ToolDiffPreview from './ToolDiffPreview.vue'
import ToolStepDetails from './ToolStepDetails.vue'
import ToolStepItem from './ToolStepItem.vue'

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

const sessionsStore = useSessionsStore()
const userExpandedSteps = ref<Set<string>>(new Set())
const userCollapsedSteps = ref<Set<string>>(new Set())
const editedOpen = ref<Map<string, boolean>>(new Map())
const exploreOpen = ref<Map<string, boolean>>(new Map())
const selectedEditedIds = ref<Set<string>>(new Set())

const views = computed(() => props.steps.map(step => buildToolStepView(step)))
const workingDirectory = computed(() =>
  sessionsStore.sessions.find(session => session.id === props.sessionId)?.workingDirectory || '',
)
const displayRuns = computed(() => buildStepActivityRuns(views.value))

watch(() => props.parentCollapsed, (collapsed) => {
  if (collapsed) {
    userExpandedSteps.value = new Set()
    userCollapsedSteps.value = new Set()
    editedOpen.value = new Map()
    exploreOpen.value = new Map()
    selectedEditedIds.value = new Set()
  }
})

function isEditedView(view: ToolStepView): boolean {
  return isEditedStepView(view)
}

function isExploreView(view: ToolStepView): boolean {
  return isExploreStepView(view)
}

function isViewInProgress(view: ToolStepView): boolean {
  return ['pending', 'streaming-input', 'awaiting-confirmation', 'executing'].includes(view.status)
}

function isViewFlowing(view: ToolStepView): boolean {
  return shouldFlowStepActivityTitle(view)
}

function runNeedsConfirmation(run: StepActivityRun): boolean {
  return run.views.some(view => view.isAwaitingConfirmation)
}

function isRunFlowing(run: StepActivityRun): boolean {
  return run.views.some(isViewFlowing)
}

function activeRunView(run: StepActivityRun): ToolStepView | null {
  return [...run.views].reverse().find(isViewInProgress) ||
    run.views[run.views.length - 1] ||
    null
}

function isEditedRunOpen(run: StepActivityRun): boolean {
  if (run.views.some(view => view.isAwaitingConfirmation || view.status === 'streaming-input')) {
    return true
  }
  return editedOpen.value.get(run.id) ?? run.views.length === 1
}

function activeEditedViewFor(run: StepActivityRun): ToolStepView | null {
  if (!isEditedRunOpen(run) || run.views.length !== 1) return null
  return run.views[0]
}

function editedRunTitle(run: StepActivityRun): string {
  const activeView = activeRunView(run)
  if (run.views.some(isViewInProgress) && activeView) {
    return `${editingVerb(activeView)} ${fileLabel(activeView)}`
  }
  if (run.views.length !== 1) return `Edited ${run.views.length} files`
  const view = run.views[0]
  const stats = editStats(view)
  const suffix = stats ? ` +${stats.additions} -${stats.deletions}` : ''
  return `Edited ${fileLabel(view)}${suffix}`
}

function isUtilityRunOpen(run: StepActivityRun): boolean {
  return runNeedsConfirmation(run) || exploreOpen.value.get(run.id) === true
}

function utilityRunTitle(run: StepActivityRun): string {
  const activeView = activeRunView(run)
  if (run.views.some(isViewInProgress) && activeView) {
    return utilityActiveTitle(activeView)
  }

  const exploreCount = run.views.filter(isExploreView).length
  const commandCount = run.views.filter(view => view.toolName === 'bash').length
  const parts: string[] = []
  if (exploreCount > 0) {
    parts.push(`Explored ${exploreCount} ${exploreCount === 1 ? 'file' : 'files'}`)
  }
  if (commandCount > 0) {
    parts.push(`Ran ${commandCount} ${commandCount === 1 ? 'command' : 'commands'}`)
  }
  return parts.join(', ')
}

function toggleEdited(runId: string) {
  const next = new Map(editedOpen.value)
  const run = displayRuns.value.find(item => item.id === runId)
  const currentlyOpen = run ? isEditedRunOpen(run) : next.get(runId) === true
  next.set(runId, !currentlyOpen)
  editedOpen.value = next
  if (currentlyOpen) selectedEditedIds.value = new Set()
}

function selectEdited(stepId: string) {
  const next = new Set(selectedEditedIds.value)
  if (next.has(stepId)) next.delete(stepId)
  else next.add(stepId)
  selectedEditedIds.value = next
}

function isEditedExpanded(view: ToolStepView): boolean {
  return view.isAwaitingConfirmation ||
    view.status === 'streaming-input' ||
    selectedEditedIds.value.has(view.id)
}

function confirmEdited(view: ToolStepView, response: 'once' | 'session' | 'workdir' | 'always') {
  emit('confirm', view.toolCall, response)
}

function rejectEdited(view: ToolStepView) {
  emit('reject', view.toolCall)
}

function toggleExplore(runId: string) {
  const next = new Map(exploreOpen.value)
  const run = displayRuns.value.find(item => item.id === runId)
  const currentlyOpen = run ? isUtilityRunOpen(run) : next.get(runId) === true
  next.set(runId, !currentlyOpen)
  exploreOpen.value = next
}

function activeDiff(view: ToolStepView): ToolDiffData | null {
  return view.diff || view.streamingDiff
}

function activeDiffLines(view: ToolStepView): ToolDiffLine[] {
  return view.diff ? view.diffLines : view.streamingDiffLines
}

function fileLabel(view: ToolStepView): string {
  return view.fileName || (isEditedView(view) ? 'file' : view.displayName)
}

function canOpenFile(view: ToolStepView): boolean {
  return !!view.filePath && ['read', 'write', 'edit'].includes(view.toolName)
}

function openFile(view: ToolStepView) {
  if (canOpenFile(view)) emit('open-file', view.filePath)
}

function editStats(view: ToolStepView): { additions: number; deletions: number } | null {
  if (view.diff) {
    return {
      additions: view.diff.additions,
      deletions: view.diff.deletions,
    }
  }
  if (view.streamingContent?.additions) {
    return {
      additions: view.streamingContent.additions,
      deletions: 0,
    }
  }
  return null
}

function editingVerb(view: ToolStepView): string {
  if (view.toolName === 'write') return 'Writing'
  return 'Editing'
}

function compactVerb(view: ToolStepView): string {
  if (view.toolName === 'bash') return view.isAwaitingConfirmation ? 'Run' : 'Ran'
  if (view.toolName === 'grep') return 'Searched'
  if (view.toolName === 'glob') return 'Matched'
  return 'Read'
}

function compactValue(view: ToolStepView): string {
  if (view.toolName === 'bash') {
    return formatCommand(view.preview || String(view.toolCall.arguments?.command || ''))
  }

  const raw = rawPathValue(view)
  if (raw) return fileLabel(view)
  return view.preview || view.displayName
}

function exploreTargetLabel(view: ToolStepView): string {
  const value = compactValue(view)
  return value || view.displayName
}

function utilityActiveTitle(view: ToolStepView): string {
  if (view.toolName === 'bash') {
    const command = compactValue(view)
    const verb = view.isAwaitingConfirmation ? 'Run' : 'Running'
    return command ? `${verb} ${command}` : verb
  }

  const target = exploreTargetLabel(view)
  return target ? `Exploring ${target}` : 'Exploring'
}

function rawPathValue(view: ToolStepView): string {
  const args = view.toolCall.arguments || {}
  if (view.diff?.filePath) return view.diff.filePath
  if (view.streamingContent?.filePath) return view.streamingContent.filePath
  if (typeof args.file_path === 'string') return args.file_path
  if (typeof args.path === 'string') return args.path
  return ''
}

function formatCommand(command: string): string {
  if (!command) return ''
  const workdir = workingDirectory.value.replace(/\\/g, '/').replace(/\/+$/, '')
  const home = getHomePath()

  let formatted = command.replace(/\\/g, '/')
  if (workdir) {
    formatted = formatted.split(workdir).join('.')
  }
  if (home) {
    formatted = formatted.split(home).join('~')
  }
  return formatted
}

function getHomePath(): string {
  const workdir = workingDirectory.value.replace(/\\/g, '/')
  const marker = '/data/'
  const markerIndex = workdir.indexOf(marker)
  if (markerIndex > 0) return workdir.slice(0, markerIndex)
  const parts = workdir.split('/').filter(Boolean)
  if (workdir.startsWith('/') && parts.length >= 2 && parts[0] === 'Users') {
    return `/${parts[0]}/${parts[1]}`
  }
  return ''
}

function isExpanded(view: ToolStepView): boolean {
  if (!view.hasDetails) return false
  if (view.isAwaitingConfirmation) return true
  if (userExpandedSteps.value.has(view.id)) return true
  if (userCollapsedSteps.value.has(view.id)) return false
  return view.defaultExpanded
}

function toggleExpand(stepId: string) {
  if (userCollapsedSteps.value.has(stepId)) {
    userCollapsedSteps.value.delete(stepId)
    userExpandedSteps.value.add(stepId)
  } else if (userExpandedSteps.value.has(stepId)) {
    userExpandedSteps.value.delete(stepId)
    userCollapsedSteps.value.add(stepId)
  } else {
    const view = views.value.find(item => item.id === stepId)
    if (view?.defaultExpanded) userCollapsedSteps.value.add(stepId)
    else userExpandedSteps.value.add(stepId)
  }

  userExpandedSteps.value = new Set(userExpandedSteps.value)
  userCollapsedSteps.value = new Set(userCollapsedSteps.value)
}
</script>

<style scoped>
.steps-panel {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 2px 0 4px;
}

.activity {
  color: var(--text-secondary);
}

.activity-summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 26px;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs, 6px);
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-md, 14px);
  font-weight: var(--font-weight-normal, 400);
  line-height: 1.35;
  cursor: pointer;
}

.activity-summary:hover {
  background: color-mix(in srgb, var(--bg-hover) 70%, transparent);
  border-color: color-mix(in srgb, var(--border-subtle) 70%, transparent);
}

.activity-summary:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 42%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent);
}

.activity.muted .activity-summary {
  color: var(--text-faint);
}

.activity.attention .activity-summary {
  color: var(--text-primary);
}

.activity.muted .activity-summary:hover {
  border-color: color-mix(in srgb, var(--border-subtle) 72%, transparent);
  box-shadow: none;
}

.activity-icon {
  color: var(--text-faint);
  flex: 0 0 auto;
}

.activity-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-title.flowing {
  background: linear-gradient(
    90deg,
    var(--text-faint) 0%,
    var(--accent) 50%,
    var(--text-faint) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: flowingGradient 2s linear infinite;
}

@keyframes flowingGradient {
  0% { background-position: 200% center; }
  100% { background-position: -200% center; }
}

.activity-chevron {
  color: var(--text-faint);
  transition: transform var(--duration-normal, 0.2s) var(--ease-default, ease);
}

.activity-chevron.open {
  transform: rotate(180deg);
}

.activity-body {
  margin: 3px 0 2px 30px;
}

.edited-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.edited-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edited-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 23px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--font-size-md, 14px);
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
}

.edited-row:focus-visible {
  outline: none;
}

.edited-row:hover .edited-file:not(.file-link) {
  text-decoration: underline;
}

.edited-action {
  color: var(--text-muted);
}

.edited-file {
  color: var(--text-link);
}

.file-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--text-link);
  font: inherit;
  line-height: inherit;
  text-align: left;
  cursor: pointer;
}

.file-link:hover {
  text-decoration: underline;
}

.edited-stats {
  display: inline-flex;
  gap: 7px;
  font-variant-numeric: tabular-nums;
}

.row-chevron {
  color: var(--text-faint);
  flex: 0 0 auto;
  transform: rotate(-90deg);
  transition: transform var(--duration-normal, 0.2s) var(--ease-default, ease);
}

.row-chevron.open {
  transform: rotate(0deg);
}

.stat-add {
  color: var(--text-success);
}

.stat-del {
  color: var(--text-error);
}

.edited-spacer,
.diff-spacer {
  flex: 1;
}

.row-confirm {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

.active-edit {
  margin-top: 8px;
}

.active-edit.nested {
  margin: 2px 0 8px 0;
}

.diff-shell {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 8px);
  background: color-mix(in srgb, var(--bg-code-block) 88%, var(--bg-panel));
}

.diff-shell-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-code-header) 42%, var(--bg-panel));
  font-size: var(--font-size-md, 14px);
  line-height: 1.35;
}

.diff-file {
  color: var(--text-muted);
}

button.diff-file {
  color: var(--text-link);
}

.diff-copy {
  color: var(--text-faint);
}

.embedded-diff {
  margin: 0;
}

.embedded-diff :deep(.diff-content) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.embedded-details {
  padding: 10px;
}

.compact-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.compact-row {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: var(--font-size-sm, 13px);
  line-height: 1.35;
  min-height: 28px;
}

.compact-value {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm, 13px);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-row.awaiting .compact-value {
  color: var(--text-primary);
}

button.compact-value {
  color: var(--text-link);
}

.compact-spacer {
  flex: 1;
}
</style>
