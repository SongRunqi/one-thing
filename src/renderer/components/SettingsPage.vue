<template>
  <div class="settings-page">
    <!-- macOS-style titlebar drag region -->
    <div class="titlebar-drag-region" />

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
      class="settings-layout"
    >
      <!-- Sidebar navigation -->
      <aside class="settings-sidebar">
        <div class="sidebar-spacer" />
        <nav class="sidebar-nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            :class="['sidebar-item', { active: activeTab === item.id }]"
            @click="activeTab = item.id"
          >
            <component
              :is="item.icon"
              class="sidebar-icon"
            />
            <span class="sidebar-label">{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- Content Area -->
      <main class="settings-content">
        <div class="content-body">
          <template v-if="localSettings">
            <GeneralSettingsTab
              v-if="activeTab === 'general'"
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
          </template>
          <div
            v-else
            class="loading-content"
          >
            Loading...
          </div>
        </div>
      </main>
    </div>

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
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { matchShortcut } from '@/composables/useShortcuts'
import type { AppSettings, ProviderInfo, CustomProviderConfig, ToolDefinition } from '@/types'

// Tab Components
import GeneralSettingsTab from './settings/GeneralSettingsTab.vue'
import { AIProviderTab } from './settings/provider'
import ToolsSettingsTab from './settings/ToolsSettingsTab.vue'
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.vue'
import { MCPSettingsPanel } from './settings/mcp'
import SkillsSettingsPanel from './settings/SkillsSettingsPanel.vue'

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

// Navigation items with inline SVG icons
const navItems = [
  {
    id: 'general',
    label: 'General',
    icon: {
      render: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }),
      ])
    }
  },
  {
    id: 'providers',
    label: 'Providers',
    icon: {
      render: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }),
        h('polyline', { points: '3.27 6.96 12 12.01 20.73 6.96' }),
        h('line', { x1: 12, y1: 22.08, x2: 12, y2: 12 }),
      ])
    }
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: {
      render: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }),
      ])
    }
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: {
      render: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }),
        h('path', { d: 'M6 8h.01' }),
        h('path', { d: 'M10 8h.01' }),
        h('path', { d: 'M14 8h.01' }),
        h('path', { d: 'M18 8h.01' }),
        h('path', { d: 'M8 12h.01' }),
        h('path', { d: 'M12 12h.01' }),
        h('path', { d: 'M16 12h.01' }),
        h('path', { d: 'M7 16h10' }),
      ])
    }
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    icon: {
      render: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('rect', { x: 2, y: 2, width: 20, height: 8, rx: 2 }),
        h('rect', { x: 2, y: 14, width: 20, height: 8, rx: 2 }),
        h('circle', { cx: 6, cy: 6, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 6, cy: 18, r: 1, fill: 'currentColor' }),
      ])
    }
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: {
      render: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }),
      ])
    }
  },
]

const currentNavItem = computed(() => navItems.find(item => item.id === activeTab.value))

// Providers list
const allProviders = computed<ProviderInfo[]>(() => {
  return settingsStore.availableProviders
})

// Check for unsaved changes
const hasUnsavedChanges = computed(() => {
  if (!localSettings.value) return false
  return JSON.stringify(localSettings.value) !== originalSettings.value
})

// Load settings
async function loadSettings() {
  try {
    // Load settings, providers and tools in parallel
    const [, , toolsResponse] = await Promise.all([
      settingsStore.loadSettings(),
      settingsStore.loadProviders(),
      window.electronAPI.getTools()
    ])

    localSettings.value = JSON.parse(JSON.stringify(settingsStore.settings))
    originalSettings.value = JSON.stringify(localSettings.value)

    // Load tools
    if (toolsResponse.success && toolsResponse.tools) {
      tools.value = toolsResponse.tools
    }
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
    selectedModels: editingProvider.value?.selectedModels || [form.model],
    enabled: editingProvider.value?.enabled ?? true,
  }

  const providers = [...(localSettings.value.ai.customProviders ?? [])]
  const existingIndex = providers.findIndex(p => p.id === provider.id)

  if (existingIndex >= 0) {
    providers[existingIndex] = provider
  } else {
    providers.push(provider)
  }

  localSettings.value = {
    ...localSettings.value,
    ai: {
      ...localSettings.value.ai,
      customProviders: providers
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
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  user-select: none;
}

/* Titlebar drag region */
.titlebar-drag-region {
  height: 38px;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  -webkit-app-region: drag;
  z-index: 10;
}

.settings-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ── Sidebar ── */
.settings-sidebar {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  -webkit-app-region: drag;
}

.sidebar-spacer {
  height: 38px;
  flex-shrink: 0;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
  -webkit-app-region: no-drag;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--text-secondary, var(--muted));
  cursor: pointer;
  font-size: 13px;
  font-weight: 400;
  text-align: left;
  transition: background 0.1s ease, color 0.1s ease;
}

.sidebar-item:hover {
  background: rgba(128, 128, 128, 0.08);
  color: var(--text);
}

.sidebar-item.active {
  background: var(--accent);
  color: white;
}

.sidebar-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

.sidebar-item.active .sidebar-icon {
  opacity: 1;
}

.sidebar-label {
  line-height: 1;
}

/* ── Content ── */
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 38px 16px 16px;
}

/* Scrollbar */
.content-body::-webkit-scrollbar {
  width: 6px;
}

.content-body::-webkit-scrollbar-track {
  background: transparent;
}

.content-body::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}

.content-body:hover::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
}

.content-body::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.5);
}

/* ── Loading ── */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  font-size: 13px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(128, 128, 128, 0.2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
