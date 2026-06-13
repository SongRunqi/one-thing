<template>
  <Teleport to="body">
    <Transition name="ctx-menu">
      <div
        v-if="show"
        class="context-menu"
        :style="{ top: y + 'px', left: x + 'px' }"
        @click.stop
      >
        <Button
          text
          size="small"
          :icon="Pencil"
          class="context-item"
          @click="handleRename"
        >
          Rename
        </Button>
        <Button
          text
          size="small"
          :icon="Pin"
          class="context-item"
          @click="handlePin"
        >
          {{ session?.isPinned ? 'Unpin' : 'Pin' }}
        </Button>
        <div class="context-divider" />
        <Button
          text
          size="small"
          type="danger"
          :icon="X"
          class="context-item danger"
          @click="handleDelete"
        >
          Close
        </Button>
      </div>
    </Transition>
    <div
      v-if="show"
      class="context-overlay"
      @click="$emit('close')"
    />
  </Teleport>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { Pencil, Pin, X } from 'lucide-vue-next'
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
  background: var(--ui-surface-menu-bg);
  border: 1px solid var(--ui-border-subtle-border);
  border-radius: 10px;
  box-shadow: var(--ui-surface-tooltip-shadow);
}

.context-item {
  --app-button-height: auto;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-gap: 10px;
  --app-button-font-size: 13px;
  --app-button-hover-fill: var(--ui-surface-menu-hover-bg);
  --app-button-hover-fg: var(--ui-text-primary-fg);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--ui-text-primary-fg);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.context-item:hover {
  background: var(--ui-surface-menu-hover-bg);
}

.context-item.danger {
  color: var(--ui-status-danger-fg);
}

.context-item.danger:hover {
  background: color-mix(in srgb, var(--ui-status-danger-fg) 10%, transparent);
}

.context-divider {
  height: 1px;
  background: var(--ui-border-subtle-border);
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
