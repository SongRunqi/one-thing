<template>
  <div
    :class="['sidebar-action-group', `is-${variant}`]"
    data-sidebar-action-group="true"
    :data-sidebar-action-group-location="variant"
  >
    <Tooltip :text="sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'">
      <Button
        text
        circle
        class="sidebar-action-btn"
        :aria-label="sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'"
        :icon="sidebarToggleIcon"
        @click="$emit('toggle-sidebar')"
      />
    </Tooltip>
    <!-- Search Everywhere opens a desktop window; hosts without desktop
         windows (web) must not render a button that would silently no-op. -->
    <Tooltip
      v-if="searchAvailable"
      text="Search"
    >
      <Button
        text
        circle
        class="sidebar-action-btn"
        aria-label="Search"
        :icon="Search"
        @click="$emit('open-search')"
      />
    </Tooltip>
    <Tooltip text="New chat">
      <Button
        text
        circle
        class="sidebar-action-btn"
        aria-label="New chat"
        :icon="SquarePen"
        @click="$emit('create-new-chat')"
      />
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import { computed } from 'vue'
import { PanelLeftClose, PanelLeftOpen, Search, SquarePen } from 'lucide-vue-next'
import { platformApi } from '@/platform'

const searchAvailable = platformApi.capabilities.desktopWindows

const props = withDefaults(defineProps<{
  sidebarVisible?: boolean
  variant?: 'sidebar' | 'topbar' | 'docked'
}>(), {
  sidebarVisible: true,
  variant: 'sidebar',
})

const sidebarToggleIcon = computed(() => props.sidebarVisible ? PanelLeftClose : PanelLeftOpen)

defineEmits<{
  'toggle-sidebar': []
  'open-search': []
  'create-new-chat': []
}>()
</script>

<style scoped>
.sidebar-action-group {
  display: inline-flex;
  /* ⚠️ variant 类名必须带 `is-` 前缀,不能直接用 `sidebar` / `topbar`。
     真机上这三颗一直是**竖排**的,根因是类名撞车:`variant="sidebar"` 让这个
     元素多了一个 `sidebar` 类,而它又在 Sidebar.vue 的 scope 内(带着同一枚
     data-v),于是侧栏根元素那条 `.sidebar` 的布局规则(display:flex +
     flex-direction:column)**打到了这个按钮组身上** —— display 被改成 flex、方向变 column、
     `margin-left:auto` 也失效。浏览器实测:命中它的 column 声明只有那一条。
     下面这两行是显式兜底,真正的修复是上面模板里的 `is-` 前缀。 */
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* Tooltip 在按钮外多包了一层 wrapper。app-region 虽然继承,但这一带是 titlebar
   拖拽区,显式挖洞比赌继承稳妥(见 drag-region 走查笔记)。 */
.sidebar-action-group :deep(.tooltip-wrapper) {
  -webkit-app-region: no-drag;
}

.sidebar-action-btn {
  --app-button-height: 24px;
  --app-button-min-width: 24px;
  --app-button-padding-x: 0;
  --app-button-hover-fill: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg));
  --app-button-hover-fg: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(
    --ui-sidebar-action-fg,
    color-mix(in srgb, var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg, var(--ui-sidebar-item-fg))) 88%, transparent)
  );
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background var(--duration-normal) var(--ease-default), color var(--duration-normal) var(--ease-default), transform var(--duration-normal) var(--ease-default);
}

.sidebar-action-btn:hover {
  background: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg));
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg));
}

.sidebar-action-btn:active {
  transform: scale(0.94);
}

.sidebar-action-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 36%, transparent);
}

.sidebar-action-group.is-sidebar {
  margin-left: auto;
  padding-right: 12px;
}

.sidebar-action-group.is-topbar {
  padding-right: 4px;
}

.sidebar-action-group.is-docked {
  padding-right: 0;
}
</style>
