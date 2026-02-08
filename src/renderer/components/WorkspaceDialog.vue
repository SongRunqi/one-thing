<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="dialog-overlay"
      @click.self="handleClose"
    >
      <div class="dialog workspace-dialog">
        <div class="dialog-header">
          <div class="dialog-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle
                cx="12"
                cy="7"
                r="4"
              />
            </svg>
          </div>
          <h3>{{ isEditing ? 'Edit Workspace' : 'Create Workspace' }}</h3>
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
                    width="24"
                    height="24"
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
              placeholder="e.g., English Teacher"
              maxlength="50"
            >
          </div>

          <!-- Working Directory -->
          <div class="form-group">
            <label class="form-label">Working Directory</label>
            <div class="directory-picker">
              <input
                v-model="form.workingDirectory"
                class="form-input directory-input"
                type="text"
                placeholder="Select a default working directory..."
                readonly
              >
              <button
                class="btn secondary browse-btn"
                @click="selectDirectory"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Browse
              </button>
              <button
                v-if="form.workingDirectory"
                class="btn icon-btn clear-btn"
                title="Clear"
                @click="form.workingDirectory = ''"
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
            <span class="form-hint">
              New chats in this workspace will use this directory by default.
            </span>
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
          <button
            v-if="isEditing"
            class="btn danger-ghost"
            @click="handleDelete"
          >
            Delete
          </button>
          <div class="dialog-actions-right">
            <button
              class="btn secondary"
              @click="handleClose"
            >
              Cancel
            </button>
            <button
              class="btn primary"
              :disabled="!isValid"
              @click="handleSave"
            >
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
  workingDirectory: '',
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
    form.workingDirectory = workspace.workingDirectory || ''
    form.systemPrompt = workspace.systemPrompt || ''
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
  form.workingDirectory = ''
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

async function selectDirectory() {
  try {
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Working Directory'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      form.workingDirectory = result.filePaths[0]
    }
  } catch (error) {
    console.error('Failed to select directory:', error)
  }
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
        workingDirectory: form.workingDirectory || undefined,
        systemPrompt: form.systemPrompt
      })
    } else {
      // Create new workspace
      const workspace = await workspacesStore.createWorkspace(
        form.name.trim(),
        form.avatar,
        form.systemPrompt,
        form.workingDirectory || undefined
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
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: overlayFadeIn 0.2s ease;
}

@keyframes overlayFadeIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(4px);
  }
}

.dialog {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow:
    0 24px 48px rgba(0, 0, 0, 0.2),
    0 8px 16px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: dialogSlideIn 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes dialogSlideIn {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(
    180deg,
    rgba(135, 154, 57, 0.04) 0%,
    transparent 100%
  );
}

.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(135, 154, 57, 0.12);
  color: #879a39;
  transition: transform 0.2s ease;
}

html[data-theme='light'] .dialog-icon {
  color: #66800b;
}

.dialog:hover .dialog-icon {
  transform: scale(1.05);
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
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-input:hover,
.form-textarea:hover {
  border-color: var(--border-strong, var(--muted));
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(var(--accent-rgb), 0.12);
  background: var(--bg-elevated);
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
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 16px;
}

.avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: var(--hover);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.avatar-preview::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(135, 154, 57, 0);
  transition: background 0.2s ease;
  border-radius: 16px;
}

.avatar-preview:hover {
  border-color: #879a39;
  border-style: solid;
  transform: scale(1.02);
}

.avatar-preview:hover::after {
  background: rgba(135, 154, 57, 0.08);
}

.preview-emoji {
  font-size: 36px;
  line-height: 1;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px;
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
  margin-top: 16px;
  padding: 16px;
  background: var(--hover);
  border-radius: var(--radius-md);
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
  background: rgba(135, 154, 57, 0.15);
  border-color: #879a39;
  transform: scale(1.05);
}

/* Dialog Actions */
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.02);
}

html[data-theme='light'] .dialog-actions {
  background: rgba(0, 0, 0, 0.02);
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
  padding: 11px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: #879a39;
  color: white;
  box-shadow: 0 2px 8px rgba(135, 154, 57, 0.3);
}

html[data-theme='light'] .btn.primary {
  background: #66800b;
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(135, 154, 57, 0.4);
}

.btn.primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn.secondary {
  background: var(--hover);
  border: 1px solid var(--border);
  color: var(--text);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--active);
  border-color: var(--border-strong, var(--muted));
}

.btn.danger-ghost {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.btn.danger-ghost:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.6);
}

/* Directory Picker */
.directory-picker {
  display: flex;
  gap: 8px;
  align-items: center;
}

.directory-input {
  flex: 1;
  cursor: pointer;
  text-overflow: ellipsis;
}

.browse-btn {
  flex-shrink: 0;
  padding: 10px 14px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.clear-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}
</style>
