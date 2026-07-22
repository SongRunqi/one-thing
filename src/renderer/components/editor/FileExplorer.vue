<template>
  <aside class="file-explorer">
    <div class="explorer-header">
      <span>Explorer</span>
      <div class="explorer-actions">
        <Button
          unstyled
          title="New file"
          @click="openNameDialog('create-file', root)"
        >
          <FilePlus :size="13" />
        </Button>
        <Button
          unstyled
          title="New folder"
          @click="openNameDialog('create-directory', root)"
        >
          <FolderPlus :size="13" />
        </Button>
        <Button
          unstyled
          title="Refresh"
          @click="loadDirectory(root)"
        >
          <RefreshCw :size="13" />
        </Button>
      </div>
    </div>
    <div
      v-if="!root"
      class="explorer-empty"
    >
      No workspace
    </div>
    <div
      v-else
      class="explorer-tree"
    >
      <TreeDirectory
        :dir-path="root"
        :depth="0"
        :active-path="activePath"
        @open-file="emit('openFile', $event)"
        @create-file="path => openNameDialog('create-file', path)"
        @create-directory="path => openNameDialog('create-directory', path)"
        @rename-path="path => openNameDialog('rename', path)"
        @delete-path="openDeleteDialog"
        @context-menu="openContextMenu"
      />
    </div>

    <div
      v-if="contextMenu"
      class="explorer-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <Button
        v-if="contextMenu.type === 'directory'"
        unstyled
        @click="selectContextAction('create-file')"
      >
        <FilePlus :size="13" />
        <span>New File</span>
      </Button>
      <Button
        v-if="contextMenu.type === 'directory'"
        unstyled
        @click="selectContextAction('create-directory')"
      >
        <FolderPlus :size="13" />
        <span>New Folder</span>
      </Button>
      <Button
        unstyled
        @click="selectContextAction('rename')"
      >
        <Pencil :size="13" />
        <span>Rename</span>
      </Button>
      <Button
        unstyled
        @click="selectContextAction('reveal')"
      >
        <ExternalLink :size="13" />
        <span>Reveal in Finder</span>
      </Button>
      <Button
        unstyled
        class="danger"
        @click="selectContextAction('delete')"
      >
        <Trash2 :size="13" />
        <span>Delete</span>
      </Button>
    </div>

    <div
      v-if="nameDialog.visible"
      class="explorer-dialog-backdrop"
      @mousedown.self="closeNameDialog"
    >
      <form
        class="explorer-dialog"
        @submit.prevent="submitNameDialog"
      >
        <label :for="nameInputId">{{ nameDialogTitle }}</label>
        <input
          :id="nameInputId"
          ref="nameInputRef"
          v-model="nameDialog.value"
          type="text"
          autocomplete="off"
          @keydown.esc.prevent="closeNameDialog"
        >
        <ErrorNote
          v-if="dialogError"
          class="dialog-error"
          :message="dialogError"
        />
        <div class="dialog-actions">
          <Button
            unstyled
            native-type="button"
            @click="closeNameDialog"
          >
            Cancel
          </Button>
          <Button
            unstyled
            native-type="submit"
          >
            {{ nameDialog.action === 'rename' ? 'Rename' : 'Create' }}
          </Button>
        </div>
      </form>
    </div>

    <div
      v-if="deleteDialog.path"
      class="explorer-dialog-backdrop"
      @mousedown.self="deleteDialog.path = ''"
    >
      <div class="explorer-dialog">
        <label>Delete {{ basename(deleteDialog.path) }}?</label>
        <p>This cannot be undone.</p>
        <ErrorNote
          v-if="dialogError"
          class="dialog-error"
          :message="dialogError"
        />
        <div class="dialog-actions">
          <Button
            unstyled
            native-type="button"
            @click="deleteDialog.path = ''"
          >
            Cancel
          </Button>
          <Button
            unstyled
            native-type="button"
            class="danger"
            @click="submitDeleteDialog"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { ExternalLink, FilePlus, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-vue-next'
import TreeDirectory, { type TreeContextMenuPayload } from './TreeDirectory.vue'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'

defineProps<{
  root: string
  activePath: string
}>()

const emit = defineEmits<{
  openFile: [path: string]
}>()

const editorWorkspace = useEditorWorkspace()
const { loadDirectory, createFile, createDirectory, renamePath, deletePath, revealPath } = editorWorkspace
type NameDialogAction = 'create-file' | 'create-directory' | 'rename'
type ContextAction = NameDialogAction | 'delete' | 'reveal'

const nameInputId = 'file-explorer-name-input'
const nameInputRef = ref<HTMLInputElement | null>(null)
const contextMenu = ref<TreeContextMenuPayload | null>(null)
const dialogError = ref('')
const nameDialog = reactive({
  visible: false,
  action: 'create-file' as NameDialogAction,
  targetPath: '',
  value: '',
})
const deleteDialog = reactive({
  path: '',
})

const nameDialogTitle = computed(() => {
  if (nameDialog.action === 'create-file') return 'New file name'
  if (nameDialog.action === 'create-directory') return 'New folder name'
  return 'Rename to'
})

function basename(filePath: string) {
  return filePath.split('/').filter(Boolean).pop() || filePath
}

function closeContextMenu() {
  contextMenu.value = null
}

function openContextMenu(payload: TreeContextMenuPayload) {
  contextMenu.value = payload
}

async function selectContextAction(action: ContextAction) {
  const targetPath = contextMenu.value?.path
  closeContextMenu()
  if (!targetPath) return
  if (action === 'delete') {
    openDeleteDialog(targetPath)
    return
  }
  if (action === 'reveal') {
    const result = await revealPath(targetPath)
    if (!result.success) dialogError.value = result.error || 'Failed to reveal path'
    return
  }
  openNameDialog(action, targetPath)
}

function openNameDialog(action: NameDialogAction, targetPath: string) {
  closeContextMenu()
  dialogError.value = ''
  nameDialog.visible = true
  nameDialog.action = action
  nameDialog.targetPath = targetPath
  nameDialog.value = action === 'rename' ? basename(targetPath) : ''
  nextTick(() => {
    nameInputRef.value?.focus()
    if (action === 'rename') nameInputRef.value?.select()
  })
}

function closeNameDialog() {
  nameDialog.visible = false
  dialogError.value = ''
}

async function submitNameDialog() {
  const name = nameDialog.value.trim()
  if (!name) return
  dialogError.value = ''

  const result = nameDialog.action === 'create-file'
    ? await createFile(nameDialog.targetPath, name)
    : nameDialog.action === 'create-directory'
      ? await createDirectory(nameDialog.targetPath, name)
      : await renamePath(nameDialog.targetPath, name)

  if (!result.success) {
    dialogError.value = result.error || 'Operation failed'
    return
  }
  closeNameDialog()
}

function openDeleteDialog(targetPath: string) {
  closeContextMenu()
  dialogError.value = ''
  deleteDialog.path = targetPath
}

async function submitDeleteDialog() {
  if (!deleteDialog.path) return
  dialogError.value = ''
  const result = await deletePath(deleteDialog.path)
  if (!result.success) {
    dialogError.value = result.error || 'Delete failed'
    return
  }
  deleteDialog.path = ''
}

function handleGlobalMouseDown(event: MouseEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('.explorer-menu')) return
  closeContextMenu()
}

window.addEventListener('mousedown', handleGlobalMouseDown)

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleGlobalMouseDown)
})
</script>

<style scoped>
.file-explorer {
  box-sizing: border-box;
  flex: 0 0 240px;
  width: 240px;
  min-width: 180px;
  max-width: 320px;
  height: 100%;
  border-right: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

.explorer-header {
  height: 34px;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-text-muted-fg, var(--muted));
  text-transform: uppercase;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  background: transparent;
}

.explorer-actions {
  display: flex;
  gap: 4px;
}

.explorer-actions button {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  border-radius: 5px;
  cursor: pointer;
}

.explorer-actions button:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.explorer-tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
  padding: 6px 0;
}

.explorer-empty {
  padding: 16px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 13px;
}

.explorer-menu {
  position: fixed;
  z-index: calc(var(--z-dropdown) + 10);
  min-width: 150px;
  padding: 5px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-sidebar-bg, var(--panel-2));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
}

.explorer-menu button {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.explorer-menu button:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.explorer-menu .danger {
  color: var(--ui-status-danger-fg, #ef4444);
}

.explorer-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 1);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.18);
}

.explorer-dialog {
  width: min(320px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-sidebar-bg, var(--panel-2));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
}

.explorer-dialog label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
}

.explorer-dialog p {
  margin: 0;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.explorer-dialog input {
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-surface-app-bg, var(--bg));
  color: var(--ui-text-primary-fg, var(--text));
  outline: none;
}

.explorer-dialog input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.dialog-error {
  align-self: stretch;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-actions button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
}

.dialog-actions button:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.dialog-actions .danger {
  border-color: rgba(239, 68, 68, 0.35);
  color: var(--ui-status-danger-fg, #ef4444);
}
</style>
