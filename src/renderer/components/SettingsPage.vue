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

    <div
      v-else
      class="settings-window"
    >
      <header class="settings-titlebar">
        <div class="titlebar-title">
          <span class="titlebar-mark">o</span>
          <span>onething · Settings</span>
        </div>
      </header>

      <div class="settings-layout">
        <!-- Sidebar navigation -->
        <aside class="settings-sidebar">
          <div class="sidebar-identity">
            <div class="brand-mark">
              o
            </div>
            <div class="brand-copy">
              <div class="brand-name">
                onething
              </div>
              <div class="brand-subtitle">
                Settings
              </div>
            </div>
          </div>

          <label class="settings-search">
            <Search class="search-icon" />
            <input
              v-model="searchQuery"
              placeholder="Search settings"
              type="search"
            >
            <span
              v-if="!searchQuery"
              class="search-kbd"
            >/</span>
          </label>

          <div class="sidebar-group-label">
            Workspace
          </div>

          <nav class="sidebar-nav">
            <button
              v-for="(item, index) in filteredNavItems"
              :key="item.id"
              :class="['sidebar-item', { active: activeTab === item.id }]"
              @click="activeTab = item.id"
            >
              <span class="sidebar-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <component
                :is="item.icon"
                class="sidebar-icon"
              />
              <span class="sidebar-copy">
                <span class="sidebar-label">{{ item.label }}</span>
                <span class="sidebar-hint">{{ item.hint }}</span>
              </span>
            </button>
          </nav>
        </aside>

        <!-- Content Area -->
        <main class="settings-content">
          <div class="content-strip">
            <span class="breadcrumb">Settings / {{ currentNavItem?.label }}</span>
            <span
              v-if="hasUnsavedChanges"
              class="save-state"
            >Saving changes…</span>
            <span
              v-else
              class="save-state"
            >Changes save automatically</span>
          </div>

          <div class="content-body">
            <div
              class="content-inner"
              :class="{ 'content-inner-wide': activeTab === 'providers' }"
            >
              <header class="section-hero">
                <div class="section-eyebrow">
                  {{ currentSectionNumber }} ──
                </div>
                <div>
                  <h1>{{ currentNavItem?.label }}</h1>
                  <p>{{ currentNavItem?.hint }}</p>
                </div>
              </header>

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
        </main>
      </div>
    </div>
    <div class="settings-page-grain" />

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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  Boxes,
  Code2,
  Keyboard,
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
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.vue'
import { MCPSettingsPanel } from './settings/mcp'
import SkillsSettingsPanel from './settings/SkillsSettingsPanel.vue'
import PluginsSettingsTab from './settings/PluginsSettingsTab.vue'

// Dialogs
import CustomProviderDialog, { type CustomProviderForm } from './settings/CustomProviderDialog.vue'
import UnsavedChangesDialog from './settings/UnsavedChangesDialog.vue'

const settingsStore = useSettingsStore()

// State
const isLoading = ref(true)
const activeTab = ref('general')
const localSettings = ref<AppSettings | null>(null)
const originalSettings = ref<string>('')
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
  },
  {
    id: 'editor',
    label: 'Editor',
    hint: 'Tabs and file preview limits',
    icon: Code2,
  },
  {
    id: 'providers',
    label: 'Providers',
    hint: 'Models, API keys, and defaults',
    icon: Boxes,
  },
  {
    id: 'tools',
    label: 'Tools',
    hint: 'Built-in capabilities and search keys',
    icon: Wrench,
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    hint: 'Keyboard bindings',
    icon: Keyboard,
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    hint: 'External context servers',
    icon: Server,
  },
  {
    id: 'skills',
    label: 'Skills',
    hint: 'Reusable agent workflows',
    icon: Sparkles,
  },
  {
    id: 'plugins',
    label: 'Plugins',
    hint: 'Installed extensions',
    icon: Plug,
  },
]

const currentNavItem = computed(() => navItems.find(item => item.id === activeTab.value))
const currentSectionNumber = computed(() => {
  const index = navItems.findIndex(item => item.id === activeTab.value)
  return String(index + 1).padStart(2, '0')
})
const searchQuery = ref('')
const filteredNavItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return navItems

  return navItems.filter(item =>
    `${item.label} ${item.hint}`.toLowerCase().includes(query)
  )
})

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
  if (e.key === 'Escape' || matchShortcut(e, closeShortcut)) {
    e.preventDefault()
    window.close()
  }
}

onMounted(async () => {
  await loadSettings()
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.settings-page {
  --settings-paper: var(--bg-app, var(--bg));
  --settings-paper-2: var(--bg-sidebar, var(--panel-2));
  --settings-paper-3: var(--bg-elevated, var(--panel));
  --settings-rule: var(--border-default, var(--border));
  --settings-rule-soft: var(--border-subtle, var(--border));
  --settings-ink: var(--text-primary, var(--text));
  --settings-ink-2: var(--text-secondary, var(--text));
  --settings-ink-3: var(--text-muted, var(--muted));
  --settings-ink-4: var(--text-faint, var(--muted));
  --settings-ink-5: color-mix(in srgb, var(--text-faint, var(--muted)) 66%, transparent);
  --settings-accent: var(--accent);
  --settings-accent-soft: rgba(var(--accent-rgb), 0.16);
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

.settings-page-grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.08;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1 0 0 0 0 0.08 0 0 0 0 0.04 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  mix-blend-mode: multiply;
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

.titlebar-mark,
.brand-mark {
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
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

.sidebar-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 14px;
}

.brand-mark {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--settings-ink);
  color: var(--settings-paper);
  font-size: 19px;
  line-height: 1;
}

.brand-copy {
  min-width: 0;
}

.brand-name {
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.2;
}

.brand-subtitle {
  margin-top: 2px;
  color: var(--settings-ink-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.03em;
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

.search-kbd {
  min-width: 22px;
  padding: 2px 7px;
  border: 1px solid var(--settings-rule);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--settings-paper-2);
  color: var(--settings-ink-3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
}

.sidebar-group-label {
  padding: 6px 0 4px 8px;
  color: var(--settings-ink-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  overflow-y: auto;
}

.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  color: var(--settings-ink-3);
  cursor: pointer;
  text-align: left;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.sidebar-item:hover {
  background: color-mix(in srgb, var(--settings-paper) 72%, transparent);
  color: var(--settings-ink);
}

.sidebar-item.active {
  border-color: var(--settings-rule);
  background: var(--settings-paper);
  color: var(--settings-ink);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--settings-ink) 8%, transparent), 0 1px 2px rgba(0, 0, 0, 0.04);
}

.sidebar-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px;
  background: var(--settings-accent);
}

.sidebar-index {
  width: 18px;
  flex-shrink: 0;
  color: var(--settings-ink-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.04em;
}

.sidebar-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--settings-ink-3);
}

.sidebar-item.active .sidebar-icon {
  color: var(--settings-accent);
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

.content-strip {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  border-bottom: 1px solid var(--settings-rule-soft);
  color: var(--settings-ink-4);
}

.breadcrumb,
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

.section-hero {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 26px;
}

.section-eyebrow {
  flex-shrink: 0;
  color: var(--settings-ink-4);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.section-hero h1 {
  margin: 0;
  color: var(--settings-ink);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 30px;
  font-style: italic;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.05;
}

.section-hero p {
  max-width: 580px;
  margin: 8px 0 0;
  color: var(--settings-ink-3);
  font-size: 13.5px;
  line-height: 1.55;
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

:deep(.model-name) {
  min-width: 0;
}

:deep(.model-caps) {
  max-width: 76px;
  overflow: hidden;
}

:deep(.model-out-wrap) {
  max-width: 56px;
}

:deep(.model-out-input) {
  width: 34px;
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
  outline: 2px solid var(--settings-accent);
  outline-offset: 2px;
}

@keyframes settingsFade {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
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
    width: 220px;
  }

  .sidebar-hint,
  .sidebar-index {
    display: none;
  }

  .content-body {
    padding: 24px 22px 44px;
  }

  .section-hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
