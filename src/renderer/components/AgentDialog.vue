<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog agent-dialog">
        <div class="dialog-header">
          <div class="dialog-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="5"/>
              <path d="M20 21a8 8 0 0 0-16 0"/>
            </svg>
          </div>
          <h3>{{ isEditing ? 'Edit Agent' : 'Create Agent' }}</h3>
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
              placeholder="e.g., Helpful Assistant"
              maxlength="50"
            />
          </div>

          <!-- Tagline -->
          <div class="form-group">
            <label class="form-label">Tagline <span class="optional">(optional)</span></label>
            <input
              v-model="form.tagline"
              class="form-input"
              type="text"
              placeholder="A short description of this agent"
              maxlength="100"
            />
          </div>

          <!-- Personality Tags -->
          <div class="form-group">
            <label class="form-label">Personality <span class="optional">(optional)</span></label>
            <div class="personality-tags">
              <span
                v-for="(tag, index) in form.personality"
                :key="index"
                class="personality-tag"
              >
                {{ tag }}
                <button class="tag-remove" @click="removePersonalityTag(index)">×</button>
              </span>
              <input
                v-if="form.personality.length < 5"
                v-model="newPersonalityTag"
                class="tag-input"
                type="text"
                placeholder="Add tag..."
                maxlength="20"
                @keydown.enter.prevent="addPersonalityTag"
              />
            </div>
            <span class="form-hint">Press Enter to add a tag (max 5)</span>
          </div>

          <!-- Primary Color -->
          <div class="form-group">
            <label class="form-label">Theme Color <span class="optional">(optional)</span></label>
            <div class="color-picker">
              <button
                v-for="color in themeColors"
                :key="color"
                class="color-option"
                :class="{ active: form.primaryColor === color }"
                :style="{ backgroundColor: color }"
                @click="form.primaryColor = color"
              />
            </div>
          </div>

          <!-- System Prompt -->
          <div class="form-group">
            <label class="form-label">System Prompt</label>
            <textarea
              v-model="form.systemPrompt"
              class="form-textarea"
              placeholder="Describe the agent's personality, expertise, and behavior..."
              rows="6"
            />
            <span class="form-hint">
              This will be prepended to every conversation using this agent.
            </span>
          </div>

          <!-- Pin to sidebar -->
          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input v-model="form.pinToSidebar" type="checkbox" class="form-checkbox" />
              <span>Pin to sidebar</span>
            </label>
            <span class="form-hint">Show this agent in the sidebar for quick access.</span>
          </div>

          <!-- Voice Settings -->
          <div class="form-group">
            <label class="form-label">
              <span>Voice</span>
              <span class="optional">(optional)</span>
            </label>
            <div class="voice-settings">
              <label class="checkbox-label">
                <input v-model="form.voice.enabled" type="checkbox" class="form-checkbox" />
                <span>Enable text-to-speech</span>
              </label>

              <template v-if="form.voice.enabled && availableVoices.length > 0">
                <!-- Voice selector -->
                <div class="voice-row">
                  <label class="voice-label">Voice</label>
                  <select v-model="form.voice.voiceURI" class="voice-select">
                    <option value="">Default</option>
                    <optgroup v-if="chineseVoices.length > 0" label="Chinese">
                      <option v-for="v in chineseVoices" :key="v.voiceURI" :value="v.voiceURI">
                        {{ v.name }}
                      </option>
                    </optgroup>
                    <optgroup v-if="englishVoices.length > 0" label="English">
                      <option v-for="v in englishVoices" :key="v.voiceURI" :value="v.voiceURI">
                        {{ v.name }}
                      </option>
                    </optgroup>
                    <optgroup v-if="otherVoices.length > 0" label="Other">
                      <option v-for="v in otherVoices" :key="v.voiceURI" :value="v.voiceURI">
                        {{ v.name }} ({{ v.lang }})
                      </option>
                    </optgroup>
                  </select>
                  <button class="voice-preview-btn" @click="previewCurrentVoice" title="Preview voice">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </button>
                </div>

                <!-- Rate slider -->
                <div class="voice-row">
                  <label class="voice-label">Speed</label>
                  <input
                    type="range"
                    v-model.number="form.voice.rate"
                    min="0.5"
                    max="2"
                    step="0.1"
                    class="voice-slider"
                  />
                  <span class="voice-value">{{ form.voice.rate?.toFixed(1) || '1.0' }}x</span>
                </div>

                <!-- Pitch slider -->
                <div class="voice-row">
                  <label class="voice-label">Pitch</label>
                  <input
                    type="range"
                    v-model.number="form.voice.pitch"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    class="voice-slider"
                  />
                  <span class="voice-value">{{ form.voice.pitch?.toFixed(1) || '1.0' }}</span>
                </div>
              </template>

              <span v-else-if="form.voice.enabled" class="form-hint voice-loading">
                Loading available voices...
              </span>
            </div>
            <span class="form-hint">Allow this agent to speak responses aloud.</span>
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
import { useAgentsStore } from '@/stores/agents'
import type { Agent, AgentAvatar, AgentVoice } from '@/types'
import { useTTS } from '@/composables/useTTS'

const props = defineProps<{
  visible: boolean
  agent?: Agent | null
}>()

const emit = defineEmits<{
  close: []
}>()

const agentsStore = useAgentsStore()
const { availableVoices, getChineseVoices, getEnglishVoices, previewVoice, stop: stopTTS } = useTTS()

// Form state
const form = reactive({
  name: '',
  avatar: { type: 'emoji', value: '' } as AgentAvatar,
  tagline: '',
  personality: [] as string[],
  primaryColor: '#6366f1',
  systemPrompt: '',
  pinToSidebar: true,
  voice: {
    enabled: false,
    voiceURI: '',
    rate: 1,
    pitch: 1,
    volume: 1
  } as AgentVoice
})

// Voice filtering
const chineseVoices = computed(() => getChineseVoices())
const englishVoices = computed(() => getEnglishVoices())
const otherVoices = computed(() => {
  const zhVoices = new Set(chineseVoices.value.map(v => v.voiceURI))
  const enVoices = new Set(englishVoices.value.map(v => v.voiceURI))
  return availableVoices.value.filter(v => !zhVoices.has(v.voiceURI) && !enVoices.has(v.voiceURI))
})

// Preview current voice
async function previewCurrentVoice() {
  const sampleText = 'Hello, this is a voice preview.'
  await previewVoice(form.voice.voiceURI || '', sampleText)
}

// Personality tag input
const newPersonalityTag = ref('')

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

// Theme color options
const themeColors = [
  '#6366f1', // Indigo (default)
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
]

const isEditing = computed(() => !!props.agent)

const isValid = computed(() => {
  return form.name.trim().length > 0 && form.avatar.value.length > 0
})

// Watch for agent changes to populate form
watch(() => props.agent, (agent) => {
  if (agent) {
    form.name = agent.name
    form.avatar = { ...agent.avatar }
    form.tagline = agent.tagline || ''
    form.personality = agent.personality ? [...agent.personality] : []
    form.primaryColor = agent.primaryColor || '#6366f1'
    form.systemPrompt = agent.systemPrompt
    form.pinToSidebar = agentsStore.pinnedAgentIds.includes(agent.id)
    avatarPickerMode.value = agent.avatar.type
    // Voice settings
    if (agent.voice) {
      form.voice = { ...agent.voice }
    } else {
      form.voice = { enabled: false, voiceURI: '', rate: 1, pitch: 1, volume: 1 }
    }
  } else {
    resetForm()
  }
}, { immediate: true })

watch(() => props.visible, (visible) => {
  if (visible && !props.agent) {
    resetForm()
  }
  // Stop any playing TTS when dialog closes
  if (!visible) {
    stopTTS()
  }
})

function resetForm() {
  form.name = ''
  form.avatar = { type: 'emoji', value: '' }
  form.tagline = ''
  form.personality = []
  form.primaryColor = '#6366f1'
  form.systemPrompt = ''
  form.pinToSidebar = true
  form.voice = { enabled: false, voiceURI: '', rate: 1, pitch: 1, volume: 1 }
  showEmojiPicker.value = false
  avatarPickerMode.value = 'emoji'
  newPersonalityTag.value = ''
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

function addPersonalityTag() {
  const tag = newPersonalityTag.value.trim()
  if (tag && !form.personality.includes(tag) && form.personality.length < 5) {
    form.personality.push(tag)
    newPersonalityTag.value = ''
  }
}

function removePersonalityTag(index: number) {
  form.personality.splice(index, 1)
}

async function handleSave() {
  if (!isValid.value) return

  try {
    if (isEditing.value && props.agent) {
      // Check if avatar is a new base64 image that needs uploading
      let avatarToSave = form.avatar
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
        tagline: form.tagline.trim() || undefined,
        personality: form.personality.length > 0 ? form.personality : undefined,
        primaryColor: form.primaryColor,
        systemPrompt: form.systemPrompt,
        voice: form.voice.enabled ? form.voice : undefined
      })

      // Handle pin/unpin
      const isPinned = agentsStore.pinnedAgentIds.includes(props.agent.id)
      if (form.pinToSidebar && !isPinned) {
        await agentsStore.pinAgent(props.agent.id)
      } else if (!form.pinToSidebar && isPinned) {
        await agentsStore.unpinAgent(props.agent.id)
      }
    } else {
      // Create new agent
      const agent = await agentsStore.createAgent(
        form.name.trim(),
        form.avatar,
        form.systemPrompt,
        {
          tagline: form.tagline.trim() || undefined,
          personality: form.personality.length > 0 ? form.personality : undefined,
          primaryColor: form.primaryColor,
          voice: form.voice.enabled ? form.voice : undefined
        }
      )

      // If avatar is base64 image, upload it
      if (agent && form.avatar.type === 'image' && form.avatar.value.startsWith('data:')) {
        const mimeMatch = form.avatar.value.match(/^data:(.+?);base64,/)
        if (mimeMatch) {
          const mimeType = mimeMatch[1]
          const avatarPath = await agentsStore.uploadAvatar(
            agent.id,
            form.avatar.value,
            mimeType
          )
          if (avatarPath) {
            await agentsStore.updateAgent(agent.id, {
              avatar: { type: 'image', value: avatarPath }
            })
          }
        }
      }

      // Pin the agent if requested
      if (agent && form.pinToSidebar) {
        await agentsStore.pinAgent(agent.id)
      }
    }

    emit('close')
  } catch (error) {
    console.error('Failed to save agent:', error)
  }
}

async function handleDelete() {
  if (!props.agent) return

  const confirmed = confirm(`Delete agent "${props.agent.name}"?`)
  if (confirmed) {
    await agentsStore.deleteAgent(props.agent.id)
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
    rgba(var(--accent-rgb), 0.04) 0%,
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
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent);
  transition: transform 0.2s ease;
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

.optional {
  font-weight: 400;
  color: var(--muted);
}

/* Personality Tags */
.personality-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-height: 44px;
}

.personality-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input {
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  outline: none;
}

.tag-input::placeholder {
  color: var(--muted);
}

/* Color Picker */
.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--text);
  box-shadow: 0 0 0 2px var(--bg-elevated);
}

/* Checkbox Group */
.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}

.form-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

/* Voice Settings */
.voice-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}

.voice-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.voice-label {
  min-width: 60px;
  font-size: 13px;
  color: var(--text-secondary);
}

.voice-select {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.voice-select:focus {
  outline: none;
  border-color: var(--accent);
}

.voice-preview-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--accent);
  color: white;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.voice-preview-btn:hover {
  background: var(--accent-hover);
}

.voice-slider {
  flex: 1;
  height: 4px;
  accent-color: var(--accent);
  cursor: pointer;
}

.voice-value {
  min-width: 40px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.voice-loading {
  font-style: italic;
  color: var(--muted);
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
  background: rgba(var(--accent-rgb), 0);
  transition: background 0.2s ease;
  border-radius: 16px;
}

.avatar-preview:hover {
  border-color: var(--accent);
  border-style: solid;
  transform: scale(1.02);
}

.avatar-preview:hover::after {
  background: rgba(var(--accent-rgb), 0.08);
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
  background: rgba(var(--accent-rgb), 0.15);
  border-color: var(--accent);
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
  background: var(--accent);
  color: white;
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.3);
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.4);
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
</style>
