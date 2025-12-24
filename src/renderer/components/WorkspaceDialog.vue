<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog workspace-dialog">
        <div class="dialog-header">
          <div class="dialog-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h3>{{ isEditing ? 'Edit Workspace' : 'Create Workspace' }}</h3>
        </div>

        <div class="dialog-body">
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
                  @click="avatarPickerMode = 'emoji'"
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
              rows="6"
            />
            <span class="form-hint">
              This will be prepended to every conversation in this workspace.
            </span>
          </div>
        </div>

        <div class="dialog-actions">
          <button v-if="isEditing" class="btn danger-ghost" @click="handleDelete">
            Delete
          </button>
          <div class="dialog-actions-right">
            <button class="btn secondary" @click="handleClose">Cancel</button>
            <button class="btn primary" :disabled="!isValid" @click="handleSave">
              {{ isEditing ? 'Save' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useWorkspacesStore } from '@/stores/workspaces'
import type { Workspace, WorkspaceAvatar } from '@/types'

const props = defineProps<{
  visible: boolean
  workspace?: Workspace | null
}>()

const emit = defineEmits<{
  close: []
}>()

const workspacesStore = useWorkspacesStore()

// Form state
const form = reactive({
  name: '',
  avatar: { type: 'emoji', value: '' } as WorkspaceAvatar,
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

const isEditing = computed(() => !!props.workspace)

const isValid = computed(() => {
  return form.name.trim().length > 0 && form.avatar.value.length > 0
})

// Watch for workspace changes to populate form
watch(() => props.workspace, (workspace) => {
  if (workspace) {
    form.name = workspace.name
    form.avatar = { ...workspace.avatar }
    form.systemPrompt = workspace.systemPrompt
    avatarPickerMode.value = workspace.avatar.type
  } else {
    resetForm()
  }
}, { immediate: true })

watch(() => props.visible, (visible) => {
  if (visible && !props.workspace) {
    resetForm()
  }
})

function resetForm() {
  form.name = ''
  form.avatar = { type: 'emoji', value: '' }
  form.systemPrompt = ''
  showEmojiPicker.value = false
  avatarPickerMode.value = 'emoji'
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
      // Read image as base64 for preview and upload
      const response = await fetch('file://' + filePath)
      const blob = await response.blob()
      const reader = new FileReader()

      reader.onload = async () => {
        const base64 = reader.result as string
        // Store temporarily for preview
        form.avatar = { type: 'image', value: base64 }
      }

      reader.readAsDataURL(blob)
    }
  } catch (error) {
    console.error('Failed to select image:', error)
  }
}

function getImageSrc(value: string): string {
  // If it's a base64 data URL, use directly
  if (value.startsWith('data:')) {
    return value
  }
  // Otherwise it's a file path
  return 'file://' + value
}

async function handleSave() {
  if (!isValid.value) return

  try {
    if (isEditing.value && props.workspace) {
      // Check if avatar is a new base64 image that needs uploading
      let avatarToSave = form.avatar
      if (form.avatar.type === 'image' && form.avatar.value.startsWith('data:')) {
        const mimeMatch = form.avatar.value.match(/^data:(.+?);base64,/)
        if (mimeMatch) {
          const mimeType = mimeMatch[1]
          const avatarPath = await workspacesStore.uploadAvatar(
            props.workspace.id,
            form.avatar.value,
            mimeType
          )
          if (avatarPath) {
            avatarToSave = { type: 'image', value: avatarPath }
          }
        }
      }

      await workspacesStore.updateWorkspace(props.workspace.id, {
        name: form.name.trim(),
        avatar: avatarToSave,
        systemPrompt: form.systemPrompt
      })
    } else {
      // Create new workspace
      const workspace = await workspacesStore.createWorkspace(
        form.name.trim(),
        form.avatar,
        form.systemPrompt
      )

      // If avatar is base64 image, upload it
      if (workspace && form.avatar.type === 'image' && form.avatar.value.startsWith('data:')) {
        const mimeMatch = form.avatar.value.match(/^data:(.+?);base64,/)
        if (mimeMatch) {
          const mimeType = mimeMatch[1]
          const avatarPath = await workspacesStore.uploadAvatar(
            workspace.id,
            form.avatar.value,
            mimeType
          )
          if (avatarPath) {
            await workspacesStore.updateWorkspace(workspace.id, {
              avatar: { type: 'image', value: avatarPath }
            })
          }
        }
      }
    }

    emit('close')
  } catch (error) {
    console.error('Failed to save workspace:', error)
  }
}

async function handleDelete() {
  if (!props.workspace) return

  const confirmed = confirm(`Delete workspace "${props.workspace.name}"? All sessions in this workspace will be deleted.`)
  if (confirmed) {
    await workspacesStore.deleteWorkspace(props.workspace.id)
    emit('close')
  }
}

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.dialog-body {
  padding: 24px;
  overflow-y: auto;
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
  min-height: 120px;
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

/* Dialog Actions */
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.dialog-actions-right {
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
</style>
