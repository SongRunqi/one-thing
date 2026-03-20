<template>
  <div class="empty-state default-theme"></div>
</template>

<script setup lang="ts">
defineEmits<{
  suggestion: [text: string]
}>()
</script>

<style scoped>
.empty-state.default-theme {
  position: absolute;
  inset: 0;
}
</style>
