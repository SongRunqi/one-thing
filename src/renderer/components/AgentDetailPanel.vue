<template>
  <div class="agent-detail-panel">
    <!-- Header with back button -->
    <div class="detail-header">
      <button class="back-btn" @click="$emit('back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <span class="header-title">Agent</span>
      <div class="header-actions">
        <button class="action-btn" @click="togglePin" :title="isPinned ? 'Unpin' : 'Pin'">
          <svg width="18" height="18" viewBox="0 0 24 24" :fill="isPinned ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
        </button>
        <button class="action-btn" @click="$emit('edit')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Agent Info -->
    <div class="detail-content">
      <!-- Avatar Section -->
      <div class="avatar-section">
        <div
          class="agent-avatar"
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
        <h1 class="agent-name">{{ agent.name }}</h1>
        <p v-if="agent.tagline" class="agent-tagline">{{ agent.tagline }}</p>
      </div>

      <!-- Personality Tags -->
      <div v-if="agent.personality?.length" class="personality-section">
        <div class="personality-tags">
          <span
            v-for="tag in agent.personality"
            :key="tag"
            class="personality-tag"
            :style="agent.primaryColor ? {
              background: `${agent.primaryColor}15`,
              color: agent.primaryColor,
              borderColor: `${agent.primaryColor}30`
            } : {}"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- System Prompt Section -->
      <div class="section">
        <div class="section-header" @click="togglePromptExpand">
          <h3 class="section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            System Prompt
          </h3>
          <svg
            class="chevron"
            :class="{ expanded: promptExpanded }"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="prompt-content" :class="{ expanded: promptExpanded }">
          <pre class="prompt-text">{{ agent.systemPrompt || 'No system prompt set' }}</pre>
        </div>
      </div>

      <!-- Voice Section (if has voice settings) -->
      <div v-if="agent.voice?.enabled" class="section">
        <h3 class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          Voice
        </h3>
        <div class="voice-info">
          <span class="voice-name">{{ agent.voice.voiceURI || 'Default' }}</span>
          <span v-if="agent.voice.rate" class="voice-setting">Speed: {{ agent.voice.rate }}x</span>
        </div>
      </div>

      <!-- Primary Color Section -->
      <div v-if="agent.primaryColor" class="section">
        <h3 class="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0 0 0 20"/>
          </svg>
          Theme Color
        </h3>
        <div class="color-display">
          <div class="color-swatch" :style="{ background: agent.primaryColor }"></div>
          <span class="color-value">{{ agent.primaryColor }}</span>
        </div>
      </div>

      <!-- Stats Section -->
      <div class="section stats-section">
        <div class="stat-item">
          <span class="stat-value">{{ agent.systemPrompt?.length || 0 }}</span>
          <span class="stat-label">chars in prompt</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ agent.personality?.length || 0 }}</span>
          <span class="stat-label">traits</span>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="detail-footer">
      <button
        class="btn primary"
        :style="agent.primaryColor ? { background: agent.primaryColor } : {}"
        @click="startChat"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Start Chat
      </button>
      <button class="btn danger" @click="confirmDelete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Delete
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import type { Agent } from '@/types'

const props = defineProps<{
  agent: Agent
}>()

const emit = defineEmits<{
  back: []
  edit: []
  deleted: []
}>()

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()

const promptExpanded = ref(false)

const isPinned = computed(() =>
  agentsStore.pinnedAgentIds.includes(props.agent.id)
)

function getImageSrc(value: string): string {
  if (value.startsWith('data:')) {
    return value
  }
  return 'file://' + value
}

function togglePromptExpand() {
  promptExpanded.value = !promptExpanded.value
}

async function togglePin() {
  await agentsStore.togglePinAgent(props.agent.id)
}

async function startChat() {
  // Select this agent and create a new chat
  agentsStore.selectAgent(props.agent.id)
  await sessionsStore.createSession('New Chat', props.agent.id)
}

async function confirmDelete() {
  const confirmed = confirm(`Delete agent "${props.agent.name}"? This action cannot be undone.`)
  if (confirmed) {
    await agentsStore.deleteAgent(props.agent.id)
    emit('deleted')
  }
}
</script>

<style scoped>
.agent-detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Header */
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--hover);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: var(--active);
}

.header-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

/* Content */
.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
}

/* Avatar Section */
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 24px;
}

.agent-avatar {
  width: 96px;
  height: 96px;
  border-radius: 24px;
  background: var(--hover);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.avatar-emoji {
  font-size: 52px;
  line-height: 1;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 24px;
}

.agent-name {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 6px;
}

.agent-tagline {
  font-size: 14px;
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
}

/* Personality Section */
.personality-section {
  margin-bottom: 24px;
}

.personality-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.personality-tag {
  padding: 6px 14px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

/* Section */
.section {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--hover);
  border-radius: 14px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-title svg {
  color: var(--muted);
}

.chevron {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.chevron.expanded {
  transform: rotate(180deg);
}

/* Prompt Content */
.prompt-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.prompt-content.expanded {
  max-height: 400px;
  overflow-y: auto;
  margin-top: 12px;
}

.prompt-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 12px;
  background: var(--bg);
  border-radius: 10px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
}

/* Voice Info */
.voice-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.voice-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.voice-setting {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 8px;
  background: var(--bg);
  border-radius: 6px;
}

/* Color Display */
.color-display {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.color-value {
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: var(--muted);
}

/* Stats Section */
.stats-section {
  display: flex;
  gap: 16px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.stat-label {
  font-size: 12px;
  color: var(--muted);
}

/* Footer */
.detail-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border);
}

.btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
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
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(var(--accent-rgb), 0.3);
}

.btn.danger {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}
</style>
