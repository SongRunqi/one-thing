<template>
  <div
    v-if="visible"
    class="dialog-overlay"
    @click.self="$emit('close')"
  >
    <div class="dialog custom-provider-dialog">
      <div class="dialog-header">
        <svg
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
        <h3>{{ isEditing ? 'Edit Provider' : 'Add Custom Provider' }}</h3>
      </div>

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
            <button
              :class="['api-type-btn', { active: form.apiType === 'openai' }]"
              type="button"
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
            </button>
            <button
              :class="['api-type-btn', { active: form.apiType === 'anthropic' }]"
              type="button"
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
            </button>
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

        <div
          v-if="error"
          class="error-message"
        >
          {{ error }}
        </div>
      </div>

      <div class="dialog-actions">
        <button
          v-if="isEditing"
          class="btn danger"
          type="button"
          @click="$emit('delete')"
        >
          Delete
        </button>
        <div class="dialog-actions-right">
          <button
            class="btn secondary"
            type="button"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            class="btn primary"
            type="button"
            @click="handleSave"
          >
            {{ isEditing ? 'Save Changes' : 'Add Provider' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

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
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.dialog {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow);
}

.custom-provider-dialog {
  max-width: 520px;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.dialog-header svg {
  color: var(--accent);
  flex-shrink: 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.dialog-body {
  padding: 20px 24px;
  max-height: 60vh;
  overflow-y: auto;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.custom-provider-dialog .dialog-actions {
  justify-content: space-between;
}

.dialog-actions-right {
  display: flex;
  gap: 10px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.form-label .required {
  color: var(--danger);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--accent);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.api-type-selector {
  display: flex;
  gap: 10px;
}

.api-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.api-type-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.api-type-btn.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--accent);
  color: var(--accent);
}

.error-message {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm);
  color: var(--danger);
  font-size: 13px;
  margin-top: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover {
  background: #2563eb;
}

.btn.secondary {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover {
  background: var(--hover);
}

.btn.danger {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}
</style>
