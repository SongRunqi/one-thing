<template>
  <div class="address-bar">
    <!-- Working Directory Prefix -->
    <button
      class="address-bar-prefix"
      :class="{ 'has-dir': workingDirectory }"
      :title="workingDirectory || 'Set working directory'"
      @click="$emit('openDirectoryPicker')"
    >
      <Folder
        :size="12"
        :stroke-width="2"
      />
      <span
        v-if="workingDirectory"
        class="prefix-name"
      >
        {{ workingDirName }}
      </span>
    </button>

    <!-- Separator -->
    <span
      v-if="workingDirectory"
      class="address-bar-separator"
    >/</span>

    <!-- Title (editable) -->
    <input
      v-if="isEditing"
      ref="titleInputRef"
      v-model="editingValue"
      class="address-bar-input"
      @blur="saveTitle"
      @keydown.enter="saveTitle"
      @keydown.escape="cancelEdit"
    >
    <span
      v-else
      class="address-bar-title"
      @click="startEdit"
    >
      {{ title || 'New chat' }}
    </span>

    <!-- Agent Selector (at end of address bar) -->
    <button
      class="address-bar-agent"
      :class="{ 'has-agent': agent }"
      title="Select agent"
      @click="toggleAgentDropdown"
    >
      <template v-if="agent">
        <span
          v-if="agent.avatar?.type === 'emoji'"
          class="agent-avatar-emoji"
        >
          {{ agent.avatar?.value }}
        </span>
        <img
          v-else-if="agent.avatar?.type === 'image' && agent.avatar?.value"
          :src="'file://' + agent.avatar.value"
          class="agent-avatar-img"
          alt=""
        >
      </template>
      <MessageSquare
        v-else
        :size="14"
        :stroke-width="2"
      />
      <ChevronDown
        class="agent-chevron"
        :size="10"
        :stroke-width="2.5"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Folder, MessageSquare, ChevronDown } from 'lucide-vue-next'
import type { Agent } from '@/types'

const props = defineProps<{
  title: string
  workingDirectory: string | null
  agent: Agent | null
}>()

const emit = defineEmits<{
  openDirectoryPicker: []
  updateTitle: [title: string]
  toggleAgentDropdown: [event: MouseEvent]
}>()

// Get working directory name (last folder in path)
const workingDirName = computed(() => {
  const dir = props.workingDirectory
  if (!dir) return ''
  const parts = dir.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || dir
})

// Title editing state
const isEditing = ref(false)
const editingValue = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

function startEdit() {
  editingValue.value = props.title || ''
  isEditing.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

function saveTitle() {
  if (!isEditing.value) return
  const newTitle = editingValue.value.trim()
  if (newTitle && newTitle !== props.title) {
    emit('updateTitle', newTitle)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
  editingValue.value = ''
}

function toggleAgentDropdown(event: MouseEvent) {
  emit('toggleAgentDropdown', event)
}
</script>

<style scoped>
/* Address Bar Container (browser URL bar style) */
.address-bar {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  min-width: 120px;
  flex: 1;
  max-width: 400px;
  -webkit-app-region: no-drag;
  margin: 0 auto;
}

html[data-theme='light'] .address-bar {
  background: rgba(0, 0, 0, 0.04);
}

/* Address Bar Prefix (folder) */
.address-bar-prefix {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  max-width: 140px;
}

.address-bar-prefix:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.address-bar-prefix.has-dir {
  color: var(--accent);
}

html[data-theme='light'] .address-bar-prefix:hover {
  background: rgba(0, 0, 0, 0.06);
}

.prefix-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.address-bar-separator {
  color: var(--muted);
  opacity: 0.4;
  font-size: 12px;
  flex-shrink: 0;
  margin: 0 2px;
}

/* Address Bar Title */
.address-bar-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
  padding: 3px 6px;
  border-radius: 5px;
  transition: background 0.15s ease;
  flex: 1;
  min-width: 0;
}

.address-bar-title:hover {
  background: rgba(255, 255, 255, 0.06);
}

html[data-theme='light'] .address-bar-title:hover {
  background: rgba(0, 0, 0, 0.04);
}

.address-bar-input {
  flex: 1;
  min-width: 80px;
  padding: 3px 6px;
  border: 1px solid var(--accent);
  border-radius: 5px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  outline: none;
}

/* Agent Button in Address Bar */
.address-bar-agent {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  margin-left: 4px;
}

.address-bar-agent:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.address-bar-agent.has-agent {
  color: var(--text);
}

html[data-theme='light'] .address-bar-agent:hover {
  background: rgba(0, 0, 0, 0.06);
}

.agent-avatar-emoji {
  font-size: 14px;
  line-height: 1;
}

.agent-avatar-img {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: cover;
}

.agent-chevron {
  opacity: 0.4;
  flex-shrink: 0;
  margin-left: -1px;
}
</style>
