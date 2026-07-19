<template>
  <section class="settings-section">
    <div class="section-header">
      <h3 class="section-title">
        MCP Servers
      </h3>
      <div class="header-actions">
        <Button
          unstyled
          class="import-btn"
          title="Import servers"
          @click="$emit('import')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line
              x1="12"
              y1="3"
              x2="12"
              y2="15"
            />
          </svg>
          Import
        </Button>
        <Button
          unstyled
          class="add-server-btn"
          @click="$emit('add')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Server
        </Button>
      </div>
    </div>

    <div
      v-if="servers.length === 0"
      class="empty-state"
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <rect
          x="2"
          y="3"
          width="20"
          height="14"
          rx="2"
          ry="2"
        />
        <line
          x1="8"
          y1="21"
          x2="16"
          y2="21"
        />
        <line
          x1="12"
          y1="17"
          x2="12"
          y2="21"
        />
      </svg>
      <p>No MCP servers configured</p>
      <p class="hint">
        Add a server to connect to external tools
      </p>
    </div>

    <div
      v-else
      class="servers-list"
    >
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
import Button from '@/components/common/Button.vue'
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
/* MCP server list — 画线风 (ledger): text actions, hairline rows, no fills. */
.settings-section {
  margin-bottom: 32px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 12px;
}

.section-header .section-title {
  flex: 1;
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-shrink: 0;
}

/* Text actions: mono, no fill, underline on hover */
.import-btn,
.add-server-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.12s ease;
}

.import-btn svg,
.add-server-btn svg {
  width: 12px;
  height: 12px;
}

.import-btn {
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.import-btn:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.add-server-btn {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.add-server-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

/* Empty state: dashed frame, faint ink, no fill */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  background: transparent;
  border: 1px dashed var(--ui-border-default-border, var(--border));
}

.empty-state svg {
  color: var(--ui-text-faint-fg, var(--muted));
  margin-bottom: 14px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.empty-state .hint {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  margin-top: 4px;
}

/* Ledger rows: items draw their own hairlines */
.servers-list {
  display: flex;
  flex-direction: column;
}
</style>
