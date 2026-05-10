<template>
  <div
    ref="containerRef"
    class="allow-split-button"
    :class="{ 'is-open': showMenu }"
  >
    <!-- 主按钮：点击立即执行默认操作 -->
    <button
      class="allow-main-btn"
      :title="'Allow this time (Enter)'"
      @click="handleDefaultAction"
    >
      Allow
    </button>
    <!-- 下拉箭头按钮 -->
    <button
      class="allow-dropdown-btn"
      :title="'More options'"
      @click.stop="toggleMenu"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <!-- 下拉菜单 -->
    <Teleport to="body">
      <Transition name="dropdown-fade">
        <div
          v-if="showMenu"
          ref="menuRef"
          class="allow-menu"
          :style="menuStyle"
          @click.stop
        >
          <button
            class="allow-menu-item"
            :class="{ 'is-default': true }"
            @click="handleAction('once')"
          >
            <span class="menu-label">本次</span>
            <kbd>⏎</kbd>
          </button>
          <button
            class="allow-menu-item"
            @click="handleAction('session')"
          >
            <span class="menu-label">本会话</span>
            <kbd>S</kbd>
          </button>
          <button
            class="allow-menu-item"
            @click="handleAction('workdir')"
          >
            <span class="menu-label">本工作目录</span>
            <kbd>W</kbd>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

type PermissionResponse = 'once' | 'session' | 'workdir'

const emit = defineEmits<{
  confirm: [response: PermissionResponse]
}>()

const containerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)
const menuPosition = ref({ top: 0, left: 0, width: 140 })

const menuStyle = computed(() => ({
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  minWidth: `${menuPosition.value.width}px`,
}))

function toggleMenu() {
  if (showMenu.value) {
    showMenu.value = false
    return
  }
  updateMenuPosition()
  showMenu.value = true
  nextTick(updateMenuPosition)
}

function handleDefaultAction() {
  emit('confirm', 'once')
}

function handleAction(response: PermissionResponse) {
  emit('confirm', response)
  showMenu.value = false
}

function updateMenuPosition() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const menuWidth = Math.max(rect.width, 140)
  const viewportPadding = 8
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    window.innerWidth - menuWidth - viewportPadding,
  )
  menuPosition.value = {
    top: rect.bottom + 4,
    left,
    width: menuWidth,
  }
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  if (
    containerRef.value &&
    !containerRef.value.contains(target) &&
    !menuRef.value?.contains(target)
  ) {
    showMenu.value = false
  }
}

function handleViewportChange() {
  if (showMenu.value) updateMenuPosition()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('resize', handleViewportChange)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
})
</script>

<style scoped>
.allow-split-button {
  display: inline-flex;
  position: relative;
  height: 26px;
}

/* 主按钮 */
.allow-main-btn {
  padding: 0 10px;
  border-radius: var(--radius-sm, 8px) 0 0 var(--radius-sm, 8px);
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--border-success) 28%, transparent);
  border-right: none;
  background: color-mix(in srgb, var(--color-success) 9%, transparent);
  color: var(--text-success);
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.allow-main-btn:hover {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  border-color: color-mix(in srgb, var(--border-success) 42%, transparent);
}

/* 下拉箭头按钮 */
.allow-dropdown-btn {
  padding: 0 6px;
  border-radius: 0 var(--radius-sm, 8px) var(--radius-sm, 8px) 0;
  font-size: var(--font-size-sm, 12px);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--border-success) 28%, transparent);
  background: color-mix(in srgb, var(--color-success) 9%, transparent);
  color: var(--text-success);
  transition: all var(--duration-fast, 0.15s) var(--ease-default, ease);
  display: flex;
  align-items: center;
  justify-content: center;
}

.allow-dropdown-btn:hover {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  border-color: color-mix(in srgb, var(--border-success) 42%, transparent);
}

.is-open .allow-dropdown-btn {
  background: color-mix(in srgb, var(--color-success) 18%, transparent);
}

.allow-dropdown-btn svg {
  transition: transform 0.15s ease;
}

.is-open .allow-dropdown-btn svg {
  transform: rotate(180deg);
}

/* 下拉菜单 */
.allow-menu {
  position: fixed;
  background: var(--bg-menu);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm, 8px);
  box-shadow: var(--shadow-md);
  z-index: var(--z-modal);
  overflow: hidden;
}

/* 菜单项 */
.allow-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-menu-item);
  font-size: var(--font-size-base, 13px);
  cursor: pointer;
  transition: background var(--duration-fast, 0.15s) var(--ease-default, ease);
  text-align: left;
}

.allow-menu-item:hover {
  background: var(--bg-menu-item-hover);
  color: var(--text-menu-item-hover);
}

.allow-menu-item.is-default {
  color: var(--text-success);
}

.allow-menu-item.is-default::before {
  content: '●';
  font-size: 8px;
  margin-right: 6px;
}

.menu-label {
  flex: 1;
}

.allow-menu-item kbd {
  display: inline-block;
  background: var(--bg-code-inline);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs, 4px);
  padding: 1px 5px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

/* 过渡动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
