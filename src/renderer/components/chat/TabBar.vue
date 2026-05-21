<template>
  <header :class="['tab-bar', { 'with-traffic-lights': showSidebarToggle, 'media-panel-open': mediaPanelOpen }]">
    <!-- Left: traffic lights reserved + tabs -->
    <div class="tab-bar-left">
      <div
        v-if="showSidebarToggle"
        class="traffic-lights-reserved"
      />
      <div
        class="tab-list"
        role="tablist"
      >
        <TabItem
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === activeTabId"
          :closable="tab.type !== 'chat' || chatTabCount > 1"
          :is-first="index === 0"
          :hide-trailing-divider="tab.id === activeTabId || tabs[index + 1]?.id === activeTabId"
          :session-name="tab.type === 'chat' ? sessionName : undefined"
          @select="$emit('selectTab', tab.id)"
          @close="$emit('closeTab', tab.id)"
          @drag-start="(id) => dragFromId = id"
          @drop-on="(id) => { $emit('moveTab', dragFromId!, id); dragFromId = null }"
        />
      </div>
      <div
        class="tab-bar-drag-spacer"
        aria-hidden="true"
      />
    </div>

    <!-- Right: action buttons -->
    <div class="tab-bar-right">
      <AgentSelector
        v-if="activeTab?.type === 'chat' && sessionId"
        :session-id="sessionId"
      />

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
import AgentSelector from './AgentSelector.vue'
import type { Tab } from '@/types/tabs'

const props = defineProps<{
  tabs: Tab[]
  activeTabId: string
  sessionId?: string
  sessionName: string
  isBranchSession: boolean
  showSidebarToggle: boolean
  mediaPanelOpen?: boolean
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
const activeTab = computed(() => props.tabs.find(tab => tab.id === props.activeTabId))
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 10px 0 0;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  background:
    linear-gradient(rgba(var(--accent-rgb), 0.04), rgba(var(--accent-rgb), 0.04)),
    var(--bg-app);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-floating) 20%, transparent);
}

.tab-bar::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: color-mix(in srgb, var(--border-subtle) 62%, transparent);
  pointer-events: none;
  z-index: 0;
}

.traffic-lights-reserved {
  width: 164px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.tab-bar.media-panel-open .traffic-lights-reserved {
  -webkit-app-region: drag;
}

/* ── Left: tabs ──────────────────── */
.tab-bar-left {
  display: flex;
  align-items: flex-end;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  position: relative;
  z-index: 1;
}

.tab-list {
  --tab-corner-size: 12px;
  display: flex;
  align-items: flex-end;
  gap: 0;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  padding: 2px var(--tab-corner-size) 0 calc(var(--tab-corner-size) + 4px);
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tab-list::-webkit-scrollbar {
  display: none;
}

.tab-bar-drag-spacer {
  flex: 1;
  min-width: 24px;
  align-self: stretch;
  -webkit-app-region: drag;
}

/* ── Right: action buttons ───────── */
.tab-bar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 60px;
  flex-shrink: 0;
  gap: 6px;
  padding-left: 12px;
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

.header-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.header-btn:hover {
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  border-color: var(--border-subtle);
  color: var(--text);
}

.header-btn:active {
  transform: translateY(1px);
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
