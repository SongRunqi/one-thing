<template>
  <div
    :class="['tab-item', { active, closable, first: isFirst, 'hide-divider': hideTrailingDivider, 'drag-over': dragOver }]"
    :title="tooltip"
    draggable="true"
    role="tab"
    :aria-selected="active"
    tabindex="0"
    @click="$emit('select')"
    @keydown.enter.prevent="$emit('select')"
    @keydown.space.prevent="$emit('select')"
    @mousedown.middle.prevent="$emit('close')"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="tab-surface">
      <component
        :is="icon"
        :size="15"
        :stroke-width="2"
        class="tab-icon"
      />
      <span class="tab-title">
        <span
          v-if="tab.type !== 'chat' && tab.dirty"
          class="tab-dirty-dot"
          aria-label="Modified"
        />
        {{ displayTitle }}
      </span>
      <button
        v-if="closable"
        class="tab-close"
        title="Close tab"
        aria-label="Close tab"
        @click.stop="$emit('close')"
        @keydown.enter.stop
        @keydown.space.stop
      >
        <X :size="12" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { MessageSquare, FolderCode, X } from 'lucide-vue-next'
import type { Tab } from '@/types/tabs'

const props = defineProps<{
  tab: Tab
  active: boolean
  closable: boolean
  hideTrailingDivider?: boolean
  sessionName?: string
  isFirst?: boolean
}>()

const emit = defineEmits<{
  select: []
  close: []
  dragStart: [tabId: string]
  dropOn: [tabId: string]
}>()

const dragOver = ref(false)

const icon = computed(() =>
  props.tab.type === 'chat' ? MessageSquare : FolderCode
)

const displayTitle = computed(() => {
  if (props.tab.type === 'chat') return props.sessionName || 'New Chat'
  if (props.tab.type === 'workbench') return props.tab.title
  if (props.tab.type === 'file') return props.tab.title
  return ''
})

const tooltip = computed(() => {
  if (props.tab.type === 'workbench') {
    return `${props.tab.workspaceRoot}\nActive: ${props.tab.activeFilePath || props.tab.initialFilePath}`
  }
  if (props.tab.type === 'file') return props.tab.filePath
  return ''
})

function onDragStart(e: DragEvent) {
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', props.tab.id)
  emit('dragStart', props.tab.id)
}

function onDragEnd() {
  dragOver.value = false
}

function onDragOver(e: DragEvent) {
  e.dataTransfer!.dropEffect = 'move'
  dragOver.value = true
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const fromId = e.dataTransfer?.getData('text/plain')
  if (fromId && fromId !== props.tab.id) {
    emit('dropOn', props.tab.id)
  }
}
</script>

<style scoped>
.tab-item {
  --tab-active-bg: var(--ui-surface-panel-bg, var(--bg-panel));
  --tab-radius: 7px;
  --tab-height: 26px;
  --tab-min-width: 72px;
  --tab-max-width: 190px;
  position: relative;
  flex: 0 1 auto;
  min-width: var(--tab-min-width);
  max-width: var(--tab-max-width);
  height: var(--tab-height);
  margin-bottom: 0;
  box-sizing: border-box;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--type-label-font);
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  color: var(--ui-tab-bar-item-fg, var(--ui-text-muted-fg, var(--muted)));
  background: transparent;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);
  -webkit-app-region: no-drag;
}

.tab-surface {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 15px minmax(0, max-content) 18px;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 100%;
  padding: 0 8px;
  box-sizing: border-box;
  border: 0.5px solid transparent;
  border-bottom-color: transparent;
  border-radius: var(--tab-radius);
  background: transparent;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);
}

.tab-item:not(.closable) .tab-surface {
  grid-template-columns: 15px minmax(0, max-content) 0;
}

.tab-item:hover .tab-surface {
  background: color-mix(in srgb, var(--ot-hover-bg, color-mix(in srgb, var(--ui-surface-elevated-bg, var(--bg-elevated)) 32%, transparent)) 78%, transparent);
  color: var(--ui-tab-bar-item-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.tab-item.active {
  color: var(--ot-active-text, var(--ui-text-primary-fg, var(--text)));
  font-weight: 500;
}

.tab-item.active .tab-surface {
  background: color-mix(in srgb, var(--ot-active-bg, color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 9%, transparent)) 58%, transparent);
  border-color: color-mix(in srgb, var(--ui-tab-bar-item-active-border, var(--ui-border-subtle-border, var(--border-subtle))) 34%, transparent);
  border-radius: var(--tab-radius);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 3%, transparent);
}

.tab-item.drag-over {
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--ui-tab-bar-divider-border, var(--ui-border-subtle-border, var(--border-subtle, var(--border)))) 80%, transparent);
}

.tab-item.drag-over .tab-surface {
  border-left-color: color-mix(in srgb, var(--ui-tab-bar-divider-border, var(--ui-border-subtle-border, var(--border-subtle, var(--border)))) 80%, transparent);
}

.tab-icon {
  flex-shrink: 0;
  justify-self: center;
  color: currentColor;
  opacity: 0.72;
}

.tab-item.active .tab-icon {
  opacity: 1;
}

.tab-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.tab-dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg, var(--accent));
  flex: 0 0 7px;
}

.tab-close {
  justify-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  -webkit-app-region: no-drag;
  border-radius: 6px;
  color: var(--ui-tab-bar-action-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}

.tab-item.active .tab-close,
.tab-item:hover .tab-close {
  opacity: 0.72;
}

.tab-close:hover {
  opacity: 1;
  background: var(--ui-tab-bar-action-hover-bg, var(--ui-state-hover-bg, var(--bg-hover)));
  color: var(--ui-tab-bar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}
</style>
