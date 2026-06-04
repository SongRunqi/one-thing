<template>
  <div
    class="editor-workbench"
    @keydown="onKeydown"
  >
    <FileExplorer
      :root="workspace.root"
      :active-path="workspace.activePath"
    />
    <section class="editor-main">
      <EditorTabStrip
        :open-editors="openEditorsForRoot"
        :active-path="activePathForRoot"
        :buffers="workspace.buffers"
        @select="setActivePath"
        @close="requestCloseFile"
      />
      <div class="editor-body">
        <div
          v-if="activeBufferForRoot?.loading"
          class="editor-state"
        >
          Loading...
        </div>
        <div
          v-else-if="activeBufferForRoot?.isBinary || activeBufferForRoot?.truncated"
          class="editor-state"
        >
          This file is read-only in the workbench.
        </div>
        <div
          v-else-if="activeBufferForRoot?.error && !activeBufferForRoot.model"
          class="editor-state error"
        >
          {{ activeBufferForRoot.error }}
        </div>
        <MarkdownDocumentEditor
          v-else-if="activeBufferForRoot?.isMarkdown"
          ref="markdownRef"
          class="markdown-workbench-editor"
          :model-value="activeBufferForRoot.value"
          surface="document"
          :document-id="activeBufferForRoot.filePath"
          :document-path="activeBufferForRoot.filePath"
          :workspace-root="workspaceRoot"
          :settings="editorSettings"
          :features="markdownFeatures"
          :toolbar="false"
          :min-height="120"
          :max-height="100000"
          placeholder=""
          @update:model-value="onMarkdownChange"
          @transaction="onMarkdownTransaction"
          @paste="onMarkdownPaste"
          @open-link="openMarkdownLink"
          @open-image="openMarkdownImage"
        />
        <MonacoEditor
          v-else-if="activeBufferForRoot?.model"
          ref="monacoRef"
          :model="activeBufferForRoot.model"
          :view-state="activeBufferForRoot.viewState"
          :read-only="false"
          :settings="editorSettings"
          @change="onEditorChange"
          @cursor-change="onCursorChange"
          @view-state-change="onViewStateChange"
          @markers-change="onMarkersChange"
        />
        <div
          v-else
          class="editor-state"
        >
          Open a file
        </div>
      </div>
      <ProblemsPanel
        :open="workspace.problemsOpen"
        :problems="problems"
        @close="workspace.problemsOpen = false"
        @open-problem="openProblem"
      />
      <EditorStatusBar :buffer="activeBufferForRoot" />
    </section>

    <FileUnsavedDialog
      :visible="!!pendingClosePath"
      :file-path="pendingClosePath || undefined"
      @save="saveAndClosePending"
      @discard="discardAndClosePending"
      @cancel="pendingClosePath = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'
import { useSettingsStore } from '@/stores/settings'
import MonacoEditor from '@/editor/MonacoEditor.vue'
import MarkdownDocumentEditor from '@/editor/MarkdownDocumentEditor.vue'
import FileUnsavedDialog from '@/components/chat/FileUnsavedDialog.vue'
import EditorStatusBar from './EditorStatusBar.vue'
import EditorTabStrip from './EditorTabStrip.vue'
import FileExplorer from './FileExplorer.vue'
import ProblemsPanel from './ProblemsPanel.vue'
import { handleMarkdownAttachmentPaste } from '@/editor/markdown-attachments'
import type { MarkdownDocumentEditorHandle, MarkdownFeatureSet } from '@/editor/markdown-document'
import type { EditorTransaction } from '@/editor/types'
import type { MarkdownAssetResolution } from '@shared/ipc/markdown'

const props = defineProps<{
  initialFilePath: string
  workspaceRoot?: string
  active?: boolean
}>()

const editorWorkspace = useEditorWorkspace()
const settingsStore = useSettingsStore()
const {
  workspace,
  problems,
  setWorkspaceRoot,
  openFile,
  setActivePath,
  handleModelChange,
  saveFile,
  saveAll,
  closeFile,
  setViewState,
  setScrollTop,
  setCursor,
  setMarkers,
  getOpenEditorsForRoot,
  isPathInsideRoot,
} = editorWorkspace

const monacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null)
const markdownRef = ref<MarkdownDocumentEditorHandle | null>(null)
const pendingClosePath = ref('')
const editorSettings = computed(() => settingsStore.settings.general.editor)
const markdownFeatures: MarkdownFeatureSet = {
  tasks: true,
  tables: true,
  images: true,
  math: true,
  codeBlocks: true,
  frontmatter: true,
}

function parentDir(filePath: string) {
  return filePath.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
}

const workspaceRoot = computed(() => {
  return props.workspaceRoot || parentDir(props.initialFilePath)
})

const openEditorsForRoot = computed(() => getOpenEditorsForRoot(workspaceRoot.value))

const activePathForRoot = computed(() => {
  if (workspace.activePath && isPathInsideRoot(workspace.activePath, workspaceRoot.value)) {
    return workspace.activePath
  }
  return openEditorsForRoot.value[0] || ''
})

const activeBufferForRoot = computed(() => {
  const activePath = activePathForRoot.value
  return activePath ? workspace.buffers.get(activePath) || null : null
})

async function bootstrap() {
  await openFile(props.initialFilePath)
  setWorkspaceRoot(workspaceRoot.value).catch(() => {})
  await nextTick()
  monacoRef.value?.focus()
}

function requestCloseFile(filePath: string) {
  const buffer = workspace.buffers.get(filePath)
  if (buffer?.dirty) {
    pendingClosePath.value = filePath
    return
  }
  closeFile(filePath)
}

function currentEditorFilePath() {
  return activeBufferForRoot.value?.filePath || ''
}

function onEditorChange(value: string) {
  const filePath = currentEditorFilePath()
  if (!filePath) return
  handleModelChange(filePath, value)
}

function onMarkdownChange(value: string) {
  const filePath = currentEditorFilePath()
  if (!filePath) return
  handleModelChange(filePath, value)
}

function lineColumnAt(value: string, position: number): { line: number; column: number } {
  const before = value.slice(0, Math.max(0, Math.min(position, value.length)))
  const lines = before.split('\n')
  return {
    line: lines.length,
    column: (lines.at(-1)?.length || 0) + 1,
  }
}

function onMarkdownTransaction(transaction: EditorTransaction) {
  const filePath = currentEditorFilePath()
  if (!filePath) return
  const cursor = lineColumnAt(transaction.value, transaction.selection.to)
  setCursor(filePath, cursor.line, cursor.column)
  setScrollTop(filePath, markdownRef.value?.getScrollTop() || 0)
}

async function onMarkdownPaste(event: ClipboardEvent) {
  const filePath = currentEditorFilePath()
  await handleMarkdownAttachmentPaste({
    event,
    editor: markdownRef.value,
    documentPath: filePath,
    workspaceRoot: workspaceRoot.value,
  })
}

function onCursorChange(line: number, column: number) {
  const filePath = currentEditorFilePath()
  if (!filePath) return
  setCursor(filePath, line, column)
}

function onViewStateChange(state: Parameters<typeof setViewState>[1]) {
  const filePath = currentEditorFilePath()
  if (!filePath) return
  setViewState(filePath, state)
}

function onMarkersChange(markers: Parameters<typeof setMarkers>[1]) {
  const filePath = currentEditorFilePath()
  if (!filePath) return
  setMarkers(filePath, markers)
}

async function saveAndClosePending() {
  if (!pendingClosePath.value) return
  const saved = await saveFile(pendingClosePath.value)
  if (!saved) return
  closeFile(pendingClosePath.value)
  pendingClosePath.value = ''
}

function discardAndClosePending() {
  if (!pendingClosePath.value) return
  closeFile(pendingClosePath.value)
  pendingClosePath.value = ''
}

async function openProblem(filePath: string, line: number) {
  await openFile(filePath)
  await nextTick()
  monacoRef.value?.revealLine(line)
}

async function resolveMarkdownLink(href: string, asset?: MarkdownAssetResolution | null) {
  if (asset) return asset
  const documentPath = currentEditorFilePath()
  if (!documentPath) return null
  const response = await window.electronAPI.resolveMarkdownAsset({
    documentPath,
    workspaceRoot: workspaceRoot.value,
    rawTarget: href,
  })
  return response.success ? response.asset || null : null
}

async function openMarkdownLink(payload: { href: string; asset?: MarkdownAssetResolution | null }) {
  const asset = await resolveMarkdownLink(payload.href, payload.asset)
  if (asset?.kind === 'external') {
    await window.electronAPI.openExternal(asset.href || payload.href)
    return
  }
  if (asset?.absolutePath) {
    await window.electronAPI.openPath(asset.absolutePath)
    return
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(payload.href)) {
    await window.electronAPI.openExternal(payload.href)
  }
}

async function openMarkdownImage(payload: {
  src: string
  alt: string
  absolutePath?: string
  asset?: MarkdownAssetResolution | null
}) {
  const src = payload.asset?.dataUrl || payload.src
  await window.electronAPI.openImagePreview(src, payload.alt)
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (!props.active) return
  if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    if (event.shiftKey) saveAll()
    else saveFile()
  }
  if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
    if (activeBufferForRoot.value?.isMarkdown) return
    event.preventDefault()
    monacoRef.value?.openFind()
  }
  if (event.key === 'p' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    window.electronAPI.toggleSearchWindow?.()
  }
}

onMounted(bootstrap)

watch(() => props.initialFilePath, async (filePath) => {
  await openFile(filePath)
})

watch(workspaceRoot, async (root) => {
  await setWorkspaceRoot(root)
})

watch(() => activeBufferForRoot.value?.filePath, async () => {
  await nextTick()
  if (activeBufferForRoot.value?.isMarkdown) {
    markdownRef.value?.setScrollTop(activeBufferForRoot.value.scrollTop)
    markdownRef.value?.focus()
  } else {
    monacoRef.value?.focus()
  }
})
</script>

<style scoped>
.editor-workbench {
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.editor-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.editor-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.markdown-workbench-editor {
  height: 100%;
  box-sizing: border-box;
  padding: 18px 24px;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.markdown-workbench-editor :deep(.markdown-document-textarea),
.markdown-workbench-editor :deep(.text-editor),
.markdown-workbench-editor :deep(.cm-editor) {
  height: 100%;
  width: 100%;
  min-height: 0;
  min-width: 0;
}

.markdown-workbench-editor :deep(.cm-scroller) {
  height: 100%;
  width: 100%;
  max-height: none;
  overflow: auto;
}

.editor-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
}

.editor-state.error {
  color: var(--ui-status-danger-fg, #ef4444);
}
</style>
