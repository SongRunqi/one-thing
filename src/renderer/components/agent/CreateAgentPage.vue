<template>
  <div class="create-agent-page" @keydown="handleKeydown" tabindex="0" ref="pageRef">
    <!-- Header -->
    <div class="page-header">
      <button class="back-btn" @click="handleClose" title="Back (Escape)">
        <ArrowLeft :size="20" :stroke-width="2" />
      </button>
      <h2 class="page-title">{{ isEditMode ? 'Edit Agent' : 'Create Custom Agent' }}</h2>
      <div class="header-spacer" />
      <!-- Source badge for edit mode -->
      <span v-if="isEditMode && agent" class="source-badge" :class="agent.source">
        {{ agent.source }}
      </span>
    </div>

    <!-- Main Content -->
    <div class="page-body">
      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" :stroke-width="2" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        <div class="tab-content-inner">
          <BasicSection
            v-show="activeTab === 'basic'"
            v-model:name="form.name"
            v-model:description="form.description"
            v-model:avatar="form.avatar"
            v-model:enableMemory="form.enableMemory"
            v-model:source="form.source"
          />

          <PromptSection
            v-show="activeTab === 'prompt'"
            v-model:systemPrompt="form.systemPrompt"
          />

          <ToolsSection
            v-show="activeTab === 'tools'"
            v-model:customTools="form.customTools"
          />

          <SettingsSection
            v-show="activeTab === 'settings'"
            v-model:maxToolCalls="form.maxToolCalls"
            v-model:timeoutMs="form.timeoutMs"
            v-model:allowBuiltinTools="form.allowBuiltinTools"
            v-model:allowedBuiltinTools="form.allowedBuiltinTools"
          />
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="page-footer">
      <div class="footer-hint">
        <span class="shortcut">{{ isMac ? '⌘' : 'Ctrl' }}+Enter</span> to {{ isEditMode ? 'save' : 'create' }}
      </div>
      <div class="footer-actions">
        <button class="btn secondary" @click="handleClose">
          Cancel
        </button>
        <button
          class="btn primary"
          :disabled="!isFormValid || isSubmitting"
          @click="handleSubmit"
        >
          <span v-if="isSubmitting" class="btn-spinner"></span>
          {{ submitButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ArrowLeft, User, FileText, Wrench, Settings } from 'lucide-vue-next'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import BasicSection from './sections/BasicSection.vue'
import PromptSection from './sections/PromptSection.vue'
import ToolsSection from './sections/ToolsSection.vue'
import SettingsSection from './sections/SettingsSection.vue'
import type { CustomAgent, CustomToolDefinition, CustomAgentConfig } from '@/types'

const props = defineProps<{
  agent?: CustomAgent | null  // If provided, we're in edit mode
}>()

const emit = defineEmits<{
  created: [agent: CustomAgent]
  saved: [agent: CustomAgent]
  close: []
}>()

const customAgentsStore = useCustomAgentsStore()
const pageRef = ref<HTMLElement | null>(null)

// Detect macOS for keyboard shortcut display
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

// Edit mode detection
const isEditMode = computed(() => !!props.agent)

// Button text
const submitButtonText = computed(() => {
  if (isSubmitting.value) {
    return isEditMode.value ? 'Saving...' : 'Creating...'
  }
  return isEditMode.value ? 'Save Changes' : 'Create Agent'
})

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

// Initialize form from agent in edit mode
watch(() => props.agent, (agent) => {
  if (agent) {
    form.name = agent.name
    form.description = agent.description
    form.systemPrompt = agent.systemPrompt
    // Handle both old emoji format and new icon format
    if (agent.avatar) {
      const av = agent.avatar as any
      if (av.type === 'emoji') {
        // Convert old emoji to default icon
        form.avatar = { type: 'icon', icon: 'Bot', gradient: 'purple-blue' }
      } else {
        form.avatar = { ...av }
      }
    }
    form.customTools = agent.customTools?.map(t => ({ ...t })) || []
    form.maxToolCalls = agent.maxToolCalls || 20
    form.timeoutMs = agent.timeoutMs || 120000
    form.allowBuiltinTools = agent.allowBuiltinTools || false
    form.allowedBuiltinTools = agent.allowedBuiltinTools || []
    form.enableMemory = agent.enableMemory ?? true
    form.source = agent.source || 'user'
  }
}, { immediate: true })

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
  // Cmd/Ctrl + Enter to submit
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    if (isFormValid.value && !isSubmitting.value) {
      handleSubmit()
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

// Submit handler - creates or updates based on mode
async function handleSubmit() {
  if (!isFormValid.value || isSubmitting.value) return

  isSubmitting.value = true

  try {
    const config = {
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

    if (isEditMode.value && props.agent) {
      // Update existing agent
      const updated = await customAgentsStore.updateCustomAgent(props.agent.id, config)
      if (updated) {
        emit('saved', updated)
      }
    } else {
      // Create new agent
      const agent = await customAgentsStore.createCustomAgent(
        config as Omit<CustomAgentConfig, 'id' | 'createdAt' | 'updatedAt'>,
        form.source
      )
      if (agent) {
        emit('created', agent)
      }
    }
  } catch (error) {
    console.error('Failed to save agent:', error)
  } finally {
    isSubmitting.value = false
  }
}

function handleClose() {
  emit('close')
}

// Focus the page on mount for keyboard shortcuts
onMounted(() => {
  pageRef.value?.focus()
})
</script>

<style scoped>
.create-agent-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg);
  outline: none;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--hover);
  color: var(--muted);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: var(--active);
  color: var(--text);
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.header-spacer {
  flex: 1;
}

.source-badge {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  border-radius: 6px;
}

.source-badge.user {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
}

.source-badge.project {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

/* Body */
.page-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: 4px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg);
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
  min-height: 0;
}

.tab-content-inner {
  max-width: 680px;
  margin: 0 auto;
  padding: 24px;
}

/* Footer */
.page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg);
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
  .page-header {
    padding: 12px 16px;
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

  .tab-content-inner {
    padding: 16px;
  }

  .page-footer {
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }

  .footer-actions {
    width: 100%;
  }

  .footer-actions .btn {
    flex: 1;
  }
}
</style>
