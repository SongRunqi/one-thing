<template>
  <div :class="['server-item', { expanded: isExpanded }]">
    <div
      class="server-header"
      @click="$emit('toggle-expand')"
    >
      <div class="server-info">
        <div
          class="server-status"
          :class="server.status"
          :title="statusText"
        >
          <div class="status-indicator">
            <div class="status-dot" />
            <div class="status-ring" />
            <div class="status-pulse" />
          </div>
        </div>
        <div class="server-details">
          <div class="server-name">
            {{ server.config.name }}
          </div>
          <div class="server-meta">
            <span
              class="transport-badge"
              :class="server.config.transport"
            >
              {{ server.config.transport.toUpperCase() }}
            </span>
            <span
              v-if="server.status === 'connected'"
              class="capability-count"
            >
              {{ server.tools.length }} tools
            </span>
          </div>
        </div>
      </div>
      <div class="server-actions">
        <Tooltip
          text="Auto-connect on startup"
          position="top"
        >
          <Switch
            variant="ledger"
            :model-value="server.config.enabled"
            aria-label="Auto-connect on startup"
            @click.stop
            @update:model-value="$emit('toggle-enabled', Boolean($event))"
          />
        </Tooltip>
        <Tooltip
          :text="server.status === 'connected' ? 'Stop' : 'Start'"
          position="top"
        >
          <Button
            unstyled
            class="icon-btn small connect-btn"
            :class="{
              'is-loading': isConnecting,
              'is-connected': server.status === 'connected'
            }"
            :disabled="!server.config.enabled || isConnecting"
            @click.stop="$emit('toggle-connect')"
          >
            <Loader2
              v-if="isConnecting"
              class="loading-spinner"
              :size="14"
            />
            <Pause
              v-else-if="server.status === 'connected'"
              :size="14"
            />
            <Play
              v-else
              :size="14"
            />
          </Button>
        </Tooltip>
        <Tooltip
          text="Edit"
          position="top"
        >
          <Button
            unstyled
            class="icon-btn small"
            @click.stop="$emit('edit')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </Button>
        </Tooltip>
        <Tooltip
          text="Delete"
          position="top"
        >
          <Button
            unstyled
            class="icon-btn small danger"
            @click.stop="$emit('delete')"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </Button>
        </Tooltip>
        <svg
          class="expand-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>

    <!-- Expanded Content -->
    <div
      v-if="isExpanded"
      class="server-expanded"
    >
      <!-- Error Message -->
      <ErrorNote
        v-if="server.error"
        class="server-error"
        :message="server.error"
      />

      <!-- Connection Info -->
      <div class="connection-info">
        <div
          v-if="server.config.transport === 'stdio'"
          class="info-row"
        >
          <span class="info-label">Command:</span>
          <code class="info-value">{{ server.config.command }} {{ (server.config.args || []).join(' ') }}</code>
        </div>
        <div
          v-else
          class="info-row"
        >
          <span class="info-label">URL:</span>
          <code class="info-value">{{ server.config.url }}</code>
        </div>
        <div
          v-if="server.connectedAt"
          class="info-row"
        >
          <span class="info-label">Connected:</span>
          <span class="info-value">{{ formatTime(server.connectedAt) }}</span>
        </div>
      </div>

      <!-- Tools List -->
      <div
        v-if="server.tools.length > 0"
        class="capabilities-section"
      >
        <div class="capabilities-header">
          <span class="capabilities-title">Tools ({{ server.tools.length }})</span>
        </div>
        <div class="tools-list">
          <div
            v-for="tool in server.tools"
            :key="tool.name"
            class="tool-item"
          >
            <span class="tool-name">{{ tool.name }}</span>
            <span
              v-if="tool.description"
              class="tool-desc"
            >{{ tool.description }}</span>
          </div>
        </div>
      </div>

      <!-- Resources List -->
      <div
        v-if="server.resources.length > 0"
        class="capabilities-section"
      >
        <div class="capabilities-header">
          <span class="capabilities-title">Resources ({{ server.resources.length }})</span>
        </div>
        <div class="resources-list">
          <div
            v-for="resource in server.resources"
            :key="resource.uri"
            class="resource-item"
          >
            <span class="resource-name">{{ resource.name }}</span>
            <span class="resource-uri">{{ resource.uri }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Switch from '@/components/common/Switch.vue'
import { computed } from 'vue'
import type { MCPServerState } from '@/types'
import { Play, Pause, Loader2 } from 'lucide-vue-next'
import Tooltip from '@/components/common/Tooltip.vue'

interface Props {
  server: MCPServerState
  isExpanded: boolean
  isConnecting: boolean
}

interface Emits {
  (e: 'toggle-expand'): void
  (e: 'toggle-enabled', enabled: boolean): void
  (e: 'toggle-connect'): void
  (e: 'edit'): void
  (e: 'delete'): void
}

const props = defineProps<Props>()
defineEmits<Emits>()

const statusText = computed(() => {
  switch (props.server.status) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'disconnected': return 'Disconnected'
    case 'error': return 'Error'
    default: return props.server.status
  }
})

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}
</script>

<style scoped>
/*
 * MCP server item — 画线风 ledger row.
 * No box, no fill: a hairline separates rows, an ink line on the left carries
 * hover/expanded state. The auto-connect toggle is `<Switch variant="ledger">`
 * (P3) and draws its own ink rule — do not redraw it here.
 */
.server-item {
  background: transparent;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 32%, transparent);
  transition: box-shadow 0.12s ease;
}

.server-item:last-child {
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 32%, transparent);
}

/* State lives in the line: left ink rule on hover, accent when expanded */
.server-item:hover {
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.server-item.expanded {
  box-shadow: inset 2px 0 0 var(--ui-accent-primary-fg, var(--accent));
}

.server-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0 9px 10px;
  cursor: pointer;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

/* Status: stroked ring, colored by --ui-status-*-fg; filled center dot only when live */
.server-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-indicator {
  position: relative;
  width: 11px;
  height: 11px;
}

.status-dot {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px dashed var(--ui-border-default-border, var(--border));
  background: transparent;
  transition: border-color 0.2s ease;
}

.status-ring {
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: transparent;
}

.status-pulse {
  display: none;
}

.server-status.connected .status-dot {
  border: 1px solid var(--ui-status-success-fg, #22c55e);
}

.server-status.connected .status-ring {
  background: var(--ui-status-success-fg, #22c55e);
}

.server-status.connecting .status-dot {
  border: 1px solid var(--ui-status-warning-fg, #f59e0b);
  border-top-color: transparent;
  animation: ring-spin 1s linear infinite;
}

.server-status.error .status-dot {
  border: 1px solid var(--ui-status-danger-fg, #b3403a);
}

.server-status.error .status-ring {
  background: var(--ui-status-danger-fg, #b3403a);
  animation: error-blink 2s ease-in-out infinite;
}

.server-status.disconnected .status-dot {
  border: 1px dashed color-mix(in srgb, var(--ui-text-faint-fg, var(--muted)) 70%, transparent);
}

@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes error-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.server-details {
  flex: 1;
  min-width: 0;
}

.server-name {
  font-size: 13px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--ui-text-primary-fg, var(--text-primary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  min-width: 0;
}

/* Transport badge: stroked ring, zero fill */
.transport-badge {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.05em;
  padding: 2px 7px 3px;
  border: 1px solid color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 55%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.transport-badge.stdio,
.transport-badge.sse {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 65%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.capability-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.server-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* Icon buttons: bare glyphs, ink darkens on hover, no fill, no radius */
.icon-btn {
  border: none;
  background: transparent;
  padding: 4px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s ease;
}

.icon-btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, #b3403a);
}

.connect-btn.is-connected {
  color: var(--ui-status-success-fg, #22c55e);
}

.connect-btn.is-connected:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, #b3403a);
}

.connect-btn.is-loading {
  pointer-events: none;
}

.connect-btn .loading-spinner {
  animation: spin 1s linear infinite;
  color: var(--ui-accent-primary-fg, var(--accent));
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.expand-chevron {
  flex-shrink: 0;
  transition: transform 0.2s ease;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.server-item.expanded .expand-chevron {
  transform: rotate(180deg);
}

/* Expanded content */
.server-expanded {
  padding: 0 0 14px 10px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 32%, transparent);
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

/* positioning only — visuals come from ErrorNote */
.server-error {
  margin-top: 10px;
}

.connection-info {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.info-label {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
  min-width: 72px;
}

.info-value {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  min-width: 0;
  word-break: break-all;
}

code.info-value {
  font-family: var(--font-mono, monospace);
  background: transparent;
  padding: 0;
}

.capabilities-section {
  margin-top: 14px;
}

.capabilities-header {
  margin-bottom: 6px;
}

.capabilities-title {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-faint-fg, var(--muted));
}

/* Capability rows quoted by a left ink rule, separated by hairlines */
.tools-list,
.resources-list {
  display: flex;
  flex-direction: column;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  padding-left: 10px;
}

.tool-item,
.resource-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 0;
  background: transparent;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 24%, transparent);
  min-width: 0;
}

.tool-item:first-child,
.resource-item:first-child {
  border-top: none;
}

.tool-name,
.resource-name {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  word-break: break-word;
}

.tool-desc {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  word-break: break-word;
}

.resource-uri {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  word-break: break-all;
}
</style>
