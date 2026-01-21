<template>
  <div
    class="custom-agent-card"
    :class="{ selected, disabled: enabled === false }"
    @click="$emit('select', agent)"
  >
    <!-- Avatar -->
    <div class="agent-avatar">
      <span
        v-if="agent.avatar?.type === 'emoji'"
        class="avatar-emoji"
      >
        {{ agent.avatar.value }}
      </span>
      <img
        v-else-if="agent.avatar?.type === 'image'"
        :src="getImageSrc(agent.avatar.value)"
        class="avatar-image"
        alt=""
      >
      <span
        v-else
        class="avatar-default"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle
            cx="12"
            cy="8"
            r="4"
          />
          <path d="M20 21a8 8 0 10-16 0" />
        </svg>
      </span>
    </div>

    <!-- Info -->
    <div class="agent-info">
      <div class="agent-header">
        <h4 class="agent-name">
          {{ agent.name }}
        </h4>
        <span
          class="agent-source"
          :class="agent.source"
        >
          {{ agent.source }}
        </span>
      </div>
      <p class="agent-description">
        {{ agent.description }}
      </p>
      <div class="agent-meta">
        <span
          class="tool-count"
          :title="toolNames"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          {{ totalToolCount }} tools
        </span>
      </div>
    </div>

    <!-- Actions -->
    <div class="agent-actions">
      <!-- Pin/Unpin button -->
      <button
        class="action-btn pin-btn"
        :class="{ pinned: isPinned }"
        :title="isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'"
        @click.stop="$emit('toggle-pin', agent)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          :fill="isPinned ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      </button>
      <!-- Enable/Disable toggle -->
      <div
        class="toggle-switch"
        :class="{ active: enabled !== false }"
        :title="enabled !== false ? 'Enabled' : 'Disabled'"
        @click.stop="$emit('toggle', agent)"
      />
      <button
        class="action-btn"
        title="Edit"
        @click.stop="$emit('edit', agent)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        class="action-btn danger"
        title="Delete"
        @click.stop="$emit('delete', agent)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CustomAgent } from '@/types'

const props = defineProps<{
  agent: CustomAgent
  selected?: boolean
  enabled?: boolean  // Whether this agent is enabled (from settings)
  isPinned?: boolean  // Whether this agent is pinned to sidebar
}>()

defineEmits<{
  select: [agent: CustomAgent]
  edit: [agent: CustomAgent]
  delete: [agent: CustomAgent]
  toggle: [agent: CustomAgent]  // Toggle enabled/disabled state
  'toggle-pin': [agent: CustomAgent]  // Toggle pin state
}>()

// Calculate total tool count (custom tools + allowed builtin tools)
const totalToolCount = computed(() => {
  const custom = props.agent.customTools.length
  const builtin = props.agent.allowBuiltinTools
    ? (props.agent.allowedBuiltinTools?.length || 0)
    : 0
  return custom + builtin
})

// Build tool names for tooltip
const toolNames = computed(() => {
  const customNames = props.agent.customTools.map(t => t.name)
  const builtinNames = props.agent.allowBuiltinTools
    ? (props.agent.allowedBuiltinTools || []).map(id => `[builtin] ${id}`)
    : []
  return [...customNames, ...builtinNames].join(', ')
})

function getImageSrc(value: string): string {
  if (value.startsWith('data:')) {
    return value
  }
  return 'file://' + value
}
</script>

<style scoped>
.custom-agent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--hover);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.custom-agent-card:hover {
  background: var(--active);
  border-color: var(--border);
}

.custom-agent-card.selected {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
}

.custom-agent-card.disabled {
  opacity: 0.5;
}

.custom-agent-card.disabled .agent-name,
.custom-agent-card.disabled .agent-description {
  text-decoration: line-through;
}

/* Avatar */
.agent-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--active);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.avatar-emoji {
  font-size: 24px;
  line-height: 1;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-default {
  color: var(--muted);
}

/* Info */
.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-source {
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.agent-source.user {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
}

.agent-source.project {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.agent-description {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}

.tool-count svg {
  opacity: 0.7;
}

/* Actions */
.agent-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Toggle switch is always visible */
.agent-actions .toggle-switch {
  flex-shrink: 0;
}

/* Action buttons are hidden by default, shown on hover */
.agent-actions .action-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.custom-agent-card:hover .agent-actions .action-btn {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Pin button - always visible when pinned */
.action-btn.pin-btn {
  opacity: 0;
}

.action-btn.pin-btn.pinned {
  opacity: 1;
  color: #eab308;
}

.custom-agent-card:hover .action-btn.pin-btn {
  opacity: 1;
}

.action-btn.pin-btn:hover {
  background: rgba(234, 179, 8, 0.1);
  color: #eab308;
}
</style>
