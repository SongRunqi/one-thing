<template>
  <button
    class="agent-chip"
    :class="{ selected }"
    @click="$emit('select')"
  >
    <div class="avatar-wrapper">
      <span v-if="agent.avatar.type === 'emoji'" class="avatar-emoji">
        {{ agent.avatar.value }}
      </span>
      <img
        v-else
        :src="'file://' + agent.avatar.value"
        class="avatar-image"
        alt=""
      />
      <div v-if="selected" class="selected-indicator">
        <Check :size="10" :stroke-width="3" />
      </div>
    </div>
    <span class="agent-name">{{ agent.name }}</span>
  </button>
</template>

<script setup lang="ts">
import type { Agent } from '@/types'
import { Check } from 'lucide-vue-next'

defineProps<{
  agent: Agent
  selected?: boolean
}>()

defineEmits<{
  select: []
}>()
</script>

<style scoped>
.agent-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 72px;
}

.agent-chip:hover {
  background: var(--hover);
}

.agent-chip.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--accent);
}

.avatar-wrapper {
  position: relative;
  width: 44px;
  height: 44px;
}

.avatar-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 24px;
  background: var(--hover);
  border-radius: 12px;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
}

.selected-indicator {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid var(--bg);
  color: white;
}

.agent-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary);
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-chip.selected .agent-name {
  color: var(--accent);
}
</style>
