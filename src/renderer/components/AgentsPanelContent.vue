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
      <Button
        unstyled
        class="agents-primary-action"
        native-type="button"
        @click="startCreate"
      >
        <Plus
          :size="15"
          :stroke-width="2"
        />
        <span>New Agent</span>
      </Button>
    </header>

    <div
      class="agents-layout"
      :class="{ 'detail-active': agentDetailActive }"
    >
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

        <Button
          v-for="agent in agentsStore.agents"
          :key="agent.id"
          unstyled
          class="agent-item"
          :class="{ active: !isCreating && agent.id === activeAgentId }"
          native-type="button"
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
        </Button>
      </aside>

      <section class="agent-editor">
        <div class="agent-editor-header">
          <Button
            unstyled
            class="back-btn icon-btn"
            native-type="button"
            title="Back to list"
            @click="agentDetailActive = false"
          >
            <ArrowLeft :size="16" />
          </Button>
          <div class="agent-editor-title">
            <h3>{{ isCreating ? 'New Agent' : selectedAgent?.name || 'Agent' }}</h3>
            <span>{{ isCreating ? 'Draft' : selectedAgent?.isDefault ? 'Default agent' : 'Custom agent' }}</span>
          </div>
          <Button
            v-if="canDelete"
            unstyled
            class="agent-icon-button danger"
            native-type="button"
            title="Delete agent"
            :disabled="saving"
            @click="deleteSelectedAgent"
          >
            <Trash2
              :size="15"
              :stroke-width="2"
            />
          </Button>
        </div>

        <div class="agent-editor-scroll">
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

          <div class="agent-field">
            <div class="agent-prompt-header">
              <span>System Prompt</span>
              <div class="prompt-counters">
                <span class="prompt-counter-badge">{{ formPrompt.length }} chars</span>
                <span class="prompt-counter-badge">{{ wordCount(formPrompt) }} words</span>
              </div>
            </div>

            <div class="prompt-templates-panel">
              <span class="templates-label">Quick Templates:</span>
              <div class="templates-list">
                <Button
                  v-for="tpl in promptTemplates"
                  :key="tpl.name"
                  unstyled
                  class="template-chip"
                  native-type="button"
                  @click="applyTemplate(tpl.prompt)"
                >
                  {{ tpl.name }}
                </Button>
              </div>
            </div>

            <textarea
              v-model="formPrompt"
              class="agent-textarea monospace"
              rows="14"
              spellcheck="true"
              placeholder="Instruct the AI on how it should behave..."
            />
          </div>

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
        </div>

        <div class="agent-editor-actions">
          <Button
            unstyled
            class="agent-secondary-action"
            native-type="button"
            :disabled="saving"
            @click="resetForm"
          >
            <X
              :size="15"
              :stroke-width="2"
            />
            <span>Cancel</span>
          </Button>
          <Button
            unstyled
            class="agents-primary-action"
            native-type="button"
            :disabled="saving"
            @click="saveAgent"
          >
            <Save
              :size="15"
              :stroke-width="2"
            />
            <span>{{ saving ? 'Saving' : 'Save' }}</span>
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { Bot, Check, Plus, Save, Trash2, X, ArrowLeft } from 'lucide-vue-next'
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

const agentDetailActive = ref(false)

const promptTemplates = [
  {
    name: 'Developer',
    prompt: 'You are an expert software developer. Provide clean, well-documented, and performant code in TypeScript/JavaScript following industry best practices. Explain design decisions briefly and clearly.'
  },
  {
    name: 'Writer',
    prompt: 'You are a creative writer and copy editor. Focus on engaging, vivid prose with excellent structure and tone. Adapt your style based on the user\'s requests, maintaining high readability and style.'
  },
  {
    name: 'Analyst',
    prompt: 'You are a detail-oriented data analyst. Provide structured insights, markdown tables, and clear explanations. Focus on extracting quantitative patterns and validating claims with rigorous logic.'
  },
  {
    name: 'Concise AI',
    prompt: 'You are a helpful assistant. Keep all responses brief, direct, and focused. Avoid introductory and concluding conversational filler. Answer in bullet points whenever possible.'
  }
]

function applyTemplate(templatePrompt: string) {
  if (!formPrompt.value.trim() || confirm('Overwrite current system prompt with this template?')) {
    formPrompt.value = templatePrompt
  }
}

function wordCount(str: string): number {
  if (!str) return 0
  return str.trim().split(/\s+/).filter(Boolean).length
}

function selectAgent(agentId: string) {
  isCreating.value = false
  activeAgentId.value = agentId
  syncFormFromSelected()
  formError.value = ''
  formFeedback.value = ''
  agentDetailActive.value = true
}

function startCreate() {
  isCreating.value = true
  activeAgentId.value = ''
  formName.value = 'New Agent'
  formPrompt.value = ''
  formError.value = ''
  formFeedback.value = ''
  agentDetailActive.value = true
}

function resetForm() {
  if (isCreating.value) {
    isCreating.value = false
    activeAgentId.value = agentsStore.defaultAgent?.id || DEFAULT_AGENT_ID
  }
  syncFormFromSelected()
  formError.value = ''
  formFeedback.value = ''
  agentDetailActive.value = false
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
  background: transparent;
}

.agents-header {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle)) 45%, transparent);
}

.agents-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.agents-title svg {
  flex: 0 0 auto;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.agents-title h2,
.agent-editor-title h3 {
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.2px;
}

.agents-title h2 {
  font-size: 20px;
  font-weight: 750;
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
  grid-template-columns: minmax(200px, 290px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px 22px 22px;
  position: relative;
  overflow: hidden;
}

/* Custom Scrollbars */
.agents-list::-webkit-scrollbar,
.agent-editor-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.agents-list::-webkit-scrollbar-track,
.agent-editor-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.agents-list::-webkit-scrollbar-thumb,
.agent-editor-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
  border-radius: 3px;
}

.agents-list::-webkit-scrollbar-thumb:hover,
.agent-editor-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}

/* List Column styling */
.agents-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border-radius: var(--radius-md);
  border: 1px solid var(--ui-border-default-border, var(--border));
  padding: 12px;
  transition: all 0.2s ease;
}

.agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 11px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  text-align: left;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.agent-item:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-subtle-border, var(--border-subtle));
  transform: translateX(2px);
}

.agent-item.active {
  background: var(--ui-state-selected-bg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, var(--ui-surface-panel-bg))) !important;
  color: var(--ui-state-selected-fg, var(--ui-text-primary-fg, var(--text)));
  border-color: var(--ui-state-selected-border, var(--ui-accent-primary-fg, var(--accent)));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transform: translateX(2px);
}

.agent-item-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.agent-item-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

.agent-item-meta {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

.agents-state {
  padding: 14px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
  text-align: center;
}

.agents-state.error,
.agent-feedback.error {
  color: var(--ui-status-danger-fg, #ef4444);
}

/* Premium Form Editor styling */
.agent-editor {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.agent-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--ui-border-subtle-border);
  background: color-mix(in srgb, var(--ui-surface-panel-bg) 98%, transparent);
}

.agent-editor .back-btn {
  display: none; /* Hidden on split views */
}

.agent-editor-title {
  min-width: 0;
}

.agent-editor-title h3 {
  overflow-wrap: anywhere;
  font-size: 15px;
  font-weight: 720;
}

.agent-editor-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-field > span,
.agent-prompt-header > span {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  font-size: 13px;
  outline: none;
  transition: all 0.2s ease;
}

.agent-input {
  height: 38px;
  padding: 0 12px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
}

.agent-textarea {
  min-height: 220px;
  flex: 1;
  resize: vertical;
  padding: 12px;
  line-height: 1.5;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
}

.agent-input:hover:not(:disabled),
.agent-textarea:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, var(--ui-accent-primary-fg, var(--accent)));
}

.agent-input:focus,
.agent-textarea:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent)) !important;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 12%, transparent), inset 0 1px 2px rgba(0, 0, 0, 0.02) !important;
}

.agent-textarea.monospace {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  line-height: 1.55;
}

.agent-feedback {
  min-height: 17px;
  margin: 0;
  color: var(--ui-status-success-fg, #10b981);
  font-size: 12px;
  font-weight: 550;
}

.agent-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--ui-border-subtle-border);
  background: color-mix(in srgb, var(--ui-surface-panel-bg) 96%, transparent);
}

/* Buttons and Controls */
.agents-primary-action,
.agent-secondary-action,
.agent-icon-button {
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
}

.agents-primary-action {
  height: 34px;
  padding: 0 14px;
  background: var(--ui-action-primary-bg, var(--ui-accent-primary-fg, var(--accent)));
  color: var(--ui-action-primary-fg, #ffffff) !important;
  border-color: var(--ui-action-primary-border, transparent);
  box-shadow: var(--ui-action-primary-shadow, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.agents-primary-action:hover:not(:disabled) {
  background: var(--ui-action-primary-hover-bg, var(--ui-action-primary-bg, var(--accent)));
  transform: translateY(-1px);
  box-shadow: var(--ui-action-primary-hover-shadow, 0 3px 8px rgba(0, 0, 0, 0.08));
}

.agents-primary-action:active:not(:disabled) {
  transform: scale(0.98);
}

.agent-secondary-action {
  height: 34px;
  padding: 0 14px;
  background: var(--ui-action-secondary-bg, var(--ui-state-hover-bg, var(--hover)));
  color: var(--ui-action-secondary-fg, var(--ui-text-primary-fg, var(--text)));
  border-color: var(--ui-border-default-border, var(--border));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.agent-secondary-action:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-border-default-border, var(--border));
  transform: translateY(-1px);
}

.agent-secondary-action:active:not(:disabled) {
  transform: scale(0.98);
}

.agent-icon-button {
  width: 34px;
  height: 34px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  border: 1px solid transparent;
}

.agent-icon-button:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-subtle-border, var(--border-subtle));
  transform: translateY(-1px);
}

.agent-icon-button.danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, #ef4444);
  background: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 10%, transparent);
  border-color: color-mix(in srgb, var(--ui-status-danger-fg, #ef4444) 30%, transparent);
}

.agents-primary-action:disabled,
.agent-secondary-action:disabled,
.agent-icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* Prompt Editor Enhancements */
.agent-prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.prompt-counters {
  display: flex;
  gap: 6px;
}

.prompt-counter-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--ui-text-muted-fg);
  background: var(--ui-state-hover-bg);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--ui-border-subtle-border);
}

.prompt-templates-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--ui-surface-panel-bg);
  border-radius: 6px;
  border: 1px solid var(--ui-border-subtle-border);
  overflow-x: auto;
  scrollbar-width: none;
}

.prompt-templates-panel::-webkit-scrollbar {
  display: none;
}

.templates-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ui-text-secondary-fg);
  white-space: nowrap;
}

.templates-list {
  display: flex;
  gap: 6px;
}

.template-chip {
  background: var(--ui-surface-elevated-bg);
  border: 1px solid var(--ui-border-default-border);
  border-radius: var(--radius-full, 9999px);
  color: var(--ui-text-primary-fg);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.template-chip:hover {
  background: var(--ui-state-hover-bg);
  border-color: var(--ui-accent-primary-fg);
  color: var(--ui-accent-primary-fg);
}



/* Slide stacked styling for side mode */
.mode-side .agents-layout {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 8px 12px 12px;
}

.mode-side .agents-list {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(0);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}

.mode-side .agent-editor {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
}

.mode-side .detail-active .agents-list {
  transform: translateX(-20%);
}

.mode-side .detail-active .agent-editor {
  transform: translateX(0);
}

.mode-side .agent-editor .back-btn {
  display: inline-flex;
}

@media (max-width: 768px) {
  .agents-layout {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 8px 12px 12px;
  }

  .agents-list {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }

  .agent-editor {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
  }

  .detail-active .agents-list {
    transform: translateX(-20%);
  }

  .detail-active .agent-editor {
    transform: translateX(0);
  }

  .agent-editor .back-btn {
    display: inline-flex;
  }
}
</style>

