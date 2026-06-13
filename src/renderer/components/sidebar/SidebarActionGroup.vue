<template>
  <div
    :class="['sidebar-action-group', variant]"
    data-sidebar-action-group="true"
    :data-sidebar-action-group-location="variant"
  >
    <Button
      text
      circle
      class="sidebar-action-btn"
      :title="sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'"
      :aria-label="sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'"
      :icon="sidebarToggleIcon"
      @click="$emit('toggle-sidebar')"
    />
    <Button
      text
      circle
      class="sidebar-action-btn"
      title="Search"
      aria-label="Search"
      :icon="Search"
      @click="$emit('open-search')"
    />
    <Button
      text
      circle
      class="sidebar-action-btn"
      title="New chat"
      aria-label="New chat"
      :icon="SquarePen"
      @click="$emit('create-new-chat')"
    />
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed } from 'vue'
import { PanelLeftClose, PanelLeftOpen, Search, SquarePen } from 'lucide-vue-next'

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
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.sidebar-action-btn {
  --app-button-height: 24px;
  --app-button-min-width: 24px;
  --app-button-padding-x: 0;
  --app-button-hover-fill: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--hover)));
  --app-button-hover-fg: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
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
    color-mix(in srgb, var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg, var(--text-sidebar-item))) 88%, transparent)
  );
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.sidebar-action-btn:hover {
  background: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--hover)));
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.sidebar-action-btn:active {
  transform: scale(0.94);
}

.sidebar-action-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 36%, transparent);
}

.sidebar-action-group.sidebar {
  margin-left: auto;
  padding-right: 12px;
}

.sidebar-action-group.topbar {
  padding-right: 4px;
}

.sidebar-action-group.docked {
  padding-right: 0;
}
</style>
