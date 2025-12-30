<template>
  <Teleport to="body">
    <div v-if="show" class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog import-dialog">
        <div class="dialog-header">
          <h3>Import MCP Servers</h3>
          <button class="close-btn" @click="$emit('close')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="dialog-content import-content">
          <!-- Tab selector -->
          <div class="import-tabs">
            <button
              :class="['import-tab', { active: activeTab === 'file' }]"
              @click="switchTab('file')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              From File
            </button>
            <button
              :class="['import-tab', { active: activeTab === 'paste' }]"
              @click="switchTab('paste')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
              Quick Paste
            </button>
            <button
              :class="['import-tab', { active: activeTab === 'presets' }]"
              @click="switchTab('presets')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Presets
            </button>
          </div>

          <!-- File Import Tab -->
          <div v-if="activeTab === 'file'" class="import-tab-content">
            <p class="import-description">
              Import MCP configurations from a JSON file. Supports Claude Desktop format.
            </p>
            <button class="select-file-btn" @click="selectImportFile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              Select JSON File
            </button>
            <div v-if="fileInfo" class="file-info">
              <span class="file-name">{{ fileInfo.name }}</span>
              <span class="server-count">{{ fileInfo.serverCount }} server(s) found</span>
            </div>
          </div>

          <!-- Quick Paste Tab -->
          <div v-if="activeTab === 'paste'" class="import-tab-content">
            <p class="import-description">
              Paste a JSON configuration or command line to add a server.
            </p>
            <textarea
              v-model="pasteContent"
              class="form-textarea"
              placeholder='Paste JSON config or command line:

{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]}

or:

npx -y @modelcontextprotocol/server-filesystem /path'
              rows="6"
              @input="parsePasteContent"
            ></textarea>
            <div v-if="pasteResult" class="parse-result">
              <div v-if="pasteResult.success" class="parse-success">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>{{ pasteResult.type }}</span>
              </div>
              <div v-else class="parse-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{{ pasteResult.error }}</span>
              </div>
            </div>
          </div>

          <!-- Presets Tab -->
          <div v-if="activeTab === 'presets'" class="import-tab-content">
            <p class="import-description">
              Choose from popular MCP servers to quickly get started.
            </p>

            <!-- Category filter -->
            <div class="preset-categories">
              <button
                v-for="cat in presetCategories"
                :key="cat.id"
                :class="['category-btn', { active: selectedCategory === cat.id }]"
                @click="selectedCategory = cat.id"
              >
                {{ cat.name }}
              </button>
            </div>

            <!-- Presets grid -->
            <div class="presets-grid">
              <div
                v-for="preset in filteredPresets"
                :key="preset.id"
                :class="['preset-card', { selected: selectedPreset?.id === preset.id }]"
                @click="selectPreset(preset)"
              >
                <div class="preset-icon">
                  <component :is="getPresetIcon(preset.icon)" />
                </div>
                <div class="preset-info">
                  <span class="preset-name">{{ preset.name }}</span>
                  <span class="preset-desc">{{ preset.description }}</span>
                </div>
                <svg v-if="selectedPreset?.id === preset.id" class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            </div>

            <!-- Parameter configuration -->
            <div v-if="selectedPreset && selectedPreset.parameters && selectedPreset.parameters.length > 0" class="preset-params">
              <h4>Configuration</h4>
              <div
                v-for="param in selectedPreset.parameters"
                :key="param.key"
                class="form-group"
              >
                <label class="form-label">
                  {{ param.name }}
                  <span v-if="param.required" class="required">*</span>
                </label>
                <div v-if="param.type === 'path'" class="path-input-group">
                  <input
                    v-model="presetParams[param.key]"
                    type="text"
                    class="form-input"
                    :placeholder="param.placeholder"
                    @input="updatePresetServer"
                  />
                  <button class="browse-btn" @click="browseForPath(param.key)">
                    Browse
                  </button>
                </div>
                <input
                  v-else
                  v-model="presetParams[param.key]"
                  :type="param.isEnvVar ? 'password' : 'text'"
                  class="form-input"
                  :placeholder="param.placeholder"
                  @input="updatePresetServer"
                />
              </div>
            </div>
          </div>

          <!-- Preview of servers to import -->
          <div v-if="serversToImport.length > 0" class="import-preview">
            <h4>Servers to Import ({{ serversToImport.length }})</h4>
            <div class="preview-list">
              <div
                v-for="(server, index) in serversToImport"
                :key="index"
                :class="['preview-item', { selected: selectedServers.has(index) }]"
                @click="toggleServerSelection(index)"
              >
                <input type="checkbox" :checked="selectedServers.has(index)" @click.stop />
                <div class="preview-info">
                  <span class="preview-name">{{ server.name }}</span>
                  <span class="preview-command">{{ getServerSummary(server) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn secondary" @click="$emit('close')">Cancel</button>
          <button
            class="btn primary"
            @click="handleImport"
            :disabled="selectedServers.size === 0 || isImporting"
          >
            {{ isImporting ? 'Importing...' : `Import ${selectedServers.size} Server(s)` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import type { MCPServerConfig } from '@/types'
import { MCP_PRESETS, PRESET_CATEGORIES, type MCPPreset, type PresetCategory } from '@/data/mcpPresets'
import { v4 as uuidv4 } from 'uuid'
import { parseConfigFile, parseCommandLine, getServerSummary } from './useMCPServers'

interface Props {
  show: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'import', servers: MCPServerConfig[], selectedIndexes: Set<number>): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Tab state
const activeTab = ref<'file' | 'paste' | 'presets'>('file')

// File tab state
const fileInfo = ref<{ name: string; serverCount: number } | null>(null)

// Paste tab state
const pasteContent = ref('')
const pasteResult = ref<{ success: boolean; type?: string; error?: string } | null>(null)

// Presets tab state
const selectedCategory = ref<PresetCategory>('all')
const selectedPreset = ref<MCPPreset | null>(null)
const presetParams = ref<Record<string, string>>({})
const presetCategories = PRESET_CATEGORIES

// Shared state
const serversToImport = ref<MCPServerConfig[]>([])
const selectedServers = ref<Set<number>>(new Set())
const error = ref('')
const isImporting = ref(false)

// Computed
const filteredPresets = computed(() => {
  if (selectedCategory.value === 'all') {
    return MCP_PRESETS
  }
  return MCP_PRESETS.filter(p => p.category === selectedCategory.value)
})

// Reset when dialog opens
watch(() => props.show, (show) => {
  if (show) {
    activeTab.value = 'file'
    error.value = ''
    serversToImport.value = []
    selectedServers.value = new Set()
    fileInfo.value = null
    pasteContent.value = ''
    pasteResult.value = null
    selectedPreset.value = null
    presetParams.value = {}
  }
})

function switchTab(tab: 'file' | 'paste' | 'presets') {
  activeTab.value = tab
  serversToImport.value = []
  selectedServers.value = new Set()
  error.value = ''
  if (tab === 'file') {
    fileInfo.value = null
  } else if (tab === 'paste') {
    pasteContent.value = ''
    pasteResult.value = null
  } else {
    selectedPreset.value = null
    presetParams.value = {}
  }
}

// File import
async function selectImportFile() {
  try {
    const result = await window.electronAPI.showOpenDialog({
      title: 'Select MCP Configuration File',
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) return

    const filePath = result.filePaths[0]
    const response = await window.electronAPI.mcpReadConfigFile(filePath)

    if (!response.success) {
      error.value = response.error || 'Failed to read file'
      return
    }

    const servers = parseConfigFile(response.content)
    serversToImport.value = servers
    selectedServers.value = new Set(servers.map((_, i) => i))
    fileInfo.value = {
      name: filePath.split('/').pop() || 'config.json',
      serverCount: servers.length,
    }
    error.value = ''
  } catch (err: any) {
    error.value = err.message || 'Failed to select file'
  }
}

// Paste parsing
function parsePasteContent() {
  const content = pasteContent.value.trim()
  if (!content) {
    pasteResult.value = null
    serversToImport.value = []
    selectedServers.value = new Set()
    return
  }

  try {
    if (content.startsWith('{') || content.startsWith('[')) {
      const parsed = JSON.parse(content)
      const servers = parseConfigFile(parsed)
      serversToImport.value = servers
      selectedServers.value = new Set(servers.map((_, i) => i))
      pasteResult.value = {
        success: true,
        type: `JSON configuration (${servers.length} server${servers.length > 1 ? 's' : ''})`,
      }
      return
    }

    const server = parseCommandLine(content)
    if (server) {
      serversToImport.value = [server]
      selectedServers.value = new Set([0])
      pasteResult.value = {
        success: true,
        type: `Command line: ${server.command}`,
      }
      return
    }

    throw new Error('Could not parse as JSON or command line')
  } catch (err: any) {
    pasteResult.value = { success: false, error: err.message }
    serversToImport.value = []
    selectedServers.value = new Set()
  }
}

// Preset handling
function selectPreset(preset: MCPPreset) {
  selectedPreset.value = preset
  presetParams.value = {}

  if (preset.parameters) {
    for (const param of preset.parameters) {
      if (param.default) {
        presetParams.value[param.key] = param.default
      }
    }
  }

  updatePresetServer()
}

function updatePresetServer() {
  if (!selectedPreset.value) return

  const preset = selectedPreset.value
  let args = preset.config.args ? [...preset.config.args] : []

  args = args.map(arg => {
    const match = arg.match(/\{(\w+)\}/)
    if (match) {
      const key = match[1]
      return presetParams.value[key] || arg
    }
    return arg
  })

  const env: Record<string, string> = {}
  if (preset.parameters) {
    for (const param of preset.parameters) {
      if (param.isEnvVar && presetParams.value[param.key]) {
        env[param.key] = presetParams.value[param.key]
      }
    }
  }

  const server: MCPServerConfig = {
    id: uuidv4(),
    name: preset.name,
    transport: preset.config.transport,
    enabled: true,
  }

  if (preset.config.command) server.command = preset.config.command
  if (args.length > 0) server.args = args
  if (preset.config.url) server.url = preset.config.url
  if (Object.keys(env).length > 0) server.env = env

  serversToImport.value = [server]
  selectedServers.value = new Set([0])
}

async function browseForPath(paramKey: string) {
  const result = await window.electronAPI.showOpenDialog({
    title: 'Select Path',
    properties: ['openDirectory'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    presetParams.value[paramKey] = result.filePaths[0]
    updatePresetServer()
  }
}

function toggleServerSelection(index: number) {
  if (selectedServers.value.has(index)) {
    selectedServers.value.delete(index)
  } else {
    selectedServers.value.add(index)
  }
  selectedServers.value = new Set(selectedServers.value)
}

function handleImport() {
  emit('import', serversToImport.value, selectedServers.value)
}

// Preset icons helper
function getPresetIcon(iconName: string) {
  const icons: Record<string, () => any> = {
    folder: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('path', { d: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' })
    ]),
    github: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('path', { d: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22' })
    ]),
    globe: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('circle', { cx: 12, cy: 12, r: 10 }),
      h('line', { x1: 2, y1: 12, x2: 22, y2: 12 }),
      h('path', { d: 'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z' })
    ]),
    database: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }),
      h('path', { d: 'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3' }),
      h('path', { d: 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5' })
    ]),
    search: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('circle', { cx: 11, cy: 11, r: 8 }),
      h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
    ]),
    download: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' }),
      h('polyline', { points: '7 10 12 15 17 10' }),
      h('line', { x1: 12, y1: 15, x2: 12, y2: 3 })
    ]),
    brain: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('path', { d: 'M12 2a4 4 0 014 4c0 1.1-.9 2-2 2h-4a2 2 0 01-2-2 4 4 0 014-4z' }),
      h('path', { d: 'M20 12c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8' }),
      h('circle', { cx: 12, cy: 12, r: 3 })
    ]),
    lightbulb: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('path', { d: 'M9 18h6' }),
      h('path', { d: 'M10 22h4' }),
      h('path', { d: 'M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14' })
    ]),
    star: () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [
      h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' })
    ]),
  }
  return icons[iconName] || icons.star
}

// Expose for parent
defineExpose({
  setError: (msg: string) => { error.value = msg },
  setLoading: (loading: boolean) => { isImporting.value = loading },
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.import-dialog {
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.import-content {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.import-tabs {
  display: flex;
  gap: 4px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.import-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.import-tab:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.import-tab.active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}

.import-tab-content {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.import-description {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.select-file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 24px;
  border: 2px dashed var(--border);
  background: transparent;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.select-file-btn:hover {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.05);
  color: var(--accent);
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  margin-top: 12px;
  background: var(--hover);
  border-radius: 8px;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.server-count {
  font-size: 12px;
  color: var(--accent);
  font-weight: 500;
}

.form-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: var(--panel-2);
  color: var(--text-primary);
  resize: vertical;
  line-height: 1.5;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-textarea::placeholder {
  color: var(--text-muted);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.parse-result {
  margin-top: 12px;
}

.parse-success,
.parse-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
}

.parse-success {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.parse-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.preset-categories {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.category-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 20px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.category-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.preset-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.preset-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-card.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
}

.preset-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 8px;
  color: var(--accent);
  flex-shrink: 0;
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.preset-desc {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.check-icon {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--accent);
}

.preset-params {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.preset-params h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--panel-2);
  color: var(--text-primary);
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.path-input-group .form-input {
  flex: 1;
}

.browse-btn {
  padding: 0 14px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text-primary);
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.browse-btn:hover {
  background: var(--hover);
}

.required {
  color: #ef4444;
}

.import-preview {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.import-preview h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.preview-item.selected {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.05);
}

.preview-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.preview-command {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
  margin: 16px 24px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: var(--panel-2);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn.secondary:hover {
  background: var(--hover);
}
</style>
