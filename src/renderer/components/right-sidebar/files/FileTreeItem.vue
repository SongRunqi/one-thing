<template>
  <div class="file-tree-item">
    <div
      class="item-row"
      :class="{ directory: isDirectory }"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="handleClick"
    >
      <!-- Expand/Collapse icon for directories -->
      <span v-if="isDirectory" class="expand-icon" :class="{ expanded: isExpanded }">
        <ChevronRight :size="14" :stroke-width="1.5" />
      </span>
      <span v-else class="expand-spacer"></span>

      <!-- File/Folder icon -->
      <component
        :is="iconComponent"
        :size="16"
        :stroke-width="1.5"
        class="item-icon"
        :class="iconClass"
      />

      <!-- Name -->
      <span class="item-name" :title="node.path">{{ node.name }}</span>
    </div>

    <!-- Children (if directory and expanded) -->
    <Transition name="expand">
      <div v-if="isDirectory && isExpanded && node.children" class="children">
        <FileTreeItem
          v-for="child in sortedChildren"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
          @toggle="$emit('toggle', $event)"
          @select="$emit('select', $event)"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  FileType,
  Settings,
  Package,
} from 'lucide-vue-next'
import type { FileTreeNode } from '@/types'
import { useRightSidebarStore } from '@/stores/right-sidebar'

const props = defineProps<{
  node: FileTreeNode
  depth: number
}>()

const emit = defineEmits<{
  toggle: [path: string]
  select: [node: FileTreeNode]
}>()

const store = useRightSidebarStore()

const isDirectory = computed(() => props.node.type === 'directory')
const isExpanded = computed(() => store.isPathExpanded(props.node.path))

// Sort children: directories first, then files, both alphabetically
const sortedChildren = computed(() => {
  if (!props.node.children) return []
  return [...props.node.children].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
})

// Get appropriate icon based on file type
const iconComponent = computed(() => {
  if (isDirectory.value) {
    return isExpanded.value ? FolderOpen : Folder
  }

  const ext = props.node.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'vue':
    case 'py':
    case 'rb':
    case 'go':
    case 'rs':
    case 'java':
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'cs':
    case 'php':
    case 'swift':
    case 'kt':
      return FileCode
    case 'json':
    case 'jsonc':
      return FileJson
    case 'md':
    case 'mdx':
    case 'txt':
    case 'rst':
      return FileText
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return Image
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'ini':
    case 'env':
      return Settings
    default:
      // Check for special files
      if (props.node.name === 'package.json' || props.node.name === 'package-lock.json') {
        return Package
      }
      return File
  }
})

// Icon color class based on file type
const iconClass = computed(() => {
  if (isDirectory.value) return 'icon-folder'

  const ext = props.node.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'icon-typescript'
    case 'js':
    case 'jsx':
      return 'icon-javascript'
    case 'vue':
      return 'icon-vue'
    case 'py':
      return 'icon-python'
    case 'json':
    case 'jsonc':
      return 'icon-json'
    case 'md':
    case 'mdx':
      return 'icon-markdown'
    case 'css':
    case 'scss':
    case 'less':
      return 'icon-css'
    case 'html':
      return 'icon-html'
    default:
      return 'icon-default'
  }
})

function handleClick() {
  if (isDirectory.value) {
    emit('toggle', props.node.path)
  } else {
    emit('select', props.node)
  }
}
</script>

<style scoped>
.file-tree-item {
  display: flex;
  flex-direction: column;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.1s ease;
  user-select: none;
}

.item-row:hover {
  background: var(--hover);
}

.expand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--muted);
  transition: transform 0.15s ease;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.expand-spacer {
  width: 16px;
}

.item-icon {
  flex-shrink: 0;
}

.item-name {
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Icon colors */
.icon-folder {
  color: #e8a838;
}

.icon-typescript {
  color: #3178c6;
}

.icon-javascript {
  color: #f7df1e;
}

.icon-vue {
  color: #42b883;
}

.icon-python {
  color: #3776ab;
}

.icon-json {
  color: #cbcb41;
}

.icon-markdown {
  color: #519aba;
}

.icon-css {
  color: #563d7c;
}

.icon-html {
  color: #e34c26;
}

.icon-default {
  color: var(--muted);
}

/* Children expansion animation */
.children {
  overflow: hidden;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.15s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
