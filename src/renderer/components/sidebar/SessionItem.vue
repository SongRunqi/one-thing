<template>
  <div
    :class="[
      'session-item',
      {
        active: isActive,
        generating: isGenerating,
        pinned: session.isPinned,
        editing: isEditing,
        branch: session.depth > 0,
        hidden: session.isHidden
      }
    ]"
    :style="{ paddingLeft: `${12 + session.depth * 16}px` }"
    :title="session.name || 'New chat'"
    @click="handleClick"
    @contextmenu.prevent="$emit('context-menu', $event)"
  >
    <!-- Indicator area (fixed width for alignment) -->
    <span class="indicator-area">
      <!-- Collapse/Expand toggle for parent sessions -->
      <button
        v-if="session.hasBranches"
        class="collapse-btn"
        :class="{ collapsed: session.isCollapsed }"
        @click.stop="$emit('toggle-collapse')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <!-- Branch indicator for child sessions without branches -->
      <span v-else-if="session.depth > 0" class="branch-indicator">›</span>
    </span>

    <!-- Generating indicator -->
    <div v-if="isGenerating" class="generating-dot"></div>

    <!-- Pin indicator -->
    <svg
      v-if="session.isPinned && session.depth === 0"
      class="pin-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M12 2v8M7 10h10M9 10v7l-2 3h10l-2-3v-7"/>
    </svg>

    <!-- Session name -->
    <input
      v-if="isEditing"
      ref="inputRef"
      v-model="localEditingName"
      class="session-name-input"
      maxlength="50"
      @click.stop
      @keydown.enter="confirmRename"
      @keydown.esc="cancelRename"
      @blur="confirmRename"
    />
    <Tooltip v-else :text="session.name || 'New chat'" position="right" :delay="600">
      <span class="session-name" @dblclick.stop="startRename">{{ session.name || 'New chat' }}</span>
    </Tooltip>

    <!-- Session time -->
    <span v-if="!isEditing" class="session-time">{{ formattedTime }}</span>

    <!-- Hover actions -->
    <div class="session-actions">
      <button
        :class="['action-btn', 'danger', { 'confirm': isPendingDelete }]"
        :title="deleteTitle"
        @click.stop="$emit('delete')"
      >
        <svg v-if="!isPendingDelete" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        <template v-else>
          <span v-if="session.hasBranches" class="delete-count">{{ session.branchCount + 1 }}</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 13l4 4L19 7"/>
          </svg>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { SessionWithBranches } from './useSessionOrganizer'

interface Props {
  session: SessionWithBranches
  isActive: boolean
  isGenerating: boolean
  isEditing: boolean
  editingName: string
  isPendingDelete: boolean
  formattedTime: string
}

interface Emits {
  (e: 'click', event: MouseEvent): void
  (e: 'context-menu', event: MouseEvent): void
  (e: 'toggle-collapse'): void
  (e: 'start-rename'): void
  (e: 'confirm-rename', name: string): void
  (e: 'cancel-rename'): void
  (e: 'delete'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const inputRef = ref<HTMLInputElement | null>(null)
const localEditingName = ref('')

// Sync local editing name with prop
watch(() => props.editingName, (newName) => {
  localEditingName.value = newName
}, { immediate: true })

// Focus input when editing starts
watch(() => props.isEditing, (isEditing) => {
  if (isEditing) {
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  }
})

const deleteTitle = computed(() => {
  if (props.isPendingDelete) {
    if (props.session.hasBranches) {
      return `Click to delete ${props.session.branchCount + 1} chats`
    }
    return 'Click to confirm delete'
  }
  if (props.session.hasBranches) {
    return `Delete (includes ${props.session.branchCount} branch${props.session.branchCount > 1 ? 'es' : ''})`
  }
  return 'Delete'
})

function handleClick(event: MouseEvent) {
  if (props.isEditing) return
  emit('click', event)
}

function startRename() {
  emit('start-rename')
}

function confirmRename() {
  emit('confirm-rename', localEditingName.value)
}

function cancelRename() {
  emit('cancel-rename')
}
</script>

<style scoped>
/* Session Item - Minimal Design */
.session-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 12px;
  margin: 2px 4px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  max-height: 60px;
  transition:
    background 0.15s ease,
    max-height 0.25s ease,
    padding 0.25s ease,
    margin 0.25s ease,
    opacity 0.2s ease;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

html[data-theme='light'] .session-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.session-item.active {
  background: var(--session-highlight);
}

.session-item.hidden {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Generating indicator */
.generating-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Collapse button */
.collapse-btn {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

html[data-theme='light'] .collapse-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.collapse-btn svg {
  transition: transform 0.2s ease;
}

.collapse-btn.collapsed svg {
  transform: rotate(-90deg);
}

/* Indicator area - fixed width for consistent name alignment */
.indicator-area {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Branch indicator */
.branch-indicator {
  font-size: 12px;
  color: var(--muted);
  opacity: 0.5;
  font-weight: 500;
}

/* Pin indicator */
.pin-icon {
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0.5;
}

/* Session name tooltip wrapper - override default tooltip-wrapper styles */
.session-item :deep(.tooltip-wrapper) {
  flex: 1;
  min-width: 0;
  display: flex;
}

/* Session name */
.session-name {
  flex: 1;
  min-width: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--text-sidebar-item);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 30px; /* Reserve space for hover actions */
  transition: color 0.15s ease;
}

.session-item:hover .session-name {
  color: var(--text-sidebar-item-hover);
}

.session-item.active .session-name {
  font-weight: 500;
  color: var(--text-primary);
}

.session-name-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 400;
  color: var(--text);
  outline: none;
}

/* Session time */
.session-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  opacity: 0.6;
  margin-left: 4px;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-time {
  opacity: 0;
}

/* Hover actions */
.session-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-actions {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

html[data-theme='light'] .action-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.action-btn.confirm {
  background: #ef4444;
  color: white;
  animation: shake 0.4s ease;
}

.action-btn.confirm:hover {
  background: #dc2626;
  color: white;
}

.delete-count {
  font-size: 10px;
  font-weight: 700;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

/* Pending delete state for session item */
.session-item:has(.action-btn.confirm) {
  background: rgba(239, 68, 68, 0.08) !important;
}

.session-item:has(.action-btn.confirm) .session-name {
  color: #ef4444;
}
</style>
