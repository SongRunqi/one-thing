<template>
  <Dialog
    :open="visible"
    variant="paper"
    dividers="header"
    title="Add skills directory"
    :width="460"
    @update:open="value => { if (!value) emit('close') }"
  >
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

      <div class="field">
        <span class="field-label">Agent</span>
        <Select
          v-bind="SHEET_SELECT"
          :model-value="agentId"
          :options="agentOptions"
          aria-label="Agent"
          @update:model-value="agentId = String($event ?? '')"
        />
        <span class="field-hint">Skills from this directory only load for the chosen agent.</span>
      </div>

      <ErrorNote
        v-if="error"
        :message="error"
      />
    </div>

    <template #actions>
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
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AgentDefinition } from '@/types'
import Dialog from '@/components/common/Dialog.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Select from '@/components/common/Select.vue'
import type { SelectOptionLike } from '@/components/common/select'

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

/**
 * `z-layer="modal"` is load-bearing: this is a Dialog at `--z-modal`, and a
 * dropdown left on its default stop opens *behind* the sheet it belongs to.
 * `teleported` then keeps the panel out of the sheet's scrolling body.
 */
const SHEET_SELECT = {
  variant: 'underline',
  size: 'small',
  teleported: true,
  fitInputWidth: true,
  zLayer: 'modal',
} as const

const path = ref('')
const label = ref('')
const agentId = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const agentOptions = computed<SelectOptionLike[]>(() => [
  { value: '', label: 'All agents' },
  ...props.agents.map(agent => ({ value: agent.id, label: agent.name })),
])

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
/* Paper dialog in the ledger language: the shell (overlay, panel, header rule,
   section paddings) is `Dialog variant="paper"` since P2. */
.dialog-body {
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


.field-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
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
