<template>
  <Teleport to="body">
    <div
      class="create-agent-overlay"
      @click.self="handleClose"
    >
      <div
        class="create-agent-modal"
        @keydown="handleKeydown"
      >
        <!-- Header -->
        <div class="modal-header">
          <h2 class="modal-title">
            Create Custom Agent
          </h2>
          <button
            class="close-btn"
            title="Close (Escape)"
            @click="handleClose"
          >
            <X
              :size="20"
              :stroke-width="2"
            />
          </button>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-nav">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="tab-btn"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <component
              :is="tab.icon"
              :size="16"
              :stroke-width="2"
            />
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
          <BasicSection
            v-show="activeTab === 'basic'"
            v-model:name="form.name"
            v-model:description="form.description"
            v-model:avatar="form.avatar"
            v-model:enable-memory="form.enableMemory"
            v-model:source="form.source"
          />

          <PromptSection
            v-show="activeTab === 'prompt'"
            v-model:system-prompt="form.systemPrompt"
          />

          <ToolsSection
            v-show="activeTab === 'tools'"
            v-model:custom-tools="form.customTools"
          />

          <SettingsSection
            v-show="activeTab === 'settings'"
            v-model:max-tool-calls="form.maxToolCalls"
            v-model:timeout-ms="form.timeoutMs"
            v-model:allow-builtin-tools="form.allowBuiltinTools"
            v-model:allowed-builtin-tools="form.allowedBuiltinTools"
          />
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-hint">
            <span class="shortcut">{{ isMac ? '⌘' : 'Ctrl' }}+Enter</span> to create
          </div>
          <div class="footer-actions">
            <button
              class="btn secondary"
              @click="handleClose"
            >
              Cancel
            </button>
            <button
              class="btn primary"
              :disabled="!isFormValid || isSubmitting"
              @click="handleCreate"
            >
              <span
                v-if="isSubmitting"
                class="btn-spinner"
              />
              {{ isSubmitting ? 'Creating...' : 'Create Agent' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { X, User, FileText, Wrench, Settings } from 'lucide-vue-next'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import BasicSection from './sections/BasicSection.vue'
import PromptSection from './sections/PromptSection.vue'
import ToolsSection from './sections/ToolsSection.vue'
import SettingsSection from './sections/SettingsSection.vue'
import type { CustomAgent, CustomToolDefinition, CustomAgentConfig } from '@/types'

const emit = defineEmits<{
  created: [agent: CustomAgent]
  close: []
}>()

const customAgentsStore = useCustomAgentsStore()

// Detect macOS for keyboard shortcut display
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

// Tab configuration
type TabId = 'basic' | 'prompt' | 'tools' | 'settings'
const tabs: Array<{ id: TabId; label: string; icon: typeof User }> = [
  { id: 'basic', label: 'Basic', icon: User },
  { id: 'prompt', label: 'Prompt', icon: FileText },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const activeTab = ref<TabId>('basic')

// Form state
const form = reactive<{
  name: string
  description: string
  systemPrompt: string
  avatar: { type: 'icon' | 'image'; icon?: string; gradient?: string; value?: string }
  customTools: CustomToolDefinition[]
  maxToolCalls: number
  timeoutMs: number
  allowBuiltinTools: boolean
  allowedBuiltinTools: string[]
  enableMemory: boolean
  source: 'user' | 'project'
}>({
  name: '',
  description: '',
  systemPrompt: '',
  avatar: { type: 'icon', icon: 'Bot', gradient: 'purple-blue' },
  customTools: [],
  maxToolCalls: 20,
  timeoutMs: 120000,
  allowBuiltinTools: false,
  allowedBuiltinTools: [],
  enableMemory: true,
  source: 'user'
})

const isSubmitting = ref(false)

// Form validation
const isFormValid = computed(() => {
  const hasValidAvatar = form.avatar.type === 'icon'
    ? (form.avatar.icon && form.avatar.gradient)
    : (form.avatar.value && form.avatar.value.length > 0)

  return form.name.trim().length > 0 &&
         form.description.trim().length > 0 &&
         hasValidAvatar
})

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  // Cmd/Ctrl + Enter to create
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    if (isFormValid.value && !isSubmitting.value) {
      handleCreate()
    }
  }
  // Escape to close
  if (e.key === 'Escape') {
    e.preventDefault()
    handleClose()
  }
  // Tab switching with Cmd/Ctrl + 1-4
  if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4'].includes(e.key)) {
    e.preventDefault()
    const tabIndex = parseInt(e.key) - 1
    activeTab.value = tabs[tabIndex].id as typeof activeTab.value
  }
}

// Create agent
async function handleCreate() {
  if (!isFormValid.value || isSubmitting.value) return

  isSubmitting.value = true

  try {
    const config: Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: form.name.trim(),
      description: form.description.trim(),
      systemPrompt: form.systemPrompt.trim(),
      avatar: { ...form.avatar },
      customTools: JSON.parse(JSON.stringify(form.customTools)),
      maxToolCalls: form.maxToolCalls,
      timeoutMs: form.timeoutMs,
      allowBuiltinTools: form.allowBuiltinTools,
      allowedBuiltinTools: [...form.allowedBuiltinTools],
      enableMemory: form.enableMemory,
    }

    const agent = await customAgentsStore.createCustomAgent(config, form.source)

    if (agent) {
      emit('created', agent)
    }
  } catch (error) {
    console.error('Failed to create agent:', error)
  } finally {
    isSubmitting.value = false
  }
}

function handleClose() {
  emit('close')
}

// Focus trap - keep focus within modal
onMounted(() => {
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<style scoped>
.create-agent-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 20px;
  animation: fadeIn 0.15s ease;
}

html[data-theme='light'] .create-agent-overlay {
  background: rgba(0, 0, 0, 0.4);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.create-agent-modal {
  width: 100%;
  max-width: 720px;
  max-height: 85vh;
  background: var(--bg);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.2s cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: 4px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.tab-btn.active {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
}

/* Tab Content */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  min-height: 0;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.footer-hint {
  font-size: 12px;
  color: var(--muted);
}

.shortcut {
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.1);
}

.btn.secondary {
  background: var(--hover);
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--active);
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 600px) {
  .create-agent-modal {
    max-height: 95vh;
  }

  .tab-nav {
    overflow-x: auto;
    padding: 8px 16px;
  }

  .tab-btn {
    padding: 8px 12px;
    font-size: 13px;
  }

  .tab-btn span {
    display: none;
  }

  .tab-content {
    padding: 16px;
  }

  .modal-footer {
    flex-direction: column;
    gap: 12px;
  }

  .footer-actions {
    width: 100%;
  }

  .footer-actions .btn {
    flex: 1;
  }
}
</style>
