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
            <Button
              unstyled
              class="btn secondary"
              @click="showDeleteDialog = false"
            >
              Cancel
            </Button>
            <Button
              unstyled
              class="btn danger"
              @click="handleDeleteServer"
            >
              Delete
            </Button>
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
import Button from '@/components/common/Button.vue'
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
/*
 * MCP settings — 画线风 (ledger).
 * No background fills, no radii: state lives in the line.
 * Toggle visuals come from the SettingsPage :deep() layer (.toggle > input + .toggle-slider).
 */
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

.form-group {
  margin-bottom: 16px;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.toggle-row .form-label {
  margin-bottom: 0;
}

/* ---- delete confirmation: paper dialog in the ledger language ---- */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-toast);
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

.dialog {
  width: 100%;
  max-width: 480px;
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  box-shadow: var(--shadow-paper);
}

.dialog.small {
  max-width: 400px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

.dialog-header h3 {
  margin: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.dialog-content {
  padding: 16px 18px 4px;
}

.dialog-content p {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  padding: 14px 18px 16px;
}

/* Footer actions as text buttons: mono, no fill, underline on hover */
.btn {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.btn.danger {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.btn.danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}
</style>
