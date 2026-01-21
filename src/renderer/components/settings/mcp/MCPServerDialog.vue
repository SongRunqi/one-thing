<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="dialog-overlay"
      @click.self="$emit('close')"
    >
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ editingServer ? 'Edit Server' : 'Add MCP Server' }}</h3>
          <button
            class="close-btn"
            @click="$emit('close')"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="dialog-content">
          <div class="form-group">
            <label class="form-label">Server Name</label>
            <input
              v-model="form.name"
              type="text"
              class="form-input"
              placeholder="My MCP Server"
            >
          </div>

          <div class="form-group">
            <label class="form-label">Transport Type</label>
            <div class="transport-selector">
              <button
                :class="['transport-option', { active: form.transport === 'stdio' }]"
                @click="form.transport = 'stdio'"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect
                    x="4"
                    y="4"
                    width="16"
                    height="16"
                    rx="2"
                    ry="2"
                  />
                  <rect
                    x="9"
                    y="9"
                    width="6"
                    height="6"
                  />
                  <line
                    x1="9"
                    y1="1"
                    x2="9"
                    y2="4"
                  />
                  <line
                    x1="15"
                    y1="1"
                    x2="15"
                    y2="4"
                  />
                  <line
                    x1="9"
                    y1="20"
                    x2="9"
                    y2="23"
                  />
                  <line
                    x1="15"
                    y1="20"
                    x2="15"
                    y2="23"
                  />
                </svg>
                <span>Stdio</span>
                <span class="transport-desc">Local process</span>
              </button>
              <button
                :class="['transport-option', { active: form.transport === 'sse' }]"
                @click="form.transport = 'sse'"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                  />
                  <line
                    x1="2"
                    y1="12"
                    x2="22"
                    y2="12"
                  />
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
                <span>SSE</span>
                <span class="transport-desc">HTTP endpoint</span>
              </button>
            </div>
          </div>

          <!-- Stdio Configuration -->
          <template v-if="form.transport === 'stdio'">
            <div class="form-group">
              <label class="form-label">Command</label>
              <input
                v-model="form.command"
                type="text"
                class="form-input"
                placeholder="npx, python, node..."
              >
            </div>
            <div class="form-group">
              <label class="form-label">Arguments</label>
              <input
                v-model="form.argsString"
                type="text"
                class="form-input"
                placeholder="-y @modelcontextprotocol/server-everything"
              >
              <p class="form-hint">
                Space-separated arguments
              </p>
            </div>
            <div class="form-group">
              <label class="form-label">Working Directory (optional)</label>
              <input
                v-model="form.cwd"
                type="text"
                class="form-input"
                placeholder="/path/to/working/dir"
              >
            </div>
          </template>

          <!-- SSE Configuration -->
          <template v-else>
            <div class="form-group">
              <label class="form-label">Server URL</label>
              <input
                v-model="form.url"
                type="text"
                class="form-input"
                placeholder="http://localhost:3000/sse"
              >
            </div>
          </template>

          <div
            v-if="error"
            class="error-message"
          >
            {{ error }}
          </div>
        </div>

        <div class="dialog-footer">
          <button
            class="btn secondary"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            class="btn primary"
            :disabled="isSaving"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving...' : (editingServer ? 'Save Changes' : 'Add Server') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { MCPServerConfig } from '@/types'
import type { ServerForm } from './useMCPServers'

interface Props {
  show: boolean
  editingServer: MCPServerConfig | null
}

interface Emits {
  (e: 'close'): void
  (e: 'save', form: ServerForm): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const error = ref('')
const isSaving = ref(false)

const form = ref<ServerForm>({
  name: '',
  transport: 'stdio',
  command: '',
  argsString: '',
  cwd: '',
  url: '',
})

// Reset form when dialog opens/closes or editing server changes
watch(
  () => [props.show, props.editingServer],
  () => {
    if (props.show) {
      error.value = ''
      if (props.editingServer) {
        form.value = {
          name: props.editingServer.name,
          transport: props.editingServer.transport,
          command: props.editingServer.command || '',
          argsString: (props.editingServer.args || []).join(' '),
          cwd: props.editingServer.cwd || '',
          url: props.editingServer.url || '',
        }
      } else {
        form.value = {
          name: '',
          transport: 'stdio',
          command: '',
          argsString: '',
          cwd: '',
          url: '',
        }
      }
    }
  },
  { immediate: true }
)

function handleSave() {
  // Basic validation
  if (!form.value.name.trim()) {
    error.value = 'Server name is required'
    return
  }

  if (form.value.transport === 'stdio') {
    if (!form.value.command.trim()) {
      error.value = 'Command is required'
      return
    }
  } else {
    if (!form.value.url.trim()) {
      error.value = 'Server URL is required'
      return
    }
  }

  error.value = ''
  emit('save', { ...form.value })
}

// Expose for parent to set error and loading state
defineExpose({
  setError: (msg: string) => { error.value = msg },
  setLoading: (loading: boolean) => { isSaving.value = loading },
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.dialog-content {
  padding: 24px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--panel-2);
  color: var(--text-primary);
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.transport-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.transport-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.transport-option:hover {
  background: var(--hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.transport-option.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--accent);
}

.transport-option span {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.transport-desc {
  font-size: 12px !important;
  font-weight: 400 !important;
  color: var(--text-muted) !important;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: #ef4444;
  margin-top: 16px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: var(--panel-2);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn.secondary:hover {
  background: var(--hover);
}
</style>
