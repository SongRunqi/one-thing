<template>
  <main class="chat">
    <!-- Tab Bar (replaces ChatHeader) -->
    <TabBar
      :tabs="tabsWithDirty"
      :active-tab-id="activeTabId"
      :session-id="effectiveSessionId"
      :session-name="currentSession?.name || 'New Chat'"
      :is-branch-session="isBranchSession"
      :show-sidebar-toggle="showSidebarToggle"
      :show-split-button="canClose !== undefined"
      :can-close="!!canClose"
      :is-inspector-open="isInspectorOpen"
      :media-panel-open="mediaPanelOpen"
      @select-tab="activateTab"
      @close-tab="handleCloseTab"
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
        v-show="activeTab?.type === 'chat'"
        ref="chatPanelRef"
        :session-id="effectiveSessionId"
        @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
        @open-file="addFileTab"
      />
      <FilePanel
        v-if="isWorkbenchLikeTab(activeTab)"
        :file-path="activeWorkbenchFilePath"
        :workspace-root="activeWorkbenchRoot"
        :max-size-kb="maxFilePreviewKB"
        :active="true"
      />
    </div>

    <FileUnsavedDialog
      :visible="!!pendingCloseWorkbench"
      :file-path="pendingCloseWorkbenchPath"
      @save="saveAndClosePendingWorkbench"
      @discard="discardAndClosePendingWorkbench"
      @cancel="pendingCloseWorkbench = null"
    />

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
import { computed, watch, onMounted, nextTick } from 'vue'
import { ref } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useTabs } from '@/composables/useTabs'
import TabBar from './TabBar.vue'
import ChatPanel from './ChatPanel.vue'
import FilePanel from './FilePanel.vue'
import FileUnsavedDialog from './FileUnsavedDialog.vue'
import SettingsPanel from '../SettingsPanel.vue'
import { useEditorWorkspace } from '@/composables/useEditorWorkspace'
import type { FileTab, Tab, WorkbenchTab } from '@/types/tabs'

interface Props {
  showSettings?: boolean
  sessionId?: string
  canClose?: boolean
  showSidebarToggle?: boolean
  mediaPanelOpen?: boolean
  isInspectorOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSettings: false,
  showSidebarToggle: false,
  mediaPanelOpen: false,
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
const editorWorkspace = useEditorWorkspace()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)
const maxFilePreviewKB = computed(() => settingsStore.settings?.general?.maxFilePreviewKB ?? 256)

// Tab state
const tabState = useTabs(effectiveSessionId.value || '')
const { tabs, activeTabId, activeTab } = tabState
const pendingCloseWorkbench = ref<WorkbenchTab | FileTab | null>(null)
const tabsWithDirty = computed<Tab[]>(() => tabs.value.map(tab => {
  if (tab.type === 'workbench') {
    return {
      ...tab,
      activeFilePath: editorWorkspace.isPathInsideRoot(editorWorkspace.workspace.activePath, tab.workspaceRoot)
        ? editorWorkspace.workspace.activePath
        : tab.activeFilePath,
      dirty: editorWorkspace.getDirtyBuffersForRoot(tab.workspaceRoot).length > 0,
    }
  }
  if (tab.type !== 'file') return tab
  const buffer = editorWorkspace.workspace.buffers.get(tab.filePath)
  return {
    ...tab,
    dirty: !!buffer?.dirty,
  }
}))

function normalizePath(path: string): string {
  if (path === '/') return '/'
  return path.replace(/\/+$/, '')
}

function parentDir(filePath: string): string {
  return normalizePath(filePath).split('/').slice(0, -1).join('/') || '/'
}

function basename(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() || path
}

function isPathInsideRoot(filePath: string, root: string): boolean {
  if (!filePath || !root) return false
  const normalizedPath = normalizePath(filePath)
  const normalizedRoot = normalizePath(root)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}

function isWorkbenchLikeTab(tab: Tab | undefined): tab is WorkbenchTab | FileTab {
  return tab?.type === 'workbench' || tab?.type === 'file'
}

const activeWorkbenchRoot = computed(() => {
  if (activeTab.value?.type === 'workbench') return activeTab.value.workspaceRoot
  if (activeTab.value?.type === 'file') return parentDir(activeTab.value.filePath)
  return ''
})

const activeWorkbenchFilePath = computed(() => {
  if (activeTab.value?.type === 'workbench') {
    return activeTab.value.activeFilePath || activeTab.value.initialFilePath
  }
  if (activeTab.value?.type === 'file') return activeTab.value.filePath
  return ''
})

const pendingCloseWorkbenchPath = computed(() => {
  const tab = pendingCloseWorkbench.value
  if (!tab) return undefined
  return tab.type === 'workbench' ? tab.workspaceRoot : tab.filePath
})

// Restore saved tabs on mount
onMounted(async () => {
  try {
    const appState = await window.electronAPI.getAppState()
    if (appState.openTabs && appState.openTabs.length > 0) {
      tabState.restore(appState.openTabs as any, appState.activeTabIndex)
    }
  } catch (err) {
    console.warn('[ChatWindow] Failed to restore tabs:', err)
  }
})

// Sync session changes to the chat tab
watch(effectiveSessionId, (newId) => {
  if (newId) tabState.updateChatSession(newId)
}, { immediate: true })

watch(() => editorWorkspace.workspace.activePath, (filePath) => {
  const tab = activeTab.value
  if (!filePath || tab?.type !== 'workbench') return
  if (!isPathInsideRoot(filePath, tab.workspaceRoot)) return
  tab.activeFilePath = filePath
  tabState.persistTabs()
})

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
let tabActivationRun = 0

function focusInput() {
  chatPanelRef.value?.focusInput()
}

function insertPromptReference(promptId: string) {
  chatPanelRef.value?.insertPromptReference(promptId)
}

function saveChatSnapshotBeforeLeaving(nextType: Tab['type']) {
  if (activeTab.value?.type === 'chat' && nextType !== 'chat') {
    chatPanelRef.value?.saveSnapshotForCurrentSession()
  }
}

async function restoreChatSnapshotAfterActivation(run: number) {
  await nextTick()
  if (run !== tabActivationRun || activeTab.value?.type !== 'chat') return
  await chatPanelRef.value?.restoreSnapshotForCurrentSession()
}

async function activateTab(id: string) {
  const nextTab = tabs.value.find(tab => tab.id === id)
  if (!nextTab || activeTabId.value === id) return

  const run = ++tabActivationRun
  saveChatSnapshotBeforeLeaving(nextTab.type)
  tabState.setActiveTab(id)

  if (nextTab.type === 'chat') {
    await restoreChatSnapshotAfterActivation(run)
  }
}

function addFileTab(filePath: string) {
  // Keep unsaved buffers safe. Max-tab enforcement can become a close-confirm
  // flow later; opening a file must never evict a dirty tab implicitly.
  tabActivationRun += 1
  saveChatSnapshotBeforeLeaving('workbench')
  tabState.addWorkbenchTab(filePath, resolveWorkspaceRoot(filePath), Number.MAX_SAFE_INTEGER)
}

async function removeTabAndRelease(tab: Tab) {
  const wasActive = activeTabId.value === tab.id
  const run = wasActive ? ++tabActivationRun : tabActivationRun
  tabState.removeTab(tab.id)
  if (tab.type === 'workbench') {
    editorWorkspace.closeWorkspace(tab.workspaceRoot)
  } else if (tab.type === 'file') {
    editorWorkspace.closeFile(tab.filePath)
  }
  if (wasActive && activeTab.value?.type === 'chat') {
    await restoreChatSnapshotAfterActivation(run)
  }
}

function resolveWorkspaceRoot(filePath: string) {
  const current = activeTab.value
  if (current?.type === 'workbench' && isPathInsideRoot(filePath, current.workspaceRoot)) {
    return current.workspaceRoot
  }
  const sessionRoot = currentSession.value?.workingDirectory
  if (sessionRoot && isPathInsideRoot(filePath, sessionRoot)) {
    return normalizePath(sessionRoot)
  }
  return parentDir(filePath)
}

function handleCloseTab(id: string) {
  const tab = tabs.value.find(t => t.id === id)
  if (!tab) return
  const hasDirtyWorkbench = tab.type === 'workbench' && editorWorkspace.getDirtyBuffersForRoot(tab.workspaceRoot).length > 0
  const buffer = tab.type === 'file' ? editorWorkspace.workspace.buffers.get(tab.filePath) : null
  if (hasDirtyWorkbench || (tab.type === 'file' && buffer?.dirty)) {
    pendingCloseWorkbench.value = tab
    return
  }
  void removeTabAndRelease(tab)
}

async function saveAndClosePendingWorkbench() {
  const tab = pendingCloseWorkbench.value
  if (!tab) return
  const saved = tab.type === 'workbench'
    ? await editorWorkspace.saveWorkspace(tab.workspaceRoot)
    : await editorWorkspace.saveFile(tab.filePath)
  if (!saved) return
  pendingCloseWorkbench.value = null
  await removeTabAndRelease(tab)
}

function discardAndClosePendingWorkbench() {
  const tab = pendingCloseWorkbench.value
  if (!tab) return
  pendingCloseWorkbench.value = null
  void removeTabAndRelease(tab)
}

async function scrollToMessage(messageId: string) {
  const chatTab = tabs.value.find(tab => tab.type === 'chat')
  if (chatTab && activeTabId.value !== chatTab.id) {
    await activateTab(chatTab.id)
  }
  return chatPanelRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  addFileTab,
  scrollToMessage,
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
