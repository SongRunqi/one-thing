<template>
  <header
    ref="headerRef"
    :class="['tab-bar', { 'with-traffic-lights': showSidebarToggle, 'media-panel-open': mediaPanelOpen }]"
  >
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

    <!-- Right: action buttons. Unfocused split panels collapse to just the
         close button; clicking anywhere in a panel focuses it. -->
    <div class="tab-bar-right">
      <AgentSelector
        v-if="showFullActions && activeTab?.type === 'chat' && sessionId"
        :session-id="sessionId"
      />
      <span
        v-if="showFullActions && activeTab?.type === 'chat' && sessionId"
        class="header-tick"
        aria-hidden="true"
      />

      <Button
        v-if="showFullActions && isBranchSession"
        unstyled
        class="header-btn back-btn"
        title="Back to parent chat"
        @click="$emit('goToParent')"
      >
        <ArrowLeft
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showFullActions && showSplitButton"
        unstyled
        class="header-btn"
        title="Split view"
        @click="$emit('split')"
      >
        <Columns2
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showFullActions && canClose"
        unstyled
        class="header-btn"
        title="Equalize panels"
        @click="$emit('equalize')"
      >
        <Equal
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showFullActions"
        unstyled
        class="header-btn side-panel-toggle"
        :title="sidePanelCollapsed ? 'Expand side panel' : 'Collapse side panel'"
        @click="$emit('toggleSidePanel')"
      >
        <ListTree
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="showFullActions"
        unstyled
        :class="['header-btn', 'inspector-toggle', { hidden: isInspectorOpen }]"
        title="Show workbench"
        @click="$emit('toggleInspector')"
      >
        <PanelRightOpen
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        v-if="canClose"
        unstyled
        class="header-btn close-btn"
        title="Close panel"
        @click="$emit('close')"
      >
        <X
          :size="14"
          :stroke-width="2"
        />
      </Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ArrowLeft, Columns2, Equal, ListTree, PanelRightOpen, X } from 'lucide-vue-next'
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
  sidePanelAvailable?: boolean
  sidePanelCollapsed?: boolean
  /** False for split panels that don't own focus: only the close button stays. */
  panelFocused?: boolean
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
  toggleSidePanel: []
}>()

const dragFromId = ref<string | null>(null)

// Narrow split panels can't fit the traffic-light slot + tabs + the full
// action group (nothing in the bar flex-shrinks), so below the threshold the
// header collapses to compact mode — close button only — even when focused.
const COMPACT_MIN_WIDTH_RESERVED = 540
const COMPACT_MIN_WIDTH = 400

const headerRef = ref<HTMLElement | null>(null)
const headerWidth = ref(Number.POSITIVE_INFINITY)
let headerResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !headerRef.value) return
  headerResizeObserver = new ResizeObserver((entries) => {
    headerWidth.value = entries[0]?.contentRect.width ?? Number.POSITIVE_INFINITY
  })
  headerResizeObserver.observe(headerRef.value)
})

onBeforeUnmount(() => {
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
})

const isCompact = computed(() => {
  const threshold = props.showSidebarToggle || props.reserveSidebarActions
    ? COMPACT_MIN_WIDTH_RESERVED
    : COMPACT_MIN_WIDTH
  return headerWidth.value < threshold
})

const showFullActions = computed(() => props.panelFocused !== false && !isCompact.value)
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
  --ot-active-bg: var(--ui-tab-bar-item-active-bg, color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 58%, transparent));
  --ot-active-text: var(--ui-tab-bar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
  --ot-hover-bg: var(--ui-tab-bar-item-hover-bg, color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 4.5%, transparent));
  --ot-divider: var(--ui-tab-bar-divider-border, color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 70%, var(--ui-text-muted-fg, var(--muted))));

  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 10px 0 0;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  background: var(--ui-tab-bar-surface-bg, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel))));
  box-shadow: var(--ui-tab-bar-surface-shadow, none);
}

/* 基线:页签底标(墨线)落在这条线上 */
.tab-bar::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: color-mix(in srgb, var(--ui-tab-bar-divider-border, var(--ui-border-subtle-border, var(--border-subtle))) 32%, transparent);
  pointer-events: none;
  z-index: 0;
}

/*
  Layout-bound sidebar action reservation.
  This slot is always mounted so Chat/Project/File tabs reserve titlebar action
  space after the app layout has settled. Width changes stay discrete to avoid
  relayouting the message list on every sidebar toggle frame.
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
  transition: none;
}

.topbar-sidebar-actions-slot.reserved {
  width: 176px;
  padding-left: 86px;
}

.topbar-sidebar-actions-slot.reserved.media-panel-open {
  width: 96px;
  padding-left: 10px;
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
  align-self: stretch;
  gap: 5px;
  overflow-x: auto;
  overflow-y: visible;
  scrollbar-width: none;
  padding: 0 10px 0 12px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tab-list::-webkit-scrollbar {
  display: none;
}

/* 竖刻:chat 组与资源组之间,与右侧 header-tick 同款 */
.tab-group-divider {
  width: 1px;
  height: 14px;
  margin: 0 6px;
  flex: 0 0 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 85%, transparent);
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
  gap: 8px;
  padding-left: 14px;
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

/* 座标底线(案 A):按钮无底色,悬停变墨并在基线上落一小段点线 */
.header-btn {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  border-radius: 0;
  color: var(--ui-tab-bar-action-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    color var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.header-btn::after {
  content: '';
  position: absolute;
  right: 7px;
  bottom: -6px;
  left: 7px;
  height: 0;
  border-bottom: 1.5px dotted transparent;
  transition: border-color var(--duration-fast) var(--ease-default);
  pointer-events: none;
}

.header-btn:hover {
  color: var(--ui-tab-bar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.header-btn:hover::after {
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 75%, transparent);
}

.header-btn:active {
  transform: translateY(1px);
}

/* 竖刻:agent 与按钮组之间的分隔 */
.header-tick {
  flex: 0 0 auto;
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 85%, transparent);
}

.header-btn.back-btn {
  color: var(--ui-tab-bar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
}

.header-btn.close-btn:hover {
  background: var(--ui-tab-bar-danger-bg, var(--ui-status-danger-bg, transparent));
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
