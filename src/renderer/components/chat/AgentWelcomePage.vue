<template>
  <div class="agent-welcome">
    <div class="welcome-content" :class="{ 'create-mode': mode === 'create' }">
      <!-- ============ VIEW MODE ============ -->
      <template v-if="mode === 'view' && agent">
        <!-- Agent Avatar -->
        <div
          class="agent-avatar-large"
          :style="agent.primaryColor ? { background: `${agent.primaryColor}20` } : {}"
        >
          <span v-if="agent.avatar.type === 'emoji'" class="avatar-emoji">
            {{ agent.avatar.value }}
          </span>
          <img
            v-else
            :src="getImageSrc(agent.avatar.value)"
            class="avatar-image"
            alt=""
          />
        </div>

        <!-- Agent Name -->
        <h1 class="agent-name">{{ agent.name }}</h1>

        <!-- Tagline -->
        <p v-if="agent.tagline" class="agent-tagline">{{ agent.tagline }}</p>

        <!-- Personality Tags -->
        <div v-if="agent.personality && agent.personality.length > 0" class="personality-tags">
          <span
            v-for="tag in agent.personality"
            :key="tag"
            class="personality-tag"
            :style="agent.primaryColor ? {
              background: `${agent.primaryColor}20`,
              color: agent.primaryColor
            } : {}"
          >
            {{ tag }}
          </span>
        </div>

        <!-- System Prompt Preview (if no tagline) -->
        <p v-if="!agent.tagline && agent.systemPrompt" class="system-prompt-preview">
          {{ truncatedPrompt }}
        </p>

        <!-- Action Buttons -->
        <div class="action-buttons">
          <button
            class="btn primary"
            :style="agent.primaryColor ? { background: agent.primaryColor } : {}"
            @click="$emit('start-chat')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Start New Chat
          </button>

          <button class="btn secondary" @click="$emit('open-settings')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Edit Agent
          </button>
        </div>
      </template>

      <!-- ============ CREATE MODE ============ -->
      <template v-else-if="mode === 'create'">
        <h1 class="create-title">Create New Agent</h1>
        <p class="create-subtitle">Design a custom AI assistant with its own personality</p>

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
            <div class="personality-tags-input">
              <span
                v-for="(tag, index) in form.personality"
                :key="index"
                class="personality-tag editable"
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
              rows="4"
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

          <!-- Voice Settings (collapsible) -->
          <div class="form-group">
            <div class="voice-header" @click="showVoiceSettings = !showVoiceSettings">
              <label class="form-label clickable">
                <span>Voice Settings</span>
                <span class="optional">(optional)</span>
              </label>
              <svg
                class="chevron"
                :class="{ expanded: showVoiceSettings }"
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            <div v-if="showVoiceSettings" class="voice-settings">
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
          </div>

          <!-- Action Buttons -->
          <div class="form-actions">
            <button class="btn secondary" @click="handleCancelCreate">
              Cancel
            </button>
            <button
              class="btn primary"
              :disabled="!isFormValid"
              :style="form.primaryColor ? { background: form.primaryColor } : {}"
              @click="handleCreateAgent"
            >
              Create Agent
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useTTS } from '@/composables/useTTS'
import type { Agent, AgentAvatar, AgentVoice } from '@/types'

const props = withDefaults(defineProps<{
  agent?: Agent
  mode?: 'view' | 'create'
}>(), {
  mode: 'view'
})

const emit = defineEmits<{
  'start-chat': []
  'open-settings': []
  'agent-created': [agent: Agent]
  'cancel-create': []
}>()

const agentsStore = useAgentsStore()
const { availableVoices, getChineseVoices, getEnglishVoices, previewVoice, stop: stopTTS } = useTTS()

// ============ VIEW MODE LOGIC ============
const truncatedPrompt = computed(() => {
  const prompt = props.agent?.systemPrompt || ''
  if (prompt.length <= 200) return prompt
  return prompt.slice(0, 200).trim() + '...'
})

// ============ CREATE MODE LOGIC ============

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

// Personality tag input
const newPersonalityTag = ref('')
const showEmojiPicker = ref(false)
const avatarPickerMode = ref<'emoji' | 'image'>('emoji')
const showVoiceSettings = ref(false)

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

const isFormValid = computed(() => {
  return form.name.trim().length > 0 && form.avatar.value.length > 0
})

// Reset form when entering create mode
watch(() => props.mode, (newMode) => {
  if (newMode === 'create') {
    resetForm()
  }
}, { immediate: true })

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
  showVoiceSettings.value = false
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

// Preview current voice
async function previewCurrentVoice() {
  const sampleText = 'Hello, this is a voice preview.'
  await previewVoice(form.voice.voiceURI || '', sampleText)
}

async function handleCreateAgent() {
  if (!isFormValid.value) return

  try {
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

    emit('agent-created', agent)
  } catch (error) {
    console.error('Failed to create agent:', error)
  }
}

function handleCancelCreate() {
  stopTTS()
  emit('cancel-create')
}

// Shared helper
function getImageSrc(value: string): string {
  if (value.startsWith('data:')) {
    return value
  }
  return 'file://' + value
}

// Cleanup on unmount
onUnmounted(() => {
  stopTTS()
})
</script>

<style scoped>
.agent-welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px 20px;
  padding-bottom: 120px; /* Space for input box */
  user-select: none;
  overflow-y: auto;
}

.welcome-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
}

.welcome-content.create-mode {
  text-align: left;
  width: 100%;
}

/* ============ VIEW MODE STYLES ============ */

.agent-avatar-large {
  width: 100px;
  height: 100px;
  border-radius: 24px;
  background: var(--hover);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.avatar-emoji {
  font-size: 56px;
  line-height: 1;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 24px;
}

.agent-name {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.agent-tagline {
  font-size: 16px;
  color: var(--text-muted);
  margin: 0 0 16px;
  line-height: 1.5;
}

.personality-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.personality-tag {
  padding: 6px 14px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.system-prompt-preview {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0 0 32px;
  padding: 16px 20px;
  background: var(--hover);
  border-radius: 12px;
  max-width: 100%;
  font-style: italic;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

/* ============ CREATE MODE STYLES ============ */

.create-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
  width: 100%;
  text-align: center;
}

.create-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 32px;
  width: 100%;
  text-align: center;
}

.create-form {
  width: 100%;
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

.avatar-preview:hover {
  border-color: var(--accent);
  border-style: solid;
  transform: scale(1.02);
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

/* Personality Tags Input */
.personality-tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-height: 44px;
}

.personality-tag.editable {
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
.voice-header {
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

.voice-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--hover);
  border-radius: var(--radius-sm);
  margin-top: 8px;
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
  border-radius: 12px;
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
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(var(--accent-rgb), 0.3);
}

.btn.secondary {
  background: var(--hover);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--active);
  transform: translateY(-2px);
}

@media (max-width: 480px) {
  .agent-avatar-large {
    width: 80px;
    height: 80px;
  }

  .avatar-emoji {
    font-size: 44px;
  }

  .agent-name {
    font-size: 24px;
  }

  .action-buttons {
    flex-direction: column;
    width: 100%;
  }

  .btn {
    width: 100%;
  }

  .emoji-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
