<template>
  <div class="basic-section">
    <!-- Avatar Picker - Compact Popover Style -->
    <div class="form-group">
      <label class="form-label">Avatar</label>
      <div
        ref="pickerRef"
        class="avatar-picker-compact"
      >
        <!-- Clickable Preview -->
        <div
          class="avatar-trigger"
          @click="showPicker = !showPicker"
        >
          <div
            class="avatar-preview"
            :style="previewStyle"
          >
            <component
              :is="getIconComponent(avatar.icon)"
              v-if="avatar.type === 'icon' && avatar.icon"
              :size="28"
              :stroke-width="1.5"
              class="avatar-icon"
            />
            <img
              v-else-if="avatar.type === 'image' && avatar.value"
              :src="getImageSrc(avatar.value)"
              class="preview-image"
              alt=""
            >
            <Bot
              v-else
              :size="28"
              :stroke-width="1.5"
              class="avatar-icon"
            />
          </div>
          <span class="avatar-hint">Click to customize</span>
          <ChevronDown
            :size="16"
            class="avatar-chevron"
            :class="{ open: showPicker }"
          />
        </div>

        <!-- Popover -->
        <Transition name="popover">
          <div
            v-if="showPicker"
            class="avatar-popover"
          >
            <!-- Icon Selection -->
            <div class="popover-section">
              <span class="popover-label">Icon</span>
              <div class="icon-grid">
                <button
                  v-for="iconName in availableIcons"
                  :key="iconName"
                  class="icon-btn"
                  :class="{ selected: avatar.type === 'icon' && avatar.icon === iconName }"
                  :title="iconName"
                  @click="selectIcon(iconName)"
                >
                  <component
                    :is="getIconComponent(iconName)"
                    :size="18"
                    :stroke-width="1.5"
                  />
                </button>
              </div>
            </div>

            <!-- Gradient Selection -->
            <div class="popover-section">
              <span class="popover-label">Color</span>
              <div class="gradient-grid">
                <button
                  v-for="(gradient, index) in gradients"
                  :key="index"
                  class="gradient-btn"
                  :class="{ selected: avatar.gradient === gradient.id }"
                  :style="{ background: gradient.value }"
                  :title="gradient.name"
                  @click="selectGradient(gradient.id)"
                />
              </div>
            </div>

            <!-- Divider -->
            <div class="popover-divider" />

            <!-- Image Upload -->
            <button
              class="upload-btn"
              @click="selectImage"
            >
              <ImageIcon
                :size="16"
                :stroke-width="2"
              />
              Upload Custom Image
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Name -->
    <div class="form-group">
      <label class="form-label">Name</label>
      <input
        :value="name"
        class="form-input"
        type="text"
        placeholder="e.g., Git Helper, API Client"
        maxlength="50"
        @input="$emit('update:name', ($event.target as HTMLInputElement).value)"
      >
    </div>

    <!-- Description -->
    <div class="form-group">
      <label class="form-label">Description</label>
      <input
        :value="description"
        class="form-input"
        type="text"
        placeholder="A short description of what this agent does"
        maxlength="200"
        @input="$emit('update:description', ($event.target as HTMLInputElement).value)"
      >
      <span class="form-hint">This will be shown to the main LLM when selecting this agent.</span>
    </div>

    <!-- Memory Toggle (Prominent) -->
    <div class="form-group">
      <div
        class="memory-card"
        :class="{ enabled: enableMemory }"
      >
        <div class="memory-info">
          <BrainIcon
            :size="20"
            :stroke-width="2"
          />
          <div class="memory-text">
            <span class="memory-title">Agent Memory</span>
            <span class="memory-desc">Include user profile and relationship context in conversations</span>
          </div>
        </div>
        <div
          class="toggle-switch"
          :class="{ active: enableMemory }"
          @click="$emit('update:enableMemory', !enableMemory)"
        />
      </div>
    </div>

    <!-- Source Selection -->
    <div class="form-group">
      <label class="form-label">Save Location</label>
      <div class="source-options">
        <label
          class="source-option"
          :class="{ active: source === 'user' }"
        >
          <input
            type="radio"
            :checked="source === 'user'"
            class="source-radio"
            @change="$emit('update:source', 'user')"
          >
          <div class="source-content">
            <UserIcon
              :size="16"
              :stroke-width="2"
            />
            <div>
              <span class="source-title">User</span>
              <span class="source-desc">Available in all projects</span>
            </div>
          </div>
        </label>
        <label
          class="source-option"
          :class="{ active: source === 'project' }"
        >
          <input
            type="radio"
            :checked="source === 'project'"
            class="source-radio"
            @change="$emit('update:source', 'project')"
          >
          <div class="source-content">
            <FolderOpen
              :size="16"
              :stroke-width="2"
            />
            <div>
              <span class="source-title">Project</span>
              <span class="source-desc">Only in current workspace</span>
            </div>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  ChevronDown,
  Image as ImageIcon,
  Brain as BrainIcon,
  User as UserIcon,
  FolderOpen,
  // Avatar Icons
  Bot,
  Cpu,
  Code,
  Search,
  FileText,
  MessageSquare,
  Zap,
  Sparkles,
  Brain,
  Wand2,
  Terminal,
  Globe,
  Database,
  Folder,
  Settings,
  Shield,
} from 'lucide-vue-next'

interface AvatarData {
  type: 'icon' | 'image'
  icon?: string
  gradient?: string
  value?: string
}

interface Props {
  name: string
  description: string
  avatar: AvatarData
  enableMemory: boolean
  source: 'user' | 'project'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:name': [value: string]
  'update:description': [value: string]
  'update:avatar': [value: AvatarData]
  'update:enableMemory': [value: boolean]
  'update:source': [value: 'user' | 'project']
}>()

// Popover state
const showPicker = ref(false)
const pickerRef = ref<HTMLElement | null>(null)

// Available icons for selection
const availableIcons = [
  'Bot', 'Cpu', 'Code', 'Search', 'FileText', 'MessageSquare',
  'Zap', 'Sparkles', 'Brain', 'Wand2', 'Terminal', 'Globe',
  'Database', 'Folder', 'Settings', 'Shield',
]

// Icon component mapping
const iconComponents: Record<string, any> = {
  Bot, Cpu, Code, Search, FileText, MessageSquare,
  Zap, Sparkles, Brain, Wand2, Terminal, Globe,
  Database, Folder, Settings, Shield,
}

function getIconComponent(name: string) {
  return iconComponents[name] || Bot
}

// Gradient presets
const gradients = [
  { id: 'purple-blue', name: 'Purple Blue', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'teal-green', name: 'Teal Green', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { id: 'pink-red', name: 'Pink Red', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'blue-cyan', name: 'Blue Cyan', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'pink-yellow', name: 'Pink Yellow', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { id: 'cyan-purple', name: 'Cyan Purple', value: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
  { id: 'yellow-red', name: 'Yellow Red', value: 'linear-gradient(135deg, #f9d423 0%, #ff4e50 100%)' },
  { id: 'gray-dark', name: 'Gray Dark', value: 'linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)' },
]

// Computed style for preview
const previewStyle = computed(() => {
  if (props.avatar.type === 'image' && props.avatar.value) {
    return {}
  }
  const gradient = gradients.find(g => g.id === props.avatar.gradient)
  return {
    background: gradient?.value || gradients[0].value
  }
})

function selectIcon(iconName: string) {
  emit('update:avatar', {
    type: 'icon',
    icon: iconName,
    gradient: props.avatar.gradient || gradients[0].id,
  })
}

function selectGradient(gradientId: string) {
  emit('update:avatar', {
    ...props.avatar,
    type: 'icon',
    gradient: gradientId,
    icon: props.avatar.icon || 'Bot',
  })
}

async function selectImage() {
  try {
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      title: 'Select Avatar Image'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0]
      const response = await fetch('file://' + filePath)
      const blob = await response.blob()
      const reader = new FileReader()

      reader.onload = () => {
        const base64 = reader.result as string
        emit('update:avatar', { type: 'image', value: base64 })
        showPicker.value = false
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

// Click outside to close popover
function handleClickOutside(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    showPicker.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.basic-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Form Groups */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.form-input:hover {
  border-color: var(--muted);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.form-input::placeholder {
  color: var(--muted);
}

.form-hint {
  font-size: 12px;
  color: var(--muted);
}

/* Avatar Picker - Compact */
.avatar-picker-compact {
  position: relative;
}

.avatar-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.avatar-trigger:hover {
  background: var(--active);
  border-color: var(--muted);
}

.avatar-preview {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.avatar-icon {
  color: white;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-hint {
  flex: 1;
  font-size: 13px;
  color: var(--muted);
}

.avatar-chevron {
  color: var(--muted);
  transition: transform 0.2s ease;
}

.avatar-chevron.open {
  transform: rotate(180deg);
}

/* Popover */
.avatar-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 320px;
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 100;
}

.popover-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.popover-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Icon Grid */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.icon-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover);
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--active);
  color: var(--text);
}

.icon-btn.selected {
  background: rgba(var(--accent-rgb), 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

/* Gradient Grid */
.gradient-grid {
  display: flex;
  gap: 6px;
}

.gradient-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.gradient-btn:hover {
  transform: scale(1.08);
}

.gradient-btn.selected {
  border-color: var(--text);
  box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--text);
}

/* Divider */
.popover-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0 14px;
}

/* Upload Button */
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.upload-btn:hover {
  background: var(--hover);
  color: var(--text);
  border-color: var(--muted);
}

/* Popover Animation */
.popover-enter-active,
.popover-leave-active {
  transition: all 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

/* Memory Card */
.memory-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.memory-card.enabled {
  background: rgba(var(--accent-rgb), 0.05);
  border-color: rgba(var(--accent-rgb), 0.3);
}

.memory-info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
}

.memory-card.enabled .memory-info {
  color: var(--accent);
}

.memory-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.memory-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.memory-desc {
  font-size: 12px;
  color: var(--muted);
}

/* Toggle Switch */
.toggle-switch {
  width: 44px;
  height: 24px;
  background: var(--border);
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 10px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active {
  background: var(--accent);
}

.toggle-switch.active::after {
  transform: translateX(20px);
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
  padding: 14px;
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
  display: none;
}

.source-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--muted);
}

.source-option.active .source-content {
  color: var(--accent);
}

.source-content > div {
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

/* Responsive */
@media (max-width: 480px) {
  .avatar-popover {
    width: calc(100vw - 80px);
    max-width: 320px;
  }

  .icon-grid {
    grid-template-columns: repeat(6, 1fr);
  }

  .source-options {
    flex-direction: column;
  }
}
</style>
