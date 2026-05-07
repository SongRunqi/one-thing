<template>
  <div
    v-if="views.length > 0"
    class="steps-panel"
    :data-depth="depth"
  >
    <FartCallItem
      v-for="view in fartViews"
      :key="view.id"
      :tool-call="view.toolCall"
    />

    <section
      v-if="editedViews.length > 0"
      class="activity"
      :class="{ open: isEditedOpen }"
    >
      <button
        class="activity-summary"
        type="button"
        @click="toggleEdited"
      >
        <Pencil
          class="activity-icon"
          :size="18"
          :stroke-width="1.8"
        />
        <span
          class="activity-title"
          :class="{ flowing: isEditing }"
        >{{ editedTitle }}</span>
        <ChevronDown
          class="activity-chevron"
          :class="{ open: isEditedOpen }"
          :size="18"
          :stroke-width="1.8"
        />
      </button>

      <div
        v-if="isEditedOpen"
        class="activity-body"
      >
        <div
          v-if="editedViews.length > 1"
          class="edited-list"
        >
          <div
            v-for="view in editedViews"
            :key="view.id"
            class="edited-item"
          >
            <button
              class="edited-row"
              type="button"
              :aria-expanded="isEditedExpanded(view)"
              @click="selectEdited(view.id)"
            >
              <span class="edited-action">Edited</span>
              <span class="edited-file">{{ fileLabel(view) }}</span>
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
            </button>

            <div
              v-if="isEditedExpanded(view)"
              class="active-edit nested"
            >
              <div class="diff-shell">
                <div class="diff-shell-header">
                  <span class="diff-file">{{ fileLabel(view) }}</span>
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
          v-if="activeEditedView && editedViews.length === 1"
          class="active-edit"
        >
          <div class="diff-shell">
            <div class="diff-shell-header">
              <span class="diff-file">{{ fileLabel(activeEditedView) }}</span>
              <span
                v-if="editStats(activeEditedView)"
                class="edited-stats"
              >
                <span class="stat-add">+{{ editStats(activeEditedView)!.additions }}</span>
                <span class="stat-del">-{{ editStats(activeEditedView)!.deletions }}</span>
              </span>
              <span class="diff-spacer" />
              <span
                v-if="activeEditedView.isAwaitingConfirmation"
                class="row-confirm"
              >
                <AllowSplitButton @confirm="confirmActiveEdited" />
                <button
                  class="btn-reject"
                  type="button"
                  @click="rejectActiveEdited"
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
              v-if="activeDiff(activeEditedView)"
              class="embedded-diff"
              :diff="activeDiff(activeEditedView)!"
              :lines="activeDiffLines(activeEditedView)"
              :status="activeEditedView.status"
              :hide-header="true"
            />
            <ToolStepDetails
              v-else
              class="embedded-details"
              :view="activeEditedView"
            />
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="exploreViews.length > 0 || commandViews.length > 0"
      class="activity muted"
      :class="{ attention: utilityNeedsConfirmation }"
    >
      <button
        class="activity-summary"
        type="button"
        @click="toggleExplore"
      >
        <SquareTerminal
          class="activity-icon"
          :size="18"
          :stroke-width="1.8"
        />
        <span
          class="activity-title"
          :class="{ flowing: isUtilityFlowing }"
        >{{ exploreTitle }}</span>
      </button>
      <div
        v-if="isExploreOpen"
        class="activity-body compact-list"
      >
        <div
          v-for="view in utilityViews"
          :key="view.id"
          class="compact-row"
          :class="{ awaiting: view.isAwaitingConfirmation }"
        >
          <span>{{ compactVerb(view) }}</span>
          <span class="compact-value">{{ compactValue(view) }}</span>
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
      v-for="view in miscViews"
      :key="view.id"
      :view="view"
      :expanded="isExpanded(view)"
      @toggle-expand="toggleExpand(view.id)"
      @confirm="(toolCall, response) => emit('confirm', toolCall, response)"
      @reject="(toolCall) => emit('reject', toolCall)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, Copy, Pencil, SquareTerminal } from 'lucide-vue-next'
import type { Step, ToolCall } from '@/types'
import { buildToolStepView, type ToolDiffData, type ToolDiffLine, type ToolStepView } from '@/stores/helpers/tool-step-view'
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
}>()

const sessionsStore = useSessionsStore()
const userExpandedSteps = ref<Set<string>>(new Set())
const userCollapsedSteps = ref<Set<string>>(new Set())
const editedOpen = ref<boolean | null>(null)
const exploreOpen = ref<boolean | null>(null)
const selectedEditedIds = ref<Set<string>>(new Set())

const views = computed(() => props.steps.map(step => buildToolStepView(step)))
const workingDirectory = computed(() =>
  sessionsStore.sessions.find(session => session.id === props.sessionId)?.workingDirectory || '',
)
const fartViews = computed(() => views.value.filter(view => view.toolName === 'fart'))
const editedViews = computed(() => views.value.filter(isEditedView))
const exploreViews = computed(() => views.value.filter(isExploreView))
const commandViews = computed(() => views.value.filter(view => view.toolName === 'bash'))
const utilityViews = computed(() => [...exploreViews.value, ...commandViews.value])
const miscViews = computed(() => views.value.filter(view =>
  view.toolName !== 'fart' &&
  !isEditedView(view) &&
  !isExploreView(view) &&
  view.toolName !== 'bash',
))

const isEditedOpen = computed(() => {
  if (editedViews.value.some(view => view.isAwaitingConfirmation || view.status === 'streaming-input')) {
    return true
  }
  return editedOpen.value ?? editedViews.value.length === 1
})

const isEditing = computed(() =>
  editedViews.value.some(isViewFlowing),
)

const activeEditedActivityView = computed(() =>
  [...editedViews.value].reverse().find(isViewInProgress) ||
  editedViews.value[editedViews.value.length - 1] ||
  null,
)

const utilityNeedsConfirmation = computed(() =>
  utilityViews.value.some(view => view.isAwaitingConfirmation),
)

const isUtilityActive = computed(() =>
  utilityViews.value.some(isViewInProgress),
)

const isUtilityFlowing = computed(() =>
  utilityViews.value.some(isViewFlowing),
)

const activeUtilityView = computed(() =>
  [...views.value].reverse().find(view =>
    (isExploreView(view) || view.toolName === 'bash') && isViewInProgress(view),
  ) ||
  utilityViews.value[utilityViews.value.length - 1] ||
  null,
)

const isExploreOpen = computed(() =>
  utilityNeedsConfirmation.value || exploreOpen.value === true,
)

const activeEditedView = computed(() => {
  if (!isEditedOpen.value) return null
  if (editedViews.value.length === 1) return editedViews.value[0]
  return null
})

const editedTitle = computed(() => {
  if (isEditing.value && activeEditedActivityView.value) {
    return `${editingVerb(activeEditedActivityView.value)} ${fileLabel(activeEditedActivityView.value)}`
  }
  if (editedViews.value.length !== 1) return `Edited ${editedViews.value.length} files`
  const view = editedViews.value[0]
  const stats = editStats(view)
  const suffix = stats ? ` +${stats.additions} -${stats.deletions}` : ''
  return `Edited ${fileLabel(view)}${suffix}`
})

const exploreTitle = computed(() => {
  if (isUtilityActive.value && activeUtilityView.value) {
    return utilityActiveTitle(activeUtilityView.value)
  }

  const parts: string[] = []
  if (exploreViews.value.length > 0) {
    parts.push(`Explored ${exploreViews.value.length} ${exploreViews.value.length === 1 ? 'file' : 'files'}`)
  }
  if (commandViews.value.length > 0) {
    parts.push(`Ran ${commandViews.value.length} ${commandViews.value.length === 1 ? 'command' : 'commands'}`)
  }
  return parts.join(', ')
})

watch(() => props.parentCollapsed, (collapsed) => {
  if (collapsed) {
    userExpandedSteps.value = new Set()
    userCollapsedSteps.value = new Set()
    editedOpen.value = null
    exploreOpen.value = null
    selectedEditedIds.value = new Set()
  }
})

function isEditedView(view: ToolStepView): boolean {
  return view.toolName === 'write' || view.toolName === 'edit' || !!view.diff || !!view.streamingContent
}

function isExploreView(view: ToolStepView): boolean {
  return ['read', 'grep', 'glob'].includes(view.toolName)
}

function isViewInProgress(view: ToolStepView): boolean {
  return ['pending', 'streaming-input', 'awaiting-confirmation', 'executing'].includes(view.status)
}

function isViewFlowing(view: ToolStepView): boolean {
  return ['pending', 'streaming-input', 'executing'].includes(view.status)
}

function toggleEdited() {
  editedOpen.value = !isEditedOpen.value
  if (!editedOpen.value) selectedEditedIds.value = new Set()
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

function toggleExplore() {
  exploreOpen.value = !isExploreOpen.value
}

function confirmActiveEdited(response: 'once' | 'session' | 'workdir' | 'always') {
  if (activeEditedView.value) emit('confirm', activeEditedView.value.toolCall, response)
}

function rejectActiveEdited() {
  if (activeEditedView.value) emit('reject', activeEditedView.value.toolCall)
}

function activeDiff(view: ToolStepView): ToolDiffData | null {
  return view.diff || view.streamingDiff
}

function activeDiffLines(view: ToolStepView): ToolDiffLine[] {
  return view.diff ? view.diffLines : view.streamingDiffLines
}

function fileLabel(view: ToolStepView): string {
  const path = view.diff?.filePath ||
    view.streamingContent?.filePath ||
    String(view.toolCall.arguments?.file_path || view.toolCall.arguments?.path || '')

  if (!path && isEditedView(view)) {
    return 'file'
  }

  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || normalized || view.displayName
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
  if (raw) return formatPath(raw)
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

function formatPath(value: string): string {
  if (!value) return ''
  const normalized = value.replace(/\\/g, '/')
  const workdir = workingDirectory.value.replace(/\\/g, '/').replace(/\/+$/, '')
  const home = getHomePath()

  if (workdir && (normalized === workdir || normalized.startsWith(`${workdir}/`))) {
    const relative = normalized === workdir ? '.' : normalized.slice(workdir.length + 1)
    return relative || '.'
  }

  if (home && (normalized === home || normalized.startsWith(`${home}/`))) {
    return `~${normalized.slice(home.length)}`
  }

  return normalized
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

.edited-row:hover .edited-file {
  text-decoration: underline;
}

.edited-action {
  color: var(--text-muted);
}

.edited-file {
  color: var(--text-link);
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

.compact-spacer {
  flex: 1;
}
</style>
