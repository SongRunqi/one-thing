<template>
  <Transition name="plan-slide">
    <div v-if="plan?.items.length" class="plan-panel" :class="{ collapsed: isCollapsed }">
      <div class="plan-header" :class="{ 'no-border': isCollapsed }" @click="toggleCollapse">
        <div class="header-left">
          <ChevronDown
            :size="14"
            class="collapse-icon"
            :class="{ rotated: isCollapsed }"
          />
          <span class="plan-title">Plan</span>
          <span class="plan-status" :class="statusClass">{{ statusText }}</span>
        </div>
        <span class="plan-progress">{{ completedCount }}/{{ plan.items.length }}</span>
      </div>
      <div class="plan-items-wrapper" :class="{ expanded: !isCollapsed }">
        <div class="plan-items">
          <div
            v-for="(item, index) in plan.items"
            :key="item.id"
            class="plan-item"
            :class="item.status"
          >
            <div class="status-indicator" :class="item.status">
              <Check v-if="item.status === 'completed'" :size="12" :stroke-width="3" />
              <Play v-else-if="item.status === 'in_progress'" :size="10" :stroke-width="2.5" />
              <div v-else class="empty-dot"></div>
            </div>
            <span class="item-number">{{ index + 1 }}.</span>
            <span class="item-content">
              {{ item.status === 'in_progress' ? item.activeForm : item.content }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { Check, Play, ChevronDown } from 'lucide-vue-next'
import type { SessionPlan } from '@/types'

interface Props {
  sessionId?: string
}

const props = defineProps<Props>()

const plan = ref<SessionPlan | undefined>(undefined)
const isCollapsed = ref(true)

const completedCount = computed(() => {
  return plan.value?.items.filter(i => i.status === 'completed').length || 0
})

const isProcessing = computed(() => {
  return plan.value?.items.some(i => i.status === 'in_progress') || false
})

const isCompleted = computed(() => {
  if (!plan.value?.items.length) return false
  return plan.value.items.every(i => i.status === 'completed')
})

const statusText = computed(() => {
  if (isCompleted.value) return 'Completed'
  if (isProcessing.value) return 'Processing'
  return 'Pending'
})

const statusClass = computed(() => {
  if (isCompleted.value) return 'completed'
  if (isProcessing.value) return 'processing'
  return 'pending'
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

// Load plan from session
async function loadPlan() {
  if (!props.sessionId) {
    plan.value = undefined
    return
  }

  try {
    const result = await window.electronAPI.getSession(props.sessionId)
    if (result.success && result.session) {
      plan.value = result.session.plan
    }
  } catch (error) {
    console.error('Failed to load plan:', error)
  }
}

// Listen for plan updates
let unsubscribePlanUpdated: (() => void) | null = null

function handlePlanUpdated(data: { sessionId: string; plan: SessionPlan }) {
  if (data.sessionId === props.sessionId) {
    plan.value = data.plan
  }
}

// Reload when session changes
watch(() => props.sessionId, () => {
  loadPlan()
}, { immediate: true })

onMounted(() => {
  unsubscribePlanUpdated = window.electronAPI.onPlanUpdated(handlePlanUpdated)
})

onUnmounted(() => {
  unsubscribePlanUpdated?.()
})
</script>

<style scoped>
.plan-panel {
  border-radius: 12px;
  border: 0.5px solid var(--border, rgba(255, 255, 255, 0.08));
  background: rgba(var(--bg-rgb, 30, 30, 35), 0.65);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  padding: 12px 14px;
  margin-bottom: 8px;
}

/* Light theme colors now controlled by theme variables */

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  user-select: none;
}

.plan-header:hover {
  opacity: 0.8;
}

.plan-header.no-border {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom-color: transparent;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-icon {
  color: var(--muted);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.collapse-icon.rotated {
  transform: rotate(-90deg);
}

.plan-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.plan-status {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.plan-status.completed {
  color: var(--color-success);
  background: var(--bg-tool-success);
}

.plan-status.processing {
  color: var(--accent);
  background: var(--bg-selected);
}

.plan-status.pending {
  color: var(--muted);
  background: var(--bg-hover);
}

.plan-progress {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 10px;
}

.plan-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
  padding: 4px 0;
  transition: opacity 0.2s ease;
}

.plan-item.completed {
  opacity: 0.7;
}

.plan-item.completed .item-content {
  text-decoration: line-through;
  text-decoration-color: var(--text);
  text-decoration-thickness: 1.5px;
}

.plan-item.in_progress {
  color: var(--accent);
}

.status-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-indicator.completed {
  background: var(--color-success-light, rgba(34, 197, 94, 0.15));
  color: var(--color-success, #22c55e);
}

.status-indicator.in_progress {
  background: var(--bg-selected, rgba(59, 130, 246, 0.15));
  color: var(--accent, #3b82f6);
  animation: pulse 2s infinite;
}

.status-indicator.pending .empty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bg-hover, rgba(120, 120, 128, 0.3));
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.item-number {
  color: var(--muted);
  font-size: 12px;
  min-width: 18px;
}

.item-content {
  flex: 1;
  color: var(--text);
}

.plan-item.in_progress .item-content {
  font-weight: 500;
}

/* Transition for panel - synced with composer border-radius transition */
.plan-slide-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.plan-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.plan-slide-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.plan-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Grid-based collapse/expand animation - GPU accelerated */
.plan-items-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.plan-items-wrapper.expanded {
  grid-template-rows: 1fr;
}

.plan-items-wrapper > .plan-items {
  min-height: 0;
  overflow: hidden;
}

/* Responsive */
@media (max-width: 600px) {
  .plan-panel {
    padding: 10px 12px;
  }

  .plan-item {
    font-size: 12px;
  }
}
</style>
