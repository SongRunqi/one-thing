<template>
  <Teleport to="body">
    <Transition name="ctx-menu">
      <div
        v-if="show"
        class="context-menu"
        :style="{ top: y + 'px', left: x + 'px' }"
        @click.stop
      >
      <button class="context-item" @click="handleRename">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
        Rename
      </button>
      <button class="context-item" @click="handlePin">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
        </svg>
        {{ session?.isPinned ? 'Unpin' : 'Pin' }}
      </button>
      <div class="context-divider"></div>
      <button class="context-item danger" @click="handleDelete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        Close
      </button>
    </div>
    </Transition>
    <div v-if="show" class="context-overlay" @click="$emit('close')"></div>
  </Teleport>
</template>

<script setup lang="ts">
import type { SessionWithBranches } from './useSessionOrganizer'

interface Props {
  show: boolean
  x: number
  y: number
  session: SessionWithBranches | null
}

interface Emits {
  (e: 'close'): void
  (e: 'rename'): void
  (e: 'pin'): void
  (e: 'delete'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

function handleRename() {
  emit('rename')
  emit('close')
}

function handlePin() {
  emit('pin')
  emit('close')
}

function handleDelete() {
  emit('delete')
  emit('close')
}
</script>

<style scoped>
/* Context Menu */
.context-menu {
  position: fixed;
  z-index: var(--z-modal);
  min-width: 160px;
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.context-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.context-item:hover {
  background: var(--hover);
}

.context-item.danger {
  color: #ef4444;
}

.context-item.danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.context-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.context-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) - 1);
}

/* Enter/leave transitions */
.ctx-menu-enter-active {
  transition: opacity 0.12s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ctx-menu-leave-active {
  transition: opacity 0.08s ease, transform 0.08s ease;
}
.ctx-menu-enter-from,
.ctx-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
