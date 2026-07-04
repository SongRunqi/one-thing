import { platformApi } from '@/platform'
/**
 * Tab state management composable
 *
 * Each ChatWindow instance holds its own tab set.
 * At least one chat tab must remain open at all times.
 */

import { ref, computed } from 'vue'
import type { Tab, ChatTab, FileTab, WorkbenchTab } from '@/types/tabs'

let nextId = 0
function genTabId(): string {
  return `tab-${Date.now()}-${++nextId}`
}

function normalizePath(path: string): string {
  if (path === '/') return '/'
  return path.replace(/\/+$/, '')
}

function basename(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() || path
}

function parentDir(filePath: string): string {
  return normalizePath(filePath).split('/').slice(0, -1).join('/') || '/'
}

export interface SerializedTab {
  type: 'chat' | 'file' | 'workbench'
  sessionId?: string
  filePath?: string
  initialFilePath?: string
  activeFilePath?: string
  workspaceRoot?: string
  title?: string
}

export function useTabs(initialSessionId: string) {
  const chatTab: ChatTab = {
    id: genTabId(),
    type: 'chat',
    sessionId: initialSessionId,
  }

  const tabs = ref<Tab[]>([chatTab])
  const activeTabId = ref(chatTab.id)

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value) ?? tabs.value[0]
  )

  const chatTabs = computed(() => tabs.value.filter(t => t.type === 'chat') as ChatTab[])

  function setActiveTab(id: string) {
    if (tabs.value.some(t => t.id === id)) {
      activeTabId.value = id
      persistTabs()
    }
  }

  function addWorkbenchTab(filePath: string, workspaceRoot = parentDir(filePath), maxTabs = 15): WorkbenchTab {
    const root = normalizePath(workspaceRoot)
    const existing = tabs.value.find(
      t => t.type === 'workbench' && t.workspaceRoot === root
    ) as WorkbenchTab | undefined
    if (existing) {
      existing.initialFilePath = filePath
      existing.activeFilePath = filePath
      activeTabId.value = existing.id
      persistTabs()
      return existing
    }

    const workbenchTabs = tabs.value.filter(t => t.type === 'workbench' || t.type === 'file')
    if (tabs.value.length >= maxTabs && workbenchTabs.length > 0) {
      const oldest = workbenchTabs[0]
      removeTab(oldest.id)
    }

    const tab: WorkbenchTab = {
      id: genTabId(),
      type: 'workbench',
      workspaceRoot: root,
      initialFilePath: filePath,
      activeFilePath: filePath,
      title: basename(root),
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id
    persistTabs()
    return tab
  }

  function addFileTab(filePath: string, maxTabs = 15): WorkbenchTab {
    return addWorkbenchTab(filePath, parentDir(filePath), maxTabs)
  }

  function removeTab(id: string) {
    const idx = tabs.value.findIndex(t => t.id === id)
    if (idx === -1) return

    const tab = tabs.value[idx]
    if (tab.type === 'chat' && chatTabs.value.length <= 1) return

    tabs.value.splice(idx, 1)

    if (activeTabId.value === id) {
      const newIdx = Math.min(idx, tabs.value.length - 1)
      activeTabId.value = tabs.value[newIdx].id
    }
    persistTabs()
  }

  function updateChatSession(sessionId: string) {
    const chat = chatTabs.value[0]
    if (chat) {
      chat.sessionId = sessionId
    }
  }

  function moveTab(fromId: string, toId: string) {
    const fromIdx = tabs.value.findIndex(t => t.id === fromId)
    const toIdx = tabs.value.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    const [moved] = tabs.value.splice(fromIdx, 1)
    tabs.value.splice(toIdx, 0, moved)
    persistTabs()
  }

  function closeAllFileTabs() {
    tabs.value = tabs.value.filter(t => t.type === 'chat')
    if (!tabs.value.some(t => t.id === activeTabId.value)) {
      activeTabId.value = tabs.value[0].id
    }
    persistTabs()
  }

  // --- Serialization ---

  function serialize(): { tabs: SerializedTab[]; activeTabIndex: number } {
    const serialized = tabs.value.map(t => {
      if (t.type === 'chat') {
        const sessionId = (t as ChatTab).sessionId
        return { type: 'chat' as const, sessionId: sessionId.startsWith('draft:') ? '' : sessionId }
      }
      if (t.type === 'workbench') {
        const wt = t as WorkbenchTab
        return {
          type: 'workbench' as const,
          workspaceRoot: wt.workspaceRoot,
          initialFilePath: wt.initialFilePath,
          activeFilePath: wt.activeFilePath,
          title: wt.title,
        }
      }
      const ft = t as FileTab
      const workspaceRoot = parentDir(ft.filePath)
      return {
        type: 'workbench' as const,
        workspaceRoot,
        initialFilePath: ft.filePath,
        activeFilePath: ft.filePath,
        title: basename(workspaceRoot),
      }
    })
    const activeIdx = tabs.value.findIndex(t => t.id === activeTabId.value)
    return { tabs: serialized, activeTabIndex: Math.max(0, activeIdx) }
  }

  function restore(saved: SerializedTab[], activeIndex?: number) {
    const restored: Tab[] = []
    for (const s of saved) {
      if (s.type === 'chat') {
        restored.push({ id: genTabId(), type: 'chat', sessionId: s.sessionId || initialSessionId })
      } else if (s.type === 'workbench' && (s.initialFilePath || s.activeFilePath || s.filePath)) {
        const initialFilePath = s.initialFilePath || s.activeFilePath || s.filePath!
        const workspaceRoot = normalizePath(s.workspaceRoot || parentDir(initialFilePath))
        restored.push({
          id: genTabId(),
          type: 'workbench',
          workspaceRoot,
          initialFilePath,
          activeFilePath: s.activeFilePath || initialFilePath,
          title: s.title || basename(workspaceRoot),
        })
      } else if (s.type === 'file' && s.filePath) {
        const workspaceRoot = normalizePath(s.workspaceRoot || parentDir(s.filePath))
        const existing = restored.find(
          tab => tab.type === 'workbench' && tab.workspaceRoot === workspaceRoot
        ) as WorkbenchTab | undefined
        if (existing) {
          existing.initialFilePath = s.filePath
          existing.activeFilePath = s.filePath
        } else {
          restored.push({
            id: genTabId(),
            type: 'workbench',
            workspaceRoot,
            initialFilePath: s.filePath,
            activeFilePath: s.filePath,
            title: basename(workspaceRoot),
          })
        }
      }
    }
    if (restored.length === 0 || !restored.some(t => t.type === 'chat')) {
      restored.unshift({ id: genTabId(), type: 'chat', sessionId: initialSessionId })
    }
    tabs.value = restored
    const idx = activeIndex != null && activeIndex >= 0 && activeIndex < restored.length
      ? activeIndex : 0
    activeTabId.value = restored[idx].id
  }

  function persistTabs() {
    if (!platformApi?.saveUIState) return
    const { tabs: serializedTabs, activeTabIndex } = serialize()
    platformApi.saveUIState({ openTabs: serializedTabs, activeTabIndex }).catch(() => {})
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    chatTabs,
    setActiveTab,
    addFileTab,
    addWorkbenchTab,
    removeTab,
    moveTab,
    updateChatSession,
    closeAllFileTabs,
    serialize,
    restore,
    persistTabs,
  }
}
