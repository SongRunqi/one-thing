<template>
  <div class="agent-welcome">
    <div class="welcome-content">
      <!-- Agent Avatar -->
      <div
        class="agent-avatar-large"
        :style="agent.primaryColor ? { background: `${agent.primaryColor}20` } : {}"
      >
        <span v-if="agent.avatar.type === 'emoji'" class="avatar-emoji">
          {{ agent.avatar.value }}
        </span>
        <img
          v-else
          :src="getImageSrc(agent.avatar.value)"
          class="avatar-image"
          alt=""
        />
      </div>

      <!-- Agent Name -->
      <h1 class="agent-name">{{ agent.name }}</h1>

      <!-- Tagline -->
      <p v-if="agent.tagline" class="agent-tagline">{{ agent.tagline }}</p>

      <!-- Personality Tags -->
      <div v-if="agent.personality && agent.personality.length > 0" class="personality-tags">
        <span
          v-for="tag in agent.personality"
          :key="tag"
          class="personality-tag"
          :style="agent.primaryColor ? {
            background: `${agent.primaryColor}20`,
            color: agent.primaryColor
          } : {}"
        >
          {{ tag }}
        </span>
      </div>

      <!-- System Prompt Preview (if no tagline) -->
      <p v-if="!agent.tagline && agent.systemPrompt" class="system-prompt-preview">
        {{ truncatedPrompt }}
      </p>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button
          class="btn primary"
          :style="agent.primaryColor ? { background: agent.primaryColor } : {}"
          @click="$emit('start-chat')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Start New Chat
        </button>

        <button class="btn secondary" @click="$emit('open-settings')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          Edit Agent
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Agent } from '@/types'

const props = defineProps<{
  agent: Agent
}>()

defineEmits<{
  'start-chat': []
  'open-settings': []
}>()

const truncatedPrompt = computed(() => {
  const prompt = props.agent.systemPrompt || ''
  if (prompt.length <= 200) return prompt
  return prompt.slice(0, 200).trim() + '...'
})

function getImageSrc(value: string): string {
  if (value.startsWith('data:')) {
    return value
  }
  return 'file://' + value
}
</script>

<style scoped>
.agent-welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
  padding-bottom: 120px; /* Space for input box */
  user-select: none;
}

.welcome-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
}

.agent-avatar-large {
  width: 100px;
  height: 100px;
  border-radius: 24px;
  background: var(--hover);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.avatar-emoji {
  font-size: 56px;
  line-height: 1;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 24px;
}

.agent-name {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.agent-tagline {
  font-size: 16px;
  color: var(--text-muted);
  margin: 0 0 16px;
  line-height: 1.5;
}

.personality-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.personality-tag {
  padding: 6px 14px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.system-prompt-preview {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0 0 32px;
  padding: 16px 20px;
  background: var(--hover);
  border-radius: 12px;
  max-width: 100%;
  font-style: italic;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover {
  filter: brightness(1.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(var(--accent-rgb), 0.3);
}

.btn.secondary {
  background: var(--hover);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--active);
  transform: translateY(-2px);
}

@media (max-width: 480px) {
  .agent-avatar-large {
    width: 80px;
    height: 80px;
  }

  .avatar-emoji {
    font-size: 44px;
  }

  .agent-name {
    font-size: 24px;
  }

  .action-buttons {
    flex-direction: column;
    width: 100%;
  }

  .btn {
    width: 100%;
  }
}
</style>
