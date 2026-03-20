<template>
  <div class="sidebar-header">
    <div class="traffic-lights-row">
      <div class="traffic-lights-space"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.sidebar-header {
  flex-shrink: 0;
  padding: 0 12px;
}

.traffic-lights-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  height: 44px;
  margin-top: -6px;
  -webkit-app-region: drag;
}

.traffic-lights-space {
  width: 70px;
  flex-shrink: 0;
}
</style>
