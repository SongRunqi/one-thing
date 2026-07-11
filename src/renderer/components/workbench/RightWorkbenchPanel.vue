<template>
  <Container
    as="aside"
    main-as="div"
    class="right-workbench"
    body-class="right-workbench-body"
    main-class="right-workbench-main"
    full-height
    overflow="hidden"
    main-overflow="hidden"
    @keydown.esc="pickerOpen = false"
  >
    <div
      v-if="pickerOpen && openTabs.length"
      class="workbench-tab-picker"
      @mousedown.stop
    >
      <Button
        v-for="option in tabOptions"
        :key="option.type"
        unstyled
        class="picker-option"
        :style="workbenchToolStyle(option.categorySlot)"
        @click="addWorkbenchTab(option.type)"
      >
        <component
          :is="option.icon"
          :size="15"
          :stroke-width="2"
          aria-hidden="true"
        />
        <span>{{ option.title }}</span>
      </Button>
    </div>

    <Button
      v-if="!openTabs.length"
      unstyled
      class="workbench-close is-floating"
      title="Close workbench"
      aria-label="Close workbench"
      @click="$emit('close')"
    >
      <X
        :size="14"
        :stroke-width="2"
        aria-hidden="true"
      />
    </Button>

    <Tabs
      v-if="openTabs.length"
      v-model="activeTabId"
      class="right-workbench-tabs"
      addable
      closable
      @tab-add="togglePicker"
      @tab-remove="closeWorkbenchTab"
    >
      <template #actions>
        <Button
          unstyled
          class="workbench-close"
          title="Close workbench"
          aria-label="Close workbench"
          @click="$emit('close')"
        >
          <X
            :size="14"
            :stroke-width="2"
            aria-hidden="true"
          />
        </Button>
      </template>

      <TabPane
        v-for="tab in openTabs"
        :key="tab.id"
        :name="tab.id"
        :label="tab.title"
        lazy
      >
        <template #label>
          <span
            class="workbench-tab-label"
            :style="workbenchToolStyle(tabCategorySlot(tab.type))"
          >
            <component
              :is="tabIcon(tab.type)"
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>{{ tab.title }}</span>
          </span>
        </template>

        <EditorWorkbench
          v-if="tab.type === 'files' || tab.type === 'file'"
          :workspace-root="tab.workspaceRoot || workspaceRoot"
          :initial-file-path="tab.filePath"
          :active="activeTabId === tab.id"
          @open-file="openFile"
        />

        <section
          v-else-if="tab.type === 'terminal'"
          class="workbench-terminal"
        >
          <div
            ref="terminalOutputRef"
            class="terminal-output"
          >
            <div
              v-for="line in terminalLines"
              :key="line.id"
              :class="['terminal-line', line.kind]"
            >
              <span
                v-if="line.kind === 'command'"
                class="terminal-prompt"
              >$</span>
              <pre>{{ line.text }}</pre>
            </div>
          </div>
          <form
            class="terminal-input-row"
            @submit.prevent="runTerminalCommand"
          >
            <span class="terminal-input-prompt">$</span>
            <input
              v-model="terminalInput"
              :disabled="terminalBusy || !sessionId || !canRunShellTools"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Command"
            >
            <Button
              unstyled
              class="terminal-run"
              native-type="submit"
              :disabled="terminalBusy || !terminalInput.trim() || !sessionId || !canRunShellTools"
            >
              <Play
                :size="13"
                :stroke-width="2"
                aria-hidden="true"
              />
            </Button>
          </form>
        </section>

        <section
          v-else-if="tab.type === 'browser'"
          class="workbench-browser"
        >
          <form
            class="browser-toolbar"
            @submit.prevent="navigateBrowser"
          >
            <Globe2
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
            />
            <input
              v-model="browserInput"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="localhost:3000"
            >
            <Button
              unstyled
              class="browser-go"
              native-type="submit"
              :disabled="!browserInput.trim()"
            >
              <ArrowRight
                :size="14"
                :stroke-width="2"
                aria-hidden="true"
              />
            </Button>
          </form>
          <iframe
            v-if="browserUrl"
            class="browser-frame"
            :src="browserUrl"
            title="Workbench browser"
          />
          <div
            v-else
            class="workbench-empty-state compact"
          >
            Open a local page
          </div>
        </section>
      </TabPane>
    </Tabs>

    <div
      v-else
      class="workbench-empty-state empty-root"
    >
      <div class="workbench-empty-copy">
        <span class="workbench-empty-title">Workbench</span>
        <span class="workbench-empty-hint">Open a tool alongside the chat.</span>
      </div>
      <Button
        v-for="option in tabOptions"
        :key="option.type"
        unstyled
        class="empty-action"
        :style="workbenchToolStyle(option.categorySlot)"
        :title="option.title"
        @click="addWorkbenchTab(option.type)"
      >
        <component
          :is="option.icon"
          :size="15"
          :stroke-width="2"
          aria-hidden="true"
        />
        <span>{{ option.title }}</span>
      </Button>
    </div>
  </Container>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { ArrowRight, FileText, Files, Globe2, Play, Terminal, X } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Container from '@/components/common/Container.vue'
import Tabs from '@/components/common/Tabs.vue'
import TabPane from '@/components/common/TabPane.vue'
import EditorWorkbench from '@/components/editor/EditorWorkbench.vue'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'
import type { TabPaneName } from '@/components/common/tabs'
import type { ContextVariable } from '@/types'
import { platformApi } from '@/platform'

type WorkbenchTabType = 'files' | 'file' | 'terminal' | 'browser'

interface WorkbenchTab {
  id: string
  type: WorkbenchTabType
  title: string
  filePath?: string
  workspaceRoot?: string
}

interface TerminalLine {
  id: string
  kind: 'command' | 'output' | 'error'
  text: string
}

const props = defineProps<{
  sessionId: string
  workspaceRoot?: string
  workspaceRoots?: string[]
}>()

defineEmits<{
  close: []
}>()

const tabOptions: Array<{
  type: WorkbenchTabType
  title: string
  icon: Component
  categorySlot: number
}> = [
  { type: 'files', title: 'Files', icon: Files, categorySlot: 5 },
  { type: 'terminal', title: 'Terminal', icon: Terminal, categorySlot: 6 },
  { type: 'browser', title: 'Browser', icon: Globe2, categorySlot: 7 },
]

const pickerOpen = ref(false)
const openTabs = ref<WorkbenchTab[]>([])
const activeTabId = ref('')
const filesWorkspaceRoot = ref('')
const variableWorkspaceRoots = ref<string[]>([])
const noteWorkspaceRoots = ref<string[]>([])
const terminalInput = ref('')
const terminalBusy = ref(false)
const terminalOutputRef = ref<HTMLElement | null>(null)
const terminalLines = ref<TerminalLine[]>([])
const browserInput = ref('localhost:3000')
const browserUrl = ref('')
const canRunShellTools = computed(() => platformApi.capabilities.shellTools)
let terminalLineId = 0
let variableRequestId = 0

const NOTE_ROOT_VARIABLE_NAMES = new Set(['ai_note_dir', 'user_note_dir', 'work_note_dir'])

const editorWorkspace = useEditorWorkspace()
const configuredWorkspaceRoots = computed(() => uniquePaths([
  ...variableWorkspaceRoots.value,
  ...(props.workspaceRoots || []),
  props.workspaceRoot,
]))
const workspaceRoot = computed(() => filesWorkspaceRoot.value || configuredWorkspaceRoots.value[0] || '')

function togglePicker() {
  pickerOpen.value = !pickerOpen.value
}

function addWorkbenchTab(type: WorkbenchTabType): WorkbenchTab {
  const existing = openTabs.value.find(tab => tab.type === type)
  if (existing) {
    activeTabId.value = existing.id
    pickerOpen.value = false
    return existing
  }

  const option = tabOptions.find(item => item.type === type)
  const tab: WorkbenchTab = {
    id: `${type}-${Date.now()}`,
    type,
    title: option?.title || type,
  }
  openTabs.value = [...openTabs.value, tab]
  activeTabId.value = tab.id
  pickerOpen.value = false
  return tab
}

function closeWorkbenchTab(name: TabPaneName) {
  const index = openTabs.value.findIndex(tab => tab.id === name)
  if (index === -1) return

  const wasActive = openTabs.value[index]?.id === activeTabId.value
  const nextTabs = openTabs.value.filter(tab => tab.id !== name)
  openTabs.value = nextTabs

  if (!wasActive) return
  activeTabId.value = nextTabs[Math.min(index, nextTabs.length - 1)]?.id || ''
}

function tabIcon(type: WorkbenchTabType): Component {
  if (type === 'file') return FileText
  if (type === 'terminal') return Terminal
  if (type === 'browser') return Globe2
  return Files
}

function tabCategorySlot(type: WorkbenchTabType): number {
  if (type === 'terminal') return 6
  if (type === 'browser') return 7
  return 5
}

function workbenchToolStyle(categorySlot: number): Record<string, string> {
  return {
    '--workbench-tool-icon-color': `var(--ui-category-${categorySlot}-icon)`,
  }
}

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '')
}

function parentDir(filePath: string): string {
  return normalizePath(filePath).split('/').slice(0, -1).join('/') || '/'
}

function basename(filePath: string): string {
  return normalizePath(filePath).split('/').filter(Boolean).pop() || filePath
}

function isPathInsideRoot(filePath: string, root: string): boolean {
  if (!filePath || !root) return false
  const normalizedPath = normalizePath(filePath)
  const normalizedRoot = normalizePath(root)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}

function uniquePaths(paths: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    if (!path) continue
    const normalized = normalizePath(path)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function findContainingRoot(filePath: string, roots: string[]): string {
  return roots.find(root => isPathInsideRoot(filePath, root)) || ''
}

function rootsFromWorkdirVariable(variable?: ContextVariable): string[] {
  if (!variable) return []
  const values = Array.isArray(variable.values) && variable.values.length > 0
    ? variable.values
    : [variable.value]
  return uniquePaths(values)
}

function applyVariableRoots(variables: ContextVariable[]) {
  const workdirVariable = variables.find(variable => variable.name === 'workdir')
  variableWorkspaceRoots.value = rootsFromWorkdirVariable(workdirVariable)
  noteWorkspaceRoots.value = uniquePaths(
    variables
      .filter(variable => NOTE_ROOT_VARIABLE_NAMES.has(variable.name))
      .map(variable => variable.value),
  )
}

async function refreshVariableRoots(): Promise<void> {
  const sessionId = props.sessionId
  if (!sessionId || !platformApi?.listVariables) return

  const requestId = ++variableRequestId
  try {
    const response = await platformApi.listVariables(sessionId)
    if (requestId !== variableRequestId || sessionId !== props.sessionId) return
    if (!response.success || !response.variables) return
    applyVariableRoots(response.variables)
  } catch {
    // Variables are an enhancement for root detection; props still provide the project roots.
  }
}

function resolveFileWorkspaceRoot(filePath: string): string {
  const noteRoot = findContainingRoot(filePath, noteWorkspaceRoots.value)
  if (noteRoot) return noteRoot

  const projectRoot = findContainingRoot(filePath, configuredWorkspaceRoots.value)
  if (projectRoot) return projectRoot

  if (filesWorkspaceRoot.value && isPathInsideRoot(filePath, filesWorkspaceRoot.value)) return filesWorkspaceRoot.value
  return parentDir(filePath)
}

async function openFile(filePath: string) {
  await refreshVariableRoots()
  const root = resolveFileWorkspaceRoot(filePath)
  filesWorkspaceRoot.value = root
  const existing = openTabs.value.find(tab => tab.type === 'file' && tab.filePath === filePath)
  if (existing) {
    existing.title = basename(filePath)
    existing.workspaceRoot = root
    activeTabId.value = existing.id
  } else {
    const tab: WorkbenchTab = {
      id: `file-${Date.now()}-${openTabs.value.length}`,
      type: 'file',
      title: basename(filePath),
      filePath,
      workspaceRoot: root,
    }
    openTabs.value = [...openTabs.value, tab]
    activeTabId.value = tab.id
  }
  await nextTick()
  await editorWorkspace.setWorkspaceRoot(root).catch(() => {})
  await editorWorkspace.openFile(filePath)
}

watch(activeTabId, id => {
  const tab = openTabs.value.find(item => item.id === id)
  if (tab?.type !== 'file' || !tab.filePath) return
  const root = tab.workspaceRoot || resolveFileWorkspaceRoot(tab.filePath)
  filesWorkspaceRoot.value = root
  void editorWorkspace.setWorkspaceRoot(root)
    .catch(() => {})
    .then(() => editorWorkspace.openFile(tab.filePath!))
})

watch(() => props.sessionId, () => {
  filesWorkspaceRoot.value = ''
  variableWorkspaceRoots.value = []
  noteWorkspaceRoots.value = []
  variableRequestId += 1
  void refreshVariableRoots()
}, { immediate: true })

function pushTerminalLine(kind: TerminalLine['kind'], text: string) {
  terminalLineId += 1
  terminalLines.value.push({
    id: `terminal-line-${terminalLineId}`,
    kind,
    text,
  })
  void nextTick(() => {
    const output = terminalOutputRef.value
    if (output) output.scrollTop = output.scrollHeight
  })
}

function getToolOutput(result: unknown): string {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  const record = result as Record<string, unknown>
  if (typeof record.output === 'string') return record.output
  const metadata = record.metadata
  if (metadata && typeof metadata === 'object' && typeof (metadata as Record<string, unknown>).output === 'string') {
    return (metadata as Record<string, string>).output
  }
  return JSON.stringify(result, null, 2)
}

async function runTerminalCommand() {
  const command = terminalInput.value.trim()
  if (!command || terminalBusy.value || !props.sessionId) return
  if (!canRunShellTools.value) {
    pushTerminalLine('error', 'Shell tools are not available in this host.')
    return
  }

  terminalInput.value = ''
  terminalBusy.value = true
  pushTerminalLine('command', command)

  try {
    const response = await platformApi.executeTool(
      'bash',
      { command, timeout: 120000 },
      `workbench-terminal-${Date.now()}`,
      props.sessionId,
    )
    if (!response.success) {
      pushTerminalLine('error', response.error || 'Command failed')
      return
    }
    pushTerminalLine('output', getToolOutput(response.result) || '(no output)')
  } catch (error) {
    pushTerminalLine('error', error instanceof Error ? error.message : 'Command failed')
  } finally {
    terminalBusy.value = false
  }
}

function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

function navigateBrowser() {
  browserUrl.value = normalizeBrowserUrl(browserInput.value)
}

defineExpose({
  openFile,
})
</script>

<style scoped>
/* 台面(Bench):直角实线,框不闭合只留角标,左缘一把刻度尺。
   活性一律制图黛蓝(theme info 色)。 */
.right-workbench {
  position: relative;
  height: 100%;
  min-width: 0;
  min-height: 0;
  --workbench-accent: var(--ui-status-info-fg, var(--color-info, #39586f));
  --workbench-line: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 85%, transparent);
  --workbench-tool-card-bg: var(--ui-surface-elevated-bg, var(--bg-elevated));
  --workbench-tool-card-hover-bg: color-mix(
    in srgb,
    var(--workbench-tool-card-bg) 90%,
    var(--workbench-tool-icon-color, var(--ui-accent-primary-fg, var(--accent))) 10%
  );
  --workbench-tool-card-active-bg: color-mix(
    in srgb,
    var(--workbench-tool-card-bg) 87%,
    var(--workbench-tool-icon-color, var(--ui-accent-primary-fg, var(--accent))) 13%
  );
  --workbench-tool-card-border: color-mix(
    in srgb,
    var(--ui-border-default-border, var(--border)) 84%,
    var(--ui-text-muted-fg, var(--muted)) 16%
  );
  --workbench-tool-card-hover-border: color-mix(
    in srgb,
    var(--workbench-tool-card-border) 76%,
    var(--workbench-tool-icon-color, var(--ui-accent-primary-fg, var(--accent))) 24%
  );
  --workbench-tool-card-active-border: color-mix(
    in srgb,
    var(--workbench-tool-card-border) 68%,
    var(--workbench-tool-icon-color, var(--ui-accent-primary-fg, var(--accent))) 32%
  );
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  color: var(--ui-text-primary-fg, var(--text));
}

:deep(.right-workbench-body),
:deep(.right-workbench-main) {
  min-width: 0;
  min-height: 0;
}

/* 签名:左缘刻度尺。8px 细刻、40px 长刻,面板即量具。 */
.right-workbench::before {
  content: "";
  position: absolute;
  z-index: 6;
  top: 0;
  left: 0;
  bottom: 0;
  width: 8px;
  background:
    repeating-linear-gradient(
      to bottom,
      var(--workbench-line) 0 1px,
      transparent 1px 8px
    ) left / 4px 100% no-repeat,
    repeating-linear-gradient(
      to bottom,
      var(--workbench-line) 0 1px,
      transparent 1px 40px
    ) left / 8px 100% no-repeat;
  opacity: 0.5;
  pointer-events: none;
}

.workbench-close {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

/* Empty state has no tab header to host the button, so it floats. */
.workbench-close.is-floating {
  position: absolute;
  z-index: 4;
  top: 7px;
  right: 8px;
}

.workbench-close:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.right-workbench-tabs {
  height: 100%;
  --app-tabs-active-text: var(--workbench-accent);
  --app-tabs-accent: var(--workbench-accent);
}

.right-workbench-tabs :deep(.app-tabs-content) {
  padding: 0;
}

/* 尺寸线:页签基线两端立起止点,tab 条是一段被测量的长度 */
.right-workbench-tabs :deep(.app-tabs-nav)::before,
.right-workbench-tabs :deep(.app-tabs-nav)::after {
  content: "";
  position: absolute;
  bottom: -1px;
  width: 1px;
  height: 6px;
  background: var(--workbench-line);
}

.right-workbench-tabs :deep(.app-tabs-nav)::before {
  left: 0;
}

.right-workbench-tabs :deep(.app-tabs-nav)::after {
  right: 0;
}

/* 卡尺括号 ⌞⌟:活动页签的指示线改为三边开口括号 */
.right-workbench .right-workbench-tabs :deep(.app-tabs--line .app-tabs-tab)::after {
  top: auto;
  right: 5px;
  bottom: -1px;
  left: 5px;
  height: 5px;
  background: transparent;
  border-right: 1.5px solid var(--workbench-accent);
  border-bottom: 1.5px solid var(--workbench-accent);
  border-left: 1.5px solid var(--workbench-accent);
}

/* In a narrow panel the text ellipsizes away, but icon + close must survive:
   10px padding ×2 + 15px icon + 6px gap + 20px close ≈ 64px. */
.right-workbench-tabs :deep(.app-tabs-tab) {
  min-width: 64px;
  padding: 0 10px;
}

.right-workbench-tabs :deep(.app-tab-pane) {
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.workbench-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.workbench-tab-label svg,
.picker-option svg,
.empty-action svg {
  flex: 0 0 auto;
  color: var(--workbench-tool-icon-color, currentColor);
  opacity: 0.92;
  transition:
    color 0.25s ease,
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.workbench-tab-label span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Anchored under the header actions ("+" now lives at the right edge). */
.workbench-tab-picker {
  position: absolute;
  z-index: 5;
  top: 38px;
  right: 8px;
  width: min(220px, calc(100% - 16px));
  padding: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
}

.right-workbench .picker-option {
  --app-button-fill: transparent;
  --app-button-hover-fill: var(--workbench-tool-card-hover-bg);
  --app-button-hover-border: var(--workbench-tool-card-hover-border);
  --app-button-hover-fg: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  --app-button-hover-shadow: none;
  width: 100%;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  border-radius: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  text-align: left;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.right-workbench .picker-option:hover {
  background: var(--workbench-tool-card-hover-bg);
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  box-shadow: none;
}

.right-workbench .picker-option:hover svg,
.right-workbench .picker-option:focus-visible svg,
.right-workbench .empty-action:hover svg,
.right-workbench .empty-action:focus-visible svg {
  color: var(--workbench-tool-icon-color, var(--ui-accent-primary-fg, var(--accent)));
  opacity: 1;
  transform: scale(1.1);
}

.right-workbench .picker-option:active {
  --app-button-hover-fill: var(--workbench-tool-card-active-bg);
  --app-button-hover-border: var(--workbench-tool-card-active-border);
  --app-button-hover-shadow: none;
  background: var(--workbench-tool-card-active-bg);
  box-shadow: none;
}

.workbench-empty-state {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
}

/* Empty state reads as a panel with structure, not floating buttons:
   header at the top, tool list rows under it. */
.workbench-empty-state.empty-root {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 6px;
  padding: 44px 18px 16px;
  box-sizing: border-box;
}

.workbench-empty-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.workbench-empty-title {
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 600;
}

.workbench-empty-hint {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.workbench-empty-state.compact {
  height: auto;
  flex: 1 1 auto;
}

.right-workbench .empty-action {
  --app-button-fill: var(--workbench-tool-card-bg);
  --app-button-hover-fill: var(--workbench-tool-card-hover-bg);
  --app-button-border: var(--workbench-tool-card-border);
  --app-button-hover-border: var(--workbench-tool-card-hover-border);
  --app-button-hover-fg: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;
  width: 100%;
  height: 30px;
  box-sizing: border-box;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--workbench-tool-card-border);
  border-radius: 0;
  color: var(--ui-text-muted-fg, var(--muted));
  background: var(--workbench-tool-card-bg);
  font-size: 12px;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease,
    box-shadow 0.14s ease;
}

.empty-action span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-workbench .empty-action:hover {
  border-color: var(--workbench-tool-card-hover-border);
  background: var(--workbench-tool-card-hover-bg);
  color: var(--ui-text-secondary-fg, var(--ui-sidebar-item-hover-fg, var(--text-sidebar-item)));
  box-shadow: none;
}

.right-workbench .empty-action:active {
  --app-button-hover-fill: var(--workbench-tool-card-active-bg);
  --app-button-hover-border: var(--workbench-tool-card-active-border);
  --app-button-hover-shadow: none;
  border-color: var(--workbench-tool-card-active-border);
  background: var(--workbench-tool-card-active-bg);
  box-shadow: none;
}

/* 角标裁切线:工作面不闭合成框,只画四只角 */
.workbench-terminal,
.workbench-browser {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 6px;
  background:
    linear-gradient(var(--workbench-line), var(--workbench-line)) top 0 left 10px / 10px 1px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) top 0 left 10px / 1px 10px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) top 0 right 2px / 10px 1px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) top 0 right 2px / 1px 10px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) bottom 2px left 10px / 10px 1px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) bottom 2px left 10px / 1px 10px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) bottom 2px right 2px / 10px 1px no-repeat,
    linear-gradient(var(--workbench-line), var(--workbench-line)) bottom 2px right 2px / 1px 10px no-repeat,
    var(--ui-surface-panel-bg, var(--bg-panel));
}

.terminal-output {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  line-height: 1.45;
}

.terminal-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 8px;
  color: var(--ui-text-primary-fg, var(--text));
}

.terminal-line.output,
.terminal-line.error {
  display: block;
}

.terminal-line.error {
  color: var(--ui-status-danger-fg, #ef4444);
}

.terminal-line pre {
  min-width: 0;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
}

.terminal-prompt,
.terminal-input-prompt {
  color: var(--workbench-accent);
}

.terminal-input-row,
.browser-toolbar {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.terminal-input-row input,
.browser-toolbar input {
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  padding: 0 9px;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  outline: none;
}

.terminal-input-row input:focus,
.browser-toolbar input:focus {
  border-color: var(--workbench-accent);
}

.terminal-run,
.browser-go {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

.terminal-run:hover,
.browser-go:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.browser-toolbar {
  order: -1;
  border-top: 0;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
}

.browser-frame {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  width: 100%;
  border: 0;
  background: white;
}
</style>
