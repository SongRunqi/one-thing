<template>
  <div class="memory-card" :class="[memory.vividness, { expanded: isExpanded }]">
    <!-- Vividness Indicator -->
    <div class="vividness-indicator" :class="memory.vividness" />

    <!-- Main Content -->
    <div class="memory-main" @click="toggleExpand">
      <p class="memory-text">{{ memory.content }}</p>

      <!-- Meta Row -->
      <div class="memory-meta">
        <!-- Strength -->
        <div class="strength-wrapper">
          <div class="strength-bar">
            <div class="strength-fill" :style="{ width: memory.strength + '%' }" />
          </div>
          <span class="strength-value">{{ memory.strength }}%</span>
        </div>

        <!-- Category Badge -->
        <span class="category-badge" :class="memory.category">
          {{ getCategoryIcon(memory.category) }} {{ memory.category }}
        </span>

        <!-- Vividness -->
        <span class="vividness-badge">{{ memory.vividness }}</span>
      </div>

      <!-- Expanded Details -->
      <div v-if="isExpanded" class="memory-details">
        <div class="detail-row">
          <span class="detail-label">Recalled</span>
          <span class="detail-value">{{ memory.recallCount || 0 }} times</span>
        </div>
        <div v-if="memory.lastRecalledAt" class="detail-row">
          <span class="detail-label">Last recalled</span>
          <span class="detail-value">{{ formatRelativeTime(memory.lastRecalledAt) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Created</span>
          <span class="detail-value">{{ formatRelativeTime(memory.createdAt) }}</span>
        </div>
        <div v-if="memory.emotionalWeight" class="detail-row">
          <span class="detail-label">Emotional weight</span>
          <span class="detail-value">{{ memory.emotionalWeight }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="memory-actions">
      <button class="action-btn delete-btn" @click.stop="confirmDelete" title="Delete">
        <Trash2 :size="14" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { AgentMemory, AgentMemoryCategory } from '@/types'
import { Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  memory: AgentMemory
}>()

const emit = defineEmits<{
  delete: [memoryId: string]
}>()

const isExpanded = ref(false)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function getCategoryIcon(category: AgentMemoryCategory): string {
  const icons: Record<AgentMemoryCategory, string> = {
    observation: '👁',
    event: '📅',
    feeling: '💭',
    learning: '💡'
  }
  return icons[category] || '📝'
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}

function confirmDelete() {
  emit('delete', props.memory.id)
}
</script>

<style scoped>
.memory-card {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--bg);
  border-radius: 12px;
  border: 1px solid var(--border);
  transition: all 0.2s ease;
  cursor: pointer;
}

.memory-card:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.1);
}

.memory-card:hover .memory-actions {
  opacity: 1;
}

/* Vividness Indicator - Left Border */
.vividness-indicator {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
}

.vividness-indicator.vivid {
  background: #22c55e;
}

.vividness-indicator.clear {
  background: #3b82f6;
}

.vividness-indicator.hazy {
  background: #f59e0b;
}

.vividness-indicator.fragment {
  background: #9ca3af;
}

/* Main Content */
.memory-main {
  flex: 1;
  min-width: 0;
  padding-left: 8px;
}

.memory-text {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

/* Meta Row */
.memory-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Strength Bar */
.strength-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.strength-bar {
  width: 60px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #60a5fa);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.strength-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

/* Category Badge */
.category-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(107, 114, 128, 0.2);
  color: var(--text-muted);
  text-transform: capitalize;
}

.category-badge.observation {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.category-badge.event {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.category-badge.feeling {
  background: rgba(236, 72, 153, 0.15);
  color: #ec4899;
}

.category-badge.learning {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

/* Vividness Badge */
.vividness-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--hover);
  color: var(--text-muted);
  text-transform: capitalize;
}

/* Expanded Details */
.memory-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.detail-label {
  color: var(--text-muted);
}

.detail-value {
  color: var(--text-secondary);
}

/* Actions */
.memory-actions {
  position: absolute;
  right: 12px;
  top: 12px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
</style>
