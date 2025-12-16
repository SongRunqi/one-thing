<template>
  <div class="mcp-settings">
    <!-- Global MCP Toggle -->
    <section class="settings-section">
      <h3 class="section-title">MCP Settings</h3>

      <div class="form-group">
        <div class="toggle-row">
          <label class="form-label">Enable MCP</label>
          <label class="toggle">
            <input
              type="checkbox"
              v-model="localMCPEnabled"
              @change="handleEnableChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="form-hint">Enable Model Context Protocol to connect to external tool servers</p>
      </div>
    </section>

    <!-- Server List -->
    <section class="settings-section" v-if="localMCPEnabled">
      <div class="section-header">
        <h3 class="section-title">MCP Servers</h3>
        <button class="add-server-btn" @click="openAddServerDialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add Server
        </button>
      </div>

      <div v-if="servers.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>No MCP servers configured</p>
        <p class="hint">Add a server to connect to external tools</p>
      </div>

      <div v-else class="servers-list">
        <div
          v-for="server in servers"
          :key="server.config.id"
          :class="['server-item', { expanded: expandedServers.has(server.config.id) }]"
        >
          <div class="server-header" @click="toggleServerExpanded(server.config.id)">
            <div class="server-info">
              <div class="server-status" :class="server.status" :title="getStatusText(server.status)">
                <div class="status-dot"></div>
              </div>
              <div class="server-details">
                <div class="server-name">{{ server.config.name }}</div>
                <div class="server-meta">
                  <span class="transport-badge" :class="server.config.transport">
                    {{ server.config.transport.toUpperCase() }}
                  </span>
                  <span v-if="server.status === 'connected'" class="capability-count">
                    {{ server.tools.length }} tools
                  </span>
                </div>
              </div>
            </div>
            <div class="server-actions">
              <label class="toggle small" @click.stop title="Enable/Disable server">
                <input
                  type="checkbox"
                  :checked="server.config.enabled"
                  @change="toggleServerEnabled(server.config.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="toggle-slider"></span>
              </label>
              <button
                class="icon-btn small"
                :class="{ spinning: connectingServers.has(server.config.id) }"
                @click.stop="handleConnectToggle(server)"
                :title="server.status === 'connected' ? 'Disconnect' : 'Connect'"
                :disabled="!server.config.enabled || connectingServers.has(server.config.id)"
              >
                <svg v-if="server.status === 'connected'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18.36 6.64a9 9 0 11-12.73 0"/>
                  <line x1="12" y1="2" x2="12" y2="12"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12.55a11 11 0 0114.08 0"/>
                  <path d="M1.42 9a16 16 0 0121.16 0"/>
                  <path d="M8.53 16.11a6 6 0 016.95 0"/>
                  <circle cx="12" cy="20" r="1"/>
                </svg>
              </button>
              <button
                class="icon-btn small"
                @click.stop="openEditServerDialog(server.config)"
                title="Edit server"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                class="icon-btn small danger"
                @click.stop="confirmDeleteServer(server.config.id)"
                title="Delete server"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
              <svg
                class="expand-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          <!-- Expanded Content -->
          <div v-if="expandedServers.has(server.config.id)" class="server-expanded">
            <!-- Error Message -->
            <div v-if="server.error" class="server-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{{ server.error }}</span>
            </div>

            <!-- Connection Info -->
            <div class="connection-info">
              <div v-if="server.config.transport === 'stdio'" class="info-row">
                <span class="info-label">Command:</span>
                <code class="info-value">{{ server.config.command }} {{ (server.config.args || []).join(' ') }}</code>
              </div>
              <div v-else class="info-row">
                <span class="info-label">URL:</span>
                <code class="info-value">{{ server.config.url }}</code>
              </div>
              <div v-if="server.connectedAt" class="info-row">
                <span class="info-label">Connected:</span>
                <span class="info-value">{{ formatTime(server.connectedAt) }}</span>
              </div>
            </div>

            <!-- Tools List -->
            <div v-if="server.tools.length > 0" class="capabilities-section">
              <div class="capabilities-header">
                <span class="capabilities-title">Tools ({{ server.tools.length }})</span>
              </div>
              <div class="tools-list">
                <div v-for="tool in server.tools" :key="tool.name" class="tool-item">
                  <span class="tool-name">{{ tool.name }}</span>
                  <span v-if="tool.description" class="tool-desc">{{ tool.description }}</span>
                </div>
              </div>
            </div>

            <!-- Resources List -->
            <div v-if="server.resources.length > 0" class="capabilities-section">
              <div class="capabilities-header">
                <span class="capabilities-title">Resources ({{ server.resources.length }})</span>
              </div>
              <div class="resources-list">
                <div v-for="resource in server.resources" :key="resource.uri" class="resource-item">
                  <span class="resource-name">{{ resource.name }}</span>
                  <span class="resource-uri">{{ resource.uri }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Add/Edit Server Dialog -->
    <Teleport to="body">
      <div v-if="showServerDialog" class="dialog-overlay" @click.self="closeServerDialog">
        <div class="dialog">
          <div class="dialog-header">
            <h3>{{ editingServer ? 'Edit Server' : 'Add MCP Server' }}</h3>
            <button class="close-btn" @click="closeServerDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="dialog-content">
            <div class="form-group">
              <label class="form-label">Server Name</label>
              <input
                v-model="serverForm.name"
                type="text"
                class="form-input"
                placeholder="My MCP Server"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Transport Type</label>
              <div class="transport-selector">
                <button
                  :class="['transport-option', { active: serverForm.transport === 'stdio' }]"
                  @click="serverForm.transport = 'stdio'"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <line x1="9" y1="1" x2="9" y2="4"/>
                    <line x1="15" y1="1" x2="15" y2="4"/>
                    <line x1="9" y1="20" x2="9" y2="23"/>
                    <line x1="15" y1="20" x2="15" y2="23"/>
                  </svg>
                  <span>Stdio</span>
                  <span class="transport-desc">Local process</span>
                </button>
                <button
                  :class="['transport-option', { active: serverForm.transport === 'sse' }]"
                  @click="serverForm.transport = 'sse'"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                  </svg>
                  <span>SSE</span>
                  <span class="transport-desc">HTTP endpoint</span>
                </button>
              </div>
            </div>

            <!-- Stdio Configuration -->
            <template v-if="serverForm.transport === 'stdio'">
              <div class="form-group">
                <label class="form-label">Command</label>
                <input
                  v-model="serverForm.command"
                  type="text"
                  class="form-input"
                  placeholder="npx, python, node..."
                />
              </div>
              <div class="form-group">
                <label class="form-label">Arguments</label>
                <input
                  v-model="serverForm.argsString"
                  type="text"
                  class="form-input"
                  placeholder="-y @modelcontextprotocol/server-everything"
                />
                <p class="form-hint">Space-separated arguments</p>
              </div>
              <div class="form-group">
                <label class="form-label">Working Directory (optional)</label>
                <input
                  v-model="serverForm.cwd"
                  type="text"
                  class="form-input"
                  placeholder="/path/to/working/dir"
                />
              </div>
            </template>

            <!-- SSE Configuration -->
            <template v-else>
              <div class="form-group">
                <label class="form-label">Server URL</label>
                <input
                  v-model="serverForm.url"
                  type="text"
                  class="form-input"
                  placeholder="http://localhost:3000/sse"
                />
              </div>
            </template>

            <div v-if="serverDialogError" class="error-message">
              {{ serverDialogError }}
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn secondary" @click="closeServerDialog">Cancel</button>
            <button class="btn primary" @click="saveServer" :disabled="isSavingServer">
              {{ isSavingServer ? 'Saving...' : (editingServer ? 'Save Changes' : 'Add Server') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div v-if="showDeleteDialog" class="dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="dialog small">
          <div class="dialog-header">
            <h3>Delete Server</h3>
          </div>
          <div class="dialog-content">
            <p>Are you sure you want to delete this MCP server? This action cannot be undone.</p>
          </div>
          <div class="dialog-footer">
            <button class="btn secondary" @click="showDeleteDialog = false">Cancel</button>
            <button class="btn danger" @click="deleteServer">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { MCPServerConfig, MCPServerState, MCPSettings } from '@/types'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  settings: MCPSettings
}

interface Emits {
  (e: 'update:settings', value: MCPSettings): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Local state
const localMCPEnabled = ref(props.settings?.enabled ?? true)
const servers = ref<MCPServerState[]>([])
const expandedServers = ref<Set<string>>(new Set())
const connectingServers = ref<Set<string>>(new Set())

// Dialog state
const showServerDialog = ref(false)
const showDeleteDialog = ref(false)
const editingServer = ref<MCPServerConfig | null>(null)
const deletingServerId = ref<string | null>(null)
const serverDialogError = ref('')
const isSavingServer = ref(false)

// Server form
const serverForm = ref({
  name: '',
  transport: 'stdio' as 'stdio' | 'sse',
  command: '',
  argsString: '',
  cwd: '',
  url: '',
})

// Watch for settings changes
watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    localMCPEnabled.value = newSettings.enabled
  }
}, { deep: true })

// Load servers on mount
onMounted(async () => {
  await loadServers()
})

async function loadServers() {
  try {
    const response = await window.electronAPI.mcpGetServers()
    if (response.success && response.servers) {
      servers.value = response.servers
    }
  } catch (error) {
    console.error('Failed to load MCP servers:', error)
  }
}

function handleEnableChange() {
  emit('update:settings', {
    ...props.settings,
    enabled: localMCPEnabled.value,
  })
}

function getStatusText(status: string): string {
  switch (status) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'disconnected': return 'Disconnected'
    case 'error': return 'Error'
    default: return status
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function toggleServerExpanded(serverId: string) {
  if (expandedServers.value.has(serverId)) {
    expandedServers.value.delete(serverId)
  } else {
    expandedServers.value.add(serverId)
  }
  expandedServers.value = new Set(expandedServers.value)
}

async function toggleServerEnabled(serverId: string, enabled: boolean) {
  const server = servers.value.find(s => s.config.id === serverId)
  if (!server) return

  const updatedConfig = { ...server.config, enabled }
  try {
    const response = await window.electronAPI.mcpUpdateServer(updatedConfig)
    if (response.success) {
      await loadServers()
      // Update parent settings
      const updatedServers = props.settings.servers.map(s =>
        s.id === serverId ? updatedConfig : s
      )
      emit('update:settings', {
        ...props.settings,
        servers: updatedServers,
      })
    }
  } catch (error) {
    console.error('Failed to toggle server:', error)
  }
}

async function handleConnectToggle(server: MCPServerState) {
  const serverId = server.config.id
  connectingServers.value.add(serverId)

  try {
    if (server.status === 'connected') {
      await window.electronAPI.mcpDisconnectServer(serverId)
    } else {
      await window.electronAPI.mcpConnectServer(serverId)
    }
    await loadServers()
  } catch (error) {
    console.error('Failed to toggle connection:', error)
  } finally {
    connectingServers.value.delete(serverId)
  }
}

function openAddServerDialog() {
  editingServer.value = null
  serverDialogError.value = ''
  serverForm.value = {
    name: '',
    transport: 'stdio',
    command: '',
    argsString: '',
    cwd: '',
    url: '',
  }
  showServerDialog.value = true
}

function openEditServerDialog(config: MCPServerConfig) {
  editingServer.value = config
  serverDialogError.value = ''
  serverForm.value = {
    name: config.name,
    transport: config.transport,
    command: config.command || '',
    argsString: (config.args || []).join(' '),
    cwd: config.cwd || '',
    url: config.url || '',
  }
  showServerDialog.value = true
}

function closeServerDialog() {
  showServerDialog.value = false
  editingServer.value = null
  serverDialogError.value = ''
}

async function saveServer() {
  // Validate
  if (!serverForm.value.name.trim()) {
    serverDialogError.value = 'Server name is required'
    return
  }

  if (serverForm.value.transport === 'stdio') {
    if (!serverForm.value.command.trim()) {
      serverDialogError.value = 'Command is required'
      return
    }
  } else {
    if (!serverForm.value.url.trim()) {
      serverDialogError.value = 'Server URL is required'
      return
    }
  }

  isSavingServer.value = true
  serverDialogError.value = ''

  try {
    const config: MCPServerConfig = {
      id: editingServer.value?.id || uuidv4(),
      name: serverForm.value.name.trim(),
      transport: serverForm.value.transport,
      enabled: editingServer.value?.enabled ?? true,
    }

    if (serverForm.value.transport === 'stdio') {
      config.command = serverForm.value.command.trim()
      config.args = serverForm.value.argsString.trim().split(/\s+/).filter(Boolean)
      if (serverForm.value.cwd.trim()) {
        config.cwd = serverForm.value.cwd.trim()
      }
    } else {
      config.url = serverForm.value.url.trim()
    }

    let response
    if (editingServer.value) {
      response = await window.electronAPI.mcpUpdateServer(config)
    } else {
      response = await window.electronAPI.mcpAddServer(config)
    }

    if (response.success) {
      await loadServers()
      // Update parent settings
      const existingServers = props.settings.servers || []
      const updatedServers = editingServer.value
        ? existingServers.map(s => s.id === config.id ? config : s)
        : [...existingServers, config]
      emit('update:settings', {
        ...props.settings,
        servers: updatedServers,
      })
      closeServerDialog()
    } else {
      serverDialogError.value = response.error || 'Failed to save server'
    }
  } catch (error: any) {
    serverDialogError.value = error.message || 'Failed to save server'
  } finally {
    isSavingServer.value = false
  }
}

function confirmDeleteServer(serverId: string) {
  deletingServerId.value = serverId
  showDeleteDialog.value = true
}

async function deleteServer() {
  if (!deletingServerId.value) return

  try {
    const response = await window.electronAPI.mcpRemoveServer(deletingServerId.value)
    if (response.success) {
      await loadServers()
      // Update parent settings
      const updatedServers = props.settings.servers.filter(s => s.id !== deletingServerId.value)
      emit('update:settings', {
        ...props.settings,
        servers: updatedServers,
      })
    }
  } catch (error) {
    console.error('Failed to delete server:', error)
  } finally {
    showDeleteDialog.value = false
    deletingServerId.value = null
  }
}
</script>

<style scoped>
.mcp-settings {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.section-header .section-title {
  margin-bottom: 0;
}

.add-server-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--accent);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-server-btn:hover {
  background: #0d8a6a;
}

/* Toggle styles */
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.form-hint {
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle.small {
  width: 36px;
  height: 20px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(120, 120, 128, 0.32);
  border-radius: 12px;
  transition: 0.2s;
}

.toggle.small .toggle-slider {
  border-radius: 10px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle.small .toggle-slider:before {
  height: 16px;
  width: 16px;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle.small input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--panel-2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.empty-state svg {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

.empty-state .hint {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
}

/* Server list */
.servers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.server-item {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.server-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.server-item.expanded {
  border-color: var(--accent);
}

.server-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.server-status {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--muted);
}

.server-status.connected .status-dot {
  background: #22c55e;
}

.server-status.connecting .status-dot {
  background: #f59e0b;
  animation: pulse 1s ease-in-out infinite;
}

.server-status.error .status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.server-details {
  min-width: 0;
}

.server-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.transport-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(120, 120, 128, 0.2);
  color: var(--muted);
}

.transport-badge.stdio {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.transport-badge.sse {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.capability-count {
  font-size: 12px;
  color: var(--muted);
}

.server-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn.small {
  width: 28px;
  height: 28px;
}

.icon-btn:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.icon-btn.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.expand-chevron {
  transition: transform 0.2s ease;
  color: var(--muted);
}

.server-item.expanded .expand-chevron {
  transform: rotate(180deg);
}

/* Expanded content */
.server-expanded {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
  margin-top: -1px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.server-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  margin-top: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
}

.server-error svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.connection-info {
  margin-top: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: 8px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  flex-shrink: 0;
  width: 80px;
}

.info-value {
  font-size: 12px;
  color: var(--text);
  word-break: break-all;
}

code.info-value {
  font-family: 'SF Mono', 'Monaco', monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Capabilities sections */
.capabilities-section {
  margin-top: 16px;
}

.capabilities-header {
  margin-bottom: 8px;
}

.capabilities-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tools-list,
.resources-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-item,
.resource-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  background: var(--hover);
  border-radius: 6px;
}

.tool-name,
.resource-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tool-desc,
.resource-uri {
  font-size: 12px;
  color: var(--muted);
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

.dialog {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s ease;
}

.dialog.small {
  max-width: 400px;
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
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.dialog-content {
  padding: 24px;
}

.dialog-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text);
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* Form inputs */
.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--panel-2);
  color: var(--text);
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.1);
}

.form-input::placeholder {
  color: var(--muted);
}

/* Transport selector */
.transport-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.transport-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.transport-option:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.transport-option.active {
  background: rgba(16, 163, 127, 0.1);
  border-color: var(--accent);
}

.transport-option span {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.transport-desc {
  font-size: 12px !important;
  font-weight: 400 !important;
  color: var(--muted) !important;
}

/* Error message */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
  margin-top: 16px;
}

/* Buttons */
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
  background: #0d8a6a;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.danger {
  background: #ef4444;
  color: white;
}

.btn.danger:hover {
  background: #dc2626;
}
</style>
