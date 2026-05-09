/**
 * Tab state management composable
 *
 * Each ChatWindow instance holds its own tab set.
 * At least one chat tab must remain open at all times.
 */

import { ref, computed, watch } from 'vue'
import type { Tab, ChatTab, FileTab } from '@/types/tabs'

let nextId = 0
function genTabId(): string {
  return `tab-${Date.now()}-${++nextId}`
}

export interface SerializedTab {
  type: 'chat' | 'file'
  sessionId?: string
  filePath?: string
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

  function addFileTab(filePath: string, maxTabs = 15): FileTab {
    const existing = tabs.value.find(
      t => t.type === 'file' && t.filePath === filePath
    ) as FileTab | undefined
    if (existing) {
      activeTabId.value = existing.id
      return existing
    }

    const fileTabs = tabs.value.filter(t => t.type === 'file')
    if (tabs.value.length >= maxTabs && fileTabs.length > 0) {
      const oldest = fileTabs[0]
      removeTab(oldest.id)
    }

    const basename = filePath.split('/').pop() || filePath
    const tab: FileTab = {
      id: genTabId(),
      type: 'file',
      filePath,
      title: basename,
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id
    persistTabs()
    return tab
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
        return { type: 'chat' as const, sessionId: (t as ChatTab).sessionId }
      }
      const ft = t as FileTab
      return { type: 'file' as const, filePath: ft.filePath, title: ft.title }
    })
    const activeIdx = tabs.value.findIndex(t => t.id === activeTabId.value)
    return { tabs: serialized, activeTabIndex: Math.max(0, activeIdx) }
  }

  function restore(saved: SerializedTab[], activeIndex?: number) {
    const restored: Tab[] = []
    for (const s of saved) {
      if (s.type === 'chat') {
        restored.push({ id: genTabId(), type: 'chat', sessionId: s.sessionId || initialSessionId })
      } else if (s.type === 'file' && s.filePath) {
        restored.push({ id: genTabId(), type: 'file', filePath: s.filePath, title: s.title || s.filePath.split('/').pop() || '' })
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
    if (!window.electronAPI?.saveUIState) return
    const { tabs: serializedTabs, activeTabIndex } = serialize()
    window.electronAPI.saveUIState({ openTabs: serializedTabs, activeTabIndex }).catch(() => {})
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    chatTabs,
    setActiveTab,
    addFileTab,
    removeTab,
    moveTab,
    updateChatSession,
    closeAllFileTabs,
    serialize,
    restore,
    persistTabs,
  }
}
