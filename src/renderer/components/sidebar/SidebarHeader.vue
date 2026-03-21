<template>
  <div class="sidebar-header">
    <div class="traffic-lights-space" />
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.sidebar-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 44px;
  margin-top: -12px;
  -webkit-app-region: drag;
}

.traffic-lights-space {
  width: 70px;
  flex-shrink: 0;
}
</style>
