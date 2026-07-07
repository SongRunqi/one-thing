<template>
  <div class="sidebar-header">
    <div class="traffic-lights-space" />
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
/* Opaque shield + soft fade: scrolled list content must never show through
   the traffic-lights row. */
.sidebar-header {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 44px;
  margin-top: -12px;
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg, var(--bg-app, var(--bg))));
  -webkit-app-region: drag;
}

.sidebar-header::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 12px;
  background: linear-gradient(
    to bottom,
    var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg, var(--bg-app, var(--bg)))),
    transparent
  );
  pointer-events: none;
}

.traffic-lights-space {
  width: 70px;
  flex-shrink: 0;
}
</style>
