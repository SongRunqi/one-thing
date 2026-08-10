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
        aria-label="Back to parent chat"
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
        aria-label="Split view"
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
        aria-label="Equalize panels"
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
        aria-label="Show workbench"
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
        aria-label="Close panel"
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
  color: var(--ui-text-muted-fg);
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
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-default);
}

.chat-header-btn:first-child {
  margin-left: 0;
}

.chat-header-btn:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

.chat-header-btn.back-btn {
  color: var(--ui-text-muted-fg);
}

/* 危险动作的 hover 底走语义档 `--ui-action-danger-hover-bg`(= danger 20% 掺面色),
   而不是写死的 Tailwind red-500 15% —— 那个字面值不跟主题走,在纸墨/浅色主题上是
   一块与全窗无关的塑料红(字那一行早就在用 `--ui-status-danger-fg` 了,底却没跟上)。
   实测:换成 token 后 ΔRGB 中位 18.3,正是"从不跟主题"到"跟主题"的那段差;它与
   中性 hover 底分得开(中位 34,最小 19),与 chat 面分得开(中位 31,最小 18)。
   备选 `--ui-status-danger-bg` 是徽标底,实测差 172.8 —— 完全另一档,不是这里要的。 */
.chat-header-btn.close-btn:hover {
  background: var(--ui-action-danger-hover-bg);
  color: var(--ui-status-danger-fg);
}

.chat-header-btn.flow-btn.active,
.chat-header-btn.active {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 15%, transparent);
  color: var(--ui-text-primary-fg);
}

.chat-header-btn.inspector-toggle {
  transition: background var(--duration-normal) var(--ease-default), color var(--duration-normal) var(--ease-default),
              opacity var(--duration-slow) var(--ease-default),
              width var(--duration-slow) var(--ease-default),
              margin-left var(--duration-slow) var(--ease-default);
}

.inspector-toggle.hidden {
  width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
