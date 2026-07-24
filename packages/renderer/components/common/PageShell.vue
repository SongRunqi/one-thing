<template>
  <div class="page-shell">
    <!-- Header area -->
    <header
      v-if="$slots.header || $slots.tabs"
      class="page-shell-header"
    >
      <div
        v-if="$slots.header"
        class="page-shell-header-main"
      >
        <slot name="header" />
      </div>
      <div
        v-if="$slots.tabs"
        class="page-shell-tabs"
      >
        <slot name="tabs" />
      </div>
    </header>

    <!-- Body area -->
    <div
      :class="['page-shell-body', { 'no-padding': noPadding }]"
      :style="bodyStyle"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { type StyleValue } from 'vue'

defineProps<{
  noPadding?: boolean
  bodyStyle?: StyleValue
}>()
</script>

<style scoped>
.page-shell {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.page-shell-header {
  min-width: 0;
  flex-shrink: 0;
  padding: 14px 18px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 45%, transparent);
}

.page-shell-header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.page-shell-tabs {
  margin-top: 4px;
}

.page-shell-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 18px;
}

.page-shell-body.no-padding {
  padding: 0;
}
</style>
