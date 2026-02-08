<template>
  <Transition name="diff-overlay">
    <div
      v-if="visible"
      class="diff-overlay"
    >
      <div class="diff-overlay-header">
        <div class="diff-file-info">
          <span class="diff-file-path">{{ filePath }}</span>
          <span
            v-if="isStaged"
            class="staged-badge"
          >Staged</span>
        </div>
        <button
          class="close-btn"
          title="Close (Esc)"
          @click="$emit('close')"
        >
          <X
            :size="18"
            :stroke-width="1.5"
          />
        </button>
      </div>
      <div class="diff-overlay-content">
        <div
          v-if="loading"
          class="loading-state"
        >
          <div class="loading-spinner" />
          <span>Loading diff...</span>
        </div>
        <div
          v-else-if="error"
          class="error-state"
        >
          <span>{{ error }}</span>
        </div>
        <DiffView
          v-else-if="diff"
          :diff="diff"
          :file-name="filePath"
          :show-file-name="false"
          :old-content="oldContent"
          :new-content="newContent"
          :expand-unchanged="true"
          :expansion-line-count="5"
          diff-style="unified"
          max-height="100%"
        />
        <div
          v-else
          class="empty-state"
        >
          <span>No changes to display</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import DiffView from '@/components/chat/message/DiffView.vue'

const props = defineProps<{
  visible: boolean
  filePath: string
  workingDirectory: string
  sessionId: string
  isStaged?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const diff = ref<string>('')
const oldContent = ref<string | undefined>(undefined)
const newContent = ref<string | undefined>(undefined)

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

async function loadDiff() {
  if (!props.filePath || !props.workingDirectory || !props.sessionId) return

  loading.value = true
  error.value = null

  try {
    const diffCommand = props.isStaged
      ? `git diff --cached -- "${props.filePath}"`
      : `git diff -- "${props.filePath}"`

    const fullPath = props.filePath.startsWith('/')
      ? props.filePath
      : `${props.workingDirectory}/${props.filePath}`

    const [diffResult, oldContentResult, newContentResult] = await Promise.all([
      window.electronAPI.executeTool(
        'bash',
        { command: diffCommand, working_directory: props.workingDirectory },
        `git-diff-${Date.now()}`,
        props.sessionId
      ),
      window.electronAPI.executeTool(
        'bash',
        {
          command: `git show HEAD:"${props.filePath}"`,
          working_directory: props.workingDirectory
        },
        `git-show-old-${Date.now()}`,
        props.sessionId
      ),
      window.electronAPI.readFileContent(fullPath)
    ])

    if (diffResult.success) {
      diff.value = getToolOutput(diffResult) || '(No changes)'
      const oldContentRaw = oldContentResult.success ? getToolOutput(oldContentResult) : ''
      const newContentRaw = newContentResult.success ? (newContentResult.content || '') : ''
      oldContent.value = oldContentRaw || undefined
      newContent.value = newContentRaw || undefined
    } else {
      error.value = diffResult.error || 'Failed to get diff'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

// Handle Escape key
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    emit('close')
  }
}

// Watch for visibility changes to load diff
watch(() => props.visible, (visible) => {
  if (visible) {
    loadDiff()
  } else {
    // Reset state when closed
    diff.value = ''
    oldContent.value = undefined
    newContent.value = undefined
    error.value = null
  }
})

// Watch for file path changes while visible
watch(() => props.filePath, () => {
  if (props.visible) {
    loadDiff()
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  if (props.visible) {
    loadDiff()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.diff-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 65%;
  min-width: 400px;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-left: 1px solid var(--border-subtle);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 100;
}

html[data-theme='light'] .diff-overlay {
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
}

.diff-overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.diff-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.diff-file-path {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staged-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: rgba(var(--success-rgb, 34, 197, 94), 0.15);
  color: var(--success, #22c55e);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.diff-overlay-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--muted);
  font-size: 13px;
}

.error-state {
  color: var(--error, #ef4444);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Remove border from DiffView when in overlay */
.diff-overlay-content :deep(.diff-view) {
  border: none;
  border-radius: 0;
}

/* Transition animations */
.diff-overlay-enter-active,
.diff-overlay-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease;
}

.diff-overlay-enter-from,
.diff-overlay-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
