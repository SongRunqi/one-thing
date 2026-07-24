<template>
  <header :class="['chat-header', { 'with-traffic-lights': showSidebarToggle }]">
    <div
      class="chat-header-drag-zones"
      aria-hidden="true"
    >
      <span class="chat-header-drag-zone drag-zone-before-toolbar" />
      <span class="chat-header-drag-zone drag-zone-after-toolbar" />
    </div>

    <div class="chat-header-left">
      <!-- Reserve space for traffic lights + floating action buttons when sidebar is hidden -->
      <div
        v-if="showSidebarToggle"
        class="traffic-lights-reserved"
      />
    </div>

    <!-- Session name (centered) -->
    <span class="chat-header-title">{{ sessionName || 'New Chat' }}</span>

    <div class="chat-header-right">
      <!-- Back to parent (for branch sessions) -->
      <Button
        v-if="isBranchSession"
        unstyled
        class="chat-header-btn back-btn"
        title="Back to parent chat"
        @click="$emit('goToParent')"
      >
        <ArrowLeft
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <!-- Split button -->
      <Button
        v-if="showSplitButton"
        unstyled
        class="chat-header-btn"
        title="Split view"
        @click="$emit('split')"
      >
        <Columns2
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <!-- Equalize panels button -->
      <Button
        v-if="canClose"
        unstyled
        class="chat-header-btn"
        title="Equalize panels"
        @click="$emit('equalize')"
      >
        <Equal
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <Button
        unstyled
        :class="['chat-header-btn', 'inspector-toggle', { hidden: isInspectorOpen }]"
        title="Show workbench"
        @click="$emit('toggleInspector')"
      >
        <PanelRightOpen
          :size="14"
          :stroke-width="2"
        />
      </Button>

      <!-- Close button (for multi-panel) -->
      <Button
        v-if="canClose"
        unstyled
        class="chat-header-btn close-btn"
        title="Close panel"
        @click="$emit('close')"
      >
        <X
          :size="14"
          :stroke-width="2"
        />
      </Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ArrowLeft, Columns2, Equal, X, PanelRightOpen } from 'lucide-vue-next'

defineProps<{
  sessionName: string
  workingDirectory: string | null
  isBranchSession: boolean
  showSidebarToggle: boolean
  showSplitButton: boolean
  canClose: boolean
  isInspectorOpen?: boolean
}>()

defineEmits<{
  toggleSidebar: []
  openDirectoryPicker: []
  updateTitle: [title: string]
  goToParent: []
  split: []
  equalize: []
  close: []
  toggleInspector: []
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
  position: relative;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

.chat-header-drag-zones {
  position: absolute;
  inset: 0 132px 0 0;
  z-index: 0;
  pointer-events: none;
}

.chat-header-drag-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: auto;
  -webkit-app-region: drag;
}

.drag-zone-before-toolbar {
  left: 82px;
  width: max(0px, calc(var(--app-toolbar-left, 204px) - 98px));
}

.drag-zone-after-toolbar {
  left: calc(var(--app-toolbar-left, 204px) + 108px);
  right: 0;
}

.traffic-lights-reserved {
  width: 170px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.chat-header-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-text-muted-fg, var(--muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
  pointer-events: none;
  z-index: 1;
}

.chat-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 60px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

.chat-header-btn {
  width: 28px;
  height: 28px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-header-btn:first-child {
  margin-left: 0;
}

.chat-header-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover, rgba(255, 255, 255, 0.08)));
  color: var(--ui-text-primary-fg, var(--text));
}

.chat-header-btn.back-btn {
  color: var(--ui-text-muted-fg, var(--muted));
}

.chat-header-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--ui-status-danger-fg, #b3403a);
}

.chat-header-btn.flow-btn.active,
.chat-header-btn.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
}

.chat-header-btn.inspector-toggle {
  transition: background 0.15s ease, color 0.15s ease,
              opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
              margin-left 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.inspector-toggle.hidden {
  width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
