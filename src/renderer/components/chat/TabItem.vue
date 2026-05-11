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
        :size="13"
        class="tab-icon"
      />
      <span class="tab-title">{{ displayTitle }}</span>
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
import { MessageSquare, FileText, X } from 'lucide-vue-next'
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
  props.tab.type === 'chat' ? MessageSquare : FileText
)

const displayTitle = computed(() => {
  if (props.tab.type === 'chat') return props.sessionName || 'New Chat'
  if (props.tab.type === 'file') return props.tab.title
  return ''
})

const tooltip = computed(() => {
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
  --tab-active-bg: var(--bg-panel);
  --tab-radius: 13px;
  --tab-corner-size: 12px;
  --tab-height: 32px;
  --tab-width: 156px;
  position: relative;
  flex: 0 0 var(--tab-width);
  width: var(--tab-width);
  height: var(--tab-height);
  margin-bottom: -1px;
  box-sizing: border-box;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--type-label-font);
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  line-height: 1;
  color: var(--muted);
  background: transparent;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);
  -webkit-app-region: no-drag;
}

.tab-item:not(.active)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 9px;
  width: 1px;
  height: 14px;
  background: rgba(var(--accent-rgb), 0.36);
  opacity: 0.62;
}

.tab-surface {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 100%;
  padding: 0 10px;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-bottom-color: transparent;
  border-radius: 10px;
  background: transparent;
  transition:
    background var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);
}

.tab-surface::before,
.tab-surface::after {
  content: '';
  position: absolute;
  bottom: -1px;
  display: none;
  width: var(--tab-corner-size);
  height: var(--tab-corner-size);
  pointer-events: none;
}

.tab-item:not(.closable) .tab-surface {
  grid-template-columns: 14px minmax(0, 1fr) 0;
}

.tab-item:hover .tab-surface {
  background: color-mix(in srgb, var(--bg-elevated) 32%, transparent);
  color: var(--text);
}

.tab-item:hover::after,
.tab-item.hide-divider::after,
.tab-item.drag-over::after {
  opacity: 0;
}

.tab-item.active {
  color: var(--text);
}

.tab-item.active .tab-surface {
  background: var(--tab-active-bg);
  border-color: color-mix(in srgb, var(--border-subtle) 58%, transparent);
  border-bottom-color: transparent;
  border-radius: var(--tab-radius) var(--tab-radius) 0 0;
  box-shadow: 0 -0.5px 0 color-mix(in srgb, var(--bg-floating) 20%, transparent);
}

.tab-item.active .tab-surface::before,
.tab-item.active .tab-surface::after {
  display: block;
}

.tab-item.active .tab-surface::before {
  left: calc(var(--tab-corner-size) * -1);
  background:
    radial-gradient(
      circle at 0 0,
      transparent 0 calc(var(--tab-corner-size) - 0.75px),
      color-mix(in srgb, var(--border-subtle) 58%, transparent) calc(var(--tab-corner-size) - 0.75px) var(--tab-corner-size),
      var(--tab-active-bg) var(--tab-corner-size)
    );
}

.tab-item.active .tab-surface::after {
  right: calc(var(--tab-corner-size) * -1);
  background:
    radial-gradient(
      circle at 100% 0,
      transparent 0 calc(var(--tab-corner-size) - 0.75px),
      color-mix(in srgb, var(--border-subtle) 58%, transparent) calc(var(--tab-corner-size) - 0.75px) var(--tab-corner-size),
      var(--tab-active-bg) var(--tab-corner-size)
    );
}

.tab-item.drag-over {
  box-shadow: inset 3px 0 0 var(--accent);
}

.tab-item.drag-over .tab-surface {
  border-left-color: var(--accent);
}

.tab-icon {
  flex-shrink: 0;
  justify-self: center;
  color: color-mix(in srgb, currentColor 64%, var(--accent));
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
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
  border-radius: 6px;
  color: var(--muted);
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
  background: var(--bg-hover);
  color: var(--text);
}
</style>
