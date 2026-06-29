<template>
  <div class="settings-page">
    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="loading-state"
    >
      <div class="loading-spinner" />
      <span>Loading settings...</span>
    </div>

    <Container
      v-else
      class="settings-window"
      full-height
      overflow="hidden"
      main-overflow="hidden"
      sidebar-overflow="hidden"
      body-class="settings-layout"
      header-class="settings-titlebar"
      sidebar-class="settings-sidebar"
      main-class="settings-content"
    >
      <template #header>
        <div class="titlebar-title">
          Settings
        </div>
        <div
          class="titlebar-save-state"
          :class="{ active: hasUnsavedChanges }"
        >
          {{ hasUnsavedChanges ? 'Saving...' : 'Saved' }}
        </div>
      </template>

      <template #sidebar>
        <div class="settings-sidebar-inner">
          <div
            class="settings-traffic-lights-space"
            aria-hidden="true"
          />

          <div class="sidebar-heading">
            <h2>Settings</h2>
            <p>Configure onething</p>
          </div>

          <label class="settings-search">
            <Search class="search-icon" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="Search settings"
              type="search"
            >
          </label>

          <AppMenu
            v-if="filteredNavItems.length > 0"
            class="sidebar-nav"
            :model-value="activeTab"
            :default-openeds="expandedNavMenuIndexes"
            :ellipsis="false"
            menu-trigger="click"
            @select="handleNavMenuSelect"
            @open="handleNavMenuOpen"
            @close="handleNavMenuClose"
          >
            <SubMenu
              v-for="item in filteredNavItems"
              :key="item.id"
              :index="item.id"
              class="sidebar-entry"
              expand-icon-position="start"
            >
              <template #icon>
                <component
                  :is="item.icon"
                  class="sidebar-icon"
                  aria-hidden="true"
                />
              </template>
              <template #title>
                <span class="sidebar-copy">
                  <span class="sidebar-label">{{ item.label }}</span>
                  <span class="sidebar-hint">{{ item.hint }}</span>
                </span>
              </template>

              <MenuItem
                v-for="section in item.sections"
                :key="section"
                :index="navSectionIndex(item.id, section)"
                :title="section"
                item-as="button"
                class="sidebar-subitem"
              />
            </SubMenu>
          </AppMenu>
          <div
            v-else
            class="sidebar-empty"
          >
            No matching settings
          </div>
        </div>
      </template>

      <header class="content-header">
        <div class="content-topline">
          <div class="settings-scope">
            <span class="scope-badge">User</span>
            <span class="scope-name">onething</span>
          </div>
          <Button
            unstyled
            class="json-settings-button"
            native-type="button"
            @click="openSettingsJson"
          >
            Edit in settings.json
          </Button>
        </div>
        <div class="content-header-copy">
          <h1>{{ currentNavItem?.label }}</h1>
          <p class="content-hint">
            {{ currentNavItem?.hint }}
          </p>
        </div>
        <span
          class="save-state"
          :class="{ active: hasUnsavedChanges }"
        >
          {{ hasUnsavedChanges ? 'Saving changes...' : 'Changes save automatically' }}
        </span>
      </header>

      <div class="content-body">
        <div
          class="content-inner"
          :class="{ 'content-inner-wide': activeTab === 'providers' || activeTab === 'prompts' }"
        >
          <template v-if="localSettings">
            <GeneralSettingsTab
              v-if="activeTab === 'general'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <EditorSettingsTab
              v-else-if="activeTab === 'editor'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <AIProviderTab
              v-else-if="activeTab === 'providers'"
              :settings="localSettings"
              :providers="allProviders"
              @update:settings="handleSettingsUpdate"
              @add-custom-provider="showCustomProviderDialog = true"
              @edit-custom-provider="editCustomProvider"
            />

            <ToolsSettingsTab
              v-else-if="activeTab === 'tools'"
              :settings="localSettings"
              :tools="tools"
              @update:settings="handleSettingsUpdate"
            />

            <NetworkSettingsTab
              v-else-if="activeTab === 'network'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <VoiceSettingsTab
              v-else-if="activeTab === 'voice'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <ChannelsSettingsTab
              v-else-if="activeTab === 'channels'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <MemorySettingsTab
              v-else-if="activeTab === 'memory'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <ShortcutsSettingsTab
              v-else-if="activeTab === 'shortcuts'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
            />

            <MCPSettingsPanel
              v-else-if="activeTab === 'mcp'"
              :settings="localSettings.mcp || { enabled: true, servers: [] }"
              @update:settings="handleMCPSettingsUpdate"
            />

            <SkillsSettingsPanel
              v-else-if="activeTab === 'skills'"
              :settings="localSettings.skills || { enableSkills: true, skills: {} }"
              @update:settings="handleSkillsSettingsUpdate"
            />

            <PromptsSettingsPanel
              v-else-if="activeTab === 'prompts'"
            />

            <PluginsSettingsTab
              v-else-if="activeTab === 'plugins'"
              @plugins-changed="loadTools"
            />
          </template>
          <div
            v-else
            class="loading-content"
          >
            Loading...
          </div>
        </div>
      </div>
    </Container>

    <!-- Custom Provider Dialog -->
    <CustomProviderDialog
      :visible="showCustomProviderDialog"
      :is-editing="!!editingProvider"
      :initial-data="editingProvider || undefined"
      @close="closeCustomProviderDialog"
      @save="saveCustomProvider"
    />

    <!-- Unsaved Changes Dialog -->
    <UnsavedChangesDialog
      :visible="showUnsavedDialog"
      @discard="handleDiscardChanges"
      @save="handleSaveAndClose"
      @cancel="showUnsavedDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Container from '@/components/common/Container.vue'
import AppMenu from '@/components/common/Menu.vue'
import MenuItem from '@/components/common/MenuItem.vue'
import SubMenu from '@/components/common/SubMenu.vue'
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  Boxes,
  Brain,
  Code2,
  MessageCircle,
  Globe2,
  Keyboard,
  Mic,
  NotebookPen,
  Plug,
  Search,
  Server,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { matchShortcut } from '@/composables/useShortcuts'
import type { AppSettings, ProviderInfo, CustomProviderConfig, ToolDefinition } from '@/types'

// Tab Components
import GeneralSettingsTab from './settings/GeneralSettingsTab.vue'
import EditorSettingsTab from './settings/EditorSettingsTab.vue'
import { AIProviderTab } from './settings/provider'
import ToolsSettingsTab from './settings/ToolsSettingsTab.vue'
import NetworkSettingsTab from './settings/NetworkSettingsTab.vue'
import VoiceSettingsTab from './settings/VoiceSettingsTab.vue'
import ChannelsSettingsTab from './settings/ChannelsSettingsTab.vue'
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.vue'
import { MCPSettingsPanel } from './settings/mcp'
import SkillsSettingsPanel from './settings/SkillsSettingsPanel.vue'
import PluginsSettingsTab from './settings/PluginsSettingsTab.vue'
import PromptsSettingsPanel from './settings/PromptsSettingsPanel.vue'
import MemorySettingsTab from './settings/MemorySettingsTab.vue'

// Dialogs
import CustomProviderDialog, { type CustomProviderForm } from './settings/CustomProviderDialog.vue'
import UnsavedChangesDialog from './settings/UnsavedChangesDialog.vue'

const settingsStore = useSettingsStore()

// State
const isLoading = ref(true)
const activeTab = ref('general')
const expandedNavItems = ref<Set<string>>(new Set())
const localSettings = ref<AppSettings | null>(null)
const originalSettings = ref<string>('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const showCustomProviderDialog = ref(false)
const editingProvider = ref<CustomProviderConfig | null>(null)
const showUnsavedDialog = ref(false)
const tools = ref<ToolDefinition[]>([])
const isInitialLoad = ref(true) // Prevent auto-save during initial load

const navItems = [
  {
    id: 'general',
    label: 'General',
    hint: 'Appearance, themes, and typography',
    icon: Settings,
    sections: ['Mode', 'Theme', 'Typography', 'Fonts', 'Context Compact', 'Daily Notes', 'Todo / Plan'],
  },
  {
    id: 'editor',
    label: 'Editor',
    hint: 'Tabs and file preview limits',
    icon: Code2,
    sections: ['Tabs', 'Text Editor', 'File Preview'],
  },
  {
    id: 'providers',
    label: 'Providers',
    hint: 'Models, API keys, and defaults',
    icon: Boxes,
    sections: ['Providers', 'API Configuration', 'Models', 'Temperature', 'Max Output'],
  },
  {
    id: 'tools',
    label: 'Tools',
    hint: 'Built-in capabilities and search keys',
    icon: Wrench,
    sections: ['Tool Settings', 'Tool Call Model', 'Available Tools', 'Web Search', 'Bash'],
  },
  {
    id: 'network',
    label: 'Network',
    hint: 'Proxy routing',
    icon: Globe2,
    sections: ['Network Proxy'],
  },
  {
    id: 'voice',
    label: 'Voice',
    hint: 'Mic input, transcription, and speech playback',
    icon: Mic,
    sections: ['Voice Input', 'Advanced Recording', 'Speech Providers'],
  },
  {
    id: 'channels',
    label: 'Channels',
    hint: 'IM gateways and login state',
    icon: MessageCircle,
    sections: ['Channels', 'Runtime', 'WeChat login', 'Sessions'],
  },
  {
    id: 'memory',
    label: 'Memory',
    hint: 'Recall, capture, profile, and index settings',
    icon: Brain,
    sections: ['Basics', 'Recall', 'Capture', 'Profile', 'Search Index', 'Embeddings', 'Daily Notes Context', 'Compact Flush', 'Diagnostics', 'Scheduled Memory'],
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    hint: 'Keyboard bindings',
    icon: Keyboard,
    sections: ['Keyboard Shortcuts'],
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    hint: 'External context servers',
    icon: Server,
    sections: ['Servers', 'Configuration'],
  },
  {
    id: 'skills',
    label: 'Skills',
    hint: 'Reusable agent workflows',
    icon: Sparkles,
    sections: ['Skills'],
  },
  {
    id: 'prompts',
    label: 'Prompts',
    hint: 'Reusable prompt snippets',
    icon: NotebookPen,
    sections: ['Prompts'],
  },
  {
    id: 'plugins',
    label: 'Plugins',
    hint: 'Installed extensions',
    icon: Plug,
    sections: ['Plugins'],
  },
]

const currentNavItem = computed(() => navItems.find(item => item.id === activeTab.value))
const searchQuery = ref('')
const filteredNavItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return navItems

  return navItems.filter(item =>
    `${item.label} ${item.hint} ${item.sections.join(' ')}`.toLowerCase().includes(query)
  )
})
const expandedNavMenuIndexes = computed(() => [...expandedNavItems.value])

function navSectionIndex(tabId: string, sectionLabel: string) {
  return `${tabId}::${sectionLabel}`
}

function parseNavMenuIndex(index: string) {
  const separatorIndex = index.indexOf('::')
  if (separatorIndex === -1) {
    return { tabId: index, sectionLabel: '' }
  }

  return {
    tabId: index.slice(0, separatorIndex),
    sectionLabel: index.slice(separatorIndex + 2),
  }
}

function isNavItemId(tabId: string) {
  return navItems.some(item => item.id === tabId)
}

// Providers list
const allProviders = computed<ProviderInfo[]>(() => {
  return settingsStore.availableProviders
})

// Check for unsaved changes
const hasUnsavedChanges = computed(() => {
  if (!localSettings.value) return false
  return JSON.stringify(localSettings.value) !== originalSettings.value
})

async function loadTools() {
  try {
    const toolsResponse = await window.electronAPI.getTools()
    if (toolsResponse.success && toolsResponse.tools) {
      tools.value = toolsResponse.tools
    }
  } catch (err) {
    console.error('Failed to load tools:', err)
  }
}

function refreshToolsWhenVisible() {
  if (activeTab.value !== 'tools') return
  void loadTools()
}

// Load settings
async function loadSettings() {
  try {
    await settingsStore.loadSettings()
    await settingsStore.loadProviders()

    localSettings.value = JSON.parse(JSON.stringify(settingsStore.settings))
    originalSettings.value = JSON.stringify(localSettings.value)

    loadTools()
  } catch (err) {
    console.error('Failed to load settings:', err)
  } finally {
    isLoading.value = false
    setTimeout(() => {
      isInitialLoad.value = false
    }, 100)
  }
}

// Handle settings update from child components
function handleSettingsUpdate(newSettings: AppSettings) {
  if (!newSettings) {
    console.warn('handleSettingsUpdate received null/undefined settings')
    return
  }
  localSettings.value = newSettings
}

// Handle MCP settings update
function handleMCPSettingsUpdate(mcpSettings: any) {
  if (!localSettings.value) return
  localSettings.value = {
    ...localSettings.value,
    mcp: mcpSettings
  }
}

// Handle Skills settings update
function handleSkillsSettingsUpdate(skillsSettings: any) {
  if (!localSettings.value) return
  localSettings.value = {
    ...localSettings.value,
    skills: skillsSettings
  }
}

async function selectNavItem(tabId: string) {
  activeTab.value = tabId
  if (tabId === 'tools') {
    void loadTools()
  }
  await nextTick()
  document.querySelector('.content-body')?.scrollTo({ top: 0, behavior: 'smooth' })
}

function setNavExpanded(tabId: string, expanded: boolean) {
  const next = new Set(expandedNavItems.value)
  if (expanded) {
    next.add(tabId)
  } else {
    next.delete(tabId)
  }
  expandedNavItems.value = next
}

function handleNavMenuSelect(index: string) {
  const { tabId, sectionLabel } = parseNavMenuIndex(index)
  if (!isNavItemId(tabId)) return

  if (sectionLabel) {
    void selectNavSection(tabId, sectionLabel)
    return
  }

  void selectNavItem(tabId)
}

function handleNavMenuOpen(index: string) {
  if (!isNavItemId(index)) return
  setNavExpanded(index, true)
  void selectNavItem(index)
}

function handleNavMenuClose(index: string) {
  if (!isNavItemId(index)) return
  setNavExpanded(index, false)
  void selectNavItem(index)
}

async function selectNavSection(tabId: string, sectionLabel: string) {
  activeTab.value = tabId
  if (tabId === 'tools') {
    void loadTools()
  }
  setNavExpanded(tabId, true)
  await nextTick()

  const contentBody = document.querySelector('.content-body')
  if (!contentBody) return

  const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()
  const headings = Array.from(contentBody.querySelectorAll('h2, h3'))
  const heading = headings.find(element => normalize(element.textContent).startsWith(sectionLabel))

  if (!heading) {
    contentBody.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  heading.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// Auto-save when settings change (with debounce)
let saveTimeout: number | null = null
watch(localSettings, (newSettings) => {
  if (!newSettings) return
  if (isInitialLoad.value) return

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = window.setTimeout(async () => {
    await settingsStore.saveSettings(newSettings)
    originalSettings.value = JSON.stringify(newSettings)
  }, 500)
}, { deep: true })

watch(activeTab, (tabId) => {
  if (tabId === 'tools') {
    void loadTools()
  }
})

// Custom provider management
function editCustomProvider(providerId: string) {
  const provider = localSettings.value?.ai.customProviders?.find(p => p.id === providerId)
  if (provider) {
    editingProvider.value = provider
    showCustomProviderDialog.value = true
  }
}

function closeCustomProviderDialog() {
  showCustomProviderDialog.value = false
  editingProvider.value = null
}

function saveCustomProvider(form: CustomProviderForm) {
  if (!localSettings.value) return

  const provider: CustomProviderConfig = {
    id: editingProvider.value?.id || `custom-${Date.now()}`,
    name: form.name,
    description: form.description,
    apiType: form.apiType,
    baseUrl: form.baseUrl,
    apiKey: form.apiKey,
    model: form.model,
    selectedModels: editingProvider.value?.selectedModels
      ?? (form.model ? [form.model] : []),
    enabled: editingProvider.value?.enabled ?? true,
  }

  const providers = [...(localSettings.value.ai.customProviders ?? [])]
  const existingIndex = providers.findIndex(p => p.id === provider.id)

  if (existingIndex >= 0) {
    providers[existingIndex] = provider
  } else {
    providers.push(provider)
  }

  // Also write a matching entry into `ai.providers[id]` — that map is what
  // the model picker (ModelSelectorPanel.filteredProviders) and the settings
  // ProviderModels read for `selectedModels`/`enabled`. Skipping it would
  // leave the picker filtering the new provider out (modelCount === 0) and
  // the Models section blank, even after a restart.
  const existingConfig = localSettings.value.ai.providers?.[provider.id]
  const nextProviders = {
    ...(localSettings.value.ai.providers ?? {}),
    [provider.id]: {
      ...(existingConfig ?? {}),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model: provider.model,
      selectedModels:
        existingConfig?.selectedModels && existingConfig.selectedModels.length > 0
          ? existingConfig.selectedModels
          : provider.selectedModels,
      enabled: existingConfig?.enabled ?? provider.enabled ?? true,
    },
  }

  localSettings.value = {
    ...localSettings.value,
    ai: {
      ...localSettings.value.ai,
      customProviders: providers,
      providers: nextProviders,
    }
  }

  closeCustomProviderDialog()
}

// Unsaved changes handling
function handleDiscardChanges() {
  showUnsavedDialog.value = false
  window.close()
}

async function handleSaveAndClose() {
  if (localSettings.value) {
    await settingsStore.saveSettings(localSettings.value)
  }
  showUnsavedDialog.value = false
  window.close()
}

// Handle window close
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (hasUnsavedChanges.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// Handle keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  const closeShortcut = localSettings.value?.general?.shortcuts?.closeChat
  const target = e.target as HTMLElement | null
  const isTypingTarget = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.isContentEditable

  if (e.key === '/' && !isTypingTarget && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    searchInputRef.value?.focus()
    return
  }

  if (e.key === 'Escape' || matchShortcut(e, closeShortcut)) {
    e.preventDefault()
    window.close()
  }
}

async function openSettingsJson() {
  try {
    const dataPath = await window.electronAPI.getDataPath()
    const normalizedPath = dataPath.endsWith('/') ? dataPath.slice(0, -1) : dataPath
    const result = await window.electronAPI.openPath(`${normalizedPath}/settings.json`)
    if (result) {
      console.warn('Failed to open settings.json:', result)
    }
  } catch (error) {
    console.error('Failed to open settings.json:', error)
  }
}

onMounted(async () => {
  await loadSettings()
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('focus', refreshToolsWhenVisible)
  document.addEventListener('visibilitychange', refreshToolsWhenVisible)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('focus', refreshToolsWhenVisible)
  document.removeEventListener('visibilitychange', refreshToolsWhenVisible)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.settings-page {
  --settings-paper: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel, var(--bg-elevated))));
  --settings-paper-2: var(--ui-sidebar-surface-bg, var(--ui-surface-sidebar-bg, var(--bg-sidebar, var(--panel-2))));
  --settings-paper-3: var(--ui-surface-panel-bg, var(--bg-panel, var(--ui-surface-elevated-bg, var(--bg-elevated))));
  --settings-rule: var(--ui-border-default-border, var(--border-default, var(--border)));
  --settings-rule-soft: var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  --settings-ink: var(--ui-text-primary-fg, var(--text-primary, var(--text)));
  --settings-ink-2: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  --settings-ink-3: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  --settings-ink-4: var(--ui-text-faint-fg, var(--text-faint, var(--muted)));
  --settings-ink-5: color-mix(in srgb, var(--ui-text-faint-fg, var(--text-faint, var(--muted))) 66%, transparent);
  --settings-accent: var(--ui-accent-primary-fg, var(--accent));
  --settings-accent-soft: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 16%, transparent);
  --settings-accent-tint: color-mix(in srgb, var(--settings-accent) 12%, var(--settings-paper));
  --settings-shadow: 0 30px 80px -34px rgba(0, 0, 0, 0.42), 0 10px 28px -18px rgba(0, 0, 0, 0.28);

  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--settings-paper-2);
  color: var(--settings-ink);
  overflow: hidden;
  user-select: none;
  position: relative;
}

.settings-window {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--settings-paper);
  box-shadow: none;
}

.settings-titlebar {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid var(--settings-rule);
  background: var(--settings-paper-2);
  position: relative;
  -webkit-app-region: drag;
}

.titlebar-title {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--settings-ink-3);
  font-size: 12.5px;
  font-weight: 500;
  pointer-events: none;
}

.settings-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 12px 12px;
  border-right: 1px solid var(--settings-rule);
  background: var(--settings-paper-2);
  -webkit-app-region: no-drag;
}

.settings-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 4px 12px;
  padding: 8px 10px;
  border: 1px solid var(--settings-rule);
  border-radius: 8px;
  background: var(--settings-paper);
  color: var(--settings-ink-3);
  -webkit-app-region: no-drag;
}

.search-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.settings-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--settings-ink);
  font: inherit;
  font-size: 13px;
}

.settings-search input::-webkit-search-cancel-button {
  display: none;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  overflow-y: auto;
}

.sidebar-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--settings-ink-3);
}

.sidebar-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.sidebar-label {
  color: inherit;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.15;
}

.sidebar-hint {
  overflow: hidden;
  color: var(--settings-ink-4);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--settings-paper);
}

.save-state {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.save-state {
  margin-left: auto;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px 60px;
}

.content-inner {
  width: min(100%, 900px);
  margin: 0 auto;
}

.content-inner-wide {
  width: min(100%, 900px);
}

.content-body::-webkit-scrollbar {
  width: 10px;
}

.content-body::-webkit-scrollbar-track {
  background: transparent;
}

.content-body::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 10px;
  background: color-mix(in srgb, var(--settings-ink) 16%, transparent);
  background-clip: padding-box;
}

.content-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--settings-ink) 28%, transparent);
  background-clip: padding-box;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--settings-ink-4);
  font-size: 13px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid color-mix(in srgb, var(--settings-ink-4) 24%, transparent);
  border-top-color: var(--settings-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

:deep(.tab-content) {
  animation: settingsFade 160ms ease;
}

:deep(.settings-section),
:deep(.detail-section) {
  margin-bottom: 30px;
}

:deep(.section-title),
:deep(.section-label) {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  color: var(--settings-ink-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:deep(.section-title::after),
:deep(.section-label::after) {
  content: '';
  height: 1px;
  flex: 1;
  background: var(--settings-rule-soft);
}

:deep(.section-desc),
:deep(.form-hint) {
  color: var(--settings-ink-4);
}

:deep(.settings-card),
:deep(.settings-group) {
  border: 1px solid var(--settings-rule-soft);
  border-radius: 10px;
  background: color-mix(in srgb, var(--settings-paper-2) 44%, transparent);
  overflow: hidden;
}

:deep(.provider-tab-wrapper),
:deep(.provider-tab),
:deep(.provider-detail),
:deep(.detail-section),
:deep(.settings-group) {
  min-width: 0;
}

:deep(.content-inner-wide .provider-tab-wrapper) {
  width: min(1120px, 100%);
  max-width: 100%;
}

:deep(.provider-tab) {
  overflow: hidden;
}

:deep(.provider-list) {
  padding-left: 0;
}

:deep(.provider-detail) {
  overflow: hidden;
}

:deep(.provider-detail .row-input),
:deep(.provider-detail .row-select),
:deep(.default-model-section .row-select) {
  max-width: min(100%, 520px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.model-row) {
  min-width: 0;
}

:deep(.model-primary),
:deep(.model-secondary) {
  min-width: 0;
}

:deep(.model-capabilities) {
  min-width: 0;
  overflow: hidden;
}

:deep(.model-out-wrap) {
  max-width: none;
}

:deep(.card-row),
:deep(.settings-row),
:deep(.shortcut-row) {
  border-bottom-color: var(--settings-rule-soft);
}

:deep(.form-label),
:deep(.row-label),
:deep(.shortcut-name) {
  color: var(--settings-ink-2);
}

:deep(.form-slider),
:deep(.row-input),
:deep(.form-input),
:deep(.form-textarea),
:deep(.form-select),
:deep(.row-select) {
  border-color: var(--settings-rule);
  background-color: var(--settings-paper);
  color: var(--settings-ink);
}

:deep(.form-slider::-webkit-slider-thumb) {
  background: var(--settings-accent);
}

:deep(.theme-card.active),
:deep(.theme-item.active),
:deep(.font-option.active) {
  border-color: var(--settings-accent);
  box-shadow: 0 0 0 3px var(--settings-accent-soft);
}

:deep(button:focus-visible),
:deep(input:focus-visible),
:deep(select:focus-visible),
:deep(textarea:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--settings-ink) 24%, transparent);
  outline-offset: 2px;
}

@keyframes settingsFade {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

.settings-page {
  --settings-paper: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel, var(--bg-elevated))));
  --settings-paper-2: var(--ui-sidebar-surface-bg, var(--ui-surface-sidebar-bg, var(--bg-sidebar, var(--panel-2))));
  --settings-paper-3: var(--ui-surface-panel-bg, var(--bg-panel, var(--ui-surface-elevated-bg, var(--bg-elevated))));
  --settings-rule: var(--ui-border-default-border, var(--border-default, var(--border)));
  --settings-rule-soft: var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  --settings-ink: var(--ui-text-primary-fg, var(--text-primary, var(--text)));
  --settings-ink-2: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  --settings-ink-3: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  --settings-ink-4: var(--ui-text-faint-fg, var(--text-faint, var(--muted)));
  --settings-accent: var(--ui-accent-primary-fg, var(--accent));
  --settings-accent-soft: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 14%, transparent);
  background: var(--settings-paper);
}

.settings-titlebar {
  height: 34px;
  padding: 0 12px;
  background: var(--settings-paper-2);
}

.titlebar-title {
  color: var(--settings-ink-3);
  font-size: 12px;
  font-weight: 600;
}

.titlebar-save-state {
  margin-left: auto;
  color: var(--settings-ink-4);
  font-size: 11px;
  font-weight: 500;
}

.titlebar-save-state.active {
  color: var(--settings-accent);
}

.settings-sidebar {
  width: 238px;
  padding: 14px 10px 12px;
  background: var(--settings-paper-2);
}

.sidebar-heading {
  padding: 2px 8px 12px;
}

.sidebar-heading h2 {
  margin: 0;
  color: var(--settings-ink);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.2;
}

.sidebar-heading p {
  margin: 3px 0 0;
  color: var(--settings-ink-4);
  font-size: 12px;
  line-height: 1.3;
}

.settings-search {
  height: 30px;
  box-sizing: border-box;
  margin: 0 4px 12px;
  padding: 0 9px;
  border-color: var(--settings-rule-soft);
  background: color-mix(in srgb, var(--settings-paper) 74%, transparent);
}

.sidebar-nav {
  gap: 2px;
}

.sidebar-icon {
  width: 15px;
  height: 15px;
}

.sidebar-label {
  font-size: 13px;
  font-weight: 600;
}

.sidebar-hint {
  display: none;
}

.sidebar-empty {
  padding: 12px 9px;
  color: var(--settings-ink-4);
  font-size: 12px;
}

.settings-content {
  background: var(--settings-paper);
}

.content-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 32px 16px;
  border-bottom: 1px solid var(--settings-rule-soft);
  background: color-mix(in srgb, var(--settings-paper) 92%, var(--settings-paper-2));
}

.content-header-copy {
  min-width: 0;
}

.content-header h1 {
  margin: 0;
  color: var(--settings-ink);
  font-size: 21px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.18;
}

.content-header p {
  margin: 5px 0 0;
  color: var(--settings-ink-4);
  font-size: 13px;
  line-height: 1.45;
}

.save-state {
  flex-shrink: 0;
  margin-top: 18px;
  padding: 4px 8px;
  border: 1px solid var(--settings-rule-soft);
  border-radius: 999px;
  background: var(--settings-paper-3);
  color: var(--settings-ink-4);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  font-family: inherit;
}

.save-state.active {
  border-color: color-mix(in srgb, var(--settings-accent) 28%, var(--settings-rule));
  color: var(--settings-accent);
}

.content-body {
  padding: 24px 32px 44px;
}

.content-inner {
  width: min(100%, 920px);
}

.content-inner-wide {
  width: min(100%, 1120px);
}

:deep(.settings-section),
:deep(.detail-section) {
  margin-bottom: 24px;
}

:deep(.settings-card),
:deep(.settings-group) {
  border-radius: 8px;
  background: var(--settings-paper-3);
}

:deep(.card-row),
:deep(.settings-row),
:deep(.shortcut-row) {
  padding: 12px 14px;
}

:deep(.form-input),
:deep(.form-textarea),
:deep(.form-select),
:deep(.row-input),
:deep(.row-select) {
  min-height: 32px;
  border-radius: 7px;
  font-size: 13px;
}

:deep(.primary-action),
:deep(.secondary-btn),
:deep(.test-btn),
:deep(.save-action),
:deep(.prompt-primary-btn),
:deep(.prompt-secondary-btn),
:deep(.prompt-danger-btn) {
  min-height: 30px;
  border-radius: 7px;
  font-size: 12px;
}

@media (max-width: 860px) {
  .settings-page {
    padding: 0;
  }

  .settings-window {
    height: 100%;
    min-height: 0;
    border-radius: 0;
  }

  .settings-sidebar {
    width: 210px;
  }

  .sidebar-hint {
    display: none;
  }

  .content-header {
    flex-direction: column;
    gap: 10px;
    padding: 16px 22px 14px;
  }

  .save-state {
    margin-top: 0;
  }

  .content-body {
    padding: 24px 22px 44px;
  }

  .content-inner-wide,
  .content-inner {
    width: 100%;
  }
}

/* IDE-style settings page refresh, inspired by compact desktop preferences. */
.settings-page {
  --settings-paper: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel, var(--bg-elevated))));
  --settings-paper-2: var(--ui-sidebar-surface-bg, var(--ui-surface-sidebar-bg, var(--bg-sidebar, var(--panel-2))));
  --settings-paper-3: var(--ui-surface-panel-bg, var(--bg-panel, var(--ui-surface-elevated-bg, var(--bg-elevated))));
  --settings-rule: color-mix(in srgb, var(--ui-border-default-border, var(--border-default, var(--border))) 82%, transparent);
  --settings-rule-soft: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 66%, transparent);
  --settings-ink: var(--ui-text-primary-fg, var(--text-primary, var(--text)));
  --settings-ink-2: color-mix(in srgb, var(--ui-text-primary-fg, var(--text-primary, var(--text))) 90%, var(--ui-text-secondary-fg, var(--text-secondary, var(--muted))));
  --settings-ink-3: var(--ui-text-secondary-fg, var(--text-secondary, var(--muted)));
  --settings-ink-4: var(--ui-text-muted-fg, var(--text-muted, var(--muted)));
  --settings-ink-5: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 72%, transparent);
  --settings-accent-soft: color-mix(in srgb, var(--settings-accent) 16%, transparent);

  background: var(--settings-paper);
}

.settings-titlebar {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.settings-window {
  --layout-container-sidebar-width: 214px;

  background: var(--settings-paper);
}

.settings-window :deep(.settings-titlebar) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  -webkit-app-region: drag;
}

.settings-window :deep(.settings-layout) {
  height: 100vh;
  min-height: 0;
}

.settings-window :deep(.settings-sidebar) {
  width: 214px;
  padding: 0 10px 14px;
  border-right: 1px solid var(--settings-rule);
  background: var(--settings-paper-2);
  -webkit-app-region: drag;
}

.settings-sidebar-inner {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.settings-traffic-lights-space {
  flex: 0 0 38px;
  -webkit-app-region: drag;
}

.sidebar-heading {
  display: none;
}

.settings-search,
.sidebar-nav {
  -webkit-app-region: no-drag;
}

.settings-search {
  height: 31px;
  margin: 0 0 16px;
  padding: 0 9px;
  border-color: var(--settings-rule);
  border-radius: 5px;
  background: color-mix(in srgb, var(--settings-paper) 56%, transparent);
  color: var(--settings-ink-4);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--settings-ink) 2%, transparent);
}

.settings-search input {
  height: 100%;
  font-size: 13.5px;
  line-height: 1;
}

.settings-search:focus-within {
  border-color: color-mix(in srgb, var(--settings-ink) 24%, var(--settings-rule));
  background: color-mix(in srgb, var(--settings-paper) 72%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--settings-ink) 8%, transparent);
}

.settings-search input:focus,
.settings-search input:focus-visible {
  outline: none;
  box-shadow: none;
}

.search-icon {
  width: 15px;
  height: 15px;
}

.sidebar-nav {
  --app-menu-bg: transparent;
  --app-menu-border: transparent;
  --app-menu-width: 100%;
  --app-menu-padding: 0;
  --app-menu-item-height: 30px;
  --app-menu-item-radius: 4px;
  --app-menu-item-gap: 8px;
  --app-menu-indent-step: 0px;
  --app-menu-item-fg: var(--settings-ink-4);
  --app-menu-item-hover-bg: color-mix(in srgb, var(--settings-paper) 46%, transparent);
  --app-menu-item-hover-fg: var(--settings-ink-2);
  --app-menu-active-bg: color-mix(in srgb, var(--settings-paper) 72%, var(--settings-accent-soft));
  --app-menu-active-fg: var(--settings-ink);

  gap: 0;
  width: 100%;
  padding-right: 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.sidebar-entry {
  display: flex;
  flex-direction: column;
}

.sidebar-entry :deep(.app-sub-menu-title) {
  gap: 8px;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: 4px;
  color: var(--settings-ink-4);
  font: inherit;
  font-size: 14px;
  outline: none;
  text-align: left;
  transition: background 120ms ease, color 120ms ease;
}

.sidebar-entry :deep(.app-sub-menu-title:hover) {
  background: color-mix(in srgb, var(--settings-paper) 46%, transparent);
  color: var(--settings-ink-2);
}

.sidebar-entry :deep(.app-sub-menu-title:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--settings-ink) 24%, transparent);
  outline-offset: 2px;
  box-shadow: none;
}

.sidebar-entry.is-active :deep(.app-sub-menu-title) {
  border-color: transparent;
  background: color-mix(in srgb, var(--settings-paper) 72%, var(--settings-accent-soft));
  color: var(--settings-ink);
  box-shadow: none;
}

.sidebar-entry :deep(.app-sub-menu-chevron) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: currentColor;
  opacity: 1;
}

.sidebar-entry :deep(.app-sub-menu-icon) {
  width: 16px;
  height: 16px;
  color: currentColor;
}

.sidebar-entry :deep(.app-sub-menu-label) {
  display: flex;
  min-width: 0;
  flex: 1;
  text-align: left;
}

.sidebar-icon {
  display: block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: currentColor;
}

.sidebar-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.sidebar-label {
  font-size: 14px;
  font-weight: 560;
  line-height: 1.25;
}

.sidebar-hint {
  display: none;
}

.sidebar-entry :deep(.app-sub-menu-panel) {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 2px 0 6px 14px;
  padding: 1px 0 1px 14px;
}

.sidebar-entry :deep(.app-sub-menu-panel::before) {
  content: '';
  position: absolute;
  left: 5px;
  top: 1px;
  bottom: 1px;
  width: 1px;
  background: var(--settings-rule-soft);
}

.sidebar-subitem {
  width: 100%;
}

.sidebar-subitem :deep(.app-menu-item) {
  min-height: 25px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--settings-ink-4);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  line-height: 1.2;
  text-align: left;
}

.sidebar-subitem :deep(.app-menu-item:hover),
.sidebar-subitem :deep(.app-menu-item:focus-visible) {
  background: color-mix(in srgb, var(--settings-paper) 42%, transparent);
  color: var(--settings-ink-2);
  box-shadow: none;
}

.sidebar-subitem :deep(.app-menu-item-label) {
  min-width: 0;
  text-align: left;
}

.sidebar-empty {
  padding: 10px 8px;
  color: var(--settings-ink-4);
  font-size: 12.5px;
}

.settings-window :deep(.settings-content) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--settings-paper);
}

.content-header {
  display: block;
  position: relative;
  padding: 23px 30px 14px;
  border-bottom: 0;
  background: var(--settings-paper);
  -webkit-app-region: drag;
}

.content-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 26px;
}

.settings-scope {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--settings-ink);
}

.scope-badge {
  display: inline-flex;
  align-items: center;
  min-height: 23px;
  padding: 0 8px;
  border-radius: 5px;
  background: var(--settings-accent-soft);
  color: var(--settings-accent);
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
}

.scope-name {
  overflow: hidden;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.json-settings-button {
  min-height: 31px;
  flex-shrink: 0;
  padding: 0 10px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background: color-mix(in srgb, var(--settings-paper-3) 84%, transparent);
  color: var(--settings-ink-2);
  font: inherit;
  font-size: 14px;
  font-weight: 560;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.json-settings-button:hover {
  border-color: color-mix(in srgb, var(--settings-accent) 42%, var(--settings-rule));
  background: color-mix(in srgb, var(--settings-paper-3) 92%, var(--settings-accent-soft));
  color: var(--settings-ink);
}

.content-header-copy {
  min-width: 0;
}

.content-header h1 {
  margin: 0;
  color: var(--settings-ink);
  font-size: 22px;
  font-weight: 620;
  letter-spacing: 0;
  line-height: 1.2;
}

.content-hint {
  display: none;
}

.save-state {
  display: none;
  position: absolute;
  right: 30px;
  bottom: 16px;
  margin: 0;
  border-radius: 5px;
  background: transparent;
}

.save-state.active {
  display: inline-flex;
}

.content-body {
  padding: 0 30px 60px;
  background: var(--settings-paper);
}

.content-inner,
.content-inner-wide {
  width: 100%;
  max-width: 930px;
  margin: 0;
}

.content-inner-wide {
  max-width: 1120px;
}

:deep(.tab-content) {
  animation: settingsFade 140ms ease;
}

:deep(.settings-section),
:deep(.detail-section) {
  margin-bottom: 38px;
}

:deep(.settings-section-header) {
  align-items: center;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--settings-rule);
}

:deep(.settings-section-title),
:deep(.section-label),
:deep(.section-title) {
  margin: 0;
  color: var(--settings-ink-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.35;
  text-transform: none;
}

:deep(.section-label::after),
:deep(.section-title::after) {
  background: var(--settings-rule);
}

:deep(.settings-section-description) {
  display: none;
}

:deep(.settings-group),
:deep(.settings-card) {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

:deep(.settings-card.theme-cards) {
  display: grid;
  gap: 12px;
}

:deep(.theme-card) {
  border-color: var(--settings-rule);
  border-radius: 6px;
  background: color-mix(in srgb, var(--settings-paper-3) 82%, transparent);
}

:deep(.theme-card.active) {
  border-color: color-mix(in srgb, var(--settings-accent) 56%, var(--settings-rule));
  box-shadow: 0 0 0 2px var(--settings-accent-soft);
}

:deep(.setting-row),
:deep(.card-row),
:deep(.settings-row),
:deep(.shortcut-row) {
  min-height: 68px;
  padding: 17px 0;
  border-bottom: 1px solid var(--settings-rule-soft);
  background: transparent;
}

:deep(.setting-row:last-child),
:deep(.card-row:last-child),
:deep(.settings-row:last-child),
:deep(.shortcut-row:last-child) {
  border-bottom: 1px solid var(--settings-rule-soft);
}

:deep(.setting-row-title),
:deep(.toggle-title),
:deep(.row-label),
:deep(.shortcut-name),
:deep(.form-label),
:deep(.settings-field-label) {
  color: var(--settings-ink-2);
  font-size: 14.5px;
  font-weight: 560;
  letter-spacing: 0;
  line-height: 1.35;
}

:deep(.setting-row-description),
:deep(.toggle-desc),
:deep(.form-hint),
:deep(.settings-field-hint),
:deep(.shortcut-desc) {
  max-width: 620px;
  margin-top: 4px;
  color: var(--settings-ink-4);
  font-size: 12.5px;
  line-height: 1.45;
}

:deep(.setting-row-split) {
  gap: 5px;
}

:deep(.setting-row-control) {
  display: flex;
  align-items: center;
  width: 100%;
}

:deep(.setting-row-split > .setting-row-head > .setting-row-control),
:deep(.setting-row-no-copy > .setting-row-control) {
  justify-content: flex-end;
}

:deep(.setting-row-stack > .setting-row-control) {
  justify-content: flex-start;
}

:deep(.form-input),
:deep(.form-textarea),
:deep(.form-select),
:deep(.row-input),
:deep(.row-select) {
  min-height: 32px;
  border: 1px solid var(--settings-rule);
  border-radius: 5px;
  background-color: color-mix(in srgb, var(--settings-paper-3) 84%, transparent);
  color: var(--settings-ink);
  font-size: 13px;
}

:deep(.form-input:focus),
:deep(.form-textarea:focus),
:deep(.form-select:focus),
:deep(.row-input:focus),
:deep(.row-select:focus) {
  border-color: color-mix(in srgb, var(--settings-ink) 24%, var(--settings-rule));
  background-color: var(--settings-paper-3);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--settings-ink) 8%, transparent);
}

:deep(.segmented-control) {
  border-color: var(--settings-rule);
  border-radius: 5px;
  background: color-mix(in srgb, var(--settings-paper-3) 72%, transparent);
}

:deep(.segment-btn),
:deep(.secondary-btn),
:deep(.test-btn),
:deep(.save-action),
:deep(.primary-action),
:deep(.prompt-primary-btn),
:deep(.prompt-secondary-btn),
:deep(.prompt-danger-btn) {
  border-radius: 5px;
  font-size: 13px;
}

:deep(.secondary-btn),
:deep(.test-btn),
:deep(.prompt-secondary-btn) {
  border-color: var(--settings-rule);
  background: color-mix(in srgb, var(--settings-paper-3) 84%, transparent);
}

:deep(.form-slider) {
  height: 4px;
  background: var(--settings-rule);
}

:deep(.form-slider::-webkit-slider-thumb) {
  width: 15px;
  height: 15px;
}

:deep(.toggle-row input[type="checkbox"]),
:deep(.native-toggle input[type="checkbox"]) {
  position: relative;
  width: 34px;
  height: 20px;
  flex: 0 0 auto;
  margin: 0;
  border: 1px solid var(--settings-rule);
  border-radius: 999px;
  background: color-mix(in srgb, var(--settings-paper-3) 72%, transparent);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: background 140ms ease, border-color 140ms ease;
}

:deep(.toggle-row input[type="checkbox"]::before),
:deep(.native-toggle input[type="checkbox"]::before) {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--settings-ink-4);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
  transition: transform 140ms ease, background 140ms ease;
}

:deep(.toggle-row input[type="checkbox"]:checked),
:deep(.native-toggle input[type="checkbox"]:checked) {
  border-color: color-mix(in srgb, var(--settings-accent) 44%, var(--settings-rule));
  background: color-mix(in srgb, var(--settings-accent) 42%, var(--settings-paper-3));
}

:deep(.toggle-row input[type="checkbox"]:checked::before),
:deep(.native-toggle input[type="checkbox"]:checked::before) {
  transform: translateX(14px);
  background: color-mix(in srgb, white 86%, var(--settings-accent));
}

:deep(.toggle-row input[type="checkbox"]:disabled),
:deep(.native-toggle input[type="checkbox"]:disabled) {
  cursor: not-allowed;
  opacity: 0.55;
}

:deep(.provider-rows) {
  border: 0;
  border-radius: 0;
  background: transparent;
}

:deep(.provider-row) {
  min-height: 62px;
  padding: 14px 0;
  border-top-color: var(--settings-rule-soft);
}

:deep(.provider-row:hover),
:deep(.provider-row.active) {
  background: color-mix(in srgb, var(--settings-paper-3) 76%, transparent);
}

:deep(.provider-configure),
:deep(.provider-row-edit),
:deep(.provider-pill),
:deep(.provider-icon-tile) {
  border-radius: 5px;
}

:deep(.detail-title) {
  font-size: 20px;
  font-weight: 620;
}

:deep(.content-inner-wide .provider-tab-wrapper) {
  width: 100%;
}

.settings-page :deep(.form-input:focus),
.settings-page :deep(.form-input:focus-visible),
.settings-page :deep(.form-textarea:focus),
.settings-page :deep(.form-textarea:focus-visible),
.settings-page :deep(.form-select:focus),
.settings-page :deep(.form-select:focus-visible),
.settings-page :deep(.row-input:focus),
.settings-page :deep(.row-input:focus-visible),
.settings-page :deep(.row-select:focus),
.settings-page :deep(.row-select:focus-visible),
.settings-page :deep(.prompt-input:focus),
.settings-page :deep(.prompt-input:focus-visible),
.settings-page :deep(.prompt-textarea:focus),
.settings-page :deep(.prompt-textarea:focus-visible),
.settings-page :deep(.text-input:focus),
.settings-page :deep(.text-input:focus-visible),
.settings-page :deep(.shortcut-input:focus),
.settings-page :deep(.shortcut-input:focus-visible),
.settings-page :deep(.add-model-input:focus),
.settings-page :deep(.add-model-input:focus-visible),
.settings-page :deep(.model-caps-id-input:focus),
.settings-page :deep(.model-caps-id-input:focus-visible) {
  outline: none;
  border-color: color-mix(in srgb, var(--settings-ink) 24%, var(--settings-rule));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--settings-ink) 8%, transparent);
}

.settings-page :deep(.settings-search:focus-within),
.settings-page :deep(.prompt-search:focus-within),
.settings-page :deep(.model-search-field:focus-within),
.settings-page :deep(.app-input-number:focus-within),
.settings-page :deep(.model-out-wrap:focus-within) {
  border-color: color-mix(in srgb, var(--settings-ink) 24%, var(--settings-rule));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--settings-ink) 8%, transparent);
}

.settings-page :deep(.segment-btn:focus-visible),
.settings-page :deep(.tristate-btn:focus-visible),
.settings-page :deep(.model-check:focus-visible),
.settings-page :deep(.model-caps-edit:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--settings-ink) 24%, transparent);
  outline-offset: 2px;
}

@media (max-width: 860px) {
  .settings-window {
    --layout-container-sidebar-width: 204px;
  }

  .settings-window :deep(.settings-sidebar) {
    width: 204px;
    padding: 0 8px 12px;
  }

  .content-header {
    padding: 23px 24px 14px;
  }

  .content-topline {
    margin-bottom: 24px;
  }

  .content-body {
    padding: 0 24px 54px;
  }

  .scope-name {
    max-width: 190px;
  }
}

@media (max-width: 720px) {
  .json-settings-button {
    display: none;
  }
}
</style>
