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

    <ContextMenu
      :show="!!contextMenu"
      :x="contextMenu?.x ?? 0"
      :y="contextMenu?.y ?? 0"
      :items="contextMenuItems"
      @select="selectContextAction"
      @close="closeContextMenu"
    />

    <!-- The name form spans input AND buttons, so it lives whole in the body
         slot rather than being split across body/actions. -->
    <Dialog
      :open="nameDialog.visible"
      :width="320"
      :z-offset="1"
      :dividers="false"
      :auto-focus="false"
      :style="explorerDialogVars"
      @update:open="value => { if (!value) closeNameDialog() }"
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
    </Dialog>

    <Dialog
      :open="!!deleteDialog.path"
      :width="320"
      :z-offset="1"
      :dividers="false"
      :style="explorerDialogVars"
      @update:open="value => { if (!value) deleteDialog.path = '' }"
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
    </Dialog>
  </aside>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import Dialog from '@/components/common/Dialog.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed, nextTick, reactive, ref, type CSSProperties } from 'vue'
import type { ContextMenuItem } from '@/components/common/context-menu'
import { ExternalLink, FilePlus, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-vue-next'
import TreeDirectory, { type TreeContextMenuPayload } from './TreeDirectory.vue'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'

/**
 * A small sidebar-toned card, not the app-wide elevated shell: these two sit
 * over the file tree and used to be drawn by `.explorer-dialog-backdrop` /
 * `.explorer-dialog`. `zOffset: 1` preserves the old `calc(var(--z-modal) + 1)`
 * so they still clear a dialog the editor itself may have raised.
 */
const explorerDialogVars: CSSProperties = {
  '--app-dialog-overlay-bg': 'rgb(0 0 0 / 0.18)',
  '--app-dialog-overlay-padding': '16px',
  '--app-dialog-radius': '8px',
  '--app-dialog-bg': 'var(--ui-surface-sidebar-bg)',
  '--app-dialog-body-padding': '14px',
} as CSSProperties

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

/**
 * P1 left this menu behind: it was `position: fixed` at the raw pointer
 * coordinates with no flip and no clamping, so a right-click near the bottom or
 * right edge of the explorer put Rename/Delete off-screen. `ContextMenu` is the
 * coordinate-triggered Dropdown, so viewport clamping, Esc, outside-dismissal
 * and the click shield all come from the floating kernel.
 */
const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const isDirectory = contextMenu.value?.type === 'directory'
  return [
    ...(isDirectory
      ? [
          { id: 'create-file', label: 'New File', icon: FilePlus },
          { id: 'create-directory', label: 'New Folder', icon: FolderPlus },
        ]
      : []),
    { id: 'rename', label: 'Rename', icon: Pencil },
    { id: 'reveal', label: 'Reveal in Finder', icon: ExternalLink },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true, separatorBefore: true },
  ]
})

async function selectContextAction(action: string) {
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
  openNameDialog(action as NameDialogAction, targetPath)
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

</script>

<style scoped>
.file-explorer {
  box-sizing: border-box;
  flex: 0 0 240px;
  width: 240px;
  min-width: 180px;
  max-width: 320px;
  height: 100%;
  border-right: 1px solid var(--ui-border-default-border);
  background: var(--ui-surface-panel-bg);
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
  color: var(--ui-text-muted-fg);
  text-transform: uppercase;
  border-bottom: 1px solid var(--ui-border-default-border);
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
  color: var(--ui-text-muted-fg);
  border-radius: 5px;
  cursor: pointer;
}

.explorer-actions button:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
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
  color: var(--ui-text-muted-fg);
  font-size: 13px;
}

/* The right-click menu is `common/ContextMenu.vue` since P2 — positioning,
   clamping and dismissal live in the floating kernel, and the menu skin comes
   with the primitive. */


/* Backdrop / panel frame are Dialog's since P2 (see `explorerDialogVars`). */
.explorer-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.explorer-dialog label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-primary-fg);
}

.explorer-dialog p {
  margin: 0;
  color: var(--ui-text-muted-fg);
  font-size: 12px;
}

.explorer-dialog input {
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 6px;
  background: var(--ui-surface-app-bg);
  color: var(--ui-text-primary-fg);
  outline: none;
}

.explorer-dialog input:focus {
  border-color: var(--ui-accent-primary-fg);
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
  border: 1px solid var(--ui-border-default-border);
  border-radius: 6px;
  background: var(--ui-surface-elevated-bg);
  color: var(--ui-text-primary-fg);
  cursor: pointer;
}

.dialog-actions button:hover {
  background: var(--ui-state-hover-bg);
}

.dialog-actions .danger {
  border-color: rgba(239, 68, 68, 0.35);
  color: var(--ui-status-danger-fg);
}
</style>
