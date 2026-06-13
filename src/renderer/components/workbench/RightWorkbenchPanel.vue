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
      v-if="pickerOpen"
      class="workbench-tab-picker"
      @mousedown.stop
    >
      <Button
        v-for="option in tabOptions"
        :key="option.type"
        unstyled
        class="picker-option"
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

    <Tabs
      v-if="openTabs.length"
      v-model="activeTabId"
      class="right-workbench-tabs"
      addable
      closable
      @tab-add="togglePicker"
      @tab-remove="closeWorkbenchTab"
    >
      <TabPane
        v-for="tab in openTabs"
        :key="tab.id"
        :name="tab.id"
        :label="tab.title"
        lazy
      >
        <template #label>
          <span class="workbench-tab-label">
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
              :disabled="terminalBusy || !sessionId"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Command"
            >
            <Button
              unstyled
              class="terminal-run"
              native-type="submit"
              :disabled="terminalBusy || !terminalInput.trim() || !sessionId"
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
      class="workbench-empty-state"
    >
      <Button
        unstyled
        class="empty-add"
        @click="togglePicker"
      >
        <Plus
          :size="16"
          :stroke-width="2"
          aria-hidden="true"
        />
      </Button>
    </div>
  </Container>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { ArrowRight, FileText, Files, Globe2, Play, Plus, Terminal, X } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Container from '@/components/common/Container.vue'
import Tabs from '@/components/common/Tabs.vue'
import TabPane from '@/components/common/TabPane.vue'
import EditorWorkbench from '@/components/editor/EditorWorkbench.vue'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'
import type { TabPaneName } from '@/components/common/tabs'

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
}>()

defineEmits<{
  close: []
}>()

const tabOptions: Array<{
  type: WorkbenchTabType
  title: string
  icon: Component
}> = [
  { type: 'files', title: 'Files', icon: Files },
  { type: 'terminal', title: 'Terminal', icon: Terminal },
  { type: 'browser', title: 'Browser', icon: Globe2 },
]

const pickerOpen = ref(false)
const openTabs = ref<WorkbenchTab[]>([])
const activeTabId = ref('')
const filesWorkspaceRoot = ref('')
const terminalInput = ref('')
const terminalBusy = ref(false)
const terminalOutputRef = ref<HTMLElement | null>(null)
const terminalLines = ref<TerminalLine[]>([])
const browserInput = ref('localhost:3000')
const browserUrl = ref('')
let terminalLineId = 0

const editorWorkspace = useEditorWorkspace()
const workspaceRoot = computed(() => filesWorkspaceRoot.value || props.workspaceRoot || '')

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

function normalizePath(path: string): string {
  if (path === '/') return '/'
  return path.replace(/\/+$/, '')
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

function resolveFileWorkspaceRoot(filePath: string): string {
  if (filesWorkspaceRoot.value && isPathInsideRoot(filePath, filesWorkspaceRoot.value)) {
    return filesWorkspaceRoot.value
  }
  if (props.workspaceRoot && isPathInsideRoot(filePath, props.workspaceRoot)) {
    return props.workspaceRoot
  }
  return parentDir(filePath)
}

async function openFile(filePath: string) {
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

  terminalInput.value = ''
  terminalBusy.value = true
  pushTerminalLine('command', command)

  try {
    const response = await window.electronAPI.executeTool(
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
.right-workbench {
  position: relative;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  color: var(--ui-text-primary-fg, var(--text));
}

:deep(.right-workbench-body),
:deep(.right-workbench-main) {
  min-width: 0;
  min-height: 0;
}

.workbench-close {
  position: absolute;
  z-index: 4;
  top: 7px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.workbench-close:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.right-workbench-tabs {
  height: 100%;
}

.right-workbench-tabs :deep(.app-tabs-nav-scroll) {
  padding-right: 38px;
}

.right-workbench-tabs :deep(.app-tabs-content) {
  padding: 0;
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
}

.workbench-tab-label span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-tab-picker {
  position: absolute;
  z-index: 5;
  top: 38px;
  left: 8px;
  width: min(220px, calc(100% - 16px));
  padding: 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
}

.picker-option {
  width: 100%;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  border-radius: 6px;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  text-align: left;
}

.picker-option:hover {
  background: var(--ui-state-hover-bg, var(--hover));
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

.workbench-empty-state.compact {
  height: auto;
  flex: 1 1 auto;
}

.empty-add {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  color: var(--ui-text-muted-fg, var(--muted));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
}

.empty-add:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.workbench-terminal,
.workbench-browser {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
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
  color: var(--ui-text-muted-fg, var(--muted));
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
  border-radius: 6px;
  padding: 0 9px;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  outline: none;
}

.terminal-input-row input:focus,
.browser-toolbar input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.terminal-run,
.browser-go {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
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
