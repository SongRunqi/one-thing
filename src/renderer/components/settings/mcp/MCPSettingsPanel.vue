<template>
  <div class="mcp-settings">
    <!-- Global MCP Toggle -->
    <section class="settings-section">
      <h3 class="section-title">
        MCP Settings
      </h3>

      <div class="form-group">
        <div class="toggle-row">
          <label class="form-label">Enable MCP</label>
          <label class="toggle">
            <input
              v-model="localMCPEnabled"
              type="checkbox"
              @change="handleEnableChange"
            >
            <span class="toggle-slider" />
          </label>
        </div>
        <p class="form-hint">
          Enable Model Context Protocol to connect to external tool servers
        </p>
      </div>
    </section>

    <!-- Server List -->
    <MCPServerList
      v-if="localMCPEnabled"
      :servers="mcpServers.servers.value"
      :expanded-servers="mcpServers.expandedServers.value"
      :connecting-servers="mcpServers.connectingServers.value"
      @add="openAddServerDialog"
      @import="openImportDialog"
      @toggle-expand="mcpServers.toggleServerExpanded"
      @toggle-enabled="mcpServers.toggleServerEnabled"
      @toggle-connect="mcpServers.handleConnectToggle"
      @edit="openEditServerDialog"
      @delete="confirmDeleteServer"
    />

    <!-- Add/Edit Server Dialog -->
    <MCPServerDialog
      ref="serverDialogRef"
      :show="showServerDialog"
      :editing-server="editingServer"
      @close="closeServerDialog"
      @save="handleSaveServer"
    />

    <!-- Delete Confirmation Dialog -->
    <Teleport to="body">
      <div
        v-if="showDeleteDialog"
        class="dialog-overlay"
        @click.self="showDeleteDialog = false"
      >
        <div class="dialog small">
          <div class="dialog-header">
            <h3>Delete Server</h3>
          </div>
          <div class="dialog-content">
            <p>Are you sure you want to delete this MCP server? This action cannot be undone.</p>
          </div>
          <div class="dialog-footer">
            <button
              class="btn secondary"
              @click="showDeleteDialog = false"
            >
              Cancel
            </button>
            <button
              class="btn danger"
              @click="handleDeleteServer"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Import Servers Dialog -->
    <MCPImportDialog
      ref="importDialogRef"
      :show="showImportDialog"
      @close="closeImportDialog"
      @import="handleImportServers"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { MCPServerConfig, MCPSettings } from '@/types'
import { useMCPServers, type ServerForm } from './useMCPServers'
import MCPServerList from './MCPServerList.vue'
import MCPServerDialog from './MCPServerDialog.vue'
import MCPImportDialog from './MCPImportDialog.vue'

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

// Dialog refs
const serverDialogRef = ref<InstanceType<typeof MCPServerDialog> | null>(null)
const importDialogRef = ref<InstanceType<typeof MCPImportDialog> | null>(null)

// Dialog state
const showServerDialog = ref(false)
const showDeleteDialog = ref(false)
const showImportDialog = ref(false)
const editingServer = ref<MCPServerConfig | null>(null)
const deletingServerId = ref<string | null>(null)

// Use MCP servers composable
const mcpServers = useMCPServers(
  () => props.settings,
  (event, value) => emit(event, value)
)

// Watch for settings changes
watch(() => props.settings, (newSettings) => {
  if (newSettings) {
    localMCPEnabled.value = newSettings.enabled
  }
}, { deep: true })

// Load servers on mount
onMounted(async () => {
  await mcpServers.loadServers()
})

// Enable/disable MCP
function handleEnableChange() {
  emit('update:settings', {
    ...props.settings,
    enabled: localMCPEnabled.value,
  })
}

// Server dialog handlers
function openAddServerDialog() {
  editingServer.value = null
  showServerDialog.value = true
}

function openEditServerDialog(config: MCPServerConfig) {
  editingServer.value = config
  showServerDialog.value = true
}

function closeServerDialog() {
  showServerDialog.value = false
  editingServer.value = null
}

async function handleSaveServer(form: ServerForm) {
  serverDialogRef.value?.setLoading(true)

  const result = await mcpServers.saveServer(form, editingServer.value)

  if (result.success) {
    closeServerDialog()
  } else {
    serverDialogRef.value?.setError(result.error || 'Failed to save server')
  }

  serverDialogRef.value?.setLoading(false)
}

// Delete handlers
function confirmDeleteServer(serverId: string) {
  deletingServerId.value = serverId
  showDeleteDialog.value = true
}

async function handleDeleteServer() {
  if (!deletingServerId.value) return

  await mcpServers.deleteServer(deletingServerId.value)
  showDeleteDialog.value = false
  deletingServerId.value = null
}

// Import handlers
function openImportDialog() {
  showImportDialog.value = true
}

function closeImportDialog() {
  showImportDialog.value = false
}

async function handleImportServers(servers: MCPServerConfig[], selectedIndexes: Set<number>) {
  importDialogRef.value?.setLoading(true)

  const result = await mcpServers.importServers(servers, selectedIndexes)

  if (result.errors.length > 0) {
    importDialogRef.value?.setError(
      `Imported ${result.successCount}/${selectedIndexes.size}. Errors: ${result.errors.join('; ')}`
    )
  } else {
    closeImportDialog()
  }

  importDialogRef.value?.setLoading(false)
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

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 16px 0;
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

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
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

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

/* Dialog styles */
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
  color: var(--text-primary);
}

.dialog-content {
  padding: 24px;
}

.dialog-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
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

.btn.secondary {
  background: var(--panel-2);
  color: var(--text-primary);
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
