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
    @dblclick.prevent.stop="openMenu"
    @contextmenu.prevent.stop="openMenu"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="tab-surface">
      <!-- Agent 执行会话的页签戴 agent 的头像章而不是通用会话图标(W20):
           几张执行会话签并排时,身份才是区分它们的东西。 -->
      <AgentAvatar
        v-if="avatar || avatarImage"
        class="tab-avatar"
        aria-hidden="true"
        :avatar="avatar"
        :avatar-image="avatarImage"
        :size="15"
      />
      <component
        :is="icon"
        v-else
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
        @contextmenu.stop
        @mousedown.stop
        @keydown.stop="handleRenameKeydown"
        @compositionstart="composing = true"
        @compositionend="onCompositionEnd"
        @blur="commitRename"
      >
      <span
        v-else
        class="tab-title"
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
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import Button from '@/components/common/Button.vue'
import { ref, computed, nextTick, watch } from 'vue'
import { MessageSquare, FolderCode, X } from 'lucide-vue-next'
import type { Tab } from '@/types/tabs'

const props = defineProps<{
  tab: Tab
  active: boolean
  closable: boolean
  hideTrailingDivider?: boolean
  sessionName?: string
  /** Emoji stamp shown in place of the tab icon (agent execution sessions). */
  avatar?: string
  /** Picture avatar (media file name); wins over `avatar` when present. */
  avatarImage?: string
  cached?: boolean
  isFirst?: boolean
  panelId?: string
  /** Parent-driven: the tab bar decides who is being renamed (menu action). */
  renaming?: boolean
}>()

const emit = defineEmits<{
  select: []
  close: []
  rename: [name: string]
  renameEnd: []
  contextMenu: [payload: { tabId: string; x: number; y: number }]
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

// —— 页签内联重命名（仅 chat 页签，由页签菜单的 Rename 触发）——
const isRenaming = ref(false)
const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

// 输入框替换掉标题后，页签会塌回 min-width；按草稿宽度撑开，编辑时跟着字数走。
// ch 是 "0" 的宽度，CJK/全角字符约占两个，按码点分别计量才不会越打越挤。
const renameWidth = computed(() => {
  let cells = 0
  for (const ch of renameDraft.value) cells += isWideChar(ch) ? 2 : 1
  return `${Math.min(40, Math.max(8, cells + 2))}ch`
})

function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x1100 && code <= 0x115f) // Hangul Jamo
    || (code >= 0x2e80 && code <= 0xa4cf) // CJK radicals … Yi
    || (code >= 0xac00 && code <= 0xd7a3) // Hangul syllables
    || (code >= 0xf900 && code <= 0xfaff) // CJK compatibility ideographs
    || (code >= 0xfe30 && code <= 0xfe4f) // CJK compatibility forms
    || (code >= 0xff00 && code <= 0xff60) // Fullwidth forms
    || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x20000 && code <= 0x3fffd) // CJK extensions B+
  )
}

// 输入法组字期间不能把 Enter / Escape 当成确认或取消。isComposing 是主路，
// 但部分输入法(搜狗/微软拼音在 Windows、部分 WebKit)会在 compositionend 之后
// 立刻补一个不带 isComposing 的 Enter —— 那一下是「上屏」而不是「确认改名」，
// 所以额外用组字结束时间戳兜一小段窗口。
const composing = ref(false)
const COMPOSITION_TAIL_MS = 40
let compositionEndedAt = 0

function onCompositionEnd() {
  composing.value = false
  compositionEndedAt = Date.now()
}

function startRename() {
  if (props.tab.type !== 'chat') return
  renameDraft.value = props.sessionName || ''
  isRenaming.value = true
  composing.value = false
  compositionEndedAt = 0
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function endRename() {
  isRenaming.value = false
  composing.value = false
  emit('renameEnd')
}

function commitRename() {
  if (!isRenaming.value) return
  // 组字中失焦(点到别处)时输入框里已是上屏文本，照常提交即可。
  const next = renameDraft.value.trim()
  endRename()
  if (next && next !== (props.sessionName || '')) emit('rename', next)
}

function handleRenameKeydown(event: KeyboardEvent) {
  // keyCode 229 是「按键交给输入法处理」的通用信号（老版 WebKit 不给 isComposing）
  if (event.isComposing || composing.value || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    if (Date.now() - compositionEndedAt < COMPOSITION_TAIL_MS) return
    commitRename()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    endRename()
  }
}

watch(() => props.renaming, (want) => {
  if (want && !isRenaming.value) startRename()
  else if (!want && isRenaming.value) isRenaming.value = false
})

// 双击 / 右键都弹页签菜单（重命名走菜单，编辑态里不再弹）
function openMenu(event: MouseEvent) {
  if (isRenaming.value) return
  emit('contextMenu', { tabId: props.tab.id, x: event.clientX, y: event.clientY })
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

/* 头像章占图标同一格:一圈发丝线,emoji 即身份(与侧栏 Agent 行、房间成员章
   同一句法),不改页签的排版占位。 */
.tab-avatar {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, currentColor 32%, transparent);
  border-radius: 50%;
  font-size: 9px;
  line-height: 1;
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
