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
          <Button
            unstyled
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
          </Button>
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
              <Button
                unstyled
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
              </Button>
              <Button
                unstyled
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
              </Button>
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

          <ErrorNote
            v-if="error"
            class="error-message"
            :message="error"
          />
        </div>

        <div class="dialog-footer">
          <Button
            unstyled
            class="btn secondary"
            @click="$emit('close')"
          >
            Cancel
          </Button>
          <Button
            unstyled
            class="btn primary"
            :disabled="isSaving"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving...' : (editingServer ? 'Save Changes' : 'Add Server') }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
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
/*
 * Paper dialog in the ledger language: hairline borders, hard ink shadow,
 * underline inputs, text-button footer. Teleported to body, so colors use
 * the --ui-* fallback chains directly.
 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--ui-surface-app-bg, var(--bg)) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-toast);
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
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 24%, transparent);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.close-btn {
  border: none;
  background: transparent;
  padding: 2px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s ease;
}

.close-btn:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.dialog-content {
  padding: 16px 18px 4px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  padding: 14px 18px 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ui-text-muted-fg, var(--text-muted));
  margin-bottom: 5px;
}

.form-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  margin-top: 5px;
}

/* Underline inputs: the line is the control. */
.form-input {
  width: 100%;
  min-width: 0;
  appearance: none;
  padding: 4px 0 5px;
  border: none;
  border-bottom: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 0;
  font-size: 13px;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text-primary));
  transition: border-color 0.12s ease;
}

.form-input:focus {
  outline: none;
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: none;
}

.form-input::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

.transport-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

/* Transport choice: square outline, accent line marks the selection */
.transport-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 12px;
  min-width: 0;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;
}

.transport-option:hover {
  border-color: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.transport-option.active {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  color: var(--ui-accent-primary-fg, var(--accent));
}

.transport-option span {
  font-size: 13px;
  font-weight: var(--font-weight-medium, 500);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.transport-option.active span {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.transport-desc {
  font-family: var(--font-mono, monospace);
  font-size: 10px !important;
  font-weight: 400 !important;
  color: var(--ui-text-faint-fg, var(--muted)) !important;
}

/* positioning only — visuals come from ErrorNote */
.error-message {
  margin-top: 16px;
}

/* Footer actions as text buttons */
.btn {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.btn:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.btn.primary {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.btn.primary:hover:not(:disabled) {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
