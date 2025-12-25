<template>
  <div :class="['skill-item', { expanded }]">
    <div class="skill-header" @click="$emit('toggle-expand')">
      <div class="skill-info">
        <div class="skill-name">{{ skill.name }}</div>
        <div class="skill-description">{{ skill.description }}</div>
      </div>
      <div class="skill-actions" @click.stop>
        <label class="toggle small" title="Enable/Disable">
          <input
            type="checkbox"
            :checked="skill.enabled"
            @change="$emit('toggle-enabled', skill.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-slider"></span>
        </label>
        <button
          class="icon-btn small"
          @click="$emit('open-directory', skill.id)"
          title="Open in file manager"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </button>
        <button
          class="icon-btn small danger"
          @click="$emit('delete', skill)"
          title="Delete skill"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
        <svg
          class="expand-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>

    <div v-if="expanded" class="skill-expanded">
      <div class="skill-meta">
        <span class="meta-label">Name:</span>
        <span class="meta-value">{{ skill.name }}</span>
      </div>
      <div class="skill-meta">
        <span class="meta-label">Description:</span>
        <span class="meta-value description-full">{{ skill.description }}</span>
      </div>
      <div v-if="skill.allowedTools?.length" class="skill-meta">
        <span class="meta-label">Allowed Tools:</span>
        <span class="meta-value">{{ skill.allowedTools.join(', ') }}</span>
      </div>
      <div v-if="skill.files?.length" class="skill-meta">
        <span class="meta-label">Files:</span>
        <span class="meta-value">{{ skill.files.map((f: any) => f.name).join(', ') }}</span>
      </div>
      <div v-if="skill.instructions" class="skill-instructions">
        <span class="meta-label">Instructions:</span>
        <pre class="instructions-content">{{ skill.instructions }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SkillDefinition } from '@/types'

defineProps<{
  skill: SkillDefinition
  expanded: boolean
}>()

defineEmits<{
  (e: 'toggle-expand'): void
  (e: 'toggle-enabled', skillId: string, enabled: boolean): void
  (e: 'delete', skill: SkillDefinition): void
  (e: 'open-directory', skillId: string): void
}>()
</script>

<style scoped>
.skill-item {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s ease;
}

.skill-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.skill-item.expanded {
  border-color: var(--accent);
}

.skill-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  gap: 12px;
}

.skill-info {
  flex: 1;
  min-width: 0;
  user-select: none;
}

.skill-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.skill-description {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.expand-chevron {
  transition: transform 0.2s ease;
  color: var(--text-muted);
}

.skill-item.expanded .expand-chevron {
  transform: rotate(180deg);
}

.skill-expanded {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border);
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

.skill-meta {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
}

.meta-label {
  color: var(--text-muted);
  font-weight: 500;
}

.meta-value {
  color: var(--text-primary);
}

.meta-value.description-full {
  display: block;
  margin-top: 4px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.skill-instructions {
  margin-top: 12px;
}

.instructions-content {
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: var(--hover);
  padding: 12px;
  border-radius: 8px;
  margin: 8px 0 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  max-height: 200px;
  overflow-y: auto;
}

/* Toggle styles */
.toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
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
  border-radius: 10px;
  transition: 0.2s;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle input:checked + .toggle-slider {
  background-color: var(--accent);
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(16px);
}

/* Icon button */
.icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.icon-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
</style>
