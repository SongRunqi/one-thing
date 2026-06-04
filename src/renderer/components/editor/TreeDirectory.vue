<template>
  <div class="tree-directory">
    <button
      class="tree-row directory-row"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      @click="toggleDirectory(dirPath)"
      @contextmenu.prevent="openContext"
    >
      <ChevronRight
        :class="{ expanded: node?.expanded }"
        :size="13"
      />
      <Folder :size="13" />
      <span>{{ name }}</span>
    </button>
    <template v-if="node?.expanded">
      <div
        v-if="node.loading"
        class="tree-loading"
        :style="{ paddingLeft: `${(depth + 1) * 14 + 8}px` }"
      >
        Loading...
      </div>
      <template
        v-for="entry in node.entries"
        :key="entry.path"
      >
        <TreeDirectory
          v-if="entry.type === 'directory'"
          :dir-path="entry.path"
          :depth="depth + 1"
          :active-path="activePath"
          @open-file="$emit('openFile', $event)"
          @create-file="$emit('createFile', $event)"
          @create-directory="$emit('createDirectory', $event)"
          @rename-path="$emit('renamePath', $event)"
          @delete-path="$emit('deletePath', $event)"
          @context-menu="$emit('contextMenu', $event)"
        />
        <button
          v-else
          :class="['tree-row', 'file-row', { active: entry.path === activePath }]"
          :style="{ paddingLeft: `${(depth + 1) * 14 + 24}px` }"
          @click="$emit('openFile', entry.path)"
          @contextmenu.prevent="openFileContext($event, entry.path)"
        >
          <FileText :size="13" />
          <span>{{ entry.name }}</span>
        </button>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ChevronRight, FileText, Folder } from 'lucide-vue-next'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'

export interface TreeContextMenuPayload {
  path: string
  type: 'file' | 'directory'
  x: number
  y: number
}

const props = defineProps<{
  dirPath: string
  depth: number
  activePath: string
}>()

const emit = defineEmits<{
  openFile: [path: string]
  createFile: [path: string]
  createDirectory: [path: string]
  renamePath: [path: string]
  deletePath: [path: string]
  contextMenu: [payload: TreeContextMenuPayload]
}>()

const { workspace, loadDirectory, toggleDirectory } = useEditorWorkspace()
const node = computed(() => workspace.tree.get(props.dirPath))
const name = computed(() => props.depth === 0 ? props.dirPath.split('/').pop() || props.dirPath : props.dirPath.split('/').pop())

function openContext(event: MouseEvent) {
  emit('contextMenu', {
    path: props.dirPath,
    type: 'directory',
    x: event.clientX,
    y: event.clientY,
  })
}

function openFileContext(event: MouseEvent, filePath: string) {
  emit('contextMenu', {
    path: filePath,
    type: 'file',
    x: event.clientX,
    y: event.clientY,
  })
}

onMounted(() => {
  if (props.depth === 0 && !node.value) loadDirectory(props.dirPath)
})
</script>

<style scoped>
.tree-row {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 26px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-right: 8px;
  border: none;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.tree-row:hover,
.tree-row.active {
  background: var(--ui-state-hover-bg, var(--hover));
}

.tree-row svg {
  color: var(--ui-text-muted-fg, var(--muted));
  flex-shrink: 0;
}

.tree-row span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-row {
  font-weight: 600;
}

.expanded {
  transform: rotate(90deg);
}

.tree-loading {
  height: 24px;
  display: flex;
  align-items: center;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}
</style>
