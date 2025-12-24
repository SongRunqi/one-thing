<template>
  <div class="agent-settings-overlay" @click.self="$emit('close')">
    <div class="agent-settings-panel">
      <header class="panel-header">
        <div class="header-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <h2>Agent Settings</h2>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div v-if="agent" class="panel-content">
        <!-- Avatar Section -->
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
            placeholder="e.g., English Teacher"
            maxlength="50"
          />
        </div>

        <!-- System Prompt -->
        <div class="form-group">
          <label class="form-label">System Prompt</label>
          <textarea
            v-model="form.systemPrompt"
            class="form-textarea"
            placeholder="Describe the character's personality, speaking style, and role..."
            rows="8"
          />
          <span class="form-hint">
            This will be prepended to every conversation using this agent.
          </span>
        </div>
      </div>

      <div v-else class="panel-content empty-state">
        <p>No agent selected</p>
      </div>

      <footer class="panel-footer">
        <button v-if="agent" class="btn danger-ghost" @click="handleDelete">
          Delete Agent
        </button>
        <div class="footer-right">
          <button class="btn secondary" @click="$emit('close')">Cancel</button>
          <button class="btn primary" :disabled="!isValid || !hasChanges" @click="handleSave">
            Save
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, toRaw } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import type { Agent, AgentAvatar } from '@/types'

const props = defineProps<{
  agent: Agent | null | undefined
}>()

const emit = defineEmits<{
  close: []
}>()

const agentsStore = useAgentsStore()

// Form state
const form = reactive({
  name: '',
  avatar: { type: 'emoji', value: '' } as AgentAvatar,
  systemPrompt: ''
})

const showEmojiPicker = ref(false)
const avatarPickerMode = ref<'emoji' | 'image'>('emoji')

// Common emojis for avatar selection
const commonEmojis = [
  // People & Roles
  '🤖', '👩‍🏫', '🧑‍💻', '👨‍⚕️', '👩‍🔬', '🧙‍♂️',
  '🦸‍♀️', '🧑‍🎨', '👨‍🍳', '🧑‍✈️', '👩‍🚀', '🥷',
  // Animals
  '🐱', '🐶', '🦊', '🐼', '🦁', '🐸',
  // Objects
  '💡', '🎯', '🔮', '📚', '🎨', '🎭',
  // Nature
  '🌟', '🌈', '🔥', '💎', '🌸', '🍀',
]

// Original values for change detection
const originalValues = ref<{ name: string; avatar: AgentAvatar; systemPrompt: string } | null>(null)

const isValid = computed(() => {
  return form.name.trim().length > 0 && form.avatar.value.length > 0
})

const hasChanges = computed(() => {
  if (!originalValues.value) return false
  return (
    form.name !== originalValues.value.name ||
    form.avatar.type !== originalValues.value.avatar.type ||
    form.avatar.value !== originalValues.value.avatar.value ||
    form.systemPrompt !== originalValues.value.systemPrompt
  )
})

// Watch for agent changes to populate form
watch(() => props.agent, (agent) => {
  if (agent) {
    form.name = agent.name
    form.avatar = { ...agent.avatar }
    form.systemPrompt = agent.systemPrompt
    avatarPickerMode.value = agent.avatar.type
    originalValues.value = {
      name: agent.name,
      avatar: { ...agent.avatar },
      systemPrompt: agent.systemPrompt
    }
  } else {
    resetForm()
  }
}, { immediate: true })

function resetForm() {
  form.name = ''
  form.avatar = { type: 'emoji', value: '' }
  form.systemPrompt = ''
  showEmojiPicker.value = false
  avatarPickerMode.value = 'emoji'
  originalValues.value = null
}

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

      reader.onload = async () => {
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

async function handleSave() {
  if (!isValid.value || !props.agent) return

  try {
    // Check if avatar is a new base64 image that needs uploading
    let avatarToSave = toRaw(form.avatar)
    if (form.avatar.type === 'image' && form.avatar.value.startsWith('data:')) {
      const mimeMatch = form.avatar.value.match(/^data:(.+?);base64,/)
      if (mimeMatch) {
        const mimeType = mimeMatch[1]
        const avatarPath = await agentsStore.uploadAvatar(
          props.agent.id,
          form.avatar.value,
          mimeType
        )
        if (avatarPath) {
          avatarToSave = { type: 'image', value: avatarPath }
        }
      }
    }

    await agentsStore.updateAgent(props.agent.id, {
      name: form.name.trim(),
      avatar: avatarToSave,
      systemPrompt: form.systemPrompt
    })

    // Update original values after successful save
    originalValues.value = {
      name: form.name.trim(),
      avatar: { ...avatarToSave },
      systemPrompt: form.systemPrompt
    }

    emit('close')
  } catch (error) {
    console.error('Failed to save agent:', error)
  }
}

async function handleDelete() {
  if (!props.agent) return

  const confirmed = confirm(`Delete agent "${props.agent.name}"? This cannot be undone.`)
  if (confirmed) {
    await agentsStore.deleteAgent(props.agent.id)
    agentsStore.selectAgent(null)
    emit('close')
  }
}
</script>

<style scoped>
.agent-settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(8px);
  padding: 20px;
}

.agent-settings-panel {
  width: min(480px, 100%);
  max-height: 85vh;
  background: var(--bg);
  border-radius: 20px;
  border: 1px solid var(--border);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalPop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

html[data-theme='light'] .panel-header {
  background: rgba(0, 0, 0, 0.02);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}

.header-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 14px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
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
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.15);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--muted);
}

.form-textarea {
  resize: vertical;
  min-height: 160px;
  font-family: inherit;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

/* Avatar Picker */
.avatar-picker {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--hover);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.avatar-preview:hover {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.05);
}

.preview-emoji {
  font-size: 32px;
  line-height: 1;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
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
  border-radius: var(--radius-sm);
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
  margin-top: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: var(--radius-sm);
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
  width: 40px;
  height: 40px;
  font-size: 22px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.emoji-btn:hover {
  background: var(--active);
}

.emoji-btn.selected {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: var(--accent);
}

/* Footer */
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.footer-right {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

/* Buttons */
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
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--hover);
}

.btn.danger-ghost {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.btn.danger-ghost:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

/* Responsive */
@media (max-width: 480px) {
  .agent-settings-panel {
    width: 100%;
    max-height: 90vh;
    border-radius: 16px;
  }

  .panel-header {
    padding: 14px 16px;
  }

  .panel-content {
    padding: 16px;
  }

  .panel-footer {
    padding: 14px 16px;
    flex-direction: column;
    gap: 12px;
  }

  .footer-right {
    width: 100%;
    justify-content: flex-end;
  }

  .btn.danger-ghost {
    width: 100%;
  }
}
</style>
