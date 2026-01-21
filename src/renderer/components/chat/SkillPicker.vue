<template>
  <div
    v-if="visible && filteredSkills.length > 0"
    class="skill-picker"
  >
    <div class="skill-picker-header">
      <span class="title">Available Skills</span>
      <span class="count">{{ filteredSkills.length }}</span>
    </div>
    <div class="skill-list">
      <div
        v-for="(skill, index) in filteredSkills"
        :key="skill.id"
        :class="['skill-item', { selected: index === selectedIndex }]"
        @click="selectSkill(skill)"
        @mouseenter="selectedIndex = index"
      >
        <div class="skill-icon">
          <svg
            v-if="skill.source === 'user'"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle
              cx="12"
              cy="7"
              r="4"
            />
          </svg>
          <svg
            v-else
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        </div>
        <div class="skill-info">
          <div class="skill-name">
            {{ skill.name }}
          </div>
          <div class="skill-description">
            {{ skill.description }}
          </div>
        </div>
        <div
          class="skill-source-badge"
          :class="skill.source"
        >
          {{ skill.source === 'user' ? 'User' : 'Project' }}
        </div>
      </div>
    </div>
    <div class="skill-picker-hint">
      <span>Claude reads skills via Bash when relevant</span>
      <span><kbd>Esc</kbd> to close</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { SkillDefinition } from '@/types'

interface Props {
  visible: boolean
  query: string
  skills: SkillDefinition[]
}

interface Emits {
  (e: 'select', skill: SkillDefinition): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedIndex = ref(0)

// Filter skills by query (match name or description)
const filteredSkills = computed(() => {
  const q = props.query.toLowerCase()
  return props.skills
    .filter(skill => skill.enabled)
    .filter(skill => {
      // Match by name
      if (skill.name.toLowerCase().includes(q)) {
        return true
      }
      // Match by description
      if (skill.description.toLowerCase().includes(q)) {
        return true
      }
      return false
    })
})

// Reset selected index when query changes
watch(() => props.query, () => {
  selectedIndex.value = 0
})

// Handle keyboard navigation
function handleKeyDown(e: KeyboardEvent) {
  if (!props.visible) return

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = Math.max(0, selectedIndex.value - 1)
      break
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = Math.min(filteredSkills.value.length - 1, selectedIndex.value + 1)
      break
    case 'Tab':
    case 'Enter':
      if (filteredSkills.value.length > 0) {
        e.preventDefault()
        selectSkill(filteredSkills.value[selectedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      emit('close')
      break
  }
}

function selectSkill(skill: SkillDefinition) {
  emit('select', skill)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.skill-picker {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  margin-bottom: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 100;
  animation: slideUp 0.15s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.skill-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.skill-picker-header .title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-picker-header .count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 10px;
  color: var(--muted);
}

.skill-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
}

.skill-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.skill-item:hover,
.skill-item.selected {
  background: var(--hover);
}

.skill-item.selected {
  background: rgba(59, 130, 246, 0.15);
}

.skill-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover);
  border-radius: 6px;
  color: var(--muted);
  flex-shrink: 0;
  margin-top: 2px;
}

.skill-item.selected .skill-icon {
  background: rgba(59, 130, 246, 0.2);
  color: var(--accent);
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.skill-description {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-source-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 2px;
}

.skill-source-badge.user {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.skill-source-badge.project {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.skill-picker-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}

.skill-picker-hint kbd {
  display: inline-block;
  padding: 2px 5px;
  background: var(--hover);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 10px;
  margin: 0 2px;
}
</style>
