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
      <div class="tab-list-wrap">
        <div
          ref="tabListRef"
          :class="['tab-list', { 'fade-left': canScrollLeft, 'fade-right': canScrollRight }]"
          role="tablist"
          @scroll="onTabListScroll"
        >
          <TabItem
            v-for="(tab, index) in chatTabs"
            :key="tab.id"
            :data-tab-id="tab.id"
            :tab="tab"
            :active="tab.id === activeTabId"
            :closable="true"
            :is-first="index === 0"
            :hide-trailing-divider="shouldHideTrailingDivider(chatTabs, index)"
            :session-name="tab.type === 'chat' ? chatSessionNames[tab.sessionId] : undefined"
            :cached="tab.type === 'chat' && (cachedSessionIds === null || cachedSessionIds.has(tab.sessionId))"
            :panel-id="panelId"
            @select="$emit('selectTab', tab.id)"
            @close="$emit('closeTab', tab.id)"
            @rename="(name) => tab.type === 'chat' && $emit('renameSession', tab.sessionId, name)"
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
            :data-tab-id="tab.id"
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
          :class="['tab-scrollbar', { visible: scrollbarVisible }]"
          aria-hidden="true"
        >
          <div
            class="tab-scroll-thumb"
            :style="{ width: `${thumb.width}px`, transform: `translateX(${thumb.left}px)` }"
          />
        </div>
      </div>
      <div
        class="tab-bar-drag-spacer"
        aria-hidden="true"
      />
    </div>

    <!-- Right: action buttons. Unfocused split panels collapse to just the
         tabs; clicking anywhere in a panel focuses it. Focused panels degrade
         by tier: full → mid (no agent selector) → slim (single ⋯ menu). -->
    <div class="tab-bar-right">
      <AgentSelector
        v-if="showAgentSelector && activeTab?.type === 'chat' && sessionId"
        :session-id="sessionId"
      />
      <span
        v-if="showAgentSelector && activeTab?.type === 'chat' && sessionId"
        class="header-tick"
        aria-hidden="true"
      />

      <Button
        v-if="showActionButtons && isBranchSession"
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
        v-if="showActionButtons && showSplitButton"
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
        v-if="showActionButtons && canClose"
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
        v-if="showActionButtons"
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
        v-if="showActionButtons"
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

      <div
        v-if="showOverflowMenu"
        ref="moreRef"
        class="header-more"
      >
        <Button
          unstyled
          class="header-btn"
          title="More actions"
          @click="moreOpen = !moreOpen"
        >
          <Ellipsis
            :size="14"
            :stroke-width="2"
          />
        </Button>
        <div
          v-if="moreOpen"
          class="tab-more-menu"
          role="menu"
        >
          <Button
            v-if="isBranchSession"
            unstyled
            class="tab-more-item"
            role="menuitem"
            @click="moreOpen = false; $emit('goToParent')"
          >
            <ArrowLeft
              :size="13"
              :stroke-width="2"
            />
            <span>Back to parent chat</span>
          </Button>
          <Button
            v-if="showSplitButton"
            unstyled
            class="tab-more-item"
            role="menuitem"
            @click="moreOpen = false; $emit('split')"
          >
            <Columns2
              :size="13"
              :stroke-width="2"
            />
            <span>Split view</span>
          </Button>
          <Button
            v-if="canClose"
            unstyled
            class="tab-more-item"
            role="menuitem"
            @click="moreOpen = false; $emit('equalize')"
          >
            <Equal
              :size="13"
              :stroke-width="2"
            />
            <span>Equalize panels</span>
          </Button>
          <Button
            unstyled
            class="tab-more-item"
            role="menuitem"
            @click="moreOpen = false; $emit('toggleSidePanel')"
          >
            <ListTree
              :size="13"
              :stroke-width="2"
            />
            <span>{{ sidePanelCollapsed ? 'Expand side panel' : 'Collapse side panel' }}</span>
          </Button>
          <Button
            v-if="!isInspectorOpen"
            unstyled
            class="tab-more-item"
            role="menuitem"
            @click="moreOpen = false; $emit('toggleInspector')"
          >
            <PanelRightOpen
              :size="13"
              :stroke-width="2"
            />
            <span>Show workbench</span>
          </Button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ArrowLeft, Columns2, Ellipsis, Equal, ListTree, PanelRightOpen } from 'lucide-vue-next'
import TabItem from './TabItem.vue'
import AgentSelector from './AgentSelector.vue'
import type { Tab } from '@/types/tabs'

const props = defineProps<{
  tabs: Tab[]
  activeTabId: string
  sessionId?: string
  panelId?: string
  chatSessionNames: Record<string, string>
  /** null = cache membership unknown (no marking); Set = evicted sessions get the cold mark. */
  cachedSessionIds: Set<string> | null
  isBranchSession: boolean
  showSidebarToggle: boolean
  mediaPanelOpen?: boolean
  showSplitButton: boolean
  canClose: boolean
  isInspectorOpen?: boolean
  reserveSidebarActions?: boolean
  sidePanelAvailable?: boolean
  sidePanelCollapsed?: boolean
  /** False for split panels that don't own focus: only the tabs stay. */
  panelFocused?: boolean
}>()

defineEmits<{
  selectTab: [id: string]
  closeTab: [id: string]
  renameSession: [sessionId: string, name: string]
  moveTab: [fromId: string, toId: string]
  toggleSidebar: []
  openSearch: []
  createNewChat: []
  goToParent: []
  split: []
  equalize: []
  toggleInspector: []
  toggleSidePanel: []
}>()

const dragFromId = ref<string | null>(null)

// ── 浮层滚动条:标签溢出时可横向滚动,滚动条不占布局、滚动时才显现 ──
const tabListRef = ref<HTMLElement | null>(null)
const scrollbarVisible = ref(false)
const thumb = ref({ width: 0, left: 0 })
// 溢出提示:某侧还有没露出的页签时,该侧边缘渐隐,暗示"没完"
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null
let tabListResizeObserver: ResizeObserver | null = null

function measureThumb() {
  const el = tabListRef.value
  if (!el) return
  const { scrollWidth, clientWidth, scrollLeft } = el
  const scrollable = scrollWidth - clientWidth > 1
  if (!scrollable) {
    thumb.value = { width: 0, left: 0 }
    scrollbarVisible.value = false
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  const ratio = clientWidth / scrollWidth
  thumb.value = {
    width: Math.max(clientWidth * ratio, 24),
    left: scrollLeft * ratio,
  }
  // 亚像素滚动位置带小数,留 1px 容差免得两端渐隐擦不干净
  canScrollLeft.value = scrollLeft > 1
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 1
}

function flashScrollbar() {
  if (thumb.value.width === 0) return
  scrollbarVisible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    scrollbarVisible.value = false
  }, 900)
}

function onTabListScroll() {
  measureThumb()
  flashScrollbar()
}

// 激活签在视野外时(侧栏点会话、新开签追加到末尾)把它滚进来。
// 留一点余量让邻签露个角,暗示两侧还有内容。
const SCROLL_INTO_VIEW_PAD = 16

function scrollActiveTabIntoView() {
  const list = tabListRef.value
  if (!list || !props.activeTabId) return
  if (list.scrollWidth - list.clientWidth <= 1) return
  const el = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(props.activeTabId)}"]`)
  if (!el) return
  // 用 rect 差值而非 offsetLeft:不依赖 tab-list 是否为 offsetParent
  const listRect = list.getBoundingClientRect()
  const tabRect = el.getBoundingClientRect()
  const overLeft = tabRect.left - listRect.left - SCROLL_INTO_VIEW_PAD
  const overRight = tabRect.right - listRect.right + SCROLL_INTO_VIEW_PAD
  const delta = overLeft < 0 ? overLeft : overRight > 0 ? overRight : 0
  if (delta === 0) return
  if (typeof list.scrollBy === 'function') list.scrollBy({ left: delta, behavior: 'smooth' })
  else list.scrollLeft += delta
}

// 阶梯降级:full(全签+全按钮)→ mid(非激活签缩成图标,收起 agent 选择器)
// → slim(动作组折进一粒 ⋯ 菜单)。tab 本身是 flex 1 1 0 弹性等分,
// 所以阈值只需要兜住「按钮组 + 图标签」的底线,不再整条塌缩。
const MID_WIDTH = 560
const SLIM_WIDTH = 400
const RESERVED_EXTRA = 160

const headerRef = ref<HTMLElement | null>(null)
const headerWidth = ref(Number.POSITIVE_INFINITY)
let headerResizeObserver: ResizeObserver | null = null

onMounted(() => {
  // 恢复布局/新建分栏时激活签可能已在视野外
  void nextTick(scrollActiveTabIntoView)
  if (typeof ResizeObserver === 'undefined') return
  if (headerRef.value) {
    headerResizeObserver = new ResizeObserver((entries) => {
      headerWidth.value = entries[0]?.contentRect.width ?? Number.POSITIVE_INFINITY
    })
    headerResizeObserver.observe(headerRef.value)
  }
  if (tabListRef.value) {
    tabListResizeObserver = new ResizeObserver(() => measureThumb())
    tabListResizeObserver.observe(tabListRef.value)
  }
})

onBeforeUnmount(() => {
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
  tabListResizeObserver?.disconnect()
  tabListResizeObserver = null
  if (hideTimer) clearTimeout(hideTimer)
})

const tier = computed<'full' | 'mid' | 'slim'>(() => {
  const extra = props.showSidebarToggle || props.reserveSidebarActions ? RESERVED_EXTRA : 0
  if (headerWidth.value < SLIM_WIDTH + extra) return 'slim'
  if (headerWidth.value < MID_WIDTH + extra) return 'mid'
  return 'full'
})

const focused = computed(() => props.panelFocused !== false)
const showAgentSelector = computed(() => focused.value && tier.value === 'full')
const showActionButtons = computed(() => focused.value && tier.value !== 'slim')
const showOverflowMenu = computed(() => focused.value && tier.value === 'slim')

const chatTabs = computed(() => props.tabs.filter(t => t.type === 'chat'))
const resourceTabs = computed(() => props.tabs.filter(t => t.type !== 'chat'))
const activeTab = computed(() => props.tabs.find(tab => tab.id === props.activeTabId))

function shouldHideTrailingDivider(group: Tab[], index: number): boolean {
  return group[index]?.id === props.activeTabId || group[index + 1]?.id === props.activeTabId
}

// 标签增删后内容宽度变化,ResizeObserver 观察不到,需主动重测
watch(() => props.tabs.length, () => nextTick(measureThumb))
// 切换激活标签滚动使其可见,重测让滚动条跟上
watch(() => props.activeTabId, () => nextTick(() => {
  measureThumb()
  scrollActiveTabIntoView()
}))

// ⋯ 菜单:点外即收
const moreRef = ref<HTMLElement | null>(null)
const moreOpen = ref(false)

function onDocPointerDown(e: PointerEvent) {
  if (!moreRef.value?.contains(e.target as Node)) moreOpen.value = false
}

watch(moreOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onDocPointerDown, true)
  else document.removeEventListener('pointerdown', onDocPointerDown, true)
})

watch(showOverflowMenu, (shown) => {
  if (!shown) moreOpen.value = false
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
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
  /* 整条顶栏打底可拖窗:tab / 按钮 / agent 选择器各自 no-drag 盖回。
     app-region 只算 content box,所以这些控件的间隙与内边距会回退到这层 drag,
     无需逐块补 spacer —— 空白处皆可拖。 */
  -webkit-app-region: drag;
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

/* 宽度对齐 App.vue 里 SidebarActionGroup 的右缘:
   left 84px(SIDEBAR_ACTION_COLLAPSED_LEFT) + 76px(3×24 按钮 + 2×2 gap) = 160px。
   多留一格就会在按钮和首个页签之间开口子,页签与按钮之间只留 .tab-list 的 12px。 */
.topbar-sidebar-actions-slot.reserved {
  width: 160px;
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

/* 包裹层承担弹性收缩,内层负责滚动,浮层滚动条锚在此层顶边 */
.tab-list-wrap {
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  align-self: stretch;
  display: flex;
}

.tab-list {
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: 5px;
  flex: 1 1 auto;
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

/*
  溢出提示:哪侧还有没露出的页签,哪侧边缘就渐隐。
  用 mask 而非叠一层渐变色块 —— mask 裁的是元素盒子(不随内容滚动),
  且不必去猜背景色,任何主题/纸墨底下都干净。
*/
.tab-list.fade-right {
  --tab-fade: 28px;
  mask-image: linear-gradient(to right, #000 calc(100% - var(--tab-fade)), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--tab-fade)), transparent 100%);
}

.tab-list.fade-left {
  --tab-fade: 28px;
  mask-image: linear-gradient(to right, transparent 0, #000 var(--tab-fade));
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--tab-fade));
}

.tab-list.fade-left.fade-right {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade),
    #000 calc(100% - var(--tab-fade)),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    #000 var(--tab-fade),
    #000 calc(100% - var(--tab-fade)),
    transparent 100%
  );
}

/* 浮层横向滚动条:绝对定位不占布局,默认隐形,滚动时淡入;锚在顶边 */
.tab-scrollbar {
  position: absolute;
  right: 0;
  top: 1px;
  left: 0;
  height: 3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--duration-fast, 0.15s) var(--ease-default, ease);
  z-index: 2;
}

.tab-scrollbar.visible {
  opacity: 1;
}

.tab-scroll-thumb {
  height: 100%;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 55%, transparent);
  will-change: transform, width;
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
  /* 不整块 no-drag:否则按钮之间的 gap/内边距也被盖成不可拖。
     交由内部 .header-btn / AgentSelector 各自 no-drag,空隙回退到 .tab-bar 的 drag。 */
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

/* ── slim 档:⋯ 溢出菜单 ─────────── */
.header-more {
  position: relative;
}

/* 同 SessionContextMenu 的菜单族语言(圆角、纸面、tooltip 影) */
.tab-more-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: var(--z-modal, 30);
  min-width: 176px;
  padding: 6px;
  background: var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 10px;
  box-shadow: var(--ui-surface-tooltip-shadow, 0 4px 14px rgb(0 0 0 / 0.12));
  -webkit-app-region: no-drag;
}

.tab-more-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-family: var(--type-label-font);
  font-size: 12.5px;
  text-align: left;
  white-space: nowrap;
  color: var(--ui-text-secondary-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition: background 0.1s ease;
}

.tab-more-item:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-surface-menu-hover-bg, color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 6%, transparent));
}

.tab-more-item svg {
  flex: 0 0 auto;
}
</style>
