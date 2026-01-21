<template>
  <div class="custom-agent-dialog">
    <div class="dialog-header">
      <h2 class="dialog-title">
        Edit Agent
      </h2>
      <button
        class="close-btn"
        @click="$emit('close')"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line
            x1="18"
            y1="6"
            x2="6"
            y2="18"
          />
          <line
            x1="6"
            y1="6"
            x2="18"
            y2="18"
          />
        </svg>
      </button>
    </div>

    <div class="dialog-body">
      <!-- Avatar Picker -->
      <div class="form-group">
        <label class="form-label">Avatar</label>
        <div class="avatar-picker">
          <div
            class="avatar-preview"
            @click="toggleAvatarPicker"
          >
            <span
              v-if="form.avatar.type === 'emoji'"
              class="preview-emoji"
            >
              {{ form.avatar.value || '?' }}
            </span>
            <img
              v-else-if="form.avatar.type === 'image' && form.avatar.value"
              :src="getImageSrc(form.avatar.value)"
              class="preview-image"
              alt=""
            >
            <span
              v-else
              class="preview-placeholder"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line
                  x1="12"
                  y1="5"
                  x2="12"
                  y2="19"
                />
                <line
                  x1="5"
                  y1="12"
                  x2="19"
                  y2="12"
                />
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
              @click="selectImage"
            >
              Image
            </button>
          </div>
        </div>

        <!-- Emoji Grid -->
        <div
          v-if="showEmojiPicker && avatarPickerMode === 'emoji'"
          class="emoji-picker"
        >
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
          placeholder="Agent name"
          maxlength="50"
        >
      </div>

      <!-- Description -->
      <div class="form-group">
        <label class="form-label">Description</label>
        <input
          v-model="form.description"
          class="form-input"
          type="text"
          placeholder="What this agent does"
          maxlength="200"
        >
      </div>

      <!-- System Prompt -->
      <div class="form-group">
        <label class="form-label">System Prompt</label>
        <textarea
          v-model="form.systemPrompt"
          class="form-textarea"
          placeholder="Agent behavior instructions..."
          rows="3"
        />
      </div>

      <!-- Custom Tools Section -->
      <div class="form-group tools-section">
        <div class="section-header">
          <label class="form-label">Custom Tools</label>
          <button
            class="add-tool-btn"
            @click="addNewTool"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line
                x1="12"
                y1="5"
                x2="12"
                y2="19"
              />
              <line
                x1="5"
                y1="12"
                x2="19"
                y2="12"
              />
            </svg>
            Add
          </button>
        </div>

        <div
          v-if="form.customTools.length === 0"
          class="empty-tools"
        >
          <span>No tools defined</span>
        </div>

        <div
          v-else
          class="tools-list"
        >
          <div
            v-for="(tool, index) in form.customTools"
            :key="tool.id"
            class="tool-item"
          >
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span
                class="tool-type"
                :class="tool.execution.type"
              >{{ tool.execution.type }}</span>
            </div>
            <div class="tool-actions">
              <button
                class="tool-btn"
                title="Edit"
                @click="editTool(index)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                class="tool-btn danger"
                title="Remove"
                @click="removeTool(index)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line
                    x1="18"
                    y1="6"
                    x2="6"
                    y2="18"
                  />
                  <line
                    x1="6"
                    y1="6"
                    x2="18"
                    y2="18"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Advanced Settings -->
      <div class="form-group">
        <div
          class="advanced-toggle"
          @click="showAdvanced = !showAdvanced"
        >
          <span class="toggle-label">Advanced Settings</span>
          <svg
            class="toggle-icon"
            :class="{ expanded: showAdvanced }"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <div
          v-if="showAdvanced"
          class="advanced-content"
        >
          <div class="setting-row">
            <label>Max Tool Calls</label>
            <input
              v-model.number="form.maxToolCalls"
              type="number"
              min="1"
              max="100"
            >
          </div>
          <div class="setting-row">
            <label>Timeout (ms)</label>
            <input
              v-model.number="form.timeoutMs"
              type="number"
              min="1000"
              max="600000"
              step="1000"
            >
          </div>
          <div class="setting-row checkbox">
            <label>
              <input
                v-model="form.allowBuiltinTools"
                type="checkbox"
              >
              Allow Built-in Tools
            </label>
          </div>

          <!-- Built-in Tools Selector -->
          <div
            v-if="form.allowBuiltinTools"
            class="builtin-tools-selector"
          >
            <label class="selector-label">Select Built-in Tools</label>
            <span class="selector-hint">Choose which built-in tools this agent can use.</span>
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
    </div>

    <div class="dialog-footer">
      <span
        class="source-badge"
        :class="agent.source"
      >{{ agent.source }}</span>
      <div class="footer-actions">
        <button
          class="btn secondary"
          @click="$emit('close')"
        >
          Cancel
        </button>
        <button
          class="btn primary"
          :disabled="!isFormValid || isSaving"
          @click="handleSave"
        >
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </div>

    <!-- Tool Editor Dialog -->
    <Teleport to="body">
      <div
        v-if="showToolEditor"
        class="tool-editor-overlay"
        @click.self="closeToolEditor"
      >
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
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useCustomAgentsStore } from '@/stores/custom-agents'
import CustomToolEditor from './CustomToolEditor.vue'
import type { CustomAgent, CustomToolDefinition } from '@/types'

const props = defineProps<{
  agent: CustomAgent
}>()

const emit = defineEmits<{
  close: []
  saved: [agent: CustomAgent]
}>()

const customAgentsStore = useCustomAgentsStore()

// Form state - initialized from props.agent
const form = reactive({
  name: '',
  description: '',
  systemPrompt: '',
  avatar: { type: 'emoji' as 'emoji' | 'image', value: '' },
  customTools: [] as CustomToolDefinition[],
  maxToolCalls: 20,
  timeoutMs: 120000,
  allowBuiltinTools: false,
  allowedBuiltinTools: [] as string[],
})

// Initialize form from agent
watch(() => props.agent, (agent) => {
  if (agent) {
    form.name = agent.name
    form.description = agent.description
    form.systemPrompt = agent.systemPrompt
    form.avatar = { ...agent.avatar } as { type: 'emoji' | 'image'; value: string }
    form.customTools = agent.customTools.map(t => ({ ...t }))
    form.maxToolCalls = agent.maxToolCalls || 20
    form.timeoutMs = agent.timeoutMs || 120000
    form.allowBuiltinTools = agent.allowBuiltinTools || false
    form.allowedBuiltinTools = agent.allowedBuiltinTools || []
  }
}, { immediate: true })

// UI state
const showEmojiPicker = ref(false)
const avatarPickerMode = ref<'emoji' | 'image'>('emoji')
const showAdvanced = ref(false)
const isSaving = ref(false)

// Tool editor state
const showToolEditor = ref(false)
const editingToolIndex = ref(-1)
const editingTool = ref<CustomToolDefinition | null>(null)

// Common emojis
const commonEmojis = [
  '🔧', '🛠️', '⚙️', '🔩', '🔨', '🔌',
  '🤖', '💻', '🖥️', '📱', '🌐', '🔗',
  '📁', '📂', '📊', '📈', '🗃️', '💾',
  '🚀', '⚡', '🎯', '✨', '🔍', '📝',
]

// Available built-in tools (loaded from backend)
const availableBuiltinTools = ref<Array<{ id: string; name: string; description: string }>>([])

// Load available built-in tools on mount
onMounted(async () => {
  try {
    availableBuiltinTools.value = await window.electronAPI.getAvailableBuiltinTools()
  } catch (error) {
    console.error('[CustomAgentDialog] Failed to load builtin tools:', error)
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
        form.avatar = { type: 'image', value: reader.result as string }
      }

      reader.readAsDataURL(blob)
    }
  } catch (error) {
    console.error('Failed to select image:', error)
  }
}

function getImageSrc(value: string): string {
  if (value.startsWith('data:')) return value
  return 'file://' + value
}

// Tool management
function addNewTool() {
  editingToolIndex.value = -1
  editingTool.value = null
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
    form.customTools.push(tool)
  } else {
    form.customTools[editingToolIndex.value] = tool
  }
  closeToolEditor()
}

function closeToolEditor() {
  showToolEditor.value = false
  editingToolIndex.value = -1
  editingTool.value = null
}

async function handleSave() {
  if (!isFormValid.value || isSaving.value) return

  isSaving.value = true

  try {
    // Convert reactive objects to plain objects for IPC serialization
    const updates = {
      name: form.name.trim(),
      description: form.description.trim(),
      systemPrompt: form.systemPrompt.trim(),
      avatar: { ...form.avatar },
      customTools: JSON.parse(JSON.stringify(form.customTools)),
      maxToolCalls: form.maxToolCalls,
      timeoutMs: form.timeoutMs,
      allowBuiltinTools: form.allowBuiltinTools,
      allowedBuiltinTools: [...form.allowedBuiltinTools],
    }

    const updated = await customAgentsStore.updateCustomAgent(props.agent.id, updates)

    if (updated) {
      emit('saved', updated)
      emit('close')
    }
  } catch (error) {
    console.error('Failed to save agent:', error)
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.custom-agent-dialog {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.dialog-title {
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
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
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

.footer-actions {
  display: flex;
  gap: 8px;
}

/* Form Styles */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 8px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--muted);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

/* Avatar Picker */
.avatar-picker {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.avatar-preview {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--hover);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}

.avatar-preview:hover {
  border-color: var(--accent);
  border-style: solid;
}

.preview-emoji {
  font-size: 28px;
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
  gap: 6px;
}

.avatar-type-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
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
  margin-top: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 20px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.emoji-btn:hover {
  background: var(--active);
}

.emoji-btn.selected {
  background: rgba(var(--accent-rgb), 0.15);
  border-color: var(--accent);
}

/* Tools Section */
.tools-section {
  background: var(--hover);
  border-radius: 10px;
  padding: 12px;
  border: 1px solid var(--border);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-header .form-label {
  margin-bottom: 0;
}

.add-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.add-tool-btn:hover {
  background: rgba(var(--accent-rgb), 0.2);
}

.empty-tools {
  text-align: center;
  padding: 16px;
  font-size: 13px;
  color: var(--muted);
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.tool-type {
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  border-radius: 3px;
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

.tool-actions {
  display: flex;
  gap: 4px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 4px;
  cursor: pointer;
}

.tool-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.tool-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Advanced Settings */
.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  cursor: pointer;
}

.toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}

.toggle-icon {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

.advanced-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: 8px;
  margin-top: 8px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-row label {
  font-size: 13px;
  color: var(--text);
  min-width: 100px;
}

.setting-row input[type="number"] {
  width: 100px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.setting-row input[type="number"]:focus {
  outline: none;
  border-color: var(--accent);
}

.setting-row.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.setting-row.checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

/* Buttons */
.btn {
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
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

/* Built-in Tools Selector */
.builtin-tools-selector {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.selector-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 4px;
}

.selector-hint {
  display: block;
  font-size: 11px;
  color: var(--muted);
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
  z-index: 1100;
  padding: 20px;
}

.tool-editor-dialog {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  background: var(--bg);
  border-radius: 12px;
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
</style>
