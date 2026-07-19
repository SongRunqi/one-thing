<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="skill-dialog-overlay"
      @click.self="emit('close')"
    >
      <div
        class="skill-dialog"
        role="dialog"
        aria-label="Add skills directory"
      >
        <div class="dialog-header">
          <h3>Add skills directory</h3>
        </div>

        <div class="dialog-body">
          <label class="field">
            <span class="field-label">Directory</span>
            <span class="field-row">
              <input
                v-model="path"
                class="field-input is-mono"
                type="text"
                placeholder="/absolute/path/to/skills"
                spellcheck="false"
              >
              <button
                v-if="canBrowse"
                class="text-action"
                type="button"
                @click="browse"
              >
                browse
              </button>
            </span>
            <span class="field-hint">Each skill is a folder containing a SKILL.md.</span>
          </label>

          <label class="field">
            <span class="field-label">Label <em>optional</em></span>
            <input
              v-model="label"
              class="field-input"
              type="text"
              placeholder="e.g. Team skills"
            >
          </label>

          <label class="field">
            <span class="field-label">Agent</span>
            <select
              v-model="agentId"
              class="field-input"
            >
              <option value="">
                All agents
              </option>
              <option
                v-for="agent in agents"
                :key="agent.id"
                :value="agent.id"
              >
                {{ agent.name }}
              </option>
            </select>
            <span class="field-hint">Skills from this directory only load for the chosen agent.</span>
          </label>

          <p
            v-if="error"
            class="dialog-error"
          >
            {{ error }}
          </p>
        </div>

        <div class="dialog-footer">
          <button
            class="text-action"
            type="button"
            @click="emit('close')"
          >
            cancel
          </button>
          <button
            class="text-action is-primary"
            type="button"
            :disabled="!path.trim() || submitting"
            @click="submit"
          >
            {{ submitting ? 'adding…' : 'add directory' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AgentDefinition } from '@/types'

interface Props {
  visible: boolean
  agents: AgentDefinition[]
  canBrowse: boolean
  pickDirectory: () => Promise<string | null>
  addDirectory: (input: { path: string; label?: string; agentId?: string | null }) => Promise<string | null>
}

interface Emits {
  (e: 'close'): void
  (e: 'added'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const path = ref('')
const label = ref('')
const agentId = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

watch(() => props.visible, visible => {
  if (visible) {
    path.value = ''
    label.value = ''
    agentId.value = ''
    error.value = null
    submitting.value = false
  }
})

async function browse() {
  const picked = await props.pickDirectory()
  if (picked) {
    path.value = picked
  }
}

async function submit() {
  if (!path.value.trim() || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    const failure = await props.addDirectory({
      path: path.value.trim(),
      label: label.value.trim() || undefined,
      agentId: agentId.value || null,
    })
    if (failure) {
      error.value = failure
      return
    }
    emit('added')
    emit('close')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
/* Paper dialog in the ledger language: hairline borders, no radii, no fills. */
.skill-dialog-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-toast);
  padding: 20px;
}

.skill-dialog {
  width: 100%;
  max-width: 460px;
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 24%, transparent);
}

.dialog-header {
  padding: 14px 18px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

.dialog-header h3 {
  margin: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.dialog-body {
  padding: 16px 18px 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.field-label em {
  font-style: normal;
  text-transform: none;
  letter-spacing: normal;
  color: var(--ui-text-faint-fg, var(--muted));
}

.field-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.field-row .field-input {
  flex: 1;
  min-width: 0;
}

/* Underline inputs: the line is the control. */
.field-input {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  padding: 4px 0 5px;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  transition: border-color 0.12s ease;
}

.field-input.is-mono {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

.field-input:focus {
  outline: none;
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

.field-input::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

select.field-input {
  cursor: pointer;
}

.field-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.dialog-error {
  margin: 0;
  font-size: 12px;
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  border-left: 2px solid var(--ui-status-danger-fg, var(--text-error, #b3403a));
  padding-left: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  padding: 14px 18px 16px;
}

.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
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

.text-action.is-primary {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
