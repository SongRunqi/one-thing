<template>
  <header :class="['chat-header', { 'with-traffic-lights': showSidebarToggle }]">
    <div class="chat-header-left">
      <!-- Reserve space for traffic lights + floating action buttons when sidebar is hidden -->
      <div v-if="showSidebarToggle" class="traffic-lights-reserved"></div>
    </div>

    <!-- Session name (centered) -->
    <span class="chat-header-title">{{ sessionName || 'New Chat' }}</span>

    <div class="chat-header-right">
      <!-- Back to parent (for branch sessions) -->
      <button
        v-if="isBranchSession"
        class="chat-header-btn back-btn"
        title="Back to parent chat"
        @click="$emit('goToParent')"
      >
        <ArrowLeft :size="14" :stroke-width="2" />
      </button>

      <!-- Split button -->
      <button
        v-if="showSplitButton"
        class="chat-header-btn"
        title="Split view"
        @click="$emit('split')"
      >
        <Columns2 :size="14" :stroke-width="2" />
      </button>

      <!-- Equalize panels button -->
      <button
        v-if="canClose"
        class="chat-header-btn"
        title="Equalize panels"
        @click="$emit('equalize')"
      >
        <Equal :size="14" :stroke-width="2" />
      </button>

      <!-- Close button (for multi-panel) -->
      <button
        v-if="canClose"
        class="chat-header-btn close-btn"
        title="Close panel"
        @click="$emit('close')"
      >
        <X :size="14" :stroke-width="2" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft, Columns2, Equal, X } from 'lucide-vue-next'

defineProps<{
  sessionName: string
  workingDirectory: string | null
  isBranchSession: boolean
  showSidebarToggle: boolean
  showSplitButton: boolean
  canClose: boolean
}>()

defineEmits<{
  toggleSidebar: []
  openDirectoryPicker: []
  updateTitle: [title: string]
  goToParent: []
  split: []
  equalize: []
  close: []
}>()
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  user-select: none;
  flex-shrink: 0;
  -webkit-app-region: drag;
  position: relative;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.traffic-lights-reserved {
  width: 170px;
  flex-shrink: 0;
}

.chat-header-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
  pointer-events: none;
}

.chat-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 60px;
  flex-shrink: 0;
}

.chat-header-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.chat-header-btn:hover {
  background: var(--hover, rgba(255, 255, 255, 0.08));
  color: var(--text);
}

.chat-header-btn.back-btn {
  color: var(--accent);
}

.chat-header-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.chat-header-btn.flow-btn.active {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
}
</style>
