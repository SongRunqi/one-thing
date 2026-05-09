<template>
  <main class="chat">
    <!-- Tab Bar (replaces ChatHeader) -->
    <TabBar
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :session-name="currentSession?.name || 'New Chat'"
      :is-branch-session="isBranchSession"
      :show-sidebar-toggle="showSidebarToggle"
      :show-split-button="canClose !== undefined"
      :can-close="!!canClose"
      :is-inspector-open="isInspectorOpen"
      @select-tab="tabState.setActiveTab"
      @close-tab="tabState.removeTab"
      @move-tab="tabState.moveTab"
      @toggle-sidebar="emit('toggleSidebar')"
      @go-to-parent="goToParentSession"
      @split="emit('split')"
      @equalize="emit('equalize')"
      @close="emit('close')"
      @toggle-inspector="emit('toggleInspector')"
    />

    <!-- Tab Content -->
    <div class="tab-content">
      <ChatPanel
        v-if="activeTab?.type === 'chat'"
        ref="chatPanelRef"
        :session-id="effectiveSessionId"
        @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
      />
      <FilePanel
        v-else-if="activeTab?.type === 'file'"
        :file-path="(activeTab as FileTab).filePath"
        :max-size-kb="maxFilePreviewKB"
      />
    </div>

    <!-- Settings Panel overlay -->
    <Transition name="settings-fade">
      <SettingsPanel
        v-if="showSettings"
        @close="emit('closeSettings')"
      />
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useTabs } from '@/composables/useTabs'
import TabBar from './TabBar.vue'
import ChatPanel from './ChatPanel.vue'
import FilePanel from './FilePanel.vue'
import SettingsPanel from '../SettingsPanel.vue'
import type { FileTab } from '@/types/tabs'

interface Props {
  showSettings?: boolean
  sessionId?: string
  canClose?: boolean
  showSidebarToggle?: boolean
  isInspectorOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSettings: false,
  showSidebarToggle: false,
})

const emit = defineEmits<{
  closeSettings: []
  openSettings: []
  close: []
  split: []
  equalize: []
  splitWithBranch: [sessionId: string]
  toggleSidebar: []
  toggleInspector: []
}>()

const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)
const maxTabs = computed(() => settingsStore.settings?.general?.maxTabs ?? 15)
const maxFilePreviewKB = computed(() => settingsStore.settings?.general?.maxFilePreviewKB ?? 256)

// Tab state
const tabState = useTabs(effectiveSessionId.value || '')
const { tabs, activeTabId, activeTab } = tabState

// Restore saved tabs on mount
onMounted(async () => {
  try {
    const appState = await window.electronAPI.getAppState()
    if (appState.openTabs && appState.openTabs.length > 0) {
      tabState.restore(appState.openTabs as any, appState.activeTabIndex)
    }
  } catch {}
})

// Sync session changes to the chat tab
watch(effectiveSessionId, (newId) => {
  if (newId) tabState.updateChatSession(newId)
}, { immediate: true })

// Session info for TabBar
const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.sessions.find(s => s.id === sid) || null
})

const isBranchSession = computed(() => !!currentSession.value?.parentSessionId)

async function goToParentSession() {
  if (currentSession.value?.parentSessionId) {
    await sessionsStore.switchSession(currentSession.value.parentSessionId)
  }
}

// ChatPanel ref for focusInput
const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null)

function focusInput() {
  chatPanelRef.value?.focusInput()
}

function addFileTab(filePath: string) {
  tabState.addFileTab(filePath, maxTabs.value)
}

defineExpose({
  focusInput,
  addFileTab,
})
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  background: var(--bg-panel, var(--bg-elevated, var(--bg-chat)));
  position: relative;
  overflow: hidden;
  border: none;
  contain: layout style;
}

.tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
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
