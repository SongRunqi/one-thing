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
          v-for="group in groups"
          :key="group.key"
          :index="groupMenuIndex(group.key)"
          expand-icon-position="start"
          class="session-group"
        >
          <template #title>
            <span class="group-label">{{ group.label }}</span>
          </template>

          <div class="session-group-items">
            <template
              v-for="session in visibleSessions(group)"
              :key="session.id"
            >
              <!-- 未归类 桶内退回时间：今天 / 昨天 / 过去 7 天 / 更早 -->
              <div
                v-if="session.sectionLabel"
                class="session-subtime"
              >
                {{ session.sectionLabel }}
              </div>
              <MenuItem
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
            </template>
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
const collapsedGroups = ref<Set<string>>(new Set())
// Groups that stay open regardless of which project is active
const ALWAYS_OPEN_GROUPS = new Set(['music', 'pinned'])
// music 组默认只露最近一次编排;show more 才翻历史
const groupLimits = ref<Record<string, number>>({ music: 1 })
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

// Drawer default state (方案六): only the current project drawer is open;
// every other project collapses to a single header row. 置顶 / 电台 always
// stay open. Runs once when groups first populate.
function seedCollapse() {
  const groups = props.groups
  if (groups.length === 0) return

  let activeKey: string | null = null
  const current = props.currentSessionId
  if (current) {
    for (const group of groups) {
      if (group.sessions.some(s => s.id === current)) { activeKey = group.key; break }
    }
  }
  // No active session → open the most recent project (first non-always-open group)
  if (!activeKey) {
    activeKey = groups.find(group => !ALWAYS_OPEN_GROUPS.has(group.key))?.key ?? null
  }

  const collapsed = new Set<string>()
  for (const group of groups) {
    if (ALWAYS_OPEN_GROUPS.has(group.key)) continue
    if (group.key === activeKey) continue
    collapsed.add(group.key)
  }
  collapsedGroups.value = collapsed
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
      seedCollapse()
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
  background: var(--ui-border-subtle-border);
  opacity: 0;
  transition: opacity var(--duration-slow) var(--ease-default);
  pointer-events: none;
  flex-shrink: 0;
}

.scroll-indicator-top.visible {
  opacity: 1;
}

.sessions-list {
  --sidebar-list-meta-fg: color-mix(
    in srgb,
    var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg)) 72%,
    transparent
  );
  --sidebar-list-meta-fg-strong: color-mix(
    in srgb,
    var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg)) 84%,
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
     scroll container's top edge, or scrolled text shows through the gap.
     Bottom is 10px rather than 12px: the row seam (`.session-item`'s 2px
     block-end margin, ui-system.md §1) leaks past the last row, so the panel
     gives those 2px back and the list's outer edge stays where it was. */
  padding: 0 10px 10px 12px;
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
  background: color-mix(in srgb, var(--ui-text-muted-fg) 26%, transparent);
}

.sidebar-menu {
  --app-menu-bg: transparent;
  --app-menu-border: transparent;
  --app-menu-width: 100%;
  --app-menu-padding: 0;
  --app-menu-item-height: 34px;
  /* 抽屉风（v7）：分组头圆角 8，hover 用软填充 */
  --app-menu-item-radius: 8px;
  /* MenuItem 会给二级项打内联 padding-inline-start: calc(12px + step)。
     归零 step，让所有行的包装盒都从 12px 起，行几何才可控。 */
  --app-menu-indent-step: 0px;
  --app-menu-item-fg: var(--sidebar-row-fg, var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg)));
  --app-menu-item-hover-bg: var(--sidebar-row-hover-fill, var(--ui-state-hover-bg));
  --app-menu-item-hover-fg: var(--sidebar-row-ink, var(--ui-text-primary-fg, var(--ui-sidebar-item-hover-fg)));
  --app-menu-active-bg: transparent;
  --app-menu-active-fg: var(--ui-sidebar-item-active-fg, var(--ui-text-primary-fg));

  position: relative;
  gap: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.session-group {
  display: flex;
  flex-direction: column;
  overflow: visible;
}

/* 抽屉头（v7 dhead）：左侧旋转 chevron + 12px/600 标签，hover 软填充圆角。
   sticky 保留：滚动时组头钉在顶部，静置底色与列表同色所以不可见。 */
.session-group :deep(.app-sub-menu-title) {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 0;
  height: auto;
  gap: 8px;
  /* Full-bleed opaque header: a right margin would leave an unpainted
     channel where scrolled text shows through. */
  margin-right: 0;
  padding-top: 7px;
  padding-bottom: 7px;
  padding-right: 8px;
  /* 静置不透明底：sticky 时挡住滚过的行文 */
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg));
  /* 分组头用全墨：与 72% 墨的行文拉开一档，层级靠色阶不靠猜主题 */
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
  /* v7 dhead：12px/600，无字距 */
  font-size: 12px;
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.35;
  letter-spacing: 0;
  transition: color var(--duration-normal) var(--ease-default), background-color var(--duration-normal) var(--ease-default);
}

/* hover 填充叠在不透明底之上（背景图层），sticky 状态下滚过的内容不会透出 */
.session-group :deep(.app-sub-menu-title:hover),
.session-group :deep(.app-sub-menu-title:focus-visible) {
  background-color: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg));
  background-image: linear-gradient(
    var(--sidebar-row-hover-fill, var(--ui-state-hover-bg)),
    var(--sidebar-row-hover-fill, var(--ui-state-hover-bg))
  );
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
  box-shadow: none;
}

.session-group :deep(.app-sub-menu-chevron-hit) {
  width: 12px;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
}

.session-group :deep(.app-sub-menu-chevron) {
  width: 12px;
  height: 12px;
}

.session-group :deep(.app-sub-menu-label) {
  display: flex;
  align-items: center;
  gap: 6px;
  color: inherit;
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

/* 未归类 桶内的时间子标签：比分组头更轻，缩进到与行文对齐(x=32) */
.session-subtime {
  padding: 8px 12px 3px 32px;
  font-size: var(--type-caption-muted-size, 10px);
  font-weight: var(--font-weight-normal, 400);
  letter-spacing: 0.1em;
  color: var(--sidebar-list-meta-fg, var(--ui-text-faint-fg));
  user-select: none;
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

/* Show-more affordance per section — 文本行，无填充，下划线示意可点 */
.load-more-btn {
  --app-button-height: auto;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-font-size: 11px;
  --app-button-hover-fill: transparent;
  --app-button-hover-fg: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  justify-content: flex-start;
  margin: 2px 4px 6px 32px;
  padding: 3px 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--sidebar-list-meta-fg);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: color var(--duration-normal) var(--ease-default);
}

.load-more-btn:hover {
  background: transparent;
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg);
}

/* Kill child transitions while initial state settles to avoid the
   collapsed-branch flicker users see when the active session's ancestors
   are expanded a frame after mount. */
.sessions-list[data-suppress-anim] :deep(.session-item),
.sessions-list[data-suppress-anim] :deep(.session-item *) {
  transition: none !important;
  animation: none !important;
}

.empty-sessions {
  padding: 20px;
  text-align: center;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  font-size: 13px;
}

/* ── 工作台外壳:交出内部滚动(R4,im-workbench-layout.md §3 W1)────────────
   workbench 下左栏只有**一个**滚动体(`Sidebar.vue` 的 `.sidebar-sections`),
   四区一起滚。这里再留一层 `overflow-y: auto` 就是双滚动条,所以整条让出去:

    - `.session-list-wrapper` 不再 `flex: 1` —— 在滚动容器里它该按内容撑开,
      而不是抢走整条竖轴(抢走了,上面三区就又被顶死);
    - `.sessions-list` 的 `overflow-y: auto` 改 `visible`;
    - **`contain: strict` 必须一并解开** —— strict 含 size containment,内容
      不再撑高盒子,让出滚动后这一段会直接塌成 0 高。`content-visibility: auto`
      同理(它隐含 size containment),一起退成 `visible`。

   classic 一条都不生效:那边会话列表照旧是左栏里唯一会滚的东西。

   ⚠️ 门写成 `html[...] .xxx` 而**不是** `:global(html[...]) .xxx` ——
   `@vue/compiler-sfc` 会把 `:global(X) .y` 静默截断成 `X`,声明全扣到 `<html>`
   头上(详见 `Sidebar.vue` 末尾那段说明,那正是 order 规则失效的真因)。
   祖先是 `html` 本来就不需要 `:global`:scoped 只给最后一个复合选择器补
   `[data-v-xxx]`,祖先照原样输出。 */
html[data-shell-mode='workbench'] .session-list-wrapper {
  flex: 0 0 auto;
  overflow: visible;
}

html[data-shell-mode='workbench'] .sessions-list {
  flex: 0 0 auto;
  overflow: visible;
  contain: none;
  content-visibility: visible;
}
</style>
