<template>
  <div
    :class="[
      'session-item',
      {
        active: isActive,
        generating: isGenerating,
        pinned: session.isPinned,
        editing: isEditing,
        branch: session.depth > 0,
        hidden: session.isHidden,
        collapsed: session.isCollapsed
      }
    ]"
    @click="handleClick"
    @contextmenu.prevent="$emit('context-menu', $event)"
  >
    <!-- 树线缩进区域：参与 flex 布局，宽度 = depth * 16px -->
    <div
      v-if="session.depth > 0"
      class="tree-indent"
      :style="{ width: `${session.depth * 16}px` }"
    >
      <div class="tree-lines">
        <!-- 祖先层级的垂直线 -->
        <span
          v-for="(isAncestorLast, idx) in session.ancestorsLastChild"
          :key="idx"
          :class="['tree-line-segment', { continue: !isAncestorLast }]"
        />
        <!-- 当前节点的连接线 -->
        <span :class="['tree-line-segment', 'connector', { 'last-child': session.isLastChild }]" />
      </div>
    </div>

    <!-- Session name (flex: 1) -->
    <input
      v-if="isEditing"
      ref="inputRef"
      v-model="localEditingName"
      class="session-name-input"
      maxlength="50"
      @click.stop
      @keydown.enter="confirmRename"
      @keydown.esc="cancelRename"
      @blur="confirmRename"
    >
    <Tooltip
      v-else
      :text="session.name || 'New chat'"
      position="right"
      :delay="600"
    >
      <span
        class="session-name"
        @dblclick.stop="startRename"
      >{{ session.name || 'New chat' }}</span>
    </Tooltip>

    <!-- Branch Badge：圆形数字，点击展开/收起 -->
    <Button
      v-if="session.hasBranches"
      text
      size="small"
      class="branch-badge"
      :title="session.isCollapsed ? `展开 ${session.branchCount} 个分支` : `收起 ${session.branchCount} 个分支`"
      @click.stop="$emit('toggle-collapse')"
    >
      {{ session.branchCount }}
    </Button>

    <!-- 右侧状态区域：相对时间 + generating dot，hover 时隐藏让位给 ⋯ -->
    <div class="status-area">
      <!-- Generating dot - 始终存在，用 class 控制显隐 -->
      <div :class="['generating-dot', { active: isGenerating }]" />
      <!-- Relative timestamp (supporting text) -->
      <span
        v-if="!isEditing"
        class="session-time"
      >{{ relativeTime }}</span>
    </div>

    <!-- Hover action: progressive disclosure menu -->
    <Button
      text
      circle
      class="more-btn"
      title="More"
      aria-label="More"
      :icon="MoreHorizontal"
      @click.stop="$emit('context-menu', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, watch, nextTick } from 'vue'
import { MoreHorizontal } from 'lucide-vue-next'
import Tooltip from '@/components/common/Tooltip.vue'
import { formatRelativeTime, type SessionWithBranches } from './useSessionOrganizer'

interface Props {
  session: SessionWithBranches
  isActive: boolean
  isGenerating: boolean
  isEditing: boolean
  editingName: string
}

interface Emits {
  (e: 'click', event: MouseEvent): void
  (e: 'context-menu', event: MouseEvent): void
  (e: 'toggle-collapse'): void
  (e: 'start-rename'): void
  (e: 'confirm-rename', name: string): void
  (e: 'cancel-rename'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const inputRef = ref<HTMLInputElement | null>(null)
const localEditingName = ref('')

// Sync local editing name with prop
watch(() => props.editingName, (newName) => {
  localEditingName.value = newName
}, { immediate: true })

// Focus input when editing starts
watch(() => props.isEditing, (isEditing) => {
  if (isEditing) {
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  }
})

const relativeTime = computed(() => formatRelativeTime(props.session.updatedAt))

function handleClick(event: MouseEvent) {
  if (props.isEditing) return
  emit('click', event)
}

function startRename() {
  emit('start-rename')
}

function confirmRename() {
  emit('confirm-rename', localEditingName.value)
}

function cancelRename() {
  emit('cancel-rename')
}
</script>

<style scoped>
/* Session Item - Minimal Design */
.session-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 7px 10px;
  margin: 2px 2px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  max-height: 44px;
  transition:
    background 0.15s ease,
    max-height 0.25s ease,
    padding 0.25s ease,
    margin 0.25s ease,
    opacity 0.2s ease;
}

.session-item:not(.active):hover {
  background: color-mix(in srgb, var(--ui-sidebar-item-hover-bg, var(--ui-state-hover-bg, var(--hover))) 54%, transparent);
}

.session-item.active {
  background: color-mix(in srgb, var(--ui-sidebar-item-active-bg, var(--ui-state-selected-bg, var(--session-highlight))) 54%, transparent);
}

.session-item.hidden {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

/* 树线缩进区域：参与 flex 布局 */
.tree-indent {
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
}

/* 树状连接线 */
.tree-lines {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  display: flex;
  pointer-events: none;
}

/* 每层的连接线单元 (16px 宽) */
.tree-line-segment {
  width: 16px;
  height: 100%;
  position: relative;
}

/* 垂直延续线 (非最后子节点的祖先) */
.tree-line-segment.continue::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--ui-sidebar-border-border, var(--ui-border-default-border, var(--border)));
  opacity: 0.34;
}

/* L 形连接线 (当前节点) */
.tree-line-segment.connector::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 0;
  height: 50%;
  width: 9px;
  border-left: 1px solid var(--ui-sidebar-border-border, var(--ui-border-default-border, var(--border)));
  border-bottom: 1px solid var(--ui-sidebar-border-border, var(--ui-border-default-border, var(--border)));
  border-bottom-left-radius: 4px;
  opacity: 0.34;
}

/* 非最后子节点：T 形（延续垂直线） */
.tree-line-segment.connector:not(.last-child)::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--ui-sidebar-border-border, var(--ui-border-default-border, var(--border)));
  opacity: 0.34;
}

/* 右侧状态区域 - 固定宽度 */
.status-area {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 42px;
  min-width: 42px;
  flex-shrink: 0;
  justify-content: flex-end;
  transition: opacity 0.12s ease;
}

/* Generating dot - 始终存在，用 class 控制显隐 */
.generating-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-status-success-fg, var(--text-success));
  flex-shrink: 0;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.generating-dot.active {
  opacity: 1;
  transform: scale(1);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Branch Badge：圆形数字 */
.branch-badge {
  --app-button-height: 18px;
  --app-button-min-width: 18px;
  --app-button-padding-x: 5px;
  --app-button-gap: 0;
  --app-button-font-size: var(--type-caption-size);
  --app-button-hover-fill: var(--ui-accent-primary-fg, var(--ui-action-primary-bg, var(--accent)));
  --app-button-hover-fg: var(--ui-text-inverse-fg, var(--ui-action-primary-fg, var(--text-btn-primary)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 15%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  font-size: var(--type-caption-size);
  font-weight: var(--font-weight-semibold);
  line-height: var(--type-caption-line-height);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.branch-badge:hover {
  background: var(--ui-accent-primary-fg, var(--ui-action-primary-bg, var(--accent)));
  color: var(--ui-text-inverse-fg, var(--ui-action-primary-fg, var(--text-btn-primary)));
}

/* 已收起时的 badge 样式 */
.session-item.collapsed .branch-badge {
  background: var(--ui-sidebar-surface-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
}

.session-item.collapsed .branch-badge:hover {
  background: var(--ui-accent-primary-fg, var(--ui-action-primary-bg, var(--accent)));
  color: var(--ui-text-inverse-fg, var(--ui-action-primary-fg, var(--text-btn-primary)));
}


/* Relative timestamp (supporting text) - subordinate metadata, hidden on hover */
.session-time {
  display: block;
  width: 100%;
  font-size: var(--type-caption-muted-size);
  font-weight: var(--type-caption-muted-weight);
  line-height: var(--type-caption-muted-line-height);
  color: var(
    --sidebar-list-meta-fg,
    color-mix(in srgb, var(--type-caption-muted-color, var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)))) 88%, transparent)
  );
  opacity: 1;
  text-align: right;
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  transition: opacity 0.12s ease;
}

.session-item.active .session-time {
  color: var(
    --sidebar-list-meta-fg-strong,
    color-mix(in srgb, var(--type-meta-color, var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)))) 96%, transparent)
  );
  opacity: 1;
}

.session-item:hover .status-area {
  opacity: 0;
}

/* Session name tooltip wrapper - override default tooltip-wrapper styles */
.session-item :deep(.tooltip-wrapper) {
  flex: 1;
  min-width: 0;
  display: flex;
}

/* Session name */
.session-name {
  flex: 1;
  min-width: 0;
  font-size: var(--type-size-500);
  font-weight: var(--type-body-weight);
  line-height: var(--type-chat-compact-line-height-px);
  letter-spacing: 0;
  color: var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg, var(--text-sidebar-item)));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s ease;
}

.session-item:hover .session-name {
  color: var(--ui-sidebar-item-hover-fg, var(--ui-text-primary-fg, var(--text-sidebar-item-hover)));
}

.session-item.active .session-name {
  font-weight: var(--type-label-weight);
  color: var(--ui-sidebar-item-active-fg, var(--ui-text-primary-fg, var(--text-primary)));
}

.session-name-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  font-size: var(--type-size-500);
  font-weight: var(--type-body-weight);
  line-height: var(--type-chat-compact-line-height-px);
  color: var(--ui-sidebar-item-active-fg, var(--ui-text-primary-fg, var(--text)));
  outline: none;
}

/* Hover action: progressive disclosure (⋯ → context menu) */
.more-btn {
  --app-button-height: 23px;
  --app-button-min-width: 23px;
  --app-button-padding-x: 0;
  --app-button-hover-fill: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--bg-hover)));
  --app-button-hover-fg: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text-primary)));
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 23px;
  height: 23px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(
    --ui-sidebar-action-fg,
    color-mix(in srgb, var(--ui-sidebar-item-fg, var(--ui-text-secondary-fg, var(--text-sidebar-item))) 88%, transparent)
  );
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, background 0.15s ease, color 0.15s ease;
}

.session-item:hover .more-btn {
  opacity: 0.9;
  pointer-events: auto;
}

.more-btn:hover {
  background: var(--ui-sidebar-action-hover-bg, var(--ui-state-hover-bg, var(--bg-hover)));
  color: var(--ui-sidebar-action-hover-fg, var(--ui-text-primary-fg, var(--text-primary)));
}
</style>
