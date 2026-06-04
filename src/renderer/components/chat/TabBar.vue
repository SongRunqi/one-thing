<template>
  <header :class="['tab-bar', { 'with-traffic-lights': showSidebarToggle, 'media-panel-open': mediaPanelOpen }]">
    <!-- Left: traffic lights reserved + tabs -->
    <div class="tab-bar-left">
      <div
        :class="[
          'topbar-sidebar-actions-slot',
          {
            reserved: showSidebarToggle || reserveSidebarActions,
            'media-panel-open': mediaPanelOpen,
          },
        ]"
        aria-hidden="true"
      />
      <div
        class="tab-list"
        role="tablist"
      >
        <TabItem
          v-for="(tab, index) in chatTabs"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === activeTabId"
          :closable="tab.type !== 'chat' || chatTabCount > 1"
          :is-first="index === 0"
          :hide-trailing-divider="shouldHideTrailingDivider(chatTabs, index)"
          :session-name="tab.type === 'chat' ? sessionName : undefined"
          @select="$emit('selectTab', tab.id)"
          @close="$emit('closeTab', tab.id)"
          @drag-start="(id) => dragFromId = id"
          @drop-on="(id) => { $emit('moveTab', dragFromId!, id); dragFromId = null }"
        />

        <div
          v-if="resourceTabs.length > 0"
          class="tab-group-divider"
          aria-hidden="true"
        />

        <TabItem
          v-for="(tab, index) in resourceTabs"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === activeTabId"
          :closable="true"
          :hide-trailing-divider="shouldHideTrailingDivider(resourceTabs, index)"
          :session-name="undefined"
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
  reserveSidebarActions?: boolean
}>()

defineEmits<{
  selectTab: [id: string]
  closeTab: [id: string]
  moveTab: [fromId: string, toId: string]
  toggleSidebar: []
  openSearch: []
  createNewChat: []
  goToParent: []
  split: []
  equalize: []
  close: []
  toggleInspector: []
}>()

const dragFromId = ref<string | null>(null)
const chatTabs = computed(() => props.tabs.filter(t => t.type === 'chat'))
const resourceTabs = computed(() => props.tabs.filter(t => t.type !== 'chat'))
const chatTabCount = computed(() => chatTabs.value.length)
const activeTab = computed(() => props.tabs.find(tab => tab.id === props.activeTabId))

function shouldHideTrailingDivider(group: Tab[], index: number): boolean {
  return group[index]?.id === props.activeTabId || group[index + 1]?.id === props.activeTabId
}
</script>

<style scoped>
.tab-bar {
  --ot-active-bg: var(--ui-tab-bar-item-active-bg, color-mix(in srgb, var(--ui-accent-subtle-fg, var(--accent-sub, var(--accent-light))) 42%, transparent));
  --ot-active-text: var(--ui-tab-bar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
  --ot-hover-bg: var(--ui-tab-bar-item-hover-bg, color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4.5%, transparent));
  --ot-divider: var(--ui-tab-bar-divider-border, color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 70%, var(--ui-text-muted-fg, var(--muted))));

  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 8px 0 0;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  background: var(--ui-tab-bar-surface-bg, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel))));
  box-shadow: var(--ui-tab-bar-surface-shadow, none);
}

.tab-bar::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: color-mix(in srgb, var(--ui-tab-bar-divider-border, var(--ui-border-subtle-border, var(--border-subtle))) 28%, transparent);
  pointer-events: none;
  z-index: 0;
}

/*
  Layout-bound sidebar action reservation.
  This slot is always mounted and animates width, so Chat/Project/File tabs
  reflow with the main panel instead of being translated or covered.
  Expanded sidebar: slot width 0, panel is pushed by sidebar width.
  Collapsed sidebar: slot reserves titlebar/traffic-light + action-group space.
*/
.topbar-sidebar-actions-slot {
  width: 0;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  overflow: hidden;
  padding-left: 0;
  -webkit-app-region: no-drag;
  transition:
    width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.topbar-sidebar-actions-slot.reserved {
  width: 164px;
  padding-left: 78px;
}

.topbar-sidebar-actions-slot.reserved.media-panel-open {
  width: 90px;
  padding-left: 8px;
}

/* ── Left: tabs ──────────────────── */
.tab-bar-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  position: relative;
  z-index: 1;
}

.tab-list {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  padding: 0 8px 0 10px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tab-list::-webkit-scrollbar {
  display: none;
}

.tab-group-divider {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  flex: 0 0 1px;
  background: var(--ot-divider);
  opacity: 0.86;
  transform: scaleX(0.5);
  transform-origin: center;
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
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 7px;
  color: var(--ui-tab-bar-action-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.header-btn:hover {
  background: color-mix(in srgb, var(--ui-tab-bar-action-hover-bg, color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 72%, transparent)) 78%, transparent);
  border-color: color-mix(in srgb, var(--ui-tab-bar-action-hover-border, var(--ui-border-subtle-border, var(--border-subtle))) 58%, transparent);
  color: var(--ui-tab-bar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.header-btn:active {
  transform: translateY(1px);
}

.header-btn.back-btn {
  color: var(--ui-tab-bar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
}

.header-btn.close-btn:hover {
  background: var(--ui-tab-bar-danger-bg, color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 15%, transparent));
  color: var(--ui-tab-bar-danger-fg, var(--ui-status-danger-fg, #ef4444));
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
