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
        <MonacoEditor
          v-else-if="activeBufferForRoot?.model"
          ref="monacoRef"
          :model="activeBufferForRoot.model"
          :view-state="activeBufferForRoot.viewState"
          :read-only="false"
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
import MonacoEditor from '@/editor/MonacoEditor.vue'
import FileUnsavedDialog from '@/components/chat/FileUnsavedDialog.vue'
import EditorStatusBar from './EditorStatusBar.vue'
import EditorTabStrip from './EditorTabStrip.vue'
import FileExplorer from './FileExplorer.vue'
import ProblemsPanel from './ProblemsPanel.vue'

const props = defineProps<{
  initialFilePath: string
  workspaceRoot?: string
  active?: boolean
}>()

const editorWorkspace = useEditorWorkspace()
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
  setCursor,
  setMarkers,
  getOpenEditorsForRoot,
  isPathInsideRoot,
} = editorWorkspace

const monacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null)
const pendingClosePath = ref('')

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

function onKeydown(event: KeyboardEvent) {
  if (!props.active) return
  if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    if (event.shiftKey) saveAll()
    else saveFile()
  }
  if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
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
</script>

<style scoped>
.editor-workbench {
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-panel);
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

.editor-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 13px;
}

.editor-state.error {
  color: #ef4444;
}
</style>
