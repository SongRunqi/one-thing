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
          <Switch
            variant="ledger"
            :model-value="localMCPEnabled"
            aria-label="Enable MCP"
            @update:model-value="handleEnableChange(Boolean($event))"
          />
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

    <!-- Delete confirmation is `useConfirm()` (see confirmDeleteServer). -->

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
import Switch from '@/components/common/Switch.vue'
import { useConfirm } from '@/composables/useConfirm'
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
const showImportDialog = ref(false)
const editingServer = ref<MCPServerConfig | null>(null)

const { confirm } = useConfirm()

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
function handleEnableChange(enabled: boolean) {
  localMCPEnabled.value = enabled
  emit('update:settings', {
    ...props.settings,
    enabled,
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

// Delete handler — the hand-rolled confirm dialog is `useConfirm()` since P2.
async function confirmDeleteServer(serverId: string) {
  const accepted = await confirm({
    title: 'Delete Server',
    message: 'Are you sure you want to delete this MCP server? This action cannot be undone.',
    danger: true,
    confirmText: 'Delete',
    variant: 'paper',
  })
  if (!accepted) return
  await mcpServers.deleteServer(serverId)
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
 * The enable switch is `<Switch variant="ledger">` (P3) — it draws its own ink
 * rule, so nothing here paints it and `.toggle-row` is layout only.
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

</style>
