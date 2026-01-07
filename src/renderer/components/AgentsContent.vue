<template>
  <div class="agents-content">
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
      <button class="refresh-btn" @click="refreshAgents" title="Refresh Agents">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: isRefreshing }">
          <polyline points="23 4 23 10 17 10"/>
          <polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
    </div>

    <!-- Agents List -->
    <div class="content-body">
      <!-- Loading State -->
      <div v-if="customAgentsStore.isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading agents...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="customAgentsStore.error" class="error-state">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p class="error-text">{{ customAgentsStore.error }}</p>
        <button class="retry-btn" @click="refreshAgents">
          Retry
        </button>
      </div>

      <!-- Agents Sections -->
      <template v-else-if="filteredAgents.length > 0">
        <!-- User Agents Section -->
        <div v-if="filteredUserAgents.length > 0" class="agents-section">
          <h4 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            User Agents
            <span class="section-count">{{ filteredUserAgents.length }}</span>
          </h4>
          <div class="agents-list">
            <CustomAgentCard
              v-for="agent in filteredUserAgents"
              :key="agent.id"
              :agent="agent"
              :selected="selectedAgentId === agent.id"
              :enabled="isAgentEnabled(agent.id)"
              @select="selectAgent"
              @edit="editAgent"
              @delete="confirmDelete"
              @toggle="toggleAgentEnabled"
            />
          </div>
        </div>

        <!-- Project Agents Section -->
        <div v-if="filteredProjectAgents.length > 0" class="agents-section">
          <h4 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Project Agents
            <span class="section-count">{{ filteredProjectAgents.length }}</span>
          </h4>
          <div class="agents-list">
            <CustomAgentCard
              v-for="agent in filteredProjectAgents"
              :key="agent.id"
              :agent="agent"
              :selected="selectedAgentId === agent.id"
              :enabled="isAgentEnabled(agent.id)"
              @select="selectAgent"
              @edit="editAgent"
              @delete="confirmDelete"
              @toggle="toggleAgentEnabled"
            />
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <p class="empty-text">{{ searchQuery ? 'No agents found' : 'No agents yet' }}</p>
        <p class="empty-hint">
          {{ searchQuery
            ? 'Try adjusting your search query'
            : 'Create your first custom agent with specialized tools'
          }}
        </p>
        <button v-if="!searchQuery" class="empty-action" @click="$emit('create-agent')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Agent
        </button>
        <button v-if="!searchQuery" class="open-folder-btn" @click="openAgentsFolder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open Agents Folder
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import { useSettingsStore } from '@/stores/settings'
import CustomAgentCard from './CustomAgentCard.vue'
import type { CustomAgent } from '@/types'

const emit = defineEmits<{
  'create-agent': []
  'edit-agent': [agent: CustomAgent]
}>()

const customAgentsStore = useCustomAgentsStore()
const settingsStore = useSettingsStore()
const searchQuery = ref('')
const selectedAgentId = ref<string | null>(null)
const isRefreshing = ref(false)

// Check if an agent is enabled (default to true if not set)
function isAgentEnabled(agentId: string): boolean {
  return settingsStore.settings?.tools?.agents?.[agentId]?.enabled ?? true
}

// Toggle agent enabled state
async function toggleAgentEnabled(agent: CustomAgent) {
  if (!settingsStore.settings?.tools) return

  // Initialize agents object if needed
  if (!settingsStore.settings.tools.agents) {
    settingsStore.settings.tools.agents = {}
  }

  // Toggle the enabled state
  const currentEnabled = isAgentEnabled(agent.id)
  settingsStore.settings.tools.agents[agent.id] = {
    enabled: !currentEnabled
  }

  // Save settings
  await settingsStore.saveSettings(settingsStore.settings)

  // Refresh async tools to update the ToolsMenu
  await window.electronAPI.refreshAsyncTools()
}

// Load agents on mount
onMounted(async () => {
  await customAgentsStore.loadCustomAgents()
})

// Filtered agents based on search
const filteredAgents = computed(() => {
  if (!searchQuery.value) return customAgentsStore.customAgents
  const query = searchQuery.value.toLowerCase()
  return customAgentsStore.customAgents.filter(agent =>
    agent.name.toLowerCase().includes(query) ||
    agent.description?.toLowerCase().includes(query) ||
    agent.customTools.some(t => t.name.toLowerCase().includes(query))
  )
})

const filteredUserAgents = computed(() =>
  filteredAgents.value.filter(a => a.source === 'user')
)

const filteredProjectAgents = computed(() =>
  filteredAgents.value.filter(a => a.source === 'project')
)

// Select an agent
function selectAgent(agent: CustomAgent) {
  selectedAgentId.value = selectedAgentId.value === agent.id ? null : agent.id
}

// Edit agent
function editAgent(agent: CustomAgent) {
  emit('edit-agent', agent)
}

// Refresh agents from backend
async function refreshAgents() {
  isRefreshing.value = true
  await customAgentsStore.refreshCustomAgents()
  isRefreshing.value = false
}

// Confirm and delete agent
async function confirmDelete(agent: CustomAgent) {
  const confirmed = confirm(`Delete agent "${agent.name}"? This action cannot be undone.`)
  if (confirmed) {
    const success = await customAgentsStore.deleteCustomAgent(agent.id)
    if (success && selectedAgentId.value === agent.id) {
      selectedAgentId.value = null
    }
  }
}

// Open agents folder in file explorer
async function openAgentsFolder() {
  await customAgentsStore.openAgentsDirectory()
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

.create-btn,
.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.create-btn {
  background: var(--accent);
  color: white;
}

.create-btn:hover {
  filter: brightness(1.1);
  transform: scale(1.02);
}

.refresh-btn {
  background: var(--hover);
  color: var(--muted);
}

.refresh-btn:hover {
  background: var(--active);
  color: var(--text);
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
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

/* Error State */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.error-icon {
  color: #ef4444;
  opacity: 0.7;
  margin-bottom: 16px;
}

.error-text {
  font-size: 14px;
  color: #ef4444;
  margin: 0 0 16px;
}

.retry-btn {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.retry-btn:hover {
  background: var(--active);
  border-color: var(--accent);
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

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text);
  background: var(--active);
  border-radius: 9px;
}

/* Agents List */
.agents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  margin-bottom: 12px;
}

.empty-action:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.open-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.open-folder-btn:hover {
  color: var(--text);
  background: var(--hover);
  border-color: var(--accent);
}
</style>
