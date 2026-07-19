<template>
  <div class="agents-panel">
    <header class="ledger-header">
      <div class="ledger-heading">
        <h2 class="ledger-title">
          <span>Agents</span>
          <span class="ledger-count">{{ agentsStore.agents.length }}</span>
        </h2>
        <p class="ledger-sub">
          System prompts that shape each conversation.
        </p>
      </div>
      <div class="ledger-actions">
        <button
          class="text-action"
          type="button"
          @click="startCreate"
        >
          + new agent
        </button>
      </div>
    </header>

    <div
      class="agents-layout"
      :class="{ 'detail-active': agentDetailActive }"
    >
      <aside class="agents-list">
        <p
          v-if="agentsStore.isLoading"
          class="ledger-note"
        >
          loading…
        </p>
        <p
          v-else-if="agentsStore.error"
          class="ledger-error"
        >
          {{ agentsStore.error }}
        </p>
        <p
          v-else-if="agentsStore.agents.length === 0"
          class="ledger-note"
        >
          No agents configured yet.
        </p>

        <div class="ledger-body">
          <ol class="agent-rows">
            <li
              v-for="agent in agentsStore.agents"
              :key="agent.id"
              class="agent-row"
              :class="{ 'is-active': !isCreating && agent.id === activeAgentId }"
            >
              <button
                class="row-line"
                type="button"
                @click="selectAgent(agent.id)"
              >
                <span
                  class="row-name"
                  :title="agent.name"
                >{{ agent.name }}</span>
                <span
                  v-if="agent.isDefault"
                  class="agent-chip"
                  title="Default agent"
                >default</span>
                <span
                  v-else
                  class="row-meta"
                >{{ formatUpdated(agent.updatedAt) }}</span>
              </button>
            </li>
          </ol>
        </div>
      </aside>

      <section class="agent-editor">
        <div class="editor-header">
          <button
            class="text-action back-btn"
            type="button"
            title="Back to list"
            @click="agentDetailActive = false"
          >
            ‹ back
          </button>
          <div class="editor-title">
            <h3 :title="isCreating ? 'New Agent' : selectedAgent?.name || 'Agent'">
              {{ isCreating ? 'New Agent' : selectedAgent?.name || 'Agent' }}
            </h3>
            <span>{{ isCreating ? 'draft' : selectedAgent?.isDefault ? 'default agent' : 'custom agent' }}</span>
          </div>
          <button
            v-if="canDelete"
            class="text-action is-danger"
            type="button"
            title="Delete agent"
            :disabled="saving"
            @click="deleteSelectedAgent"
          >
            delete
          </button>
        </div>

        <div class="editor-scroll">
          <div class="editor-body">
            <label class="agent-field">
              <span class="field-label">Name</span>
              <input
                v-model="formName"
                class="ledger-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
              >
            </label>

            <div class="agent-field">
              <div class="prompt-header">
                <span class="field-label">System Prompt</span>
                <span class="prompt-counters">
                  <span class="prompt-counter">{{ formPrompt.length }} chars</span>
                  <span class="prompt-counter">{{ wordCount(formPrompt) }} words</span>
                </span>
              </div>

              <div class="prompt-templates">
                <span class="templates-label">templates</span>
                <button
                  v-for="tpl in promptTemplates"
                  :key="tpl.name"
                  class="text-action template-action"
                  type="button"
                  :title="`Use the ${tpl.name} template`"
                  @click="applyTemplate(tpl.prompt)"
                >
                  {{ tpl.name }}
                </button>
              </div>

              <textarea
                v-model="formPrompt"
                class="ledger-textarea"
                rows="14"
                spellcheck="true"
                placeholder="Instruct the AI on how it should behave..."
              />
            </div>

            <p
              v-if="formError"
              class="ledger-error form-note"
            >
              {{ formError }}
            </p>
            <p
              v-else-if="formFeedback"
              class="ledger-note form-note"
            >
              {{ formFeedback }}
            </p>
          </div>
        </div>

        <div class="editor-footer">
          <button
            class="text-action"
            type="button"
            :disabled="saving"
            @click="resetForm"
          >
            cancel
          </button>
          <button
            class="text-action is-primary"
            type="button"
            :disabled="saving"
            @click="saveAgent"
          >
            {{ saving ? 'saving…' : 'save' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
/*
 * Agents ledger — 画线风.
 * No background fills, no radii: state lives in the line.
 * Agents hang as numbered rows on one vertical ink rule;
 * the editor is a plain sheet with rule-hung field labels.
 */
.agents-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: transparent;
  animation: ledger-fade 0.15s ease;
  container-type: inline-size;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- header ---- */
.ledger-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
}

.ledger-heading {
  min-width: 0;
}

.ledger-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.ledger-title > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  color: var(--ui-text-faint-fg, var(--muted));
}

.ledger-sub {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-actions {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  padding-bottom: 2px;
}

/* ---- notes & errors ---- */
.ledger-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  word-break: break-word;
}

.ledger-error {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  border-left: 2px solid var(--ui-status-danger-fg, var(--text-error, #b3403a));
  padding-left: 8px;
  word-break: break-word;
}

.form-note {
  margin: 0;
  min-height: 17px;
}

/* ---- layout ---- */
.agents-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(200px, 290px) minmax(0, 1fr);
  gap: 20px;
  padding: 12px 18px 18px;
  position: relative;
  overflow: hidden;
}

/* Custom scrollbars (kept from before — no nested scroll areas added) */
.agents-list::-webkit-scrollbar,
.editor-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.agents-list::-webkit-scrollbar-track,
.editor-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.agents-list::-webkit-scrollbar-thumb,
.editor-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
}

.agents-list::-webkit-scrollbar-thumb:hover,
.editor-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}

/* ---- list column ---- */
.agents-list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 2px 8px 0;
  background: transparent;
}

/* The vertical ink rule the rows hang on */
.ledger-body {
  position: relative;
  padding-left: 16px;
  margin-top: 6px;
}

.ledger-body::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

/* ---- agent rows (register numbering) ---- */
.agent-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: agent-row;
}

.agent-row {
  position: relative;
  counter-increment: agent-row;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

.agent-row:first-child {
  border-top: none;
}

/* Tick hanging each row on the rule */
.agent-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.agent-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

/* Active agent: heavier accent tick + accent figure number */
.agent-row.is-active::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.row-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  min-height: 30px;
  padding: 6px 0;
  appearance: none;
  background: transparent;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

/* Figure number, like rows on a blueprint sheet */
.row-line::before {
  content: counter(agent-row, decimal-leading-zero);
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
  min-width: 16px;
}

.agent-row.is-active .row-line::before {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.row-meta {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

/* Default agent: outlined ring, zero fill — accent marks the binding */
.agent-chip {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 7px 3px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 65%, transparent);
  border-radius: 9px;
  color: var(--ui-accent-primary-fg, var(--accent));
  background: transparent;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- editor sheet ---- */
.agent-editor {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.editor-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

.agent-editor .back-btn {
  display: none; /* shown in stacked/side mode only */
  flex-shrink: 0;
}

.editor-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.editor-title h3 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.editor-title span {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

.editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 2px 14px 0;
}

/* Editor fields hang on their own rule */
.editor-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-left: 16px;
}

.editor-body::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.agent-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Field label: section-header tick language */
.field-label {
  position: relative;
  font-size: 11px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.editor-body .field-label::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

/* Inputs: state lives in the bottom line */
.ledger-input {
  width: 100%;
  box-sizing: border-box;
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  padding: 2px 2px 6px;
  font: inherit;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  outline: none;
  transition: border-color 0.12s ease;
}

.ledger-input:hover:not(:disabled),
.ledger-input:focus {
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

/* Prompt: an editable excerpt held by a left rule, no filled block */
.ledger-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 220px;
  resize: vertical;
  appearance: none;
  background: transparent;
  border: none;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  padding: 4px 2px 8px 10px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-primary-fg, var(--text-primary));
  outline: none;
  transition: border-color 0.12s ease;
}

.ledger-textarea::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

.ledger-textarea:hover:not(:disabled),
.ledger-textarea:focus {
  border-left-color: var(--ui-accent-primary-fg, var(--accent));
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

/* Prompt header: label + mono counters */
.prompt-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.prompt-counters {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.prompt-counter {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

/* Templates: a line of text actions, wraps when narrow */
.prompt-templates {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.templates-label {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

.template-action {
  text-transform: lowercase;
  white-space: nowrap;
}

/* ---- footer actions ---- */
.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  padding: 12px 2px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

/* ---- shared text actions ---- */
.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.text-action:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.text-action.is-primary {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-primary:hover:not(:disabled) {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.text-action:focus-visible,
.row-line:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 2px;
}

.ledger-input:focus-visible,
.ledger-textarea:focus-visible {
  outline: none;
}

/* ---- stacked slide layout (workspace side panel) ---- */
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
  padding: 8px 12px 12px;
  box-sizing: border-box;
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
  padding: 0 12px 12px;
  box-sizing: border-box;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.mode-side .detail-active .agents-list {
  transform: translateX(-20%);
}

.mode-side .detail-active .agent-editor {
  transform: translateX(0);
}

.mode-side .agent-editor .back-btn {
  display: inline-block;
}

/* Narrow panel (not just narrow viewport): stack list/editor as slide-over */
@container (max-width: 640px) {
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
    padding: 8px 12px 12px;
    box-sizing: border-box;
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
    padding: 0 12px 12px;
    box-sizing: border-box;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
    background: var(--ui-surface-panel-bg, var(--bg-panel));
  }

  .detail-active .agents-list {
    transform: translateX(-20%);
  }

  .detail-active .agent-editor {
    transform: translateX(0);
  }

  .agent-editor .back-btn {
    display: inline-block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agents-panel {
    animation: none;
  }

  .agents-list,
  .agent-editor,
  .mode-side .agents-list,
  .mode-side .agent-editor {
    transition: none;
  }
}
</style>
