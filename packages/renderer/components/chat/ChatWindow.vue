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
      <!-- 房 / 私聊(workbench):房头取代 TabBar —— 换房走左栏,房头只剩身份
           与动作(去复用重构 R1,§8.1)。直聊与 classic 一律走下面的旧壳。 -->
      <template #header>
        <RoomHeader
          v-if="roomSurfaceActive"
          :session-id="effectiveSessionId"
          :show-sidebar-toggle="showSidebarToggle"
          :is-inspector-open="isInspectorOpen"
          @toggle-sidebar="emit('toggleSidebar')"
          @open-search="emit('openSearch')"
          @toggle-inspector="emit('toggleInspector')"
        />
        <SessionHeader
          v-else
          :session-id="effectiveSessionId"
          :session-name="chatSessionNames[effectiveSessionId]"
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
          @rename-session="(sid, name) => sessionsStore.renameSession(sid, name)"
          @toggle-sidebar="emit('toggleSidebar')"
          @open-search="emit('openSearch')"
          @create-new-chat="emit('createNewChat')"
          @go-to-parent="goToParentSession"
          @split="emit('split')"
          @equalize="emit('equalize')"
          @toggle-inspector="emit('toggleInspector')"
          @toggle-side-panel="emit('toggleSidePanel')"
        />
        <!-- 练习条是直聊的东西,不进房(样板末节)。 -->
        <PracticeStrip v-if="showPracticeStrip && !roomSurfaceActive" />
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
        <!-- 分流是 v-if/v-else 级(§8 铁律 2):两套聊天面永不同时挂载。 -->
        <RoomSurface
          v-if="roomSurfaceActive"
          ref="roomSurfaceRef"
          :session-id="effectiveSessionId"
          @switch-session="(sessionId) => emit('switchSession', sessionId)"
        />

        <template v-else>
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
        </template>

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
import { computed, onMounted, ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { MAIN_LEAF_ID, type SplitDirection } from '@/stores/workspace-tree'
import SessionHeader from './SessionHeader.vue'
import ChatPanel from './ChatPanel.vue'
import RoomHeader from './room/RoomHeader.vue'
import RoomSurface from './room/RoomSurface.vue'
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

const chatBorderColor = 'color-mix(in srgb, var(--ui-border-subtle-border) 52%, transparent)'
const chatPanelShadowFallback = [
  '0 10px 28px rgba(0, 0, 0, 0.11)',
  '0 1px 5px rgba(0, 0, 0, 0.055)',
  'inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg) 2.8%, transparent)',
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

// This window renders one workspace leaf; which session sits in it lives in
// the store (一格恰好一条会话,U2)。
const leafId = computed(() => props.panelId ?? MAIN_LEAF_ID)
const effectiveSessionId = computed(() => workspaceStore.activeSessionIdOf(leafId.value))

onMounted(() => {
  void refreshCacheStats()
})

// Session info for the header
const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

// 标题。"New Chat" 只留给草稿;一个解析不出来的真实会话 id(正常不该活过
// hydration/生命周期清理)不许冒充新会话。
const chatSessionNames = computed<Record<string, string>>(() => {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return {}
  return {
    [sessionId]: sessionsStore.getSessionItem(sessionId)?.name
      || (sessionsStore.isNewChatDraftId(sessionId) ? 'New Chat' : 'Untitled'),
  }
})

// Sessions currently held in the main process's in-memory session LRU cache,
// used to mark an evicted ("cold") session in the header. Refreshed
// opportunistically rather than polled, since a brief staleness after a
// capacity-triggered server-side eviction is only a cosmetic delay.
// null = unknown (before the first refresh, or on hosts without a session
// cache, e.g. web): the session is then treated as warm so nothing gets marked.
const cachedSessionIds = ref<Set<string> | null>(null)

async function refreshCacheStats() {
  const stats = await platformApi.getSessionCacheStats()
  cachedSessionIds.value = stats.maxSize > 0 ? new Set(stats.cachedSessionIds) : null
}

const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

/**
 * 房 / 私聊新面的分流门(去复用重构 R1,§8 铁律 2/3)。
 *
 * **判据只有两条,没有第三条**:
 *  1. `kind === 'room'` —— 群聊房、单成员 dm 房、agent 互聊 pair 房都是 room,
 *     这正是 W-Q4 划的覆盖范围;直聊(`chat`)与执行会话(`work`/`agent`)不是,
 *     它们本身就是工程驾驶舱,继续走 TabBar + ChatPanel 旧壳;
 *  2. workbench 外壳 —— classic 是逐像素回滚闸,新面在那儿一行都不许挂。
 *
 * 门是 DOM 级的(`v-if` / `v-else`),两套聊天面在结构上不可能同时挂载。
 * **全库唯一一处 say 树分流**:R3 已拆掉 `MessageList` 里那道同口径的旧门
 * (workbench 下房会话根本到不了 `ChatPanel` → `MessageList`)。
 */
const roomSurfaceActive = computed(() => currentSession.value?.kind === 'room')

async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// ChatPanel ref for focusInput
const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const roomSurfaceRef = ref<InstanceType<typeof RoomSurface> | null>(null)
const chatFooterRef = ref<HTMLElement | null>(null)

/** 只有一面挂着,所以"当前那一面"就是非空的那一个 ref。 */
function activeSurface() {
  return roomSurfaceActive.value ? roomSurfaceRef.value : chatPanelRef.value
}

function focusInput() {
  activeSurface()?.focusInput()
}

function insertPromptReference(promptId: string) {
  activeSurface()?.insertPromptReference(promptId)
}

function handleOpenFile(filePath: string) {
  emit('openFile', filePath)
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
  return activeSurface()?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  scrollToMessage,
})
</script>

<style scoped>
.chat {
  --chat-surface: var(--ui-surface-chat-bg);

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
  z-index: var(--z-sticky);
  pointer-events: none;
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 16%, transparent);
  border: 2px solid var(--ui-accent-primary-fg);
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
  transition: opacity var(--duration-fast) var(--ease-default);
}

.split-zone-enter-from,
.split-zone-leave-to {
  opacity: 0;
}

</style>
