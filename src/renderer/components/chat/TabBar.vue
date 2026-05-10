<template>
  <header :class="['tab-bar', { 'with-traffic-lights': showSidebarToggle }]">
    <!-- Left: traffic lights reserved + tabs -->
    <div class="tab-bar-left">
      <div
        v-if="showSidebarToggle"
        class="traffic-lights-reserved"
      />
      <div class="tab-list">
        <TabItem
          v-for="tab in tabs"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === activeTabId"
          :closable="tab.type === 'file' || chatTabCount > 1"
          :session-name="tab.type === 'chat' ? sessionName : undefined"
          @select="$emit('selectTab', tab.id)"
          @close="$emit('closeTab', tab.id)"
          @drag-start="(id) => dragFromId = id"
          @drop-on="(id) => { $emit('moveTab', dragFromId!, id); dragFromId = null }"
        />
      </div>
    </div>

    <!-- Right: action buttons -->
    <div class="tab-bar-right">
      <button
        v-if="isBranchSession"
        class="header-btn back-btn"
        title="Back to parent chat"
        @click="$emit('goToParent')"
      >
        <ArrowLeft
          :size="14"
          :stroke-width="2"
        />
      </button>

      <button
        v-if="showSplitButton"
        class="header-btn"
        title="Split view"
        @click="$emit('split')"
      >
        <Columns2
          :size="14"
          :stroke-width="2"
        />
      </button>

      <button
        v-if="canClose"
        class="header-btn"
        title="Equalize panels"
        @click="$emit('equalize')"
      >
        <Equal
          :size="14"
          :stroke-width="2"
        />
      </button>

      <button
        :class="['header-btn', 'inspector-toggle', { hidden: isInspectorOpen }]"
        title="Show session lens"
        @click="$emit('toggleInspector')"
      >
        <Radar
          :size="14"
          :stroke-width="2"
        />
      </button>

      <button
        v-if="canClose"
        class="header-btn close-btn"
        title="Close panel"
        @click="$emit('close')"
      >
        <X
          :size="14"
          :stroke-width="2"
        />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ArrowLeft, Columns2, Equal, X, Radar } from 'lucide-vue-next'
import TabItem from './TabItem.vue'
import type { Tab } from '@/types/tabs'

const props = defineProps<{
  tabs: Tab[]
  activeTabId: string
  sessionName: string
  isBranchSession: boolean
  showSidebarToggle: boolean
  showSplitButton: boolean
  canClose: boolean
  isInspectorOpen?: boolean
}>()

defineEmits<{
  selectTab: [id: string]
  closeTab: [id: string]
  moveTab: [fromId: string, toId: string]
  toggleSidebar: []
  goToParent: []
  split: []
  equalize: []
  close: []
  toggleInspector: []
}>()

const dragFromId = ref<string | null>(null)
const chatTabCount = computed(() => props.tabs.filter(t => t.type === 'chat').length)
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 12px;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  -webkit-app-region: drag;
}

.traffic-lights-reserved {
  width: 170px;
  flex-shrink: 0;
}

/* ── Left: tabs ──────────────────── */
.tab-bar-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.tab-list {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-app-region: no-drag;
}

.tab-list::-webkit-scrollbar {
  display: none;
}

/* ── Right: action buttons ───────── */
.tab-bar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 60px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.header-btn {
  width: 28px;
  height: 28px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:first-child {
  margin-left: 0;
}

.header-btn:hover {
  background: var(--hover, rgba(255, 255, 255, 0.08));
  color: var(--text);
}

.header-btn.back-btn {
  color: var(--accent);
}

.header-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.header-btn.inspector-toggle {
  transition: background 0.15s ease, color 0.15s ease,
              opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              margin-left 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.inspector-toggle.hidden {
  width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
