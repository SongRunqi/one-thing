<template>
  <Teleport to="body">
    <Transition name="commit-dialog">
      <div
        v-if="visible"
        class="commit-dialog-backdrop"
        @click.self="$emit('close')"
      >
        <div class="commit-dialog">
          <div class="dialog-header">
            <h3>Commit Changes</h3>
            <button
              class="close-btn"
              title="Close (Esc)"
              @click="$emit('close')"
            >
              <X
                :size="16"
                :stroke-width="1.5"
              />
            </button>
          </div>

          <div class="dialog-body">
            <div class="staged-summary">
              <GitCommitHorizontal
                :size="16"
                :stroke-width="1.5"
              />
              <span>{{ stagedCount }} file{{ stagedCount !== 1 ? 's' : '' }} staged for commit</span>
            </div>

            <div class="input-group">
              <label for="commit-message">Commit Message</label>
              <textarea
                id="commit-message"
                ref="messageInput"
                v-model="commitMessage"
                placeholder="Enter a descriptive commit message..."
                rows="4"
                @keydown.ctrl.enter="handleCommit"
                @keydown.meta.enter="handleCommit"
              />
              <span class="hint">Press Ctrl+Enter to commit</span>
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
              :disabled="!commitMessage.trim() || isCommitting"
              @click="handleCommit"
            >
              <Loader2
                v-if="isCommitting"
                :size="14"
                class="spinning"
              />
              <span>{{ isCommitting ? 'Committing...' : 'Commit' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { X, GitCommitHorizontal, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  stagedCount: number
  workingDirectory: string
  sessionId: string
}>()

const emit = defineEmits<{
  close: []
  committed: []
}>()

const commitMessage = ref('')
const isCommitting = ref(false)
const messageInput = ref<HTMLTextAreaElement | null>(null)

// Helper to extract tool output from bash execution result
function getToolOutput(result: { result?: unknown }): string {
  const raw = result.result
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const stdout = (raw as { stdout?: unknown }).stdout
    if (typeof stdout === 'string') return stdout
    const output = (raw as { output?: unknown }).output
    if (typeof output === 'string') return output
  }
  return ''
}

async function handleCommit() {
  if (!commitMessage.value.trim() || isCommitting.value) return

  isCommitting.value = true

  try {
    // Escape quotes in commit message
    const escapedMessage = commitMessage.value.replace(/"/g, '\\"')
    const command = `git commit -m "${escapedMessage}"`

    const result = await window.electronAPI.executeTool(
      'bash',
      { command, working_directory: props.workingDirectory },
      `git-commit-${Date.now()}`,
      props.sessionId
    )

    if (result.success) {
      commitMessage.value = ''
      emit('committed')
      emit('close')
    } else {
      // Show error in console for now
      console.error('[CommitDialog] Commit failed:', result.error)
      alert(`Commit failed: ${result.error || 'Unknown error'}`)
    }
  } catch (error) {
    console.error('[CommitDialog] Error:', error)
    alert(`Commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isCommitting.value = false
  }
}

// Handle Escape key
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    emit('close')
  }
}

// Focus input when dialog opens
watch(() => props.visible, async (visible) => {
  if (visible) {
    await nextTick()
    messageInput.value?.focus()
  } else {
    commitMessage.value = ''
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.commit-dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

html[data-theme='light'] .commit-dialog-backdrop {
  background: rgba(0, 0, 0, 0.3);
}

.commit-dialog {
  width: 90%;
  max-width: 500px;
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

html[data-theme='light'] .commit-dialog {
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.staged-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
}

.staged-summary svg {
  color: var(--accent);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input-group textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.15);
}

.input-group textarea::placeholder {
  color: var(--muted);
}

.input-group .hint {
  font-size: 11px;
  color: var(--muted);
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.secondary {
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.btn.secondary:hover {
  background: var(--hover);
  border-color: var(--border-default);
  color: var(--text);
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Transition animations */
.commit-dialog-enter-active,
.commit-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.commit-dialog-enter-active .commit-dialog,
.commit-dialog-leave-active .commit-dialog {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.commit-dialog-enter-from,
.commit-dialog-leave-to {
  opacity: 0;
}

.commit-dialog-enter-from .commit-dialog,
.commit-dialog-leave-to .commit-dialog {
  transform: scale(0.95);
}
</style>
