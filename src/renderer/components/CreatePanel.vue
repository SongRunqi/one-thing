<template>
  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="visible"
        class="create-panel"
        :style="panelStyle"
        @click.stop
      >
        <button class="create-option" @click="handleCreateAgent">
          <div class="option-icon agent-icon">
            <Bot :size="20" :stroke-width="1.5" />
          </div>
          <div class="option-text">
            <span class="option-title">Create Agent</span>
            <span class="option-desc">Customize AI assistant personality</span>
          </div>
        </button>
        <button class="create-option" @click="handleCreateWorkspace">
          <div class="option-icon workspace-icon">
            <FolderOpen :size="20" :stroke-width="1.5" />
          </div>
          <div class="option-text">
            <span class="option-title">Create Workspace</span>
            <span class="option-desc">Organize related conversations</span>
          </div>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Bot, FolderOpen } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  triggerRect: DOMRect | null
}>()

const emit = defineEmits<{
  'close': []
  'create-agent': []
  'create-workspace': []
}>()

const panelStyle = computed(() => {
  if (!props.triggerRect) {
    return { display: 'none' }
  }

  const panelWidth = 220
  const panelHeight = 140
  const gap = 8

  // Position above the trigger button
  const bottom = window.innerHeight - props.triggerRect.top + gap
  let left = props.triggerRect.left + props.triggerRect.width / 2 - panelWidth / 2

  // Ensure panel doesn't overflow right edge
  if (left + panelWidth > window.innerWidth - 16) {
    left = window.innerWidth - panelWidth - 16
  }

  // Ensure panel doesn't overflow left edge
  if (left < 16) {
    left = 16
  }

  return {
    bottom: `${bottom}px`,
    left: `${left}px`
  }
})

function handleCreateAgent() {
  emit('create-agent')
  emit('close')
}

function handleCreateWorkspace() {
  emit('create-workspace')
  emit('close')
}
</script>

<style scoped>
.create-panel {
  position: fixed;
  width: 220px;
  background: var(--bg-elevated);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.2),
    0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  overflow: hidden;
  padding: 8px;
}

/* Panel transition */
.panel-enter-active {
  animation: panelSlideUp 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

.panel-leave-active {
  animation: panelSlideUp 0.15s cubic-bezier(0.32, 0.72, 0, 1) reverse;
}

@keyframes panelSlideUp {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.create-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.create-option:hover {
  background: var(--hover);
}

.create-option:active {
  transform: scale(0.98);
}

.option-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.create-option:hover .option-icon {
  transform: scale(1.05);
}

.option-icon.agent-icon {
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
}

.option-icon.workspace-icon {
  background: rgba(135, 154, 57, 0.15);
  color: #879a39;
}

html[data-theme='light'] .option-icon.workspace-icon {
  background: rgba(135, 154, 57, 0.12);
  color: #66800b;
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.option-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.option-desc {
  font-size: 12px;
  color: var(--muted);
}
</style>
