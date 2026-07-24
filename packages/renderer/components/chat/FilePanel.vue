<template>
  <EditorWorkbench
    :initial-file-path="filePath"
    :workspace-root="workspaceRoot"
    :active="active"
  />
</template>

<script setup lang="ts">
import EditorWorkbench from '@/components/editor/EditorWorkbench.vue'

withDefaults(defineProps<{
  filePath: string
  workspaceRoot?: string
  maxSizeKb?: number
  active?: boolean
}>(), {
  maxSizeKb: 256,
  active: true,
})
</script>
