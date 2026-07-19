<template>
  <div
    :class="['tab-item', { active, closable, cold: isCold, dirty: tab.type !== 'chat' && tab.dirty, first: isFirst, 'hide-divider': hideTrailingDivider, 'drag-over': dragOver }]"
    :title="isRenaming ? undefined : tooltip"
    :draggable="!isRenaming"
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
      <input
        v-if="isRenaming"
        ref="renameInputRef"
        v-model="renameDraft"
        class="tab-title-input"
        maxlength="120"
        :style="{ width: renameWidth }"
        @click.stop
        @dblclick.stop
        @mousedown.stop
        @keydown.stop="handleRenameKeydown"
        @blur="commitRename"
      >
      <span
        v-else
        class="tab-title"
        @dblclick.stop="startRename"
      >
        <span
          v-if="tab.type !== 'chat' && tab.dirty"
          class="tab-dirty-dot"
          aria-label="Modified"
        />
        <span class="tab-title-text">{{ displayTitle }}</span>
      </span>
      <Button
        v-if="closable && !isRenaming"
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
import { ref, computed, nextTick } from 'vue'
import { MessageSquare, FolderCode, X } from 'lucide-vue-next'
import type { Tab } from '@/types/tabs'

const props = defineProps<{
  tab: Tab
  active: boolean
  closable: boolean
  hideTrailingDivider?: boolean
  sessionName?: string
  cached?: boolean
  isFirst?: boolean
  panelId?: string
}>()

const emit = defineEmits<{
  select: []
  close: []
  rename: [name: string]
  dragStart: [tabId: string]
  dropOn: [tabId: string]
}>()

const dragOver = ref(false)

const icon = computed(() =>
  props.tab.type === 'chat' ? MessageSquare : FolderCode
)

// 缓存是常态,常态无标记;冷会话(未驻内存)才虚描图标。
const isCold = computed(() => props.tab.type === 'chat' && !props.cached)

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
  return props.sessionName || ''
})

// —— 页签内联重命名（仅 chat 页签，双击标题触发）——
const isRenaming = ref(false)
const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

// 输入框替换掉标题后，页签会塌回 min-width；按草稿长度撑开，编辑时宽度跟着字数走。
const renameWidth = computed(() => `${Math.min(40, Math.max(8, renameDraft.value.length + 2))}ch`)

function startRename() {
  if (props.tab.type !== 'chat') return
  renameDraft.value = props.sessionName || ''
  isRenaming.value = true
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function commitRename() {
  if (!isRenaming.value) return
  isRenaming.value = false
  const next = renameDraft.value.trim()
  if (next && next !== (props.sessionName || '')) emit('rename', next)
}

function handleRenameKeydown(event: KeyboardEvent) {
  // 中文输入法用 Enter 选词时 isComposing 为 true，不能当成「确认重命名」
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    isRenaming.value = false
  }
}

function onDragStart(e: DragEvent) {
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', props.tab.id)
  // Only chat tabs can be dragged out to split, and only when this isn't the
  // last chat tab in the panel (mirrors the `closable` guard exactly, so a
  // drop target elsewhere simply never lights up for a tab that can't move).
  if (props.tab.type === 'chat' && props.closable && props.panelId) {
    e.dataTransfer!.setData('application/x-onething-split-tab', JSON.stringify({
      sessionId: props.tab.sessionId,
      sourcePanelId: props.panelId,
    }))
  }
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
   active 朱砂实线 —— 与 side panel「点描实」同一句法。
   墨签各按内容完整撑开:标题全显不省略、不封顶、不收缩,
   装不下由 tab-list 横向滚动兜底(basis auto + 不 shrink)。 */
.tab-item {
  /* 主题把 tab-bar-item-active-border 定义为 transparent(胶囊时代无边框),
     底标直接取 accent 墨色。 */
  --tab-ink: var(--ui-accent-primary-fg, var(--accent));
  --tab-paper: var(--ui-tab-bar-surface-bg, var(--ui-surface-chat-bg, var(--bg-chat, var(--bg-panel))));
  position: relative;
  flex: 0 0 auto;
  align-self: stretch;
  min-width: 40px;
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
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 100%;
  padding: 0 9px;
  box-sizing: border-box;
}

/* closable 页签常留关闭钮的槽位(与 active/hover 无关),
   这样悬停出现的关闭钮不会压住标题,且选中时不跳版。 */
.tab-item.closable .tab-surface {
  padding-right: 26px;
}

.tab-item:hover {
  color: var(--ui-tab-bar-item-hover-fg, var(--ui-text-primary-fg, var(--text)));
}

.tab-item:hover:not(.active)::after {
  border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 75%, transparent);
}

/* active 只靠色深 + 朱砂实线 + 图标满描区分,不改字重 ——
   字重 400→500 会加宽短标题、把后续页签整条右推(选中即跳版)。 */
.tab-item.active {
  color: var(--ot-active-text, var(--ui-text-primary-fg, var(--text)));
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
  flex: 0 0 15px;
  color: currentColor;
  opacity: 0.72;
}

.tab-item.active .tab-icon {
  opacity: 1;
}

/* 冷会话:虚描图标示意「点开要重新载入」,取代旧缓存圆点 */
.tab-item.cold:not(.active) .tab-icon {
  opacity: 0.38;
  stroke-dasharray: 2 2;
}

.tab-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  min-width: 0;
  flex: 1 1 auto;
}

/* text-overflow only clips on a block-ish box; on the flex container the
   flexed text node gets hard-cut without an ellipsis. */
.tab-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* 重命名输入框：无框无底，只在基线上留一道朱砂虚线，
   与墨签「点描实」同一句法,编辑态不跳版。 */
.tab-title-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: none;
  border-bottom: 1px dashed var(--tab-ink);
  border-radius: 0;
  background: transparent;
  outline: none;
  color: var(--ot-active-text, var(--ui-text-primary-fg, var(--text)));
  font: inherit;
  -webkit-app-region: no-drag;
}

.tab-dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg, var(--accent));
  flex: 0 0 7px;
}

/* 关闭钮悬浮在右缘纸色渐变上,不再永久占格 */
.tab-close {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  box-sizing: border-box;
  border: none;
  background: linear-gradient(to right, transparent, var(--tab-paper) 38%);
  -webkit-app-region: no-drag;
  border-radius: 0;
  color: var(--ui-tab-bar-action-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}

.tab-item:hover .tab-close {
  opacity: 0.72;
  pointer-events: auto;
}

.tab-close:hover {
  opacity: 1;
  color: var(--ui-tab-bar-action-hover-fg, var(--ui-text-primary-fg, var(--text)));
}
</style>
