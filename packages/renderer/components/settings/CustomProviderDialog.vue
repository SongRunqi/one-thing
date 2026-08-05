<template>
  <Dialog
    :open="visible"
    variant="paper"
    dividers="header"
    :width="520"
    :title="isEditing ? 'Edit Provider' : 'Add Custom Provider'"
    :style="providerDialogVars"
    @update:open="value => { if (!value) $emit('close') }"
  >
    <template #header-leading>
      <svg
        class="header-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle
          cx="12"
          cy="12"
          r="3"
        />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    </template>

    <div class="dialog-body">
      <div class="form-group">
        <label class="form-label">Provider Name <span class="required">*</span></label>
        <input
          v-model="form.name"
          type="text"
          class="form-input"
          placeholder="e.g., My Ollama, Together AI..."
        >
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <input
          v-model="form.description"
          type="text"
          class="form-input"
          placeholder="Optional description..."
        >
      </div>

      <div class="form-group">
        <label class="form-label">API Compatibility <span class="required">*</span></label>
        <div class="api-type-selector">
          <Button
            unstyled
            :class="['api-type-btn', { active: form.apiType === 'openai' }]"
            native-type="button"
            @click="form.apiType = 'openai'"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646" />
            </svg>
            OpenAI Compatible
          </Button>
          <Button
            unstyled
            :class="['api-type-btn', { active: form.apiType === 'anthropic' }]"
            native-type="button"
            @click="form.apiType = 'anthropic'"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065" />
            </svg>
            Anthropic Compatible
          </Button>
        </div>
        <p class="form-hint">
          Most local AI servers (Ollama, LM Studio, etc.) use OpenAI-compatible API
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">Base URL <span class="required">*</span></label>
        <input
          v-model="form.baseUrl"
          type="text"
          class="form-input"
          placeholder="e.g., http://localhost:11434/v1"
        >
        <p class="form-hint">
          The API endpoint URL (without /chat/completions)
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">API Key</label>
        <input
          v-model="form.apiKey"
          type="password"
          class="form-input"
          placeholder="Leave empty if not required..."
        >
        <p class="form-hint">
          Some local servers don't require an API key
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">Default Model</label>
        <input
          v-model="form.model"
          type="text"
          class="form-input"
          placeholder="e.g., llama3, mistral..."
        >
      </div>

      <ErrorNote
        v-if="error"
        class="error-message"
        :message="error"
      />
    </div>

    <template #actions>
      <button
        v-if="isEditing"
        type="button"
        class="app-dialog-text-btn is-danger"
        @click="$emit('delete')"
      >
        Delete
      </button>
      <div class="provider-dialog-actions-right">
        <button
          type="button"
          class="app-dialog-text-btn"
          @click="$emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="app-dialog-text-btn is-primary"
          @click="handleSave"
        >
          {{ isEditing ? 'Save Changes' : 'Add Provider' }}
        </button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import Dialog from '@/components/common/Dialog.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed, ref, watch, type CSSProperties } from 'vue'

export interface CustomProviderForm {
  name: string
  description: string
  apiType: 'openai' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
}

interface Props {
  visible: boolean
  isEditing?: boolean
  initialData?: Partial<CustomProviderForm>
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  initialData: () => ({}),
  error: '',
})

/**
 * Icon-then-title header (so the bar packs left, not space-between).
 *
 * The footer splits only in EDIT mode, where Delete sits alone on the left and
 * Cancel/Save on the right. Add mode has no Delete, so `space-between` would
 * push its two buttons apart and strand them in the bottom-left corner —
 * it falls back to the ordinary right alignment.
 */
const providerDialogVars = computed<CSSProperties>(() => ({
  '--app-dialog-header-justify': 'flex-start',
  '--app-dialog-body-max-height': '60vh',
  ...(props.isEditing ? { '--app-dialog-actions-justify': 'space-between' } : {}),
} as CSSProperties))

const emit = defineEmits<{
  close: []
  save: [form: CustomProviderForm]
  delete: []
}>()

const form = ref<CustomProviderForm>({
  name: '',
  description: '',
  apiType: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
})

// Reset form when dialog opens or initialData changes
watch(
  () => [props.visible, props.initialData],
  () => {
    if (props.visible) {
      form.value = {
        name: props.initialData.name || '',
        description: props.initialData.description || '',
        apiType: props.initialData.apiType || 'openai',
        baseUrl: props.initialData.baseUrl || '',
        apiKey: props.initialData.apiKey || '',
        model: props.initialData.model || '',
      }
    }
  },
  { immediate: true }
)

function handleSave() {
  emit('save', { ...form.value })
}
</script>

<style scoped>
/* Paper dialog in the ledger language: the shell is `Dialog variant="paper"`
   since P2. The gear icon rides in `#header-leading`, so its colour is set on
   the slot content here (slot content keeps this file's scope). */
.header-icon {
  color: var(--ui-accent-primary-fg);
  flex-shrink: 0;
}

/* Renamed off the global `.dialog-actions-right` (components.css): sharing a
   component class name with the global sheet is what made the footer buttons
   order-dependent, and the same trap is not worth keeping for a flex row. */
.provider-dialog-actions-right {
  display: flex;
  gap: 18px;
}

.form-group {
  margin-bottom: 16px;
  min-width: 0;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg);
  margin-bottom: 5px;
}

.form-label .required {
  color: var(--ui-status-danger-fg, var(--danger));
}

/* Underline inputs: the line is the control. */
.form-input {
  width: 100%;
  min-width: 0;
  appearance: none;
  padding: 4px 0 5px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ui-border-default-border);
  border-radius: 0;
  color: var(--ui-text-primary-fg);
  font-size: 13px;
  outline: none;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: border-color var(--duration-normal) var(--ease-default);
}

input.form-input:focus {
  border-bottom-color: var(--ui-accent-primary-fg);
}

.form-input::placeholder {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.form-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.api-type-selector {
  display: flex;
  gap: 10px;
  min-width: 0;
}

/* Square drafting boxes: state lives in the line, not a fill. */
.api-type-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 8px;
  background: transparent;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 0;
  color: var(--ui-text-muted-fg);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--duration-normal) var(--ease-default), color var(--duration-normal) var(--ease-default), box-shadow var(--duration-normal) var(--ease-default);
}

.api-type-btn svg {
  flex-shrink: 0;
}

.api-type-btn:hover {
  border-color: var(--ui-text-muted-fg);
  color: var(--ui-text-primary-fg);
}

.api-type-btn.active {
  background: transparent;
  border-color: var(--ui-accent-primary-fg);
  box-shadow: inset 0 -2px 0 var(--ui-accent-primary-fg);
  color: var(--ui-text-primary-fg);
}

/* positioning only — visuals come from ErrorNote */
.error-message {
  margin-top: 16px;
}

/* Footer buttons are `.app-dialog-text-btn` (published by Dialog.vue's
   non-scoped block). They used to be a scoped `.btn` here, which tied with the
   global `.btn.primary` / `.btn.secondary` at (0,2,0) and was decided by
   stylesheet order — P2 reshuffled that order and the tie flipped to a solid
   accent block with accent text on it. */
</style>
