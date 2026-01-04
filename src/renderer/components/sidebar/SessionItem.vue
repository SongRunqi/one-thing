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
    <div v-if="session.depth > 0" class="tree-indent" :style="{ width: `${session.depth * 16}px` }">
      <div class="tree-lines">
        <!-- 祖先层级的垂直线 -->
        <span
          v-for="(isAncestorLast, idx) in session.ancestorsLastChild"
          :key="idx"
          :class="['tree-line-segment', { continue: !isAncestorLast }]"
        ></span>
        <!-- 当前节点的连接线 -->
        <span :class="['tree-line-segment', 'connector', { 'last-child': session.isLastChild }]"></span>
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
    />
    <Tooltip v-else :text="session.name || 'New chat'" position="right" :delay="600">
      <span class="session-name" @dblclick.stop="startRename">{{ session.name || 'New chat' }}</span>
    </Tooltip>

    <!-- Branch Badge：圆形数字，点击展开/收起 -->
    <button
      v-if="session.hasBranches"
      class="branch-badge"
      :title="session.isCollapsed ? `展开 ${session.branchCount} 个分支` : `收起 ${session.branchCount} 个分支`"
      @click.stop="$emit('toggle-collapse')"
    >
      {{ session.branchCount }}
    </button>

    <!-- 右侧状态区域 (固定宽度，始终占位) -->
    <div class="status-area">
      <!-- Generating dot - 始终存在，用 class 控制显隐 -->
      <div :class="['generating-dot', { active: isGenerating }]"></div>
      <!-- Pin icon -->
      <svg
        v-if="session.isPinned && session.depth === 0"
        class="pin-icon"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
      >
        <path d="M12 2v8M7 10h10M9 10v7l-2 3h10l-2-3v-7"/>
      </svg>
    </div>

    <!-- Session time (固定宽度，默认隐藏) -->
    <span v-if="!isEditing" class="session-time">{{ formattedTime }}</span>

    <!-- Hover actions -->
    <div class="session-actions">
      <button
        :class="['action-btn', 'danger', { 'confirm': isPendingDelete }]"
        :title="deleteTitle"
        @click.stop="$emit('delete')"
      >
        <svg v-if="!isPendingDelete" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
        <template v-else>
          <span v-if="session.hasBranches" class="delete-count">{{ session.branchCount + 1 }}</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 13l4 4L19 7"/>
          </svg>
        </template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { SessionWithBranches } from './useSessionOrganizer'

interface Props {
  session: SessionWithBranches
  isActive: boolean
  isGenerating: boolean
  isEditing: boolean
  editingName: string
  isPendingDelete: boolean
  formattedTime: string
}

interface Emits {
  (e: 'click', event: MouseEvent): void
  (e: 'context-menu', event: MouseEvent): void
  (e: 'toggle-collapse'): void
  (e: 'start-rename'): void
  (e: 'confirm-rename', name: string): void
  (e: 'cancel-rename'): void
  (e: 'delete'): void
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

const deleteTitle = computed(() => {
  if (props.isPendingDelete) {
    if (props.session.hasBranches) {
      return `Click to delete ${props.session.branchCount + 1} chats`
    }
    return 'Click to confirm delete'
  }
  if (props.session.hasBranches) {
    return `Delete (includes ${props.session.branchCount} branch${props.session.branchCount > 1 ? 'es' : ''})`
  }
  return 'Delete'
})

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
  padding: 10px 12px;
  margin: 1px 4px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  max-height: 60px;
  transition:
    background 0.15s ease,
    max-height 0.25s ease,
    padding 0.25s ease,
    margin 0.25s ease,
    opacity 0.2s ease;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: var(--session-highlight);
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
  background: var(--border);
  opacity: 0.5;
}

/* L 形连接线 (当前节点) */
.tree-line-segment.connector::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 0;
  height: 50%;
  width: 9px;
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: 4px;
  opacity: 0.5;
}

/* 非最后子节点：T 形（延续垂直线） */
.tree-line-segment.connector:not(.last-child)::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
  opacity: 0.5;
}

/* 右侧状态区域 - 固定宽度 */
.status-area {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 20px;
  flex-shrink: 0;
  justify-content: flex-end;
}

/* Generating dot - 始终存在，用 class 控制显隐 */
.generating-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-success);
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
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.branch-badge:hover {
  background: var(--accent);
  color: var(--text-btn-primary);
}

/* 已收起时的 badge 样式 */
.session-item.collapsed .branch-badge {
  background: var(--bg-elevated);
  color: var(--text-muted);
}

.session-item.collapsed .branch-badge:hover {
  background: var(--accent);
  color: var(--text-btn-primary);
}


/* Pin indicator - 默认隐藏，hover 或 pinned 时显示 */
.pin-icon {
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.session-item:hover .pin-icon,
.session-item.pinned .pin-icon {
  opacity: 0.5;
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
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--text-sidebar-item);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s ease;
}

.session-item:hover .session-name {
  color: var(--text-sidebar-item-hover);
}

.session-item.active .session-name {
  font-weight: 500;
  color: var(--text-primary);
}

.session-name-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 400;
  color: var(--text);
  outline: none;
}

/* Session time - 默认显示，hover 时隐藏（给 actions 让位） */
.session-time {
  flex-shrink: 0;
  min-width: 36px;
  font-size: 11px;
  color: var(--muted);
  text-align: right;
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-time {
  opacity: 0;
}

/* Hover actions */
.session-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-actions {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn.danger:hover {
  background: rgba(var(--color-danger-rgb), 0.15);
  color: var(--text-error);
}

.action-btn.confirm {
  background: var(--text-error);
  color: var(--text-btn-danger);
  animation: shake 0.4s ease;
}

.action-btn.confirm:hover {
  background: var(--bg-btn-danger-hover);
  color: var(--text-btn-danger);
}

.delete-count {
  font-size: 10px;
  font-weight: 700;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

/* Pending delete state for session item */
.session-item:has(.action-btn.confirm) {
  background: rgba(var(--color-danger-rgb), 0.08) !important;
}

.session-item:has(.action-btn.confirm) .session-name {
  color: var(--text-error);
}
</style>
