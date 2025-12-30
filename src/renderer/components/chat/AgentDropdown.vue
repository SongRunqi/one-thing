<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="agent-dropdown-backdrop"
      @click="$emit('close')"
    ></div>
    <div
      v-if="visible"
      class="agent-dropdown"
      :style="dropdownStyle"
    >
      <div class="agent-dropdown-header">Select Agent</div>
      <div class="agent-dropdown-list">
        <!-- No Agent option -->
        <button
          class="agent-dropdown-item"
          :class="{ active: !currentAgentId }"
          @click="$emit('select', null)"
        >
          <div class="agent-dropdown-icon">
            <MessageSquare :size="16" :stroke-width="2" />
          </div>
          <span class="agent-dropdown-name">No Agent</span>
        </button>
        <!-- Agent options -->
        <button
          v-for="agent in agents"
          :key="agent.id"
          class="agent-dropdown-item"
          :class="{ active: currentAgentId === agent.id }"
          @click="$emit('select', agent.id)"
        >
          <span v-if="agent.avatar.type === 'emoji'" class="agent-dropdown-emoji">
            {{ agent.avatar.value }}
          </span>
          <img
            v-else
            :src="'file://' + agent.avatar.value"
            class="agent-dropdown-img"
            alt=""
          />
          <span class="agent-dropdown-name">{{ agent.name }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next'
import type { Agent } from '@/types'

defineProps<{
  visible: boolean
  dropdownStyle: Record<string, string>
  agents: Agent[]
  currentAgentId: string | null
}>()

defineEmits<{
  close: []
  select: [agentId: string | null]
}>()
</script>

<style scoped>
.agent-dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.agent-dropdown {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  max-width: 280px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: dropdownFadeIn 0.15s ease;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

html[data-theme='light'] .agent-dropdown {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
}

.agent-dropdown-header {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
}

.agent-dropdown-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
}

.agent-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.agent-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

html[data-theme='light'] .agent-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.agent-dropdown-item.active {
  background: rgba(var(--accent-rgb), 0.12);
}

.agent-dropdown-item.active:hover {
  background: rgba(var(--accent-rgb), 0.18);
}

.agent-dropdown-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: var(--muted);
  flex-shrink: 0;
}

html[data-theme='light'] .agent-dropdown-icon {
  background: rgba(0, 0, 0, 0.04);
}

.agent-dropdown-emoji {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  flex-shrink: 0;
}

html[data-theme='light'] .agent-dropdown-emoji {
  background: rgba(0, 0, 0, 0.04);
}

.agent-dropdown-img {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.agent-dropdown-name {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
