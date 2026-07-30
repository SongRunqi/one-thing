<template>
  <BorderBox
    as="main"
    class="chat"
    border-style="solid"
    radius-value="0"
    :border-color="chatBorderColor"
    background="var(--chat-surface)"
    :shadow-value="chatPanelShadowValue"
  >
    <Container
      as="section"
      main-as="section"
      body-class="chat-body"
      main-class="chat-main-region"
      full-height
      :main-flex="'1 1 0'"
      overflow="hidden"
      main-overflow="hidden"
    >
      <!-- Tab Bar (replaces ChatHeader) -->
      <template #header>
        <TabBar
          :tabs="tabs"
          :active-tab-id="activeTabId"
          :session-id="effectiveSessionId"
          :chat-session-names="chatSessionNames"
          :cached-session-ids="cachedSessionIds"
          :panel-id="panelId"
          :is-branch-session="isBranchSession"
          :show-sidebar-toggle="showSidebarToggle"
          :show-split-button="canClose !== undefined"
          :can-close="!!canClose"
          :is-inspector-open="isInspectorOpen"
          :media-panel-open="mediaPanelOpen"
          :reserve-sidebar-actions="reserveSidebarActions"
          :side-panel-available="sidePanelAvailable"
          :side-panel-collapsed="sidePanelCollapsed"
          :panel-focused="panelFocused"
          @select-tab="activateTab"
          @close-tab="handleCloseTab"
          @close-tabs="handleCloseTabs"
          @rename-session="(sid, name) => sessionsStore.renameSession(sid, name)"
          @move-tab="(fromId, toId) => workspaceStore.moveTab(leafId, fromId, toId)"
          @toggle-sidebar="emit('toggleSidebar')"
          @open-search="emit('openSearch')"
          @create-new-chat="emit('createNewChat')"
          @go-to-parent="goToParentSession"
          @split="emit('split')"
          @equalize="emit('equalize')"
          @toggle-inspector="emit('toggleInspector')"
          @toggle-side-panel="emit('toggleSidePanel')"
        />
        <PracticeStrip v-if="showPracticeStrip" />
      </template>

      <!-- Panel body: tab content + composer footer, wrapped together so the
           split drop-zone overlay covers the whole panel (composer included),
           not just the message list. -->
      <div
        class="panel-body"
        @dragover="handleContentDragOver"
        @dragleave="handleContentDragLeave"
        @drop="handleContentDrop"
      >
        <div class="tab-content">
          <ChatPanel
            ref="chatPanelRef"
            :session-id="effectiveSessionId"
            :active="true"
            :footer-target="chatFooterRef"
            :layout-transitioning="layoutTransitioning"
            :outline-rail-target="outlineRailTarget"
            @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
            @open-file="handleOpenFile"
            @review-goal="(goalSessionId) => emit('reviewGoal', goalSessionId)"
            @switch-session="(sessionId) => emit('switchSession', sessionId)"
          />
        </div>

        <div
          ref="chatFooterRef"
          class="chat-footer"
        />

        <Transition name="split-zone">
          <div
            v-if="dragHoverZone"
            :class="['split-drop-overlay', `zone-${dragHoverZone}`]"
          />
        </Transition>
      </div>
    </Container>
  </BorderBox>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { MAIN_LEAF_ID, type SplitDirection } from '@/stores/workspace-tree'
import TabBar from './TabBar.vue'
import ChatPanel from './ChatPanel.vue'
import Container from '@/components/common/Container.vue'
import BorderBox from '@/components/common/BorderBox.vue'
import PracticeStrip from './PracticeStrip.vue'
import { platformApi } from '@/platform'

interface Props {
  panelId?: string
  canClose?: boolean
  showSidebarToggle?: boolean
  mediaPanelOpen?: boolean
  isInspectorOpen?: boolean
  reserveSidebarActions?: boolean
  layoutTransitioning?: boolean
  panelFocused?: boolean
  /** Shared side panel state, owned by ChatContainer (see stores/workspace) — this window only reflects it in its tab bar toggle. */
  sidePanelAvailable?: boolean
  sidePanelCollapsed?: boolean
  /** Non-null only for the currently focused panel; ChatPanel teleports its outline rail here. */
  outlineRailTarget?: HTMLElement | null
  /** Practice strip renders once globally, under the primary panel's tab bar. */
  showPracticeStrip?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSidebarToggle: false,
  mediaPanelOpen: false,
  panelFocused: true,
})

const chatBorderColor = 'color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 52%, transparent)'
const chatPanelShadowFallback = [
  '0 10px 28px rgba(0, 0, 0, 0.11)',
  '0 1px 5px rgba(0, 0, 0, 0.055)',
  'inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.8%, transparent)',
].join(', ')
const chatPanelShadowValue = `var(--ui-surface-chat-panel-shadow, ${chatPanelShadowFallback})`

const emit = defineEmits<{
  split: []
  equalize: []
  splitWithBranch: [sessionId: string]
  toggleSidebar: []
  openSearch: []
  createNewChat: []
  toggleInspector: []
  openFile: [filePath: string]
  reviewGoal: [sessionId: string]
  switchSession: [sessionId: string]
  splitDrop: [payload: { direction: SplitDirection; sessionId: string; sourcePanelId: string }]
  toggleSidePanel: []
}>()

const sessionsStore = useSessionsStore()
const workspaceStore = useWorkspaceStore()

// This window renders one workspace leaf; all tab state lives in the store.
const leafId = computed(() => props.panelId ?? MAIN_LEAF_ID)
const tabs = computed(() => workspaceStore.tabsOf(leafId.value))
const activeTabId = computed(() => workspaceStore.activeTabIdOf(leafId.value))
const effectiveSessionId = computed(() => workspaceStore.activeSessionIdOf(leafId.value))

onMounted(() => {
  void refreshCacheStats()
})

// Session info for TabBar
const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

// Tab titles. "New Chat" is reserved for drafts; a real session id that no
// longer resolves (should not survive hydration/lifecycle pruning) must not
// masquerade as a new chat.
const chatSessionNames = computed(() => Object.fromEntries(
  tabs.value.map(tab => [
    tab.sessionId,
    sessionsStore.getSessionItem(tab.sessionId)?.name
      || (sessionsStore.isNewChatDraftId(tab.sessionId) ? 'New Chat' : 'Untitled'),
  ]),
))

// Sessions currently held in the main process's in-memory session LRU cache,
// used to mark evicted ("cold") chat tabs. Refreshed opportunistically after
// the actions that actually change cache membership (see syncSessionFromTab /
// handleCloseTab) rather than polled, since a brief staleness after a
// capacity-triggered server-side eviction is only a cosmetic delay.
// null = unknown (before the first refresh, or on hosts without a session
// cache, e.g. web): tabs are then treated as warm so nothing gets marked.
const cachedSessionIds = ref<Set<string> | null>(null)

async function refreshCacheStats() {
  const stats = await platformApi.getSessionCacheStats()
  cachedSessionIds.value = stats.maxSize > 0 ? new Set(stats.cachedSessionIds) : null
}

const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// ChatPanel ref for focusInput
const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const chatFooterRef = ref<HTMLElement | null>(null)

function focusInput() {
  chatPanelRef.value?.focusInput()
}

function insertPromptReference(promptId: string) {
  chatPanelRef.value?.insertPromptReference(promptId)
}

function activateTab(id: string) {
  if (activeTabId.value === id && workspaceStore.activeLeafId === leafId.value) return
  workspaceStore.activateTab(leafId.value, id)
  // Session switching follows via the workspace effect; refresh the cache
  // markers once that has had a chance to run.
  void nextTick().then(refreshCacheStats)
}

// Cmd+1..9: digit is 1-9, browser convention where 9 always means "last tab".
function selectTabByIndex(digit: number) {
  const list = tabs.value
  const index = digit === 9 ? list.length - 1 : digit - 1
  const target = list[index]
  if (target) activateTab(target.id)
}

function handleOpenFile(filePath: string) {
  emit('openFile', filePath)
}

// Cmd+W: close the tab the user is looking at, not the window.
function closeActiveTab() {
  const id = activeTabId.value
  if (id) void handleCloseTab(id)
}

/** Closes one tab through the store; false means the store refused (nothing left to keep on screen). */
async function closeOneTab(id: string): Promise<boolean> {
  // The store owns the close semantics: closing a leaf's last tab closes the
  // leaf itself (mirrors VS Code editor groups), refused only for the sole
  // remaining leaf. `released` means no other leaf still shows the session.
  const result = workspaceStore.closeTab(leafId.value, id)
  if (!result) return false

  if (result.released) {
    if (sessionsStore.isNewChatDraftId(result.closedSessionId)) {
      sessionsStore.discardNewChatDraft(result.closedSessionId)
    } else {
      await platformApi.evictSessionCache(result.closedSessionId).catch(() => {})
    }
  }
  return true
}

async function handleCloseTab(id: string) {
  const lastRemaining = workspaceStore.isLastRemainingTab(leafId.value, id)
  const closed = await closeOneTab(id)
  if (!closed) {
    // The workspace must keep something on screen, so the last tab has nowhere
    // to go — closing it means closing the window (macOS Cmd+W convention).
    if (lastRemaining) await platformApi.closeWindow().catch(() => {})
    return
  }
  await refreshCacheStats()
}

/**
 * Batch close from the tab menu (close others / left / right / all). Unlike
 * Cmd+W this never closes the window: when the batch would empty the last
 * remaining leaf, a blank New Chat takes the seat so the workspace still has
 * something on screen and "Close All" really does close everything opened.
 */
async function handleCloseTabs(ids: string[]) {
  let refreshNeeded = false
  for (const id of ids) {
    if (await closeOneTab(id)) {
      refreshNeeded = true
      continue
    }
    // Refused: this is the only tab of the only leaf. Seat a fresh draft next
    // to it, then retry — unless the draft simply reused this very tab (an
    // empty draft is already the desired end state).
    if (!workspaceStore.isLastRemainingTab(leafId.value, id)) break
    workspaceStore.activateTab(leafId.value, id)
    sessionsStore.openNewChatDraft()
    await nextTick()
    if (workspaceStore.tabsOf(leafId.value).length <= 1) break
    if (!(await closeOneTab(id))) break
    refreshNeeded = true
  }
  if (refreshNeeded) await refreshCacheStats()
}

const SPLIT_DROP_MIME = 'application/x-onething-split-tab'
const dragHoverZone = ref<SplitDirection | null>(null)
// dragover fires on every pointer-move tick (~60/s); getBoundingClientRect()
// forces a synchronous layout flush, so calling it per-tick visibly janks the
// drag. The panel doesn't resize mid-drag, so measure once per hover streak
// and reuse it until the cursor actually leaves (cleared in dragleave/drop).
let cachedContentRect: DOMRect | null = null

function resolveDropZone(e: DragEvent, rect: DOMRect): SplitDirection | null {
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  if (x < 0.25) return 'left'
  if (x > 0.75) return 'right'
  if (y < 0.25) return 'top'
  if (y > 0.75) return 'bottom'
  return null
}

function handleContentDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(SPLIT_DROP_MIME)) return
  e.preventDefault()
  if (!cachedContentRect) {
    cachedContentRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  }
  const zone = resolveDropZone(e, cachedContentRect)
  if (zone !== dragHoverZone.value) dragHoverZone.value = zone
}

// dragover stops firing the moment the cursor leaves this panel (e.g. it
// moved onto a different split panel), so without this the highlight from
// the panel the drag started over would otherwise never clear. Ignore leaves
// into a child element (dragleave/dragenter fire at every element boundary
// while bubbling) — only clear once the cursor is truly outside panel-body.
function handleContentDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as Node | null
  if (related && target.contains(related)) return
  cachedContentRect = null
  dragHoverZone.value = null
}

function handleContentDrop(e: DragEvent) {
  const zone = dragHoverZone.value
  dragHoverZone.value = null
  cachedContentRect = null
  const raw = e.dataTransfer?.getData(SPLIT_DROP_MIME)
  if (!raw) {
    // Anything that isn't a split-tab drag must still be swallowed here.
    // Letting it bubble reaches the window default, which navigates to
    // file:/// and hands the file to the OS via will-navigate →
    // shell.openExternal — dropping a PDF beside the composer would open it
    // in Preview. The composer's own drop zone stops propagation before this.
    e.preventDefault()
    return
  }
  e.preventDefault()
  if (!zone) return
  const { sessionId, sourcePanelId } = JSON.parse(raw) as { sessionId: string; sourcePanelId: string }
  emit('splitDrop', { direction: zone, sessionId, sourcePanelId })
}

async function scrollToMessage(messageId: string) {
  return chatPanelRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  scrollToMessage,
  selectTabByIndex,
  closeActiveTab,
})
</script>

<style scoped>
.chat {
  --chat-surface: var(--ui-surface-chat-bg, var(--bg-chat, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg-elevated)))));

  flex: 1;
  height: 100%;
  min-width: 0;
  position: relative;
  overflow: hidden;
  contain: layout style;
}

.chat :deep(.chat-body) {
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.chat :deep(.chat-main-region) {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.panel-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.chat-footer {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: visible;
}

.tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.split-drop-overlay {
  position: absolute;
  z-index: var(--z-sticky, 10);
  pointer-events: none;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 16%, transparent);
  border: 2px solid var(--ui-accent-primary-fg, var(--accent));
  box-sizing: border-box;
}

.split-drop-overlay.zone-left {
  left: 0;
  top: 0;
  bottom: 0;
  width: 50%;
}

.split-drop-overlay.zone-right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 50%;
}

.split-drop-overlay.zone-top {
  left: 0;
  right: 0;
  top: 0;
  height: 50%;
}

.split-drop-overlay.zone-bottom {
  left: 0;
  right: 0;
  bottom: 0;
  height: 50%;
}

.split-zone-enter-active,
.split-zone-leave-active {
  transition: opacity var(--duration-fast, 0.12s) var(--ease-default, ease);
}

.split-zone-enter-from,
.split-zone-leave-to {
  opacity: 0;
}

</style>
