<template>
  <Teleport to="body">
    <Transition name="ctx-menu">
      <div
        v-if="show"
        ref="menuRef"
        class="app-context-menu"
        role="menu"
        :style="{ top: `${position.y}px`, left: `${position.x}px`, minWidth: `${minWidth}px` }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <template
          v-for="(item, index) in items"
          :key="item.id"
        >
          <div
            v-if="item.separatorBefore && index > 0"
            class="app-context-divider"
          />
          <!-- 原生 button 而非 Button.vue:unstyled 的 --app-button-hover-fill 是
               transparent,且 BorderBox 的 scoped :hover 规则特异性压过外部覆盖,
               菜单行的悬停底色会被吃掉(见 tab-more-item 同款旧坑)。 -->
          <button
            type="button"
            :class="['app-context-item', { danger: item.danger }]"
            role="menuitem"
            :disabled="item.disabled"
            @click="onSelect(item)"
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="13"
              :stroke-width="2"
            />
            <span>{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Transition>
    <div
      v-if="show"
      class="app-context-overlay"
      @pointerdown="$emit('close')"
      @contextmenu.prevent="$emit('close')"
      @wheel="$emit('close')"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ContextMenuItem } from './context-menu'

const props = withDefaults(defineProps<{
  show: boolean
  /** Viewport coordinates of the invoking pointer (clientX / clientY). */
  x: number
  y: number
  items: ContextMenuItem[]
  minWidth?: number
}>(), {
  minWidth: 184,
})

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const position = ref({ x: 0, y: 0 })

const VIEWPORT_MARGIN = 8

// The anchor is a raw pointer position, so a menu opened near the right/bottom
// edge would spill off-screen. Measure once mounted and flip back inside.
function clampToViewport() {
  const el = menuRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const maxX = window.innerWidth - rect.width - VIEWPORT_MARGIN
  const maxY = window.innerHeight - rect.height - VIEWPORT_MARGIN
  position.value = {
    x: Math.max(VIEWPORT_MARGIN, Math.min(props.x, maxX)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(props.y, maxY)),
  }
}

watch(
  () => [props.show, props.x, props.y, props.items.length] as const,
  ([show]) => {
    if (!show) return
    // Paint at the raw anchor first, then correct after measuring: a
    // pre-measurement frame at (0,0) would visibly jump.
    position.value = { x: props.x, y: props.y }
    void nextTick(clampToViewport)
  },
  { immediate: true },
)

function onSelect(item: ContextMenuItem) {
  if (item.disabled) return
  emit('select', item.id)
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

watch(() => props.show, (show) => {
  if (show) window.addEventListener('keydown', onKeydown, true)
  else window.removeEventListener('keydown', onKeydown, true)
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<style scoped>
/* 菜单族语言与 SessionContextMenu / tab-more-menu 同款:10px 圆角、纸面、tooltip 影 */
.app-context-menu {
  position: fixed;
  z-index: var(--z-modal, 30);
  padding: 6px;
  background: var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg, var(--bg-elevated)));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  border-radius: 10px;
  box-shadow: var(--ui-surface-tooltip-shadow, 0 4px 14px rgb(0 0 0 / 0.12));
  -webkit-app-region: no-drag;
}

.app-context-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-family: var(--type-label-font);
  font-size: 12.5px;
  text-align: left;
  white-space: nowrap;
  color: var(--ui-text-secondary-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: pointer;
  transition:
    background var(--duration-fast, 0.12s) var(--ease-default, ease),
    color var(--duration-fast, 0.12s) var(--ease-default, ease);
}

/* 悬停三管齐下:底色加深 + 字转主色 + 左缘一道朱砂 —— 单靠 menu-hover token
   在有些主题下与菜单底色几乎同色,分辨不出选中的是哪一行。 */
.app-context-item::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background var(--duration-fast, 0.12s) var(--ease-default, ease);
}

.app-context-item:hover:not(:disabled),
.app-context-item:focus-visible:not(:disabled) {
  outline: none;
  color: var(--ui-text-primary-fg, var(--text));
  background: color-mix(
    in srgb,
    var(--ui-surface-menu-hover-bg, var(--ui-text-primary-fg, var(--text))) 88%,
    var(--ui-text-primary-fg, var(--text))
  );
}

.app-context-item:hover:not(:disabled)::before,
.app-context-item:focus-visible:not(:disabled)::before {
  background: var(--ui-accent-primary-fg, var(--accent));
}

.app-context-item.danger {
  color: var(--ui-status-danger-fg, var(--color-danger, #c0392b));
}

.app-context-item.danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--color-danger, #c0392b));
}

.app-context-item.danger:hover:not(:disabled)::before {
  background: var(--ui-status-danger-fg, var(--color-danger, #c0392b));
}

.app-context-item:disabled {
  opacity: 0.45;
  cursor: default;
}

.app-context-item svg {
  flex: 0 0 auto;
}

.app-context-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.app-context-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal, 30) - 1);
}

.ctx-menu-enter-active {
  transition: opacity 0.12s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ctx-menu-leave-active {
  transition: opacity 0.08s ease, transform 0.08s ease;
}

.ctx-menu-enter-from,
.ctx-menu-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
