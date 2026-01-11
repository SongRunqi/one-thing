<template>
  <div class="allow-split-button" ref="containerRef" :class="{ 'is-open': showMenu }">
    <!-- 主按钮：点击立即执行默认操作 -->
    <button
      class="allow-main-btn"
      @click="handleDefaultAction"
      :title="'Allow this time (Enter)'"
    >
      Allow
    </button>
    <!-- 下拉箭头按钮 -->
    <button
      class="allow-dropdown-btn"
      @click.stop="toggleMenu"
      :title="'More options'"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </button>

    <!-- 下拉菜单 -->
    <Transition name="dropdown-fade">
      <div v-if="showMenu" class="allow-menu" @click.stop>
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
          @click="handleAction('workspace')"
        >
          <span class="menu-label">本工作区</span>
          <kbd>W</kbd>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

type PermissionResponse = 'once' | 'session' | 'workspace'

const emit = defineEmits<{
  confirm: [response: PermissionResponse]
}>()

const containerRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function handleDefaultAction() {
  emit('confirm', 'once')
}

function handleAction(response: PermissionResponse) {
  emit('confirm', response)
  showMenu.value = false
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.allow-split-button {
  display: inline-flex;
  position: relative;
}

/* 主按钮 */
.allow-main-btn {
  padding: 4px 10px;
  border-radius: 6px 0 0 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid rgba(135, 154, 57, 0.3);
  border-right: none;
  background: rgba(135, 154, 57, 0.08);
  color: var(--text-success, #879A39);
  transition: all 0.15s ease;
}

.allow-main-btn:hover {
  background: rgba(135, 154, 57, 0.15);
  border-color: rgba(135, 154, 57, 0.5);
}

/* 下拉箭头按钮 */
.allow-dropdown-btn {
  padding: 4px 6px;
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(135, 154, 57, 0.3);
  background: rgba(135, 154, 57, 0.08);
  color: var(--text-success, #879A39);
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.allow-dropdown-btn:hover {
  background: rgba(135, 154, 57, 0.15);
  border-color: rgba(135, 154, 57, 0.5);
}

.is-open .allow-dropdown-btn {
  background: rgba(135, 154, 57, 0.2);
}

.allow-dropdown-btn svg {
  transition: transform 0.15s ease;
}

.is-open .allow-dropdown-btn svg {
  transform: rotate(180deg);
}

/* 下拉菜单 */
.allow-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 140px;
  background: var(--panel, #1a1a1d);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
}

html[data-theme='light'] .allow-menu {
  background: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
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
  color: var(--text, #e0e0e0);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s ease;
  text-align: left;
}

.allow-menu-item:hover {
  background: var(--hover, rgba(255, 255, 255, 0.05));
}

html[data-theme='light'] .allow-menu-item {
  color: var(--text, #333);
}

html[data-theme='light'] .allow-menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.allow-menu-item.is-default {
  color: var(--text-success, #879A39);
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
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  padding: 1px 5px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 10px;
  color: var(--muted, #888);
}

html[data-theme='light'] .allow-menu-item kbd {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.1);
  color: var(--muted, #666);
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
