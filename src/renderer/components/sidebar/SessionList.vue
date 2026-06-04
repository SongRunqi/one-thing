<template>
  <div class="session-list-wrapper">
    <!-- Top scroll indicator line -->
    <div :class="['scroll-indicator-top', { visible: isOverflowing }]" />

    <div
      ref="listRef"
      class="sessions-list"
      :data-suppress-anim="suppressAnim ? '' : null"
      role="list"
      @scroll="checkOverflow"
    >
      <slot name="before" />

      <!-- Temporal groups -->
      <div
        v-for="group in groups"
        :key="group.key"
        class="session-group"
      >
        <button
          class="session-group-header"
          @click="toggleGroup(group.key)"
        >
          <svg
            class="group-chevron"
            :class="{ collapsed: isGroupCollapsed(group.key) }"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span class="group-label">{{ group.label }}</span>
          <span
            v-if="isGroupCollapsed(group.key)"
            class="group-count"
          >{{ rootCount(group) }}</span>
        </button>

        <template v-if="!isGroupCollapsed(group.key)">
          <SessionItem
            v-for="session in visibleSessions(group)"
            :key="session.id"
            :session="session"
            :is-active="session.id === currentSessionId"
            :is-generating="isSessionGenerating(session.id)"
            :is-editing="editingSessionId === session.id"
            :editing-name="editingName"
            @click="(e) => handleSessionClick(e, session)"
            @context-menu="(e) => $emit('context-menu', e, session)"
            @toggle-collapse="$emit('toggle-collapse', session.id)"
            @start-rename="$emit('start-rename', session)"
            @confirm-rename="(name) => $emit('confirm-rename', session.id, name)"
            @cancel-rename="$emit('cancel-rename')"
          />
          <button
            v-if="hasMore(group)"
            class="load-more-btn"
            @click="loadMore(group.key)"
          >
            显示更多
          </button>
        </template>
      </div>

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
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import SessionItem from './SessionItem.vue'
import type { SessionWithBranches, SessionGroup } from './useSessionOrganizer'

interface Props {
  groups: SessionGroup[]
  currentSessionId: string | null
  isSessionGenerating: (sessionId: string) => boolean
  editingSessionId: string | null
  editingName: string
}

interface Emits {
  (e: 'session-click', event: MouseEvent, session: SessionWithBranches): void
  (e: 'context-menu', event: MouseEvent, session: SessionWithBranches): void
  (e: 'toggle-collapse', sessionId: string): void
  (e: 'start-rename', session: SessionWithBranches): void
  (e: 'confirm-rename', sessionId: string, name: string): void
  (e: 'cancel-rename'): void
  (e: 'overflow-change', isOverflowing: boolean, hasContentBelow: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const listRef = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)
const hasContentBelow = ref(false)

// Per-group display state (keyed by stable group.key)
const DEFAULT_VISIBLE = 5   // root sessions shown per group by default
const LOAD_STEP = 10        // additional roots revealed per "show more" click
const collapsedGroups = ref<Set<string>>(new Set(['older']))
const groupLimits = ref<Record<string, number>>({})

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

function isGroupCollapsed(key: string): boolean {
  return collapsedGroups.value.has(key)
}

function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
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
  if (listRef.value) {
    const el = listRef.value
    // Top separator: show only when content is actually scrolled above (not at top)
    isOverflowing.value = el.scrollTop > 0
    // Bottom separator: show only when there's more content below the visible area
    const hasMore = el.scrollHeight > el.clientHeight &&
                    el.scrollHeight > Math.ceil(el.scrollTop + el.clientHeight) + 2
    hasContentBelow.value = hasMore

    emit('overflow-change', isOverflowing.value, hasContentBelow.value)
  }
}

function checkOverflowDelayed() {
  setTimeout(checkOverflow, 350)
}

function handleSessionClick(event: MouseEvent, session: SessionWithBranches) {
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

  // Single click - record it and emit
  lastClickInfo.value = { sessionId: session.id, time: now }
  emit('session-click', event, session)
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
  if (listRef.value) {
    // MutationObserver for content changes
    mutationObserver = new MutationObserver(() => {
      checkOverflow()
    })
    mutationObserver.observe(listRef.value, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    // ResizeObserver for container size changes
    resizeObserver = new ResizeObserver(() => {
      checkOverflow()
    })
    resizeObserver.observe(listRef.value)

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
    var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted))) 88%,
    transparent
  );
  --sidebar-list-meta-fg-strong: color-mix(
    in srgb,
    var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted))) 96%,
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
  padding: 2px 8px 60px 10px;
  scrollbar-gutter: stable;
  contain: strict;
  content-visibility: auto;
}

/* Each temporal section: sticky header + its rows */
.session-group {
  display: flex;
  flex-direction: column;
}

/* Temporal group header — chunking cue, clickable to collapse, sticks while scrolling */
.session-group-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-right: 4px;
  padding: 15px 8px 5px;
  border: none;
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg, var(--sidebar-bg)));
  font-size: 11px;
  font-weight: var(--font-weight-normal);
  line-height: 1.35;
  letter-spacing: 0.01em;
  color: var(--sidebar-list-meta-fg);
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

.session-group-header:hover {
  color: var(--ui-sidebar-item-hover-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

/* First section header sits flush at the top */
.session-group:first-child .session-group-header {
  padding-top: 4px;
}

.group-chevron {
  flex-shrink: 0;
  color: currentColor;
  opacity: 1;
  transition: transform 0.18s ease;
}

.group-chevron.collapsed {
  transform: rotate(-90deg);
}

.group-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  flex-shrink: 0;
  font-weight: var(--font-weight-normal);
  color: var(--sidebar-list-meta-fg-strong);
}

/* Show-more affordance per section */
.load-more-btn {
  margin: 2px 4px 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sidebar-list-meta-fg);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.load-more-btn:hover {
  background: color-mix(in srgb, var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--hover))) 76%, transparent);
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
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
