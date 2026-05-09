<template>
  <div
    :class="['tab-item', { active, 'drag-over': dragOver }]"
    :title="tooltip"
    draggable="true"
    @click="$emit('select')"
    @mousedown.middle.prevent="$emit('close')"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <component
      :is="icon"
      :size="13"
      class="tab-icon"
    />
    <span class="tab-title">{{ displayTitle }}</span>
    <button
      v-if="closable"
      class="tab-close"
      @click.stop="$emit('close')"
    >
      <X :size="12" />
    </button>
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
  sessionName?: string
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 180px;
  height: 28px;
  font-size: 12px;
  color: var(--muted);
  transition: background 0.12s, color 0.12s;
  -webkit-app-region: no-drag;
}

.tab-item:hover {
  background: var(--hover);
  color: var(--text);
}

.tab-item.active {
  background: var(--hover);
  color: var(--text);
}

.tab-item.drag-over {
  border-left: 2px solid var(--accent);
  padding-left: 6px;
}

.tab-icon {
  flex-shrink: 0;
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: none;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s;
}

.tab-item:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--hover);
  color: var(--text);
}
</style>
