<template>
  <div class="settings-page">
    <!-- macOS-style titlebar drag region -->
    <div class="titlebar-drag-region"></div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading settings...</span>
    </div>

    <div v-else class="settings-layout">
      <!-- Left Sidebar -->
      <nav class="settings-nav">
        <div class="nav-section">
          <button
            v-for="item in navItems"
            :key="item.id"
            :class="['nav-item', { active: activeTab === item.id }]"
            @click="activeTab = item.id"
          >
            <component :is="item.icon" class="nav-icon" />
            <span class="nav-label">{{ item.label }}</span>
          </button>
        </div>
      </nav>

      <!-- Right Content Area -->
      <main class="settings-content">
        <header class="content-header">
          <h1 class="content-title">{{ currentNavItem?.label }}</h1>
        </header>

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

            <ChatSettingsTab
              v-else-if="activeTab === 'chat'"
              :settings="localSettings"
              @update:settings="handleSettingsUpdate"
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

            <EmbeddingSettingsPanel
              v-else-if="activeTab === 'embedding'"
              :settings="localSettings.embedding || { provider: 'openai' }"
              @update:settings="handleEmbeddingSettingsUpdate"
            />
          </template>
          <div v-else class="loading-content">
            Loading...
          </div>
        </div>
      </main>
    </div>

    <!-- Custom Provider Dialog -->
    <CustomProviderDialog
      v-if="showCustomProviderDialog"
      :provider="editingProvider"
      @close="closeCustomProviderDialog"
      @save="saveCustomProvider"
    />

    <!-- Unsaved Changes Dialog -->
    <UnsavedChangesDialog
      v-if="showUnsavedDialog"
      @discard="handleDiscardChanges"
      @save="handleSaveAndClose"
      @cancel="showUnsavedDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, h } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { AppSettings, ProviderInfo, CustomProviderConfig, ToolDefinition } from '@/types'

// Tab Components
import GeneralSettingsTab from './settings/GeneralSettingsTab.vue'
import AIProviderTab from './settings/AIProviderTab.vue'
import ChatSettingsTab from './settings/ChatSettingsTab.vue'
import ToolsSettingsTab from './settings/ToolsSettingsTab.vue'
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.vue'
import MCPSettingsPanel from './settings/MCPSettingsPanel.vue'
import SkillsSettingsPanel from './settings/SkillsSettingsPanel.vue'
import EmbeddingSettingsPanel from './settings/EmbeddingSettingsPanel.vue'

// Dialogs
import CustomProviderDialog from './settings/CustomProviderDialog.vue'
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

// Navigation items with inline SVG icons
const navItems = [
  {
    id: 'general',
    label: 'General',
    icon: {
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }),
      ])
    }
  },
  {
    id: 'providers',
    label: 'AI Providers',
    icon: {
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }),
        h('path', { d: 'M2 17l10 5 10-5' }),
        h('path', { d: 'M2 12l10 5 10-5' }),
      ])
    }
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: {
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('path', { d: 'M12 20h9' }),
        h('path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }),
      ])
    }
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: {
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }),
      ])
    }
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: {
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
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
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
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
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }),
      ])
    }
  },
  {
    id: 'embedding',
    label: 'Memory',
    icon: {
      render: () => h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, [
        h('path', { d: 'M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V11a1 1 0 0 1 2 0v1.5c1.2.6 2 1.9 2 3.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4c0-1.6.8-2.9 2-3.5V11a1 1 0 0 1 2 0v-1.6c-1.2-.6-2-1.9-2-3.4a4 4 0 0 1 4-4z' }),
        h('circle', { cx: 12, cy: 6, r: 1.5, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 16, r: 1.5, fill: 'currentColor' }),
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

    // Apply theme
    const theme = localSettings.value?.theme || 'dark'
    document.documentElement.dataset.theme = theme

    // Apply color theme
    const colorTheme = localSettings.value?.general?.colorTheme || 'blue'
    document.documentElement.dataset.colorTheme = colorTheme
  } catch (err) {
    console.error('Failed to load settings:', err)
  } finally {
    isLoading.value = false
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

// Handle Embedding settings update
function handleEmbeddingSettingsUpdate(embeddingSettings: any) {
  if (!localSettings.value) return
  localSettings.value = {
    ...localSettings.value,
    embedding: embeddingSettings
  }
}

// Auto-save when settings change (with debounce)
let saveTimeout: number | null = null
watch(localSettings, (newSettings) => {
  if (!newSettings) return

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = window.setTimeout(async () => {
    await settingsStore.saveSettings(newSettings)
    originalSettings.value = JSON.stringify(newSettings)
  }, 500)
}, { deep: true })

// Custom provider management
function editCustomProvider(providerId: string) {
  const provider = localSettings.value?.ai.customProviders.find(p => p.id === providerId)
  if (provider) {
    editingProvider.value = provider
    showCustomProviderDialog.value = true
  }
}

function closeCustomProviderDialog() {
  showCustomProviderDialog.value = false
  editingProvider.value = null
}

function saveCustomProvider(provider: CustomProviderConfig) {
  if (!localSettings.value) return

  const providers = [...localSettings.value.ai.customProviders]
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

onMounted(async () => {
  await loadSettings()
  window.addEventListener('beforeunload', handleBeforeUnload)
})
</script>

<style scoped>
.settings-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--bg, #1C1B1A);
  color: var(--text-primary, #CECDC3);
  overflow: hidden;
}

/* Titlebar drag region for macOS */
.titlebar-drag-region {
  height: 52px;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  -webkit-app-region: drag;
  z-index: 1;
}

.settings-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Left Navigation - macOS Style */
.settings-nav {
  width: 220px;
  min-width: 220px;
  background: var(--bg-secondary, #282726);
  border-right: 1px solid var(--border, #343331);
  padding: 60px 12px 20px;
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-secondary, #878580);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  -webkit-app-region: no-drag;
}

.nav-item:hover {
  background: var(--hover, rgba(255,255,255,0.05));
  color: var(--text-primary, #CECDC3);
}

.nav-item.active {
  background: var(--accent, #4385BE);
  color: white;
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-item.active .nav-icon {
  opacity: 1;
}

.nav-label {
  flex: 1;
}

/* Right Content Area */
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.content-header {
  padding: 60px 32px 16px;
  border-bottom: 1px solid var(--border, #343331);
  -webkit-app-region: drag;
}

.content-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary, #CECDC3);
  margin: 0;
  -webkit-app-region: no-drag;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

/* Scrollbar styling */
.content-body::-webkit-scrollbar {
  width: 8px;
}

.content-body::-webkit-scrollbar-track {
  background: transparent;
}

.content-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.content-body::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* Dark/Light mode adjustments */
html[data-theme='light'] .settings-nav {
  background: #f5f5f4;
}

html[data-theme='light'] .nav-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Loading State */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted, #878580);
  font-size: 14px;
  padding-top: 52px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border, #343331);
  border-top-color: var(--accent, #4385BE);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
