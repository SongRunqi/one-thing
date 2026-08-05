<template>
  <div class="sidebar-header">
    <div class="traffic-lights-space" />
    <!-- 侧栏展开时,三颗操作按钮住在这里。它们必须是这条 drag 行的真实子孙:
         Chromium 只让 drag 元素的子孙用 no-drag 挖洞,跨分支的 fixed 浮层挖不动
         —— 那正是以前要在顶栏手工预留一块 [84,160] 的原因。 -->
    <slot />
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
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg));
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
    var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg)),
    transparent
  );
  pointer-events: none;
}

.traffic-lights-space {
  width: 70px;
  flex-shrink: 0;
}
</style>
