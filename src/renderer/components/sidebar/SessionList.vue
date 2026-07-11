<template>
  <div class="session-list-wrapper">
    <!-- Top scroll indicator line -->
    <div :class="['scroll-indicator-top', { visible: isOverflowing }]" />

    <div
      ref="listRef"
      class="sessions-list"
      :class="{ 'is-scrolling': isScrolling }"
      :data-suppress-anim="suppressAnim ? '' : null"
      @scroll="handleScroll"
    >
      <AppMenu
        class="sidebar-menu"
        :model-value="activeIndex"
        :default-openeds="expandedGroupMenuIndexes"
        :ellipsis="false"
        menu-trigger="click"
        @select="handleMenuSelect"
        @open="handleMenuOpen"
        @close="handleMenuClose"
      >
        <slot name="before" />

        <SubMenu
          v-for="(group, groupIndex) in groups"
          :key="group.key"
          :index="groupMenuIndex(group.key)"
          class="session-group"
          :class="{ 'is-first-group': groupIndex === 0 }"
        >
          <template #title>
            <span class="group-label">{{ group.label }}</span>
            <span
              v-if="collapsedGroups.has(group.key)"
              class="group-count"
            >{{ rootCount(group) }}</span>
          </template>

          <div class="session-group-items">
            <MenuItem
              v-for="session in visibleSessions(group)"
              :key="session.id"
              :index="sessionMenuIndex(session.id)"
              item-as="div"
              raw
              class="session-menu-item"
              @click="(_, event) => handleSessionMenuClick(event, session)"
            >
              <SessionItem
                :session="session"
                :is-active="activeIndex === sessionMenuIndex(session.id)"
                :is-generating="isSessionGenerating(session.id)"
                :is-editing="editingSessionId === session.id"
                :editing-name="editingName"
                @context-menu="(e) => $emit('context-menu', e, session)"
                @toggle-collapse="$emit('toggle-collapse', session.id)"
                @start-rename="$emit('start-rename', session)"
                @confirm-rename="(name) => $emit('confirm-rename', session.id, name)"
                @cancel-rename="$emit('cancel-rename')"
              />
            </MenuItem>
            <Button
              v-if="hasMore(group)"
              text
              size="small"
              class="load-more-btn"
              @click.stop="loadMore(group.key)"
            >
              显示更多
            </Button>
          </div>
        </SubMenu>
      </AppMenu>

      <div
        v-if="groups.length === 0"
        class="empty-sessions"
      >
        <span>No chats yet</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import AppMenu from '@/components/common/Menu.vue'
import MenuItem from '@/components/common/MenuItem.vue'
import SubMenu from '@/components/common/SubMenu.vue'
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import SessionItem from './SessionItem.vue'
import type { SessionWithBranches, SessionGroup } from './useSessionOrganizer'

interface Props {
  groups: SessionGroup[]
  activeIndex: string
  currentSessionId: string | null
  isSessionGenerating: (sessionId: string) => boolean
  editingSessionId: string | null
  editingName: string
}

interface Emits {
  (e: 'menu-select', index: string): void
  (e: 'context-menu', event: MouseEvent, session: SessionWithBranches): void
  (e: 'toggle-collapse', sessionId: string): void
  (e: 'start-rename', session: SessionWithBranches): void
  (e: 'confirm-rename', sessionId: string, name: string): void
  (e: 'cancel-rename'): void
  (e: 'overflow-change', isOverflowing: boolean, hasContentBelow: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  activeIndex: '',
})
const emit = defineEmits<Emits>()

const listRef = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)
const hasContentBelow = ref(false)

// Per-group display state (keyed by stable group.key)
const DEFAULT_VISIBLE = 5   // root sessions shown per group by default
const LOAD_STEP = 10        // additional roots revealed per "show more" click
const collapsedGroups = ref<Set<string>>(new Set(['older']))
const groupLimits = ref<Record<string, number>>({})
const expandedGroupMenuIndexes = computed(() =>
  props.groups
    .filter(group => !collapsedGroups.value.has(group.key))
    .map(group => groupMenuIndex(group.key))
)

// Count top-level (root) sessions in a group; branches ride along with their root
function rootCount(group: SessionGroup): number {
  let n = 0
  for (const s of group.sessions) if (s.depth === 0) n++
  return n
}

function limitFor(key: string): number {
  return groupLimits.value[key] ?? DEFAULT_VISIBLE
}

// Slice the flattened list to the first N roots, keeping each root's full subtree
function visibleSessions(group: SessionGroup): SessionWithBranches[] {
  const max = limitFor(group.key)
  const result: SessionWithBranches[] = []
  let roots = 0
  for (const s of group.sessions) {
    if (s.depth === 0) {
      roots++
      if (roots > max) break
    }
    result.push(s)
  }
  return result
}

function hasMore(group: SessionGroup): boolean {
  return rootCount(group) > limitFor(group.key)
}

function loadMore(key: string) {
  groupLimits.value = { ...groupLimits.value, [key]: limitFor(key) + LOAD_STEP }
}

function sessionMenuIndex(sessionId: string): string {
  return `session:${sessionId}`
}

function groupMenuIndex(groupKey: string): string {
  return `group:${groupKey}`
}

function groupKeyFromMenuIndex(index: string): string | null {
  if (!index.startsWith('group:')) return null
  return index.slice('group:'.length)
}

function handleMenuSelect(index: string) {
  emit('menu-select', index)
}

function handleMenuOpen(index: string) {
  const key = groupKeyFromMenuIndex(index)
  if (!key) return
  const next = new Set(collapsedGroups.value)
  next.delete(key)
  collapsedGroups.value = next
}

function handleMenuClose(index: string) {
  const key = groupKeyFromMenuIndex(index)
  if (!key) return
  const currentGroupKeys = new Set(props.groups.map(group => group.key))
  if (!currentGroupKeys.has(key)) return
  const next = new Set(collapsedGroups.value)
  next.add(key)
  collapsedGroups.value = next
}

// Make sure the active session is actually rendered: expand its group and raise
// its limit far enough to include it. Runs on deliberate switches + first load.
function ensureActiveVisible() {
  const id = props.currentSessionId
  if (!id) return
  for (const group of props.groups) {
    let rootIdx = -1
    let found = false
    for (const s of group.sessions) {
      if (s.depth === 0) rootIdx++
      if (s.id === id) { found = true; break }
    }
    if (!found) continue
    if (collapsedGroups.value.has(group.key)) {
      const next = new Set(collapsedGroups.value)
      next.delete(group.key)
      collapsedGroups.value = next
    }
    if (limitFor(group.key) < rootIdx + 1) {
      groupLimits.value = { ...groupLimits.value, [group.key]: rootIdx + 1 }
    }
    break
  }
}
// Suppress CSS transitions on initial mount so collapsed branches don't visibly
// animate as the organizer settles its hierarchy / active-session expansion.
const suppressAnim = ref(true)
let suppressAnimFrame: number | null = null

let mutationObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

// Double-click detection
const lastClickInfo = ref<{ sessionId: string; time: number } | null>(null)
const DOUBLE_CLICK_THRESHOLD = 400

function checkOverflow() {
  const el = listRef.value
  if (!el) return

  // Top separator: show only when content is actually scrolled above (not at top)
  isOverflowing.value = el.scrollTop > 0
  // Bottom separator: show only when there's more content below the visible area
  const hasMore = el.scrollHeight > el.clientHeight &&
                  el.scrollHeight > Math.ceil(el.scrollTop + el.clientHeight) + 2
  hasContentBelow.value = hasMore

  emit('overflow-change', isOverflowing.value, hasContentBelow.value)
}

function checkOverflowDelayed() {
  setTimeout(checkOverflow, 350)
}

// Reveal the scrollbar only while actively scrolling
const isScrolling = ref(false)
let scrollEndTimer: number | null = null

function handleScroll() {
  checkOverflow()

  isScrolling.value = true
  if (scrollEndTimer !== null) window.clearTimeout(scrollEndTimer)
  scrollEndTimer = window.setTimeout(() => {
    scrollEndTimer = null
    isScrolling.value = false
  }, 600)
}

function handleSessionMenuClick(event: MouseEvent, session: SessionWithBranches) {
  const now = Date.now()
  const lastClick = lastClickInfo.value

  // Check if click was on session-name (which has its own @dblclick for rename)
  const target = event.target as HTMLElement
  const isOnSessionName = target.classList.contains('session-name') ||
    target.closest('.session-name') !== null

  // Check if this is a double-click (same session clicked within threshold)
  if (lastClick && lastClick.sessionId === session.id && (now - lastClick.time) < DOUBLE_CLICK_THRESHOLD) {
    // Double-click detected - toggle collapse
    lastClickInfo.value = null

    // Don't toggle collapse if clicking on session-name (let rename work)
    // Only toggle for parent sessions with branches when not on the name
    if (session.hasBranches && !isOnSessionName) {
      emit('toggle-collapse', session.id)
    }
    return
  }

  // Single click - record it. The actual selection is emitted by AppMenu.
  lastClickInfo.value = { sessionId: session.id, time: now }
}

// Watch total session count to recheck overflow
watch(
  () => props.groups.reduce((n, g) => n + g.sessions.length, 0),
  () => {
    nextTick(checkOverflow)
  }
)

// Keep the active session visible on deliberate navigation
watch(
  () => props.currentSessionId,
  () => nextTick(ensureActiveVisible)
)

// And once on the first load after groups are populated
let initialActiveApplied = false
watch(
  () => props.groups.length,
  (len) => {
    if (len > 0 && !initialActiveApplied) {
      initialActiveApplied = true
      nextTick(ensureActiveVisible)
    }
  },
  { immediate: true }
)

onMounted(() => {
  const listElement = listRef.value

  if (listElement) {
    // MutationObserver for content changes
    mutationObserver = new MutationObserver(() => {
      checkOverflow()
    })
    mutationObserver.observe(listElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    // ResizeObserver for container size changes
    resizeObserver = new ResizeObserver(() => {
      checkOverflow()
    })
    resizeObserver.observe(listElement)

    // Initial check
    checkOverflowDelayed()
  }
  // Re-enable transitions after the layout has fully settled on first paint.
  // Two RAFs is enough for the initial collapse-state pass + active-session
  // ancestor expansion to commit without animating.
  suppressAnimFrame = requestAnimationFrame(() => {
    suppressAnimFrame = requestAnimationFrame(() => {
      suppressAnimFrame = null
      suppressAnim.value = false
    })
  })
})

onUnmounted(() => {
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (suppressAnimFrame !== null) {
    cancelAnimationFrame(suppressAnimFrame)
    suppressAnimFrame = null
  }
  if (scrollEndTimer !== null) {
    window.clearTimeout(scrollEndTimer)
    scrollEndTimer = null
  }
})
</script>

<style scoped>
/* Wrapper to fill available space in flex container */
.session-list-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* Top scroll indicator line - outside scroll container */
.scroll-indicator-top {
  height: 1px;
  margin: 0 16px;
  background: var(--ui-border-subtle-border, var(--border-subtle));
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  flex-shrink: 0;
}

.scroll-indicator-top.visible {
  opacity: 1;
}

.sessions-list {
  --sidebar-list-meta-fg: color-mix(
    in srgb,
    var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted))) 72%,
    transparent
  );
  --sidebar-list-meta-fg-strong: color-mix(
    in srgb,
    var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted))) 84%,
    transparent
  );

  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
  /* No top padding: the sticky group header must sit flush against the
     scroll container's top edge, or scrolled text shows through the gap. */
  padding: 0 10px 64px 12px;
  contain: strict;
  content-visibility: auto;
}

/* Native scrollbar stays hidden until the user scrolls or hovers the thumb.
   The transparent thumb still occupies its 10px gutter, so :hover can hit it. */
.sessions-list::-webkit-scrollbar-thumb {
  background: transparent;
}

.sessions-list.is-scrolling::-webkit-scrollbar-thumb,
.sessions-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 26%, transparent);
}

.sidebar-menu {
  --app-menu-bg: transparent;
  --app-menu-border: transparent;
  --app-menu-width: 100%;
  --app-menu-padding: 0;
  --app-menu-item-height: 34px;
  --app-menu-item-radius: 0;
  /* MenuItem 会给二级项打内联 padding-inline-start: calc(12px + step)。
     归零 step，让所有行的包装盒都从 12px 起，刻度几何才可控。 */
  --app-menu-indent-step: 0px;
  --app-menu-item-fg: var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg, var(--text-sidebar-item)));
  /* Ledger（墨线）: state is drawn with the tick marks inside SessionItem,
     never with background fills. */
  --app-menu-item-hover-bg: transparent;
  --app-menu-item-hover-fg: var(--ui-sidebar-item-hover-fg, var(--ui-text-primary-fg, var(--text-sidebar-item-hover)));
  --app-menu-active-bg: transparent;
  --app-menu-active-fg: var(--ui-sidebar-item-active-fg, var(--ui-text-primary-fg, var(--text-primary)));

  position: relative;
  gap: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

/* 主账目线：整栏唯一的结构线。行刻度(SessionItem::before, x=7)挂在这条线上；
   sticky 分组标签自带不透明底，天然把线打断。 */
.sidebar-menu::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 4px;
  bottom: 6px;
  width: 1px;
  background: color-mix(
    in srgb,
    var(--ui-border-strong-border, var(--border-strong, var(--border))) 80%,
    transparent
  );
  pointer-events: none;
}

.session-group {
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.session-group :deep(.app-sub-menu-title) {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 0;
  height: auto;
  /* Full-bleed opaque header: a right margin would leave an unpainted
     channel where scrolled text shows through. */
  margin-right: 0;
  padding: 11px 14px 4px 8px;
  border-radius: 0;
  /* 不透明底同时承担"打断账目线"的角色（sticky 时压在线上方） */
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg, var(--sidebar-bg)));
  color: var(--ui-text-faint-fg, var(--text-faint, var(--text-muted)));
  font-size: var(--type-caption-size, 11px);
  font-weight: var(--font-weight-normal, 400);
  line-height: 1.35;
  letter-spacing: 0.14em;
  transition: color 0.15s ease;
}

/* 第一组要让开 SidebarHeader 底部 12px 的淡出渐变，否则标签上半截被罩住 */
.session-group.is-first-group :deep(.app-sub-menu-title) {
  padding-top: 14px;
}

.session-group :deep(.app-sub-menu-title:hover),
.session-group :deep(.app-sub-menu-title:focus-visible) {
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg, var(--sidebar-bg)));
  color: var(--ui-sidebar-item-hover-fg, var(--ui-text-primary-fg, var(--text-primary)));
  box-shadow: none;
}

/* Ledger（墨线）：分组头不用图标，标签本身压在账目线上（不透明底打断线）。
   折叠状态由 group-count 提示，展开/收起仍点击整行。 */
.session-group :deep(.app-sub-menu-chevron) {
  display: none;
}

.session-group :deep(.app-sub-menu-label) {
  display: flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  /* 标签压线：SubMenu 给标题打了 12px 内联 padding-inline-start，拉回后
     标签从 x=0(菜单系)起笔，账目线(x=7)从标签下方穿过 —— 与设计稿一致 */
  margin-inline-start: -12px;
}

.session-group :deep(.app-sub-menu-panel) {
  gap: 0;
  margin: 0;
  padding: 0;
  overflow: visible;
}

.session-group-items {
  width: 100%;
}

.session-menu-item :deep(.app-menu-item) {
  outline-offset: -2px;
}

.group-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 折叠时的会话数：右侧细字提示，同时充当"已折叠"的状态信号 */
.group-count {
  flex-shrink: 0;
  font-weight: var(--font-weight-normal);
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  color: var(--sidebar-list-meta-fg-strong);
}

/* Show-more affordance per section — 文本行，无填充，下划线示意可点 */
.load-more-btn {
  --app-button-height: auto;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-font-size: 11px;
  --app-button-hover-fill: transparent;
  --app-button-hover-fg: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  justify-content: flex-start;
  margin: 2px 4px 6px 26px;
  padding: 3px 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--sidebar-list-meta-fg);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: color 0.15s ease;
}

.load-more-btn:hover {
  background: transparent;
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

/* Kill child transitions while initial state settles to avoid the
   collapsed-branch flicker users see when the active session's ancestors
   are expanded a frame after mount. */
.sessions-list[data-suppress-anim] :deep(.session-item),
.sessions-list[data-suppress-anim] :deep(.session-item *) {
  transition: none !important;
  animation: none !important;
}

/* New Chat item - always at top of session list */
.session-item.new-chat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 12px;
  margin: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  border-bottom: 1px solid var(--ui-sidebar-border-border, var(--ui-border-default-border, var(--border)));
  margin-bottom: 8px;
  padding-bottom: 12px;
}

.session-item.new-chat-item .new-chat-icon {
  color: var(--ui-accent-primary-fg, var(--accent));
  flex-shrink: 0;
}

.session-item.new-chat-item .session-name {
  flex: 1;
  min-width: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--ui-accent-primary-fg, var(--accent));
  padding-right: 12px;
}

.session-item.new-chat-item:hover {
  background: var(--ui-sidebar-item-hover-bg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent));
}

.session-item.new-chat-item:hover .session-name {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.empty-sessions {
  padding: 20px;
  text-align: center;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--muted)));
  font-size: 13px;
}
</style>
