<template>
  <div class="session-list-wrapper">
    <!-- Top scroll indicator line -->
    <div :class="['scroll-indicator-top', { visible: isOverflowing }]"></div>

    <div
      ref="listRef"
      class="sessions-list"
      role="list"
      @scroll="checkOverflow"
    >
      <!-- New Chat item - always at top -->
      <div
        class="session-item new-chat-item"
        @click="$emit('create-new-chat')"
      >
        <svg class="new-chat-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span class="session-name">New Chat</span>
      </div>

      <!-- Session list -->
      <SessionItem
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :is-active="session.id === currentSessionId"
        :is-generating="isSessionGenerating(session.id)"
        :is-editing="editingSessionId === session.id"
        :editing-name="editingName"
        :is-pending-delete="pendingDeleteId === session.id"
        :formatted-time="formatSessionTime(session.createdAt)"
        @click="(e) => handleSessionClick(e, session)"
        @context-menu="(e) => $emit('context-menu', e, session)"
        @toggle-collapse="$emit('toggle-collapse', session.id)"
        @start-rename="$emit('start-rename', session)"
        @confirm-rename="(name) => $emit('confirm-rename', session.id, name)"
        @cancel-rename="$emit('cancel-rename')"
        @delete="$emit('delete', session.id)"
      />

      <div v-if="sessions.length === 0" class="empty-sessions">
        <span>No chats yet</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import SessionItem from './SessionItem.vue'
import type { SessionWithBranches } from './useSessionOrganizer'

interface Props {
  sessions: SessionWithBranches[]
  currentSessionId: string | null
  isSessionGenerating: (sessionId: string) => boolean
  editingSessionId: string | null
  editingName: string
  pendingDeleteId: string | null
  formatSessionTime: (timestamp: number) => string
}

interface Emits {
  (e: 'create-new-chat'): void
  (e: 'session-click', event: MouseEvent, session: SessionWithBranches): void
  (e: 'context-menu', event: MouseEvent, session: SessionWithBranches): void
  (e: 'toggle-collapse', sessionId: string): void
  (e: 'start-rename', session: SessionWithBranches): void
  (e: 'confirm-rename', sessionId: string, name: string): void
  (e: 'cancel-rename'): void
  (e: 'delete', sessionId: string): void
  (e: 'overflow-change', isOverflowing: boolean, hasContentBelow: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const listRef = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)
const hasContentBelow = ref(false)

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

// Watch sessions count to recheck overflow
watch(
  () => props.sessions.length,
  () => {
    nextTick(checkOverflow)
  }
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
  background: var(--border-subtle);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  flex-shrink: 0;
}

.scroll-indicator-top.visible {
  opacity: 1;
}

.sessions-list {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  min-width: 0;
  padding: 6px 0 60px 8px;
  scrollbar-gutter: stable;
  contain: strict;
  content-visibility: auto;
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
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  padding-bottom: 12px;
}

.session-item.new-chat-item .new-chat-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.session-item.new-chat-item .session-name {
  flex: 1;
  min-width: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--accent);
  padding-right: 12px;
}

.session-item.new-chat-item:hover {
  background: rgba(var(--accent-rgb), 0.1);
}

.session-item.new-chat-item:hover .session-name {
  color: var(--accent);
}

.empty-sessions {
  padding: 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
</style>
