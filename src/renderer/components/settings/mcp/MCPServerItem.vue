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
          <label
            class="toggle small"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="server.config.enabled"
              @change="$emit('toggle-enabled', ($event.target as HTMLInputElement).checked)"
            >
            <span class="toggle-slider" />
          </label>
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
      <div
        v-if="server.error"
        class="server-error"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <line
            x1="12"
            y1="8"
            x2="12"
            y2="12"
          />
          <line
            x1="12"
            y1="16"
            x2="12.01"
            y2="16"
          />
        </svg>
        <span>{{ server.error }}</span>
      </div>

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
.server-item {
  background: var(--ui-surface-sidebar-bg, var(--panel-2));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.server-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.server-item.expanded {
  border-color: var(--ui-accent-primary-fg, var(--accent));
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
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-indicator {
  position: relative;
  width: 10px;
  height: 10px;
}

.status-dot {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--ui-text-muted-fg, var(--text-muted));
  opacity: 0.5;
  transition: all 0.3s ease;
}

.status-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid transparent;
  opacity: 0;
  transition: all 0.3s ease;
}

.status-pulse {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: transparent;
  opacity: 0;
}

.server-status.connected .status-dot {
  background: var(--ui-status-success-fg, #22c55e);
  opacity: 1;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

.server-status.connected .status-ring {
  border-color: rgba(34, 197, 94, 0.3);
  opacity: 1;
}

.server-status.connecting .status-dot {
  background: var(--ui-status-warning-fg, #f59e0b);
  opacity: 1;
}

.server-status.connecting .status-ring {
  border-color: var(--ui-status-warning-fg, #f59e0b);
  opacity: 1;
  animation: ring-spin 1s linear infinite;
  border-top-color: transparent;
  border-right-color: transparent;
}

.server-status.error .status-dot {
  background: var(--ui-status-danger-fg, #ef4444);
  opacity: 1;
  animation: error-blink 2s ease-in-out infinite;
}

.server-status.error .status-ring {
  border-color: rgba(239, 68, 68, 0.3);
  opacity: 1;
}

.server-status.disconnected .status-dot {
  background: var(--ui-text-muted-fg, var(--text-muted));
  opacity: 0.4;
}

@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes error-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.server-details {
  min-width: 0;
}

.server-name {
  font-size: 14px;
  font-weight: 600;
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
}

.transport-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(120, 120, 128, 0.2);
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.transport-badge.stdio {
  background: rgba(168, 85, 247, 0.15);
  color: var(--ui-accent-primary-fg, #a855f7);
}

.transport-badge.sse {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
}

.capability-count {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.server-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Toggle styles */
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
  background-color: var(--ui-accent-primary-fg, var(--accent));
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle.small input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--ui-text-muted-fg, var(--text-muted));
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
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: var(--ui-status-danger-fg, #ef4444);
}

.connect-btn {
  position: relative;
  overflow: hidden;
}

.connect-btn.is-connected {
  color: var(--ui-status-success-fg, #22c55e);
}

.connect-btn.is-connected:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: var(--ui-status-danger-fg, #ef4444);
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
  transition: transform 0.2s ease;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.server-item.expanded .expand-chevron {
  transform: rotate(180deg);
}

/* Expanded content */
.server-expanded {
  padding: 0 16px 16px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
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
  color: var(--ui-status-danger-fg, #ef4444);
}

.server-error svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.connection-info {
  margin-top: 12px;
  padding: 12px;
  background: var(--ui-state-hover-bg, var(--hover));
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
  color: var(--ui-text-muted-fg, var(--text-muted));
  flex-shrink: 0;
  width: 80px;
}

.info-value {
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  word-break: break-all;
}

code.info-value {
  font-family: 'SF Mono', 'Monaco', monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

.capabilities-section {
  margin-top: 16px;
}

.capabilities-header {
  margin-bottom: 8px;
}

.capabilities-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted-fg, var(--text-muted));
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
  background: var(--ui-state-hover-bg, var(--hover));
  border-radius: 6px;
}

.tool-name,
.resource-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.tool-desc,
.resource-uri {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}
</style>
