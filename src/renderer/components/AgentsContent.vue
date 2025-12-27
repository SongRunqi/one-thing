<template>
  <div class="agents-content">
    <!-- Agent Detail Panel (when an agent is selected) -->
    <AgentDetailPanel
      v-if="selectedAgent"
      :agent="selectedAgent"
      @back="selectedAgent = null"
      @edit="editSelectedAgent"
      @deleted="selectedAgent = null"
    />

    <!-- Agent List (when no agent is selected) -->
    <template v-else>
    <!-- Header -->
    <div class="content-header">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search agents..."
      />
      <button class="create-btn" @click="$emit('create-agent')" title="Create Agent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- Agents List -->
    <div class="content-body">
      <!-- Loading State -->
      <div v-if="agentsStore.isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading agents...</p>
      </div>

      <!-- Agents Grid -->
      <template v-else-if="filteredAgents.length > 0">
        <!-- Pinned Section -->
        <div v-if="pinnedAgents.length > 0" class="agents-section">
          <h4 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            Pinned
          </h4>
          <div class="agents-grid">
            <div
              v-for="agent in pinnedAgents"
              :key="agent.id"
              class="agent-card"
              :class="{ selected: agentsStore.selectedAgentId === agent.id }"
              @click="selectAgent(agent)"
            >
              <div class="agent-avatar" :style="getAvatarStyle(agent)">
                <span v-if="agent.avatar.type === 'emoji'" class="avatar-emoji">
                  {{ agent.avatar.value }}
                </span>
                <img
                  v-else
                  :src="'file://' + agent.avatar.value"
                  class="avatar-image"
                  alt=""
                />
              </div>
              <div class="agent-info">
                <h5 class="agent-name">{{ agent.name }}</h5>
                <p v-if="agent.tagline" class="agent-tagline">{{ agent.tagline }}</p>
                <div v-if="agent.personality?.length" class="agent-tags">
                  <span v-for="tag in agent.personality.slice(0, 2)" :key="tag" class="tag">
                    {{ tag }}
                  </span>
                </div>
              </div>
              <div class="agent-actions">
                <button class="action-btn" @click.stop="togglePin(agent)" title="Unpin">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  </svg>
                </button>
                <button class="action-btn" @click.stop="$emit('edit-agent', agent)" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="action-btn danger" @click.stop="confirmDelete(agent)" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- All Agents Section -->
        <div class="agents-section">
          <h4 v-if="pinnedAgents.length > 0" class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            All Agents
          </h4>
          <div class="agents-grid">
            <div
              v-for="agent in unpinnedFilteredAgents"
              :key="agent.id"
              class="agent-card"
              :class="{ selected: agentsStore.selectedAgentId === agent.id }"
              @click="selectAgent(agent)"
            >
              <div class="agent-avatar" :style="getAvatarStyle(agent)">
                <span v-if="agent.avatar.type === 'emoji'" class="avatar-emoji">
                  {{ agent.avatar.value }}
                </span>
                <img
                  v-else
                  :src="'file://' + agent.avatar.value"
                  class="avatar-image"
                  alt=""
                />
              </div>
              <div class="agent-info">
                <h5 class="agent-name">{{ agent.name }}</h5>
                <p v-if="agent.tagline" class="agent-tagline">{{ agent.tagline }}</p>
                <div v-if="agent.personality?.length" class="agent-tags">
                  <span v-for="tag in agent.personality.slice(0, 2)" :key="tag" class="tag">
                    {{ tag }}
                  </span>
                </div>
              </div>
              <div class="agent-actions">
                <button class="action-btn" @click.stop="togglePin(agent)" title="Pin">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  </svg>
                </button>
                <button class="action-btn" @click.stop="$emit('edit-agent', agent)" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="action-btn danger" @click.stop="confirmDelete(agent)" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <p class="empty-text">No agents yet</p>
        <p class="empty-hint">Create your first AI agent to get started</p>
        <button class="empty-action" @click="$emit('create-agent')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Agent
        </button>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import AgentDetailPanel from './AgentDetailPanel.vue'
import type { Agent } from '@/types'

const emit = defineEmits<{
  'create-agent': []
  'edit-agent': [agent: Agent]
}>()

const agentsStore = useAgentsStore()
const searchQuery = ref('')
const selectedAgent = ref<Agent | null>(null)

// Filtered agents
const filteredAgents = computed(() => {
  if (!searchQuery.value) return agentsStore.agents
  const query = searchQuery.value.toLowerCase()
  return agentsStore.agents.filter(agent =>
    agent.name.toLowerCase().includes(query) ||
    agent.tagline?.toLowerCase().includes(query) ||
    agent.personality?.some(p => p.toLowerCase().includes(query))
  )
})

const pinnedAgents = computed(() =>
  filteredAgents.value.filter(a => agentsStore.pinnedAgentIds.includes(a.id))
)

const unpinnedFilteredAgents = computed(() =>
  filteredAgents.value.filter(a => !agentsStore.pinnedAgentIds.includes(a.id))
)

// Get avatar style with primary color
function getAvatarStyle(agent: Agent) {
  if (agent.primaryColor) {
    return {
      '--agent-color': agent.primaryColor,
      background: `${agent.primaryColor}20`
    }
  }
  return {}
}

// Click agent to show detail panel
function selectAgent(agent: Agent) {
  selectedAgent.value = agent
}

// Edit the selected agent (from detail panel)
function editSelectedAgent() {
  if (selectedAgent.value) {
    emit('edit-agent', selectedAgent.value)
  }
}

// Toggle pin status
async function togglePin(agent: Agent) {
  await agentsStore.togglePinAgent(agent.id)
}

// Confirm and delete agent
async function confirmDelete(agent: Agent) {
  const confirmed = confirm(`Delete agent "${agent.name}"? This action cannot be undone.`)
  if (confirmed) {
    await agentsStore.deleteAgent(agent.id)
  }
}
</script>

<style scoped>
.agents-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-header {
  display: flex;
  gap: 8px;
  padding: 16px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--muted);
}

.create-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.create-btn:hover {
  filter: brightness(1.1);
  transform: scale(1.02);
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Agents Section */
.agents-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px;
  padding: 0 4px;
}

/* Agents Grid */
.agents-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--hover);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-card:hover {
  background: var(--active);
  border-color: var(--border);
}

.agent-card.selected {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
}

.agent-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--active);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.avatar-emoji {
  font-size: 24px;
  line-height: 1;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-tagline {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-tags {
  display: flex;
  gap: 4px;
}

.tag {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  border-radius: 10px;
}

/* Agent Actions */
.agent-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.agent-card:hover .agent-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 20px;
}

.empty-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  background: var(--accent);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.empty-action:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
</style>
