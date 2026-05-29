<template>
  <div
    ref="rootRef"
    class="agent-selector"
  >
    <button
      class="agent-chip"
      type="button"
      :disabled="isDisabled"
      :title="isDisabled ? 'Agent can be changed after the current response finishes' : 'Change agent for this chat'"
      @click.stop="toggleOpen"
    >
      <Bot :size="14" />
      <span>{{ currentAgent?.name || 'Default Agent' }}</span>
      <ChevronDown :size="13" />
    </button>

    <div
      v-if="open"
      class="agent-menu"
      @click.stop
    >
      <div class="agent-list">
        <button
          v-for="agent in agentsStore.agents"
          :key="agent.id"
          :class="['agent-row', { active: agent.id === currentAgentId }]"
          type="button"
          @click="selectAgent(agent.id)"
        >
          <span class="agent-row-name">{{ agent.name }}</span>
          <span
            v-if="agent.isDefault"
            class="agent-row-meta"
          >Default</span>
        </button>
      </div>

      <div class="agent-actions">
        <button
          class="agent-action"
          type="button"
          @click="beginCreate"
        >
          <Plus :size="14" />
          <span>New</span>
        </button>
        <button
          class="agent-action"
          type="button"
          :disabled="!currentAgent"
          @click="beginEdit"
        >
          <Pencil :size="14" />
          <span>Edit</span>
        </button>
      </div>

      <form
        v-if="editing"
        class="agent-form"
        @submit.prevent="saveAgent"
      >
        <input
          v-model="formName"
          class="agent-input"
          placeholder="Agent name"
        >
        <textarea
          v-model="formPrompt"
          class="agent-textarea"
          placeholder="System prompt for this agent"
          rows="6"
        />
        <p
          v-if="formError"
          class="agent-error"
        >
          {{ formError }}
        </p>
        <div class="agent-form-actions">
          <button
            class="agent-icon-action"
            type="submit"
            title="Save agent"
          >
            <Check :size="14" />
          </button>
          <button
            class="agent-icon-action"
            type="button"
            title="Cancel"
            @click="cancelEdit"
          >
            <X :size="14" />
          </button>
          <button
            v-if="editingAgentId && editingAgentId !== DEFAULT_AGENT_ID"
            class="agent-icon-action danger"
            type="button"
            title="Delete agent"
            @click="deleteEditingAgent"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bot, Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import { useAgentsStore, DEFAULT_AGENT_ID } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'

const props = defineProps<{
  sessionId: string
}>()

const agentsStore = useAgentsStore()
const chatStore = useChatStore()
const sessionsStore = useSessionsStore()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)
const editing = ref(false)
const editingAgentId = ref<string | null>(null)
const formName = ref('')
const formPrompt = ref('')
const formError = ref('')

const session = computed(() =>
  sessionsStore.sessions.find(item => item.id === props.sessionId) || null
)
const currentAgentId = computed(() => session.value?.agentId || DEFAULT_AGENT_ID)
const currentAgent = computed(() => agentsStore.getAgent(currentAgentId.value))
const isDisabled = computed(() => !!props.sessionId && chatStore.isSessionGenerating(props.sessionId))

function close() {
  open.value = false
  cancelEdit()
}

function handleDocumentClick(event: MouseEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    close()
  }
}

function toggleOpen() {
  if (isDisabled.value) return
  open.value = !open.value
}

async function selectAgent(agentId: string) {
  if (!props.sessionId || agentId === currentAgentId.value) {
    open.value = false
    return
  }
  const response = await sessionsStore.updateSessionAgent(props.sessionId, agentId)
  if (!response.success) {
    formError.value = response.error || 'Failed to switch agent'
    return
  }
  open.value = false
}

function beginCreate() {
  editing.value = true
  editingAgentId.value = null
  formName.value = 'New Agent'
  formPrompt.value = ''
  formError.value = ''
}

function beginEdit() {
  if (!currentAgent.value) return
  editing.value = true
  editingAgentId.value = currentAgent.value.id
  formName.value = currentAgent.value.name
  formPrompt.value = currentAgent.value.systemPrompt
  formError.value = ''
}

function cancelEdit() {
  editing.value = false
  editingAgentId.value = null
  formName.value = ''
  formPrompt.value = ''
  formError.value = ''
}

async function saveAgent() {
  const name = formName.value.trim()
  if (!name) {
    formError.value = 'Name is required'
    return
  }
  try {
    const agent = editingAgentId.value
      ? await agentsStore.updateAgent(editingAgentId.value, { name, systemPrompt: formPrompt.value })
      : await agentsStore.createAgent(name, formPrompt.value)
    await selectAgent(agent.id)
    cancelEdit()
  } catch (err: any) {
    formError.value = err?.message || 'Failed to save agent'
  }
}

async function deleteEditingAgent() {
  if (!editingAgentId.value || editingAgentId.value === DEFAULT_AGENT_ID) return
  try {
    await agentsStore.deleteAgent(editingAgentId.value)
    cancelEdit()
  } catch (err: any) {
    formError.value = err?.message || 'Failed to delete agent'
  }
}

onMounted(() => {
  void agentsStore.loadAgents()
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<style scoped>
.agent-selector {
  position: relative;
  flex: 0 0 auto;
  align-self: center;
  -webkit-app-region: no-drag;
}

.agent-chip {
  height: 28px;
  max-width: 180px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--border-subtle, var(--border)) 70%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-elevated) 42%, transparent);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}

.agent-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-chip:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border);
}

.agent-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.agent-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 300px;
  max-height: min(520px, calc(100vh - 64px));
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-floating, var(--bg-panel));
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  z-index: 50;
}

.agent-list {
  display: grid;
  gap: 4px;
}

.agent-row,
.agent-action,
.agent-icon-action {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.agent-row {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  border-radius: 7px;
  text-align: left;
}

.agent-row:hover,
.agent-row.active,
.agent-action:hover,
.agent-icon-action:hover {
  background: var(--bg-hover);
  border-color: var(--border-subtle);
}

.agent-row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-row-meta {
  color: var(--muted);
  font-size: 11px;
}

.agent-actions {
  display: flex;
  gap: 6px;
  padding: 8px 0;
}

.agent-action {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border-radius: 7px;
  color: var(--muted);
}

.agent-form {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.agent-input,
.agent-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-input, var(--bg));
  color: var(--text);
  font: inherit;
}

.agent-input {
  height: 32px;
  padding: 0 9px;
}

.agent-textarea {
  resize: vertical;
  min-height: 112px;
  padding: 8px 9px;
  line-height: 1.45;
}

.agent-error {
  margin: 0;
  color: var(--error, #ef4444);
  font-size: 12px;
}

.agent-form-actions {
  display: flex;
  gap: 6px;
}

.agent-icon-action {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
}

.agent-icon-action.danger:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
</style>
