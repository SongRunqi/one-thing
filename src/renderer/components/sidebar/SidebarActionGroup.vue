<template>
  <div
    :class="['sidebar-action-group', variant]"
    data-sidebar-action-group="true"
    :data-sidebar-action-group-location="variant"
  >
    <button
      class="sidebar-action-btn"
      :title="sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'"
      @click="$emit('toggle-sidebar')"
    >
      <PanelLeftClose
        v-if="sidebarVisible"
        :size="14"
        :stroke-width="1.6"
      />
      <PanelLeftOpen
        v-else
        :size="14"
        :stroke-width="1.6"
      />
    </button>
    <button
      class="sidebar-action-btn"
      title="Search"
      @click="$emit('open-search')"
    >
      <Search
        :size="14"
        :stroke-width="1.6"
      />
    </button>
    <button
      class="sidebar-action-btn"
      title="New chat"
      @click="$emit('create-new-chat')"
    >
      <SquarePen
        :size="14"
        :stroke-width="1.6"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen, Search, SquarePen } from 'lucide-vue-next'

withDefaults(defineProps<{
  sidebarVisible?: boolean
  variant?: 'sidebar' | 'topbar' | 'docked'
}>(), {
  sidebarVisible: true,
  variant: 'sidebar',
})

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
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.sidebar-action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.sidebar-action-btn:active {
  transform: scale(0.94);
}

.sidebar-action-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 36%, transparent);
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
