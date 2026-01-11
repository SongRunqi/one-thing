<template>
  <div class="file-tree">
    <FileTreeItem
      v-for="node in nodes"
      :key="node.path"
      :node="node"
      :depth="depth"
      @toggle="$emit('toggle', $event)"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { FileTreeNode } from '@/types'
import FileTreeItem from './FileTreeItem.vue'

defineProps<{
  nodes: FileTreeNode[]
  depth: number
}>()

defineEmits<{
  toggle: [path: string]
  select: [node: FileTreeNode]
}>()
</script>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
}
</style>
