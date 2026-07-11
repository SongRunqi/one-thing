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
        <span class="tab-title-text">{{ displayTitle }}</span>
      </span>
      <Button
        v-if="closable"
        unstyled
        class="tab-close"
        title="Close tab"
        aria-label="Close tab"
        @click.stop="$emit('close')"
        @keydown.enter.stop
        @keydown.space.stop
      >
        <X :size="12" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
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
/* 墨线页签:无胶囊无底色。inactive 纯文字,hover 点线浮现,
   active 朱砂实线 —— 与 side panel「点描实」同一句法。 */
.tab-item {
  --tab-min-width: 82px;
  --tab-max-width: 220px;
  /* 主题把 tab-bar-item-active-border 定义为 transparent(胶囊时代无边框),
     底标直接取 accent 墨色。 */
  --tab-ink: var(--ui-accent-primary-fg, var(--accent));
  position: relative;
  flex: 0 1 auto;
  align-self: stretch;
  min-width: var(--tab-min-width);
  max-width: var(--tab-max-width);
  margin-bottom: 0;
  box-sizing: border-box;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--type-label-font);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1;
  color: var(--ui-tab-bar-item-fg, var(--ui-text-muted-fg, var(--muted)));
  background: transparent;
  transition: color var(--duration-fast) var(--ease-default);
  -webkit-app-region: no-drag;
}

/* 底标:tab 撑满整条 bar,线落在自身底缘 = bar 基线上
   (tab-list 横向滚动会裁掉盒外内容,所以线必须画在盒内)。 */
.tab-item::after {
  content: '';
  position: absolute;
  right: 9px;
  bottom: 0;
  left: 9px;
  height: 0;
  border-bottom: 1.5px dotted transparent;
  transition: border-color var(--duration-fast) var(--ease-default);
  pointer-events: none;
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
  padding: 0 9px;
  box-sizing: border-box;
}

.tab-item:not(.closable) .tab-surface {
  grid-template-columns: 15px minmax(0, max-content) 0;
}

.tab-item:hover {
  color: var(--ui-tab-bar-item-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.tab-item:hover:not(.active)::after {
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 75%, transparent);
}

.tab-item.active {
  color: var(--ot-active-text, var(--ui-text-primary-fg, var(--text)));
  font-weight: 500;
}

.tab-item.active::after {
  border-bottom-style: solid;
  border-bottom-color: var(--tab-ink);
}

/* 拖放插入位:一道墨竖线 */
.tab-item.drag-over {
  box-shadow: inset 2px 0 0 var(--tab-ink);
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
  min-width: 0;
}

/* text-overflow only clips on a block-ish box; on the flex container the
   flexed text node gets hard-cut without an ellipsis. */
.tab-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border-radius: 0;
  color: var(--ui-tab-bar-action-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}

.tab-item.active .tab-close,
.tab-item:hover .tab-close {
  opacity: 0.72;
}

.tab-close:hover {
  opacity: 1;
  color: var(--ui-tab-bar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}
</style>
