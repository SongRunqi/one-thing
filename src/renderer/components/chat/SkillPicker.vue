<template>
  <div class="skill-picker" v-if="visible && filteredSkills.length > 0">
    <div class="skill-picker-header">
      <span class="title">Skills</span>
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
          <svg v-if="skill.type === 'prompt-template'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
        </div>
        <div class="skill-info">
          <div class="skill-name">{{ skill.name }}</div>
          <div class="skill-triggers">{{ skill.triggers.join(', ') }}</div>
        </div>
        <div class="skill-type-badge" :class="skill.type">
          {{ skill.type === 'prompt-template' ? 'Template' : 'Workflow' }}
        </div>
      </div>
    </div>
    <div class="skill-picker-hint">
      <span><kbd>Tab</kbd> or <kbd>Enter</kbd> to select</span>
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

// Filter skills by query
const filteredSkills = computed(() => {
  const q = props.query.toLowerCase()
  return props.skills.filter(skill => {
    // Match by trigger
    for (const trigger of skill.triggers) {
      if (trigger.toLowerCase().startsWith(q)) {
        return true
      }
    }
    // Match by name
    if (skill.name.toLowerCase().includes(q)) {
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
  align-items: center;
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
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-triggers {
  font-size: 11px;
  color: var(--muted);
  font-family: 'SF Mono', 'Monaco', monospace;
  margin-top: 1px;
}

.skill-type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.skill-type-badge.prompt-template {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.skill-type-badge.workflow {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
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
