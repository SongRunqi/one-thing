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
      sidebar-position="right"
      :sidebar-class="['chat-side-region', { collapsed: sidePanelCollapsed }]"
      full-height
      :main-flex="'1 1 0'"
      :sidebar-width="chatSidePanelWidth"
      overflow="hidden"
      main-overflow="hidden"
      sidebar-overflow="hidden"
    >
      <!-- Tab Bar (replaces ChatHeader) -->
      <template #header>
        <TabBar
          :tabs="tabs"
          :active-tab-id="activeTabId"
          :session-id="effectiveSessionId"
          :session-name="currentSession?.name || 'New Chat'"
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
          @move-tab="tabState.moveTab"
          @toggle-sidebar="emit('toggleSidebar')"
          @open-search="emit('openSearch')"
          @create-new-chat="emit('createNewChat')"
          @go-to-parent="goToParentSession"
          @split="emit('split')"
          @equalize="emit('equalize')"
          @close="emit('close')"
          @toggle-inspector="emit('toggleInspector')"
          @toggle-side-panel="toggleSidePanelCollapsed"
        />
      </template>

      <!-- Tab Content -->
      <div class="tab-content">
        <ChatPanel
          ref="chatPanelRef"
          :session-id="effectiveSessionId"
          :active="true"
          :footer-target="chatFooterRef"
          :layout-transitioning="layoutTransitioning"
          :outline-rail-target="!sidePanelCollapsed ? chatSideOutlineTarget : null"
          @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
          @open-file="handleOpenFile"
          @switch-session="(sessionId) => emit('switchSession', sessionId)"
        />
      </div>

      <div
        ref="chatFooterRef"
        class="chat-footer"
      />

      <!-- Settings Panel overlay -->
      <Transition name="settings-fade">
        <SettingsPanel
          v-if="showSettings"
          @close="emit('closeSettings')"
        />
      </Transition>

      <template
        v-if="sidePanelVisible"
        #sidebar
      >
        <ChatSidePanel
          :session-id="effectiveSessionId"
          :working-directory="currentSession?.workingDirectory || ''"
          :agent-id="currentSession?.agentId"
          :last-provider="currentSession?.lastProvider"
          :last-model="currentSession?.lastModel"
          :collapsed="sidePanelCollapsed"
          @outline-target-change="handleSideOutlineTargetChange"
          @toggle-collapsed="toggleSidePanelCollapsed"
        />
      </template>
    </Container>
  </BorderBox>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useTabs } from '@/composables/useTabs'
import TabBar from './TabBar.vue'
import ChatPanel from './ChatPanel.vue'
import ChatSidePanel from './ChatSidePanel.vue'
import Container from '@/components/common/Container.vue'
import BorderBox from '@/components/common/BorderBox.vue'
import SettingsPanel from '../SettingsPanel.vue'
import { platformApi } from '@/platform'

interface Props {
  showSettings?: boolean
  sessionId?: string
  canClose?: boolean
  showSidebarToggle?: boolean
  mediaPanelOpen?: boolean
  isInspectorOpen?: boolean
  reserveSidebarActions?: boolean
  layoutTransitioning?: boolean
  panelFocused?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSettings: false,
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
const CHAT_SIDE_PANEL_WIDTH = 268
const CHAT_SIDE_PANEL_COLLAPSED_WIDTH = 0
const CHAT_SIDE_PANEL_MIN_WINDOW_WIDTH = 1100
const CHAT_SIDE_PANEL_COLLAPSED_STORAGE_KEY = 'chatSidePanelCollapsed'

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
  close: []
  split: []
  equalize: []
  splitWithBranch: [sessionId: string]
  toggleSidebar: []
  openSearch: []
  createNewChat: []
  toggleInspector: []
  openFile: [filePath: string]
  switchSession: [sessionId: string]
}>()

const sessionsStore = useSessionsStore()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// Tab state
const tabState = useTabs(effectiveSessionId.value || '')
const { tabs, activeTabId } = tabState

// Restore saved tabs on mount
onMounted(async () => {
  try {
    const appState = await platformApi.getAppState()
    const chatTabs = appState.openTabs?.filter((tab: any) => tab.type === 'chat') || []
    if (chatTabs.length > 0) {
      tabState.restore(chatTabs as any, 0)
    }
  } catch (err) {
    console.warn('[ChatWindow] Failed to restore tabs:', err)
  }
})

// Sync session changes to the chat tab
watch(effectiveSessionId, (newId) => {
  if (newId) tabState.updateChatSession(newId)
}, { immediate: true })

// Session info for TabBar
const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// ChatPanel ref for focusInput
const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)
const chatFooterRef = ref<HTMLElement | null>(null)
const chatSideOutlineTarget = ref<HTMLElement | null>(null)
const sidePanelAvailable = ref(false)
const sidePanelCollapsed = ref(localStorage.getItem(CHAT_SIDE_PANEL_COLLAPSED_STORAGE_KEY) === 'true')
let chatResizeObserver: ResizeObserver | null = null
const chatSidePanelWidth = computed(() => sidePanelCollapsed.value ? CHAT_SIDE_PANEL_COLLAPSED_WIDTH : CHAT_SIDE_PANEL_WIDTH)
const sidePanelVisible = computed(() => sidePanelAvailable.value || !sidePanelCollapsed.value)

function focusInput() {
  chatPanelRef.value?.focusInput()
}

function insertPromptReference(promptId: string) {
  chatPanelRef.value?.insertPromptReference(promptId)
}

function activateTab(id: string) {
  if (!tabs.value.some(tab => tab.id === id) || activeTabId.value === id) return
  tabState.setActiveTab(id)
}

function handleOpenFile(filePath: string) {
  emit('openFile', filePath)
}

function handleCloseTab(id: string) {
  tabState.removeTab(id)
}

function getChatRootElement() {
  return chatFooterRef.value?.closest('.chat') as HTMLElement | null
}

function updateSidePanelAvailability() {
  const width = getChatRootElement()?.getBoundingClientRect().width ?? 0
  sidePanelAvailable.value = width >= CHAT_SIDE_PANEL_MIN_WINDOW_WIDTH
}

function observeChatWidth() {
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
  const chatRoot = getChatRootElement()
  if (!chatRoot || typeof ResizeObserver === 'undefined') {
    updateSidePanelAvailability()
    return
  }
  chatResizeObserver = new ResizeObserver(updateSidePanelAvailability)
  chatResizeObserver.observe(chatRoot)
  updateSidePanelAvailability()
}

function handleSideOutlineTargetChange(target: HTMLElement | null) {
  chatSideOutlineTarget.value = !sidePanelCollapsed.value ? target : null
}

function toggleSidePanelCollapsed() {
  sidePanelCollapsed.value = !sidePanelCollapsed.value
  localStorage.setItem(CHAT_SIDE_PANEL_COLLAPSED_STORAGE_KEY, String(sidePanelCollapsed.value))
  if (sidePanelCollapsed.value) {
    chatSideOutlineTarget.value = null
  }
}

watch(sidePanelCollapsed, (collapsed) => {
  if (collapsed) {
    chatSideOutlineTarget.value = null
  }
})

onMounted(() => {
  nextTick(observeChatWidth)
})

onBeforeUnmount(() => {
  chatResizeObserver?.disconnect()
  chatResizeObserver = null
})

async function scrollToMessage(messageId: string) {
  return chatPanelRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  scrollToMessage,
})
</script>

<style scoped>
.chat {
  --chat-surface: var(--ui-surface-chat-bg, var(--bg-chat, var(--ui-surface-panel-bg, var(--bg-panel, var(--bg-elevated)))));
  --chat-side-panel-width: 268px;

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

.chat :deep(.chat-side-region) {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* Settings Fade Transition */
.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: all 0.3s ease;
}

.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
}

.settings-fade-enter-active :deep(.floating-hub) {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.settings-fade-enter-from :deep(.floating-hub) {
  transform: scale(0.9) translateY(20px);
}
</style>
