<template>
  <div class="retrieved-memories-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header" @click="toggleCollapse">
      <div class="header-left">
        <svg class="icon brain" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a9 9 0 0 1 9 9c0 3.86-3.14 7-7 7h-2a7 7 0 0 1-7-7 9 9 0 0 1 9-9z"/>
          <path d="M12 2c-1.5 0-3 .5-4 1.5a5 5 0 0 0-1 3.5"/>
          <path d="M9 18v4"/>
          <path d="M15 18v4"/>
        </svg>
        <span class="title">Retrieved Memories</span>
        <span class="count">({{ memories.length }})</span>
      </div>
      <div class="header-right">
        <svg
          class="chevron"
          :class="{ rotated: !isCollapsed }"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>

    <Transition name="slide">
      <div v-show="!isCollapsed" class="panel-content">
        <div
          v-for="mem in memories"
          :key="mem.path"
          class="memory-item"
          :class="{ 'has-feedback': feedbackGiven[mem.path] }"
        >
          <div class="memory-info">
            <span class="memory-title" :title="mem.path">{{ mem.title }}</span>
            <div class="memory-meta">
              <span class="match-badge" :class="mem.matchType">
                {{ matchTypeLabel[mem.matchType] }}
              </span>
              <span class="score">{{ Math.round(mem.score) }}%</span>
            </div>
          </div>

          <div class="feedback-buttons" v-if="!feedbackGiven[mem.path]">
            <button
              class="feedback-btn positive"
              @click.stop="giveFeedback(mem.path, 'positive')"
              :disabled="isSubmitting[mem.path]"
              title="Helpful"
            >
              👍
            </button>
            <button
              class="feedback-btn negative"
              @click.stop="giveFeedback(mem.path, 'negative')"
              :disabled="isSubmitting[mem.path]"
              title="Not Helpful"
            >
              👎
            </button>
          </div>
          <div v-else class="feedback-status">
            <span :class="feedbackGiven[mem.path]">
              {{ feedbackGiven[mem.path] === 'positive' ? '👍' : '👎' }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { RetrievedMemory } from '@shared/ipc'

interface Props {
  memories: RetrievedMemory[]
}

defineProps<Props>()

const isCollapsed = ref(true)
const feedbackGiven = reactive<Record<string, 'positive' | 'negative'>>({})
const isSubmitting = reactive<Record<string, boolean>>({})

const matchTypeLabel: Record<string, string> = {
  tag: 'Tag',
  keyword: 'Keyword',
  related: 'Related',
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

async function giveFeedback(path: string, type: 'positive' | 'negative') {
  if (isSubmitting[path] || feedbackGiven[path]) return

  isSubmitting[path] = true
  try {
    const result = await window.electronAPI.recordMemoryFeedback(path, type)
    if (result.success) {
      feedbackGiven[path] = type
      console.log(`[RetrievedMemories] Feedback recorded: ${type} for ${path}`)
    } else {
      console.error(`[RetrievedMemories] Failed to record feedback:`, result.error)
    }
  } catch (error) {
    console.error(`[RetrievedMemories] Error recording feedback:`, error)
  } finally {
    isSubmitting[path] = false
  }
}
</script>

<style scoped>
.retrieved-memories-panel {
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 10px;
  margin: 8px 0;
  overflow: hidden;
  transition: all 0.2s ease;
}

.retrieved-memories-panel:hover {
  border-color: rgba(139, 92, 246, 0.35);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background: rgba(139, 92, 246, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon.brain {
  color: rgb(139, 92, 246);
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.count {
  font-size: 12px;
  color: var(--muted);
}

.chevron {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.chevron.rotated {
  transform: rotate(90deg);
}

.panel-content {
  padding: 0 14px 12px;
}

.memory-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-top: 6px;
  background: rgba(139, 92, 246, 0.05);
  border-radius: 6px;
  transition: background 0.15s ease;
}

.memory-item:hover {
  background: rgba(139, 92, 246, 0.1);
}

.memory-item.has-feedback {
  opacity: 0.7;
}

.memory-info {
  flex: 1;
  min-width: 0;
}

.memory-title {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memory-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.match-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  text-transform: uppercase;
}

.match-badge.tag {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(34, 197, 94);
}

.match-badge.keyword {
  background: rgba(59, 130, 246, 0.15);
  color: rgb(59, 130, 246);
}

.match-badge.related {
  background: rgba(234, 179, 8, 0.15);
  color: rgb(180, 140, 8);
}

.score {
  font-size: 11px;
  color: var(--muted);
}

.feedback-buttons {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.feedback-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.feedback-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.15);
  transform: scale(1.1);
}

.feedback-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feedback-btn.positive:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.2);
}

.feedback-btn.negative:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
}

.feedback-status {
  margin-left: 12px;
  font-size: 16px;
}

/* Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Light mode adjustments */
html[data-theme='light'] .retrieved-memories-panel {
  background: rgba(139, 92, 246, 0.04);
  border-color: rgba(139, 92, 246, 0.15);
}

html[data-theme='light'] .memory-item {
  background: rgba(139, 92, 246, 0.06);
}

html[data-theme='light'] .memory-item:hover {
  background: rgba(139, 92, 246, 0.1);
}

html[data-theme='light'] .match-badge.related {
  color: rgb(161, 98, 7);
}
</style>
