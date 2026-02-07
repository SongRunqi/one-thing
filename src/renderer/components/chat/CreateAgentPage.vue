<template>
  <div class="create-agent-page">
    <div class="page-content">
      <h1 class="page-title">Create Custom Agent</h1>
      <p class="page-subtitle">Design an AI agent with specialized tools for specific tasks</p>

      <div class="create-form">
        <!-- Avatar Picker -->
        <div class="form-group">
          <label class="form-label">Avatar</label>
          <div class="avatar-picker">
            <div class="avatar-preview" @click="toggleAvatarPicker">
              <span v-if="form.avatar.type === 'emoji'" class="preview-emoji">
                {{ form.avatar.value || '?' }}
              </span>
              <img
                v-else-if="form.avatar.type === 'image' && form.avatar.value"
                :src="getImageSrc(form.avatar.value)"
                class="preview-image"
                alt=""
              />
              <span v-else class="preview-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
            </div>
            <div class="avatar-options">
              <button
                class="avatar-type-btn"
                :class="{ active: avatarPickerMode === 'emoji' }"
                @click="avatarPickerMode = 'emoji'; showEmojiPicker = true"
              >
                Emoji
              </button>
              <button
                class="avatar-type-btn"
                :class="{ active: avatarPickerMode === 'image' }"
                @click="selectImage"
              >
                Image
              </button>
            </div>
          </div>

          <!-- Emoji Grid -->
          <div v-if="showEmojiPicker && avatarPickerMode === 'emoji'" class="emoji-picker">
            <div class="emoji-grid">
              <button
                v-for="emoji in commonEmojis"
                :key="emoji"
                class="emoji-btn"
                :class="{ selected: form.avatar.type === 'emoji' && form.avatar.value === emoji }"
                @click="selectEmoji(emoji)"
              >
                {{ emoji }}
              </button>
            </div>
          </div>
        </div>

        <!-- Name -->
        <div class="form-group">
          <label class="form-label">Name</label>
          <input
            v-model="form.name"
            class="form-input"
            type="text"
            placeholder="e.g., Git Helper, API Client"
            maxlength="50"
          />
        </div>

        <!-- Description -->
        <div class="form-group">
          <label class="form-label">Description</label>
          <input
            v-model="form.description"
            class="form-input"
            type="text"
            placeholder="A short description of what this agent does"
            maxlength="200"
          />
          <span class="form-hint">This will be shown to the main LLM when selecting this agent.</span>
        </div>

        <!-- System Prompt -->
        <div class="form-group">
          <label class="form-label">System Prompt</label>
          <textarea
            v-model="form.systemPrompt"
            class="form-textarea"
            placeholder="Define the agent's behavior, expertise, and how it should use its tools..."
            rows="4"
          />
          <span class="form-hint">
            Instructions for how the agent should behave and complete tasks.
          </span>
        </div>

        <!-- Custom Tools Section -->
        <div class="form-group tools-section">
          <div class="section-header">
            <label class="form-label">Custom Tools</label>
            <button class="add-tool-btn" @click="addNewTool">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Tool
            </button>
          </div>

          <div v-if="form.customTools.length === 0" class="empty-tools">
            <div class="empty-tools-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <p class="empty-tools-text">No tools defined yet</p>
            <p class="empty-tools-hint">Add custom tools that this agent can use</p>
          </div>

          <div v-else class="tools-list">
            <div
              v-for="(tool, index) in form.customTools"
              :key="tool.id"
              class="tool-item"
            >
              <div class="tool-info">
                <div class="tool-header">
                  <span class="tool-name">{{ tool.name || 'Unnamed Tool' }}</span>
                  <span class="tool-type" :class="tool.execution.type">
                    {{ tool.execution.type }}
                  </span>
                </div>
                <p class="tool-description">{{ tool.description || 'No description' }}</p>
                <div class="tool-meta">
                  <span class="param-count">{{ tool.parameters.length }} params</span>
                  <span v-if="tool.execution.type === 'bash'" class="exec-preview">
                    {{ truncateCommand(tool.execution.command) }}
                  </span>
                  <span v-else-if="tool.execution.type === 'http'" class="exec-preview">
                    {{ tool.execution.method }} {{ truncateUrl(tool.execution.url) }}
                  </span>
                  <span v-else-if="tool.execution.type === 'builtin'" class="exec-preview">
                    {{ tool.execution.toolId }}
                  </span>
                </div>
              </div>
              <div class="tool-actions">
                <button class="tool-action-btn" @click="editTool(index)" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="tool-action-btn danger" @click="removeTool(index)" title="Remove">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Advanced Settings (collapsible) -->
        <div class="form-group">
          <div class="advanced-header" @click="showAdvancedSettings = !showAdvancedSettings">
            <label class="form-label clickable">
              <span>Advanced Settings</span>
              <span class="optional">(optional)</span>
            </label>
            <svg
              class="chevron"
              :class="{ expanded: showAdvancedSettings }"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          <div v-if="showAdvancedSettings" class="advanced-settings">
            <div class="setting-row">
              <label class="setting-label">Max Tool Calls</label>
              <input
                v-model.number="form.maxToolCalls"
                type="number"
                min="1"
                max="100"
                class="setting-input"
              />
              <span class="setting-hint">Maximum number of tool calls per execution (default: 20)</span>
            </div>

            <div class="setting-row">
              <label class="setting-label">Timeout (ms)</label>
              <input
                v-model.number="form.timeoutMs"
                type="number"
                min="1000"
                max="600000"
                step="1000"
                class="setting-input"
              />
              <span class="setting-hint">Maximum execution time in milliseconds (default: 120000)</span>
            </div>

            <div class="setting-row checkbox-row">
              <label class="checkbox-label">
                <input v-model="form.allowBuiltinTools" type="checkbox" class="form-checkbox" />
                <span>Allow Built-in Tools</span>
              </label>
              <span class="setting-hint">Allow the agent to use built-in tools in addition to custom tools</span>
            </div>

            <div class="setting-row checkbox-row">
              <label class="checkbox-label">
                <input v-model="form.enableMemory" type="checkbox" class="form-checkbox" />
                <span>Enable Memory</span>
              </label>
              <span class="setting-hint">Include user profile and agent relationship memory in the prompt</span>
            </div>

            <!-- Built-in Tools Selector -->
            <div v-if="form.allowBuiltinTools" class="builtin-tools-selector">
              <label class="form-label">Select Built-in Tools</label>
              <span class="setting-hint">Choose which built-in tools this agent can use.</span>
              <div class="tools-toggle-list">
                <div
                  v-for="tool in availableBuiltinTools"
                  :key="tool.id"
                  class="tool-toggle-item"
                >
                  <div class="tool-toggle-info">
                    <span class="tool-toggle-name">{{ tool.name }}</span>
                    <span class="tool-toggle-desc">{{ tool.description }}</span>
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: form.allowedBuiltinTools.includes(tool.id) }"
                    @click="toggleBuiltinTool(tool.id)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Source Selection -->
        <div class="form-group">
          <label class="form-label">Save Location</label>
          <div class="source-options">
            <label class="source-option" :class="{ active: form.source === 'user' }">
              <input v-model="form.source" type="radio" value="user" class="source-radio" />
              <div class="source-content">
                <span class="source-title">User</span>
                <span class="source-desc">Available in all projects</span>
              </div>
            </label>
            <label class="source-option" :class="{ active: form.source === 'project' }">
              <input v-model="form.source" type="radio" value="project" class="source-radio" />
              <div class="source-content">
                <span class="source-title">Project</span>
                <span class="source-desc">Only in current workspace</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="form-actions">
          <button class="btn secondary" @click="handleCancel">
            Cancel
          </button>
          <button
            class="btn primary"
            :disabled="!isFormValid || isSubmitting"
            @click="handleCreate"
          >
            <span v-if="isSubmitting" class="btn-spinner"></span>
            {{ isSubmitting ? 'Creating...' : 'Create Agent' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tool Editor Dialog -->
    <Teleport to="body">
      <div v-if="showToolEditor" class="tool-editor-overlay" @click.self="closeToolEditor">
        <div class="tool-editor-dialog">
          <CustomToolEditor
            :tool="editingTool"
            :mode="editingToolIndex === -1 ? 'create' : 'edit'"
            @save="handleToolSave"
            @cancel="closeToolEditor"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import CustomToolEditor from '../CustomToolEditor.vue'
import type { CustomAgent, CustomToolDefinition, CustomAgentConfig } from '@/types'

const emit = defineEmits<{
  'agent-created': [agent: CustomAgent]
  'cancel': []
}>()

const customAgentsStore = useCustomAgentsStore()

// Form state
const form = reactive<{
  name: string
  description: string
  systemPrompt: string
  avatar: { type: 'emoji' | 'image'; value: string }
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
  avatar: { type: 'emoji', value: '' },
  customTools: [],
  maxToolCalls: 20,
  timeoutMs: 120000,
  allowBuiltinTools: false,
  allowedBuiltinTools: [],
  enableMemory: true,
  source: 'user'
})

// UI state
const showEmojiPicker = ref(false)
const avatarPickerMode = ref<'emoji' | 'image'>('emoji')
const showAdvancedSettings = ref(false)
const isSubmitting = ref(false)

// Tool editor state
const showToolEditor = ref(false)
const editingToolIndex = ref(-1)
const editingTool = ref<CustomToolDefinition | undefined>(undefined)

// Common emojis for avatar selection
const commonEmojis = [
  // Tools & Tech
  '🔧', '🛠️', '⚙️', '🔩', '🔨', '🔌',
  '🤖', '💻', '🖥️', '📱', '🌐', '🔗',
  // Files & Data
  '📁', '📂', '📊', '📈', '🗃️', '💾',
  // Actions
  '🚀', '⚡', '🎯', '✨', '🔍', '📝',
  // Misc
  '🧩', '🎨', '🔮', '💡', '📦', '🗂️',
]

// Available built-in tools (loaded from backend)
const availableBuiltinTools = ref<Array<{ id: string; name: string; description: string }>>([])

// Load available built-in tools on mount
onMounted(async () => {
  try {
    availableBuiltinTools.value = await window.electronAPI.getAvailableBuiltinTools()
  } catch (error) {
    console.error('[CreateAgentPage] Failed to load builtin tools:', error)
  }
})

// Toggle a builtin tool in the allowedBuiltinTools list
function toggleBuiltinTool(toolId: string) {
  const index = form.allowedBuiltinTools.indexOf(toolId)
  if (index === -1) {
    form.allowedBuiltinTools.push(toolId)
  } else {
    form.allowedBuiltinTools.splice(index, 1)
  }
}

const isFormValid = computed(() => {
  return form.name.trim().length > 0 &&
         form.description.trim().length > 0 &&
         form.avatar.value.length > 0
})

function toggleAvatarPicker() {
  showEmojiPicker.value = !showEmojiPicker.value
}

function selectEmoji(emoji: string) {
  form.avatar = { type: 'emoji', value: emoji }
  showEmojiPicker.value = false
}

async function selectImage() {
  avatarPickerMode.value = 'image'
  showEmojiPicker.value = false

  try {
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openFile'],
      title: 'Select Avatar Image'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      const response = await fetch('file://' + filePath)
      const blob = await response.blob()
      const reader = new FileReader()

      reader.onload = () => {
        const base64 = reader.result as string
        form.avatar = { type: 'image', value: base64 }
      }

      reader.readAsDataURL(blob)
    }
  } catch (error) {
    console.error('Failed to select image:', error)
  }
}

function getImageSrc(value: string): string {
  if (value.startsWith('data:')) {
    return value
  }
  return 'file://' + value
}

// Tool management
function addNewTool() {
  editingToolIndex.value = -1
  editingTool.value = undefined
  showToolEditor.value = true
}

function editTool(index: number) {
  editingToolIndex.value = index
  editingTool.value = { ...form.customTools[index] }
  showToolEditor.value = true
}

function removeTool(index: number) {
  form.customTools.splice(index, 1)
}

function handleToolSave(tool: CustomToolDefinition) {
  if (editingToolIndex.value === -1) {
    // Adding new tool
    form.customTools.push(tool)
  } else {
    // Updating existing tool
    form.customTools[editingToolIndex.value] = tool
  }
  closeToolEditor()
}

function closeToolEditor() {
  showToolEditor.value = false
  editingToolIndex.value = -1
  editingTool.value = undefined
}

// Helpers for display
function truncateCommand(cmd: string): string {
  if (cmd.length <= 40) return cmd
  return cmd.slice(0, 40) + '...'
}

function truncateUrl(url: string): string {
  if (url.length <= 30) return url
  return url.slice(0, 30) + '...'
}

// Form actions
async function handleCreate() {
  if (!isFormValid.value || isSubmitting.value) return

  isSubmitting.value = true

  try {
    // Convert reactive objects to plain objects for IPC serialization
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
      emit('agent-created', agent)
    }
  } catch (error) {
    console.error('Failed to create agent:', error)
  } finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.create-agent-page {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
  padding-bottom: 120px;
  overflow-y: auto;
}

.page-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
  text-align: center;
}

.page-subtitle {
  font-size: 14px;
  color: var(--muted);
  margin: 0 0 32px;
  text-align: center;
}

.create-form {
  width: 100%;
}

/* Form Groups */
.form-group {
  margin-bottom: 24px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.form-label.clickable {
  cursor: pointer;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.form-input:hover,
.form-textarea:hover {
  border-color: var(--muted);
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--muted);
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

.optional {
  font-weight: 400;
  color: var(--muted);
}

/* Avatar Picker */
.avatar-picker {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  background: var(--hover);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.avatar-preview:hover {
  border-color: var(--accent);
  border-style: solid;
}

.preview-emoji {
  font-size: 36px;
  line-height: 1;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder {
  color: var(--muted);
}

.avatar-options {
  display: flex;
  gap: 8px;
}

.avatar-type-btn {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.avatar-type-btn:hover {
  background: var(--active);
}

.avatar-type-btn.active {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
  color: var(--accent);
}

/* Emoji Picker */
.emoji-picker {
  margin-top: 16px;
  padding: 16px;
  background: var(--hover);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 24px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.emoji-btn:hover {
  background: var(--active);
  transform: scale(1.1);
}

.emoji-btn.selected {
  background: rgba(var(--accent-rgb), 0.15);
  border-color: var(--accent);
}

/* Tools Section */
.tools-section {
  background: var(--hover);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header .form-label {
  margin-bottom: 0;
}

.add-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-tool-btn:hover {
  background: rgba(var(--accent-rgb), 0.2);
}

/* Empty Tools */
.empty-tools {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  text-align: center;
}

.empty-tools-icon {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 12px;
}

.empty-tools-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 4px;
}

.empty-tools-hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}

/* Tools List */
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.tool-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.tool-type {
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  border-radius: 4px;
}

.tool-type.bash {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.tool-type.http {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.tool-type.builtin {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.tool-description {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}

.param-count {
  padding: 2px 6px;
  background: var(--hover);
  border-radius: 4px;
}

.exec-preview {
  font-family: monospace;
  opacity: 0.7;
}

.tool-actions {
  display: flex;
  gap: 4px;
}

.tool-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-action-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.tool-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Advanced Settings */
.advanced-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px 0;
}

.chevron {
  transition: transform 0.2s ease;
  color: var(--muted);
}

.chevron.expanded {
  transform: rotate(180deg);
}

.advanced-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--hover);
  border-radius: 10px;
  margin-top: 12px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.setting-input {
  width: 120px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.setting-input:focus {
  outline: none;
  border-color: var(--accent);
}

.setting-hint {
  font-size: 11px;
  color: var(--muted);
}

.checkbox-row {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}

.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

/* Source Selection */
.source-options {
  display: flex;
  gap: 12px;
}

.source-option {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.source-option:hover {
  background: var(--active);
}

.source-option.active {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
}

.source-radio {
  margin-top: 2px;
  accent-color: var(--accent);
}

.source-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.source-desc {
  font-size: 12px;
  color: var(--muted);
}

/* Form Actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
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
  transform: translateY(-1px);
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

/* Built-in Tools Selector */
.builtin-tools-selector {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.builtin-tools-selector .form-label {
  margin-bottom: 4px;
}

.builtin-tools-selector .setting-hint {
  display: block;
  margin-bottom: 12px;
}

.tools-toggle-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.tool-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.tool-toggle-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tool-toggle-desc {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tool Editor Overlay */
.tool-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.tool-editor-dialog {
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  background: var(--bg);
  border-radius: 16px;
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* Responsive */
@media (max-width: 480px) {
  .emoji-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .source-options {
    flex-direction: column;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
