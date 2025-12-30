<template>
  <section class="settings-section">
    <div class="section-header">
      <h3 class="section-title">MCP Servers</h3>
      <div class="header-actions">
        <button class="import-btn" @click="$emit('import')" title="Import servers">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import
        </button>
        <button class="add-server-btn" @click="$emit('add')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add Server
        </button>
      </div>
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
      <MCPServerItem
        v-for="server in servers"
        :key="server.config.id"
        :server="server"
        :is-expanded="expandedServers.has(server.config.id)"
        :is-connecting="connectingServers.has(server.config.id)"
        @toggle-expand="$emit('toggle-expand', server.config.id)"
        @toggle-enabled="(enabled) => $emit('toggle-enabled', server.config.id, enabled)"
        @toggle-connect="$emit('toggle-connect', server)"
        @edit="$emit('edit', server.config)"
        @delete="$emit('delete', server.config.id)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { MCPServerState, MCPServerConfig } from '@/types'
import MCPServerItem from './MCPServerItem.vue'

interface Props {
  servers: MCPServerState[]
  expandedServers: Set<string>
  connectingServers: Set<string>
}

interface Emits {
  (e: 'add'): void
  (e: 'import'): void
  (e: 'toggle-expand', serverId: string): void
  (e: 'toggle-enabled', serverId: string, enabled: boolean): void
  (e: 'toggle-connect', server: MCPServerState): void
  (e: 'edit', config: MCPServerConfig): void
  (e: 'delete', serverId: string): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
.settings-section {
  margin-bottom: 32px;
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
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.import-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.import-btn:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
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
  background: #2563eb;
}

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
  color: var(--text-muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.empty-state .hint {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.servers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
