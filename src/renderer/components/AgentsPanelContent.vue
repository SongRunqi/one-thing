<template>
  <div class="agents-panel">
    <header class="agents-header">
      <div class="agents-title">
        <Bot
          :size="21"
          :stroke-width="1.7"
        />
        <div>
          <h2>Agents</h2>
          <p>{{ agentsStore.agents.length }} configured</p>
        </div>
      </div>
      <button
        class="agents-primary-action"
        type="button"
        @click="startCreate"
      >
        <Plus
          :size="15"
          :stroke-width="2"
        />
        <span>New Agent</span>
      </button>
    </header>

    <div class="agents-layout">
      <aside class="agents-list">
        <div
          v-if="agentsStore.isLoading"
          class="agents-state"
        >
          Loading agents...
        </div>
        <div
          v-else-if="agentsStore.error"
          class="agents-state error"
        >
          {{ agentsStore.error }}
        </div>

        <button
          v-for="agent in agentsStore.agents"
          :key="agent.id"
          class="agent-item"
          :class="{ active: !isCreating && agent.id === activeAgentId }"
          type="button"
          @click="selectAgent(agent.id)"
        >
          <span class="agent-item-main">
            <span class="agent-item-name">{{ agent.name }}</span>
            <span class="agent-item-meta">
              {{ agent.isDefault ? 'Default' : formatUpdated(agent.updatedAt) }}
            </span>
          </span>
          <Check
            v-if="!isCreating && agent.id === activeAgentId"
            :size="15"
            :stroke-width="2.2"
          />
        </button>
      </aside>

      <section class="agent-editor">
        <div class="agent-editor-header">
          <div class="agent-editor-title">
            <h3>{{ isCreating ? 'New Agent' : selectedAgent?.name || 'Agent' }}</h3>
            <span>{{ isCreating ? 'Draft' : selectedAgent?.isDefault ? 'Default agent' : 'Custom agent' }}</span>
          </div>
          <button
            v-if="canDelete"
            class="agent-icon-button danger"
            type="button"
            title="Delete agent"
            :disabled="saving"
            @click="deleteSelectedAgent"
          >
            <Trash2
              :size="15"
              :stroke-width="2"
            />
          </button>
        </div>

        <label class="agent-field">
          <span>Name</span>
          <input
            v-model="formName"
            class="agent-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
          >
        </label>

        <label class="agent-field">
          <span>System Prompt</span>
          <textarea
            v-model="formPrompt"
            class="agent-textarea"
            rows="14"
            spellcheck="true"
          />
        </label>

        <p
          v-if="formError"
          class="agent-feedback error"
        >
          {{ formError }}
        </p>
        <p
          v-else-if="formFeedback"
          class="agent-feedback"
        >
          {{ formFeedback }}
        </p>

        <div class="agent-editor-actions">
          <button
            class="agent-secondary-action"
            type="button"
            :disabled="saving"
            @click="resetForm"
          >
            <X
              :size="15"
              :stroke-width="2"
            />
            <span>Cancel</span>
          </button>
          <button
            class="agents-primary-action"
            type="button"
            :disabled="saving"
            @click="saveAgent"
          >
            <Save
              :size="15"
              :stroke-width="2"
            />
            <span>{{ saving ? 'Saving' : 'Save' }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bot, Check, Plus, Save, Trash2, X } from 'lucide-vue-next'
import { DEFAULT_AGENT_ID, useAgentsStore } from '@/stores/agents'

const agentsStore = useAgentsStore()

const activeAgentId = ref(DEFAULT_AGENT_ID)
const isCreating = ref(false)
const saving = ref(false)
const formName = ref('')
const formPrompt = ref('')
const formError = ref('')
const formFeedback = ref('')

const selectedAgent = computed(() =>
  agentsStore.agents.find(agent => agent.id === activeAgentId.value) ||
  agentsStore.defaultAgent
)

const canDelete = computed(() =>
  !isCreating.value &&
  !!selectedAgent.value &&
  selectedAgent.value.id !== DEFAULT_AGENT_ID
)

function syncFormFromSelected() {
  if (isCreating.value) return
  const agent = selectedAgent.value
  formName.value = agent?.name || ''
  formPrompt.value = agent?.systemPrompt || ''
}

function selectAgent(agentId: string) {
  isCreating.value = false
  activeAgentId.value = agentId
  syncFormFromSelected()
  formError.value = ''
  formFeedback.value = ''
}

function startCreate() {
  isCreating.value = true
  activeAgentId.value = ''
  formName.value = 'New Agent'
  formPrompt.value = ''
  formError.value = ''
  formFeedback.value = ''
}

function resetForm() {
  if (isCreating.value) {
    isCreating.value = false
    activeAgentId.value = agentsStore.defaultAgent?.id || DEFAULT_AGENT_ID
  }
  syncFormFromSelected()
  formError.value = ''
  formFeedback.value = ''
}

async function saveAgent() {
  const name = formName.value.trim()
  if (!name) {
    formError.value = 'Name is required'
    return
  }

  saving.value = true
  formError.value = ''
  formFeedback.value = ''

  try {
    if (isCreating.value) {
      const agent = await agentsStore.createAgent(name, formPrompt.value)
      isCreating.value = false
      activeAgentId.value = agent.id
      formFeedback.value = 'Agent created'
    } else if (selectedAgent.value) {
      const agent = await agentsStore.updateAgent(selectedAgent.value.id, {
        name,
        systemPrompt: formPrompt.value,
      })
      activeAgentId.value = agent.id
      formFeedback.value = 'Agent saved'
    }
    syncFormFromSelected()
  } catch (err: any) {
    formError.value = err?.message || 'Failed to save agent'
  } finally {
    saving.value = false
  }
}

async function deleteSelectedAgent() {
  const agent = selectedAgent.value
  if (!agent || agent.id === DEFAULT_AGENT_ID) return
  if (!window.confirm(`Delete ${agent.name}?`)) return

  saving.value = true
  formError.value = ''
  formFeedback.value = ''

  try {
    await agentsStore.deleteAgent(agent.id)
    activeAgentId.value = agentsStore.defaultAgent?.id || agentsStore.agents[0]?.id || DEFAULT_AGENT_ID
    isCreating.value = false
    syncFormFromSelected()
    formFeedback.value = 'Agent deleted'
  } catch (err: any) {
    formError.value = err?.message || 'Failed to delete agent'
  } finally {
    saving.value = false
  }
}

function formatUpdated(timestamp: number): string {
  if (!timestamp) return 'Custom'
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

watch(selectedAgent, syncFormFromSelected, { immediate: true })

onMounted(async () => {
  try {
    await agentsStore.loadAgents()
    if (!agentsStore.agents.some(agent => agent.id === activeAgentId.value)) {
      activeAgentId.value = agentsStore.defaultAgent?.id || agentsStore.agents[0]?.id || DEFAULT_AGENT_ID
    }
    syncFormFromSelected()
  } catch {
    // Store error is rendered above.
  }
})
</script>

<style scoped>
.agents-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-surface-app-bg, var(--bg));
}

.agents-header {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 58%, transparent);
}

.agents-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.agents-title svg {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
}

.agents-title h2,
.agent-editor-title h3 {
  margin: 0;
  line-height: 1.2;
  letter-spacing: 0;
}

.agents-title h2 {
  font-size: 20px;
  font-weight: 720;
}

.agents-title p,
.agent-editor-title span {
  margin: 3px 0 0;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.agents-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(190px, 270px) minmax(0, 1fr);
}

.agents-list {
  min-width: 0;
  overflow: auto;
  padding: 12px;
  border-right: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 58%, transparent);
}

.agent-item {
  width: 100%;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  text-align: left;
  cursor: pointer;
}

.agent-item:hover,
.agent-item.active {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 72%, transparent);
}

.agent-item.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 9%, var(--ui-state-hover-bg, var(--hover)));
}

.agent-item-main {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.agent-item-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
}

.agent-item-meta {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.agents-state {
  padding: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.agents-state.error,
.agent-feedback.error {
  color: var(--ui-status-danger-fg, #ef4444);
}

.agent-editor {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 22px 22px;
}

.agent-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-editor-title {
  min-width: 0;
}

.agent-editor-title h3 {
  overflow-wrap: anywhere;
  font-size: 16px;
  font-weight: 700;
}

.agent-field {
  display: grid;
  gap: 7px;
}

.agent-field span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  font-weight: 650;
}

.agent-input,
.agent-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  font: inherit;
}

.agent-input {
  height: 36px;
  padding: 0 10px;
}

.agent-textarea {
  flex: 1;
  min-height: 260px;
  resize: vertical;
  padding: 10px;
  line-height: 1.48;
}

.agent-input:focus,
.agent-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 48%, var(--ui-border-default-border, var(--border)));
}

.agent-feedback {
  min-height: 17px;
  margin: 0;
  color: var(--ui-status-success-fg, var(--text-success, var(--text)));
  font-size: 12px;
}

.agent-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.agents-primary-action,
.agent-secondary-action,
.agent-icon-button {
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.agents-primary-action,
.agent-secondary-action {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.agents-primary-action {
  background: var(--ui-action-primary-bg, var(--accent));
  color: var(--ui-action-primary-fg, var(--text-btn-primary));
}

.agent-secondary-action {
  background: var(--ui-action-ghost-bg, var(--hover));
  color: var(--ui-action-ghost-fg, var(--muted));
  border-color: var(--ui-border-default-border, var(--border));
}

.agent-icon-button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
}

.agents-primary-action:hover:not(:disabled) {
  background: var(--ui-action-primary-hover-bg, var(--bg-btn-primary-hover));
}

.agent-secondary-action:hover:not(:disabled),
.agent-icon-button:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.agent-icon-button.danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, #ef4444);
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 12%, transparent);
}

.agents-primary-action:disabled,
.agent-secondary-action:disabled,
.agent-icon-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .agents-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .agents-layout {
    grid-template-columns: 1fr;
  }

  .agents-list {
    max-height: 220px;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 58%, transparent);
  }
}
</style>
