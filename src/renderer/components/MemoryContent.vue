<template>
  <div class="memory-content">
    <!-- Tabs -->
    <div class="memory-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'profile' }"
        @click="activeTab = 'profile'"
      >
        <User :size="14" :stroke-width="2" />
        User Profile
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'agent' }"
        @click="activeTab = 'agent'"
      >
        <Heart :size="14" :stroke-width="2" />
        Agent Memory
      </button>
      <button class="open-folder-btn" @click="openDataFolder" title="Open data folder">
        <FolderOpen :size="16" :stroke-width="2" />
      </button>
    </div>

    <!-- User Profile Tab -->
    <div v-if="activeTab === 'profile'" class="tab-content">
      <!-- Search & Add -->
      <div class="content-toolbar">
        <div class="search-wrapper">
          <Search class="search-icon" :size="14" :stroke-width="2" />
          <input
            v-model="factSearch"
            type="text"
            class="search-input"
            placeholder="Search facts..."
          />
        </div>
        <button class="add-btn" @click="showAddFactModal = true">
          <Plus :size="14" :stroke-width="2" />
          Add Fact
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="profileLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <span>Loading profile...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="!profile || filteredFacts.length === 0" class="empty-state">
        <div class="empty-icon">
          <User :size="48" :stroke-width="1.5" />
        </div>
        <p class="empty-title">No facts yet</p>
        <p class="empty-desc">Facts are learned from your conversations, or you can add them manually.</p>
        <button class="empty-action" @click="showAddFactModal = true">
          <Plus :size="14" :stroke-width="2" />
          Add Your First Fact
        </button>
      </div>

      <!-- Facts List -->
      <div v-else class="facts-container">
        <div v-for="category in factCategories" :key="category" class="category-section">
          <div
            class="category-header"
            @click="toggleCategory(category)"
          >
            <ChevronRight
              class="chevron"
              :class="{ expanded: expandedCategories.has(category) }"
              :size="16"
              :stroke-width="2"
            />
            <component :is="getCategoryIcon(category)" class="category-icon" :size="16" :stroke-width="2" />
            <span class="category-name">{{ getCategoryLabel(category) }}</span>
            <span class="category-count">{{ getFactsByCategory(category).length }}</span>
          </div>

          <Transition name="expand">
            <div v-if="expandedCategories.has(category)" class="category-content">
              <FactCard
                v-for="fact in getFactsByCategory(category)"
                :key="fact.id"
                :fact="fact"
                @update="handleUpdateFact"
                @delete="handleDeleteFact"
              />
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Agent Memory Tab -->
    <div v-if="activeTab === 'agent'" class="tab-content">
      <!-- Agent Selector -->
      <div class="agent-selector">
        <span class="selector-label">Select Agent</span>
        <div class="agent-chips">
          <AgentChip
            v-for="agent in agents"
            :key="agent.id"
            :agent="agent"
            :selected="selectedAgentId === agent.id"
            @select="selectAgent(agent.id)"
          />
        </div>
      </div>

      <!-- No Agent Selected -->
      <div v-if="!selectedAgentId" class="empty-state">
        <div class="empty-icon">
          <Heart :size="48" :stroke-width="1.5" />
        </div>
        <p class="empty-title">Select an agent</p>
        <p class="empty-desc">Choose an agent above to view your shared memories.</p>
      </div>

      <!-- Loading -->
      <div v-else-if="memoryLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <span>Loading memories...</span>
      </div>

      <!-- No Relationship -->
      <div v-else-if="!relationship" class="empty-state">
        <div class="empty-icon">
          <Heart :size="48" :stroke-width="1.5" />
        </div>
        <p class="empty-title">No memories yet</p>
        <p class="empty-desc">Start chatting with this agent to build memories together.</p>
      </div>

      <!-- Agent Memory Content -->
      <div v-else class="agent-memory-container">
        <!-- Relationship Card -->
        <div class="relationship-card">
          <div class="relationship-header">
            <span class="section-title">Relationship</span>
            <div class="mood-badge" :class="relationship.agentFeelings?.currentMood || 'neutral'">
              {{ getMoodEmoji(relationship.agentFeelings?.currentMood) }}
              {{ relationship.agentFeelings?.currentMood || 'neutral' }}
            </div>
          </div>

          <p v-if="relationship.agentFeelings?.notes" class="mood-notes">
            "{{ relationship.agentFeelings.notes }}"
          </p>

          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-header">
                <span class="stat-label">Trust</span>
                <span class="stat-value">{{ relationship.relationship.trustLevel }}%</span>
              </div>
              <div class="stat-bar">
                <div
                  class="stat-fill trust"
                  :style="{ width: relationship.relationship.trustLevel + '%' }"
                />
              </div>
            </div>

            <div class="stat-item">
              <div class="stat-header">
                <span class="stat-label">Familiarity</span>
                <span class="stat-value">{{ relationship.relationship.familiarity }}%</span>
              </div>
              <div class="stat-bar">
                <div
                  class="stat-fill familiarity"
                  :style="{ width: relationship.relationship.familiarity + '%' }"
                />
              </div>
            </div>

            <div class="stat-item inline">
              <span class="stat-label">Interactions</span>
              <span class="stat-value">{{ relationship.relationship.totalInteractions }}</span>
            </div>

            <div class="stat-item inline">
              <span class="stat-label">Last chat</span>
              <span class="stat-value">{{ formatRelativeTime(relationship.relationship.lastInteraction) }}</span>
            </div>
          </div>
        </div>

        <!-- Memories Section -->
        <div class="memories-section">
          <div class="section-header">
            <span class="section-title">Memories ({{ memories.length }})</span>
            <button class="add-btn small" @click="showAddMemoryModal = true">
              <Plus :size="12" :stroke-width="2" />
              Add
            </button>
          </div>

          <!-- Search Memories -->
          <div class="search-wrapper" v-if="memories.length > 0">
            <Search class="search-icon" :size="14" :stroke-width="2" />
            <input
              v-model="memorySearch"
              type="text"
              class="search-input"
              placeholder="Search memories..."
            />
          </div>

          <!-- Memories List -->
          <div v-if="filteredMemories.length === 0" class="empty-state small">
            <p class="empty-title">No memories</p>
            <p class="empty-desc">Add memories to help this agent remember important things.</p>
          </div>
          <div v-else class="memories-list">
            <MemoryCard
              v-for="memory in filteredMemories"
              :key="memory.id"
              :memory="memory"
              @delete="handleDeleteMemory"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AddFactModal
      :visible="showAddFactModal"
      @close="showAddFactModal = false"
      @save="handleAddFact"
    />

    <AddMemoryModal
      :visible="showAddMemoryModal"
      @close="showAddMemoryModal = false"
      @save="handleAddMemory"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserProfileStore } from '@/stores/user-profile'
import { useAgentMemoryStore } from '@/stores/agent-memory'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import type { UserFactCategory, AgentMemoryCategory } from '@/types'
import FactCard from './memory/FactCard.vue'
import MemoryCard from './memory/MemoryCard.vue'
import AgentChip from './memory/AgentChip.vue'
import AddFactModal from './memory/AddFactModal.vue'
import AddMemoryModal from './memory/AddMemoryModal.vue'
import {
  User,
  Heart,
  FolderOpen,
  Search,
  Plus,
  ChevronRight,
  CircleUser,
  Flag,
  Fingerprint,
  SlidersHorizontal
} from 'lucide-vue-next'

const userProfileStore = useUserProfileStore()
const agentMemoryStore = useAgentMemoryStore()
const customAgentsStore = useCustomAgentsStore()

// Tab state
const activeTab = ref<'profile' | 'agent'>('profile')

// User Profile state
const profileLoading = ref(false)
const factSearch = ref('')
const expandedCategories = ref<Set<string>>(new Set(['personal', 'preference', 'goal', 'trait']))
const showAddFactModal = ref(false)

// Agent Memory state
const selectedAgentId = ref('')
const memoryLoading = ref(false)
const memorySearch = ref('')
const showAddMemoryModal = ref(false)

// Computed - User Profile
const profile = computed(() => userProfileStore.profile)
const facts = computed(() => userProfileStore.facts)
const factCategories: UserFactCategory[] = ['personal', 'preference', 'goal', 'trait']

const filteredFacts = computed(() => {
  if (!factSearch.value.trim()) return facts.value
  const query = factSearch.value.toLowerCase()
  return facts.value.filter(f => f.content.toLowerCase().includes(query))
})

// Computed - Agent Memory
const agents = computed(() => customAgentsStore.customAgents)
const relationship = computed(() => agentMemoryStore.currentRelationship)
const memories = computed(() => agentMemoryStore.memories)

const filteredMemories = computed(() => {
  const sorted = [...memories.value].sort((a, b) => b.strength - a.strength)
  if (!memorySearch.value.trim()) return sorted
  const query = memorySearch.value.toLowerCase()
  return sorted.filter(m => m.content.toLowerCase().includes(query))
})

// Methods - User Profile
function getCategoryLabel(category: UserFactCategory): string {
  const labels: Record<UserFactCategory, string> = {
    personal: 'Personal',
    preference: 'Preferences',
    goal: 'Goals',
    trait: 'Traits'
  }
  return labels[category]
}

const categoryIcons = {
  personal: CircleUser,
  preference: SlidersHorizontal,
  goal: Flag,
  trait: Fingerprint
} as const

function getCategoryIcon(category: UserFactCategory) {
  return categoryIcons[category]
}

function getFactsByCategory(category: UserFactCategory) {
  const categoryFacts = filteredFacts.value.filter(f => f.category === category)
  return categoryFacts
}

function toggleCategory(category: string) {
  if (expandedCategories.value.has(category)) {
    expandedCategories.value.delete(category)
  } else {
    expandedCategories.value.add(category)
  }
  expandedCategories.value = new Set(expandedCategories.value)
}

async function handleAddFact(data: { content: string; category: UserFactCategory; confidence: number }) {
  await userProfileStore.addFact(data.content, data.category, data.confidence)
  showAddFactModal.value = false
}

async function handleUpdateFact(factId: string, updates: { content?: string; confidence?: number }) {
  await userProfileStore.updateFact(factId, updates)
}

async function handleDeleteFact(factId: string) {
  await userProfileStore.deleteFact(factId)
}

// Methods - Agent Memory
function selectAgent(agentId: string) {
  selectedAgentId.value = agentId
  loadAgentMemory()
}

async function loadAgentMemory() {
  if (!selectedAgentId.value) {
    agentMemoryStore.clearRelationship()
    return
  }
  memoryLoading.value = true
  try {
    await agentMemoryStore.loadRelationship(selectedAgentId.value)
  } finally {
    memoryLoading.value = false
  }
}

function getMoodEmoji(mood?: string): string {
  const emojis: Record<string, string> = {
    happy: '😊',
    neutral: '😐',
    concerned: '😟',
    excited: '🤩'
  }
  return emojis[mood || 'neutral'] || '😐'
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Never'
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

async function handleAddMemory(data: { content: string; category: AgentMemoryCategory; emotionalWeight: number }) {
  if (!selectedAgentId.value) return
  await agentMemoryStore.addMemory(selectedAgentId.value, data.content, data.category, data.emotionalWeight)
  showAddMemoryModal.value = false
}

async function handleDeleteMemory(memoryId: string) {
  const success = await agentMemoryStore.deleteMemory(memoryId)
  if (!success) {
    console.error('Failed to delete memory:', memoryId)
  }
}

// Open folder
async function openDataFolder() {
  try {
    const dataPath = await window.electronAPI.getDataPath()
    await window.electronAPI.openPath(dataPath)
  } catch (err) {
    console.error('Failed to open data folder:', err)
  }
}

// Load initial data
onMounted(async () => {
  profileLoading.value = true
  try {
    await userProfileStore.loadProfile()
    await customAgentsStore.loadCustomAgents()
  } finally {
    profileLoading.value = false
  }
})
</script>

<style scoped>
.memory-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Tabs */
.memory-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 20px;
}

.open-folder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: auto;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.open-folder-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent-main);
  color: var(--bg-app);
}

/* Tab Content */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* Content Toolbar */
.content-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.search-wrapper {
  flex: 1;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 36px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-faint);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.add-btn:hover {
  opacity: 0.9;
}

.add-btn.small {
  padding: 6px 12px;
  font-size: 12px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
  color: var(--text-muted);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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

.empty-state.small {
  padding: 30px 20px;
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.4;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 20px;
  max-width: 280px;
}

.empty-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.empty-action:hover {
  opacity: 0.9;
}

/* Facts Container */
.facts-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Category Section */
.category-section {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.category-header:hover {
  background: var(--hover);
}

.chevron {
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.chevron.expanded {
  transform: rotate(90deg);
}

.category-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.category-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.category-count {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--hover);
  color: var(--text-muted);
}

.category-content {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Expand Transition */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* Agent Selector */
.agent-selector {
  margin-bottom: 20px;
}

.selector-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.agent-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Agent Memory Container */
.agent-memory-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Relationship Card */
.relationship-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
}

.relationship-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.mood-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  text-transform: capitalize;
}

.mood-badge.happy {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.mood-badge.neutral {
  background: rgba(107, 114, 128, 0.15);
  color: #9ca3af;
}

.mood-badge.concerned {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.mood-badge.excited {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.mood-notes {
  font-size: 13px;
  font-style: italic;
  color: var(--text-secondary);
  margin: 0 0 16px;
  padding: 10px 14px;
  background: var(--hover);
  border-radius: 10px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-item.inline {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.stat-header {
  display: flex;
  justify-content: space-between;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-bar {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.stat-fill.trust {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

.stat-fill.familiarity {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

/* Memories Section */
.memories-section {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.memories-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
</style>
