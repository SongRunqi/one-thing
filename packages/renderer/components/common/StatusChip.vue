<template>
  <!-- 静态 chip:没有 flyout 插槽就没有可展开的东西,壳退化成一个 span。
       插件块(chat.status-bar)走的就是这一支 —— 描述树自己即内容。 -->
  <span
    v-if="!$slots.flyout"
    class="status-chip is-static"
    v-bind="$attrs"
  ><slot /></span>

  <!-- 可展开 chip:入口是 <button>,浮层是它的**兄弟**。
       嵌进 button 里会被 HTML 解析器强闭外层(浮层里有真按钮),
       见 docs/design/composer-bands-2026-08.md §3.3。 -->
  <span
    v-else
    class="status-chip-host"
  >
    <button
      ref="triggerRef"
      type="button"
      class="status-chip"
      :class="{ 'is-open': isOpen }"
      :aria-expanded="isOpen ? 'true' : 'false'"
      aria-haspopup="dialog"
      v-bind="$attrs"
      @click="toggle"
    ><slot /></button>

    <!-- 浮层一律走 Popover(Teleport-to-body + 定位内核 + z 档位):S 带是
         横向滚动容器,`overflow-x: auto` 会连带把纵轴变 auto,留在带内的
         绝对定位浮层会被直接剪没(demo 实测判例)。 -->
    <Popover
      v-model:open="isOpen"
      :anchor="triggerRef"
      placement="top-start"
      :offset="8"
      surface="menu"
      class="status-chip-flyout"
      :style="flyoutStyle"
    >
      <div
        class="status-chip-flyout-body"
        role="dialog"
        :aria-label="label || undefined"
      >
        <slot name="flyout" />
      </div>
    </Popover>
  </span>
</template>

<script setup lang="ts">
/**
 * StatusChip —— S 状态带的唯一壳(docs/design/composer-bands-2026-08.md §3.1)。
 *
 * 它只统一**外形与开合**:24px 高、tabular-nums、hover/open/focus-visible 三态、
 * 从 chip 弹出的浮层。成员各自的 Vue 组件与全部交互原样保留 —— 壳不碰内容,
 * 内容通过默认插槽(收起态)与 `flyout` 插槽(展开态)进来,且都留在**调用方的
 * scoped CSS 作用域**里(与 Popover 同规)。
 */
import { computed, ref } from 'vue'
import Popover from './Popover.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** 受控开合(`v-model:open`)。不传则 chip 自己按点击切换。 */
  open?: boolean
  /** 浮层的可及名(role="dialog" 的 aria-label)。 */
  label?: string
  /** 浮层最小宽度(px)。内容自己更宽时以内容为准。 */
  flyoutWidth?: number
}>(), {
  open: undefined,
  label: '',
  flyoutWidth: 260,
})

const emit = defineEmits<{
  'update:open': [boolean]
}>()

const triggerRef = ref<HTMLElement | null>(null)

/**
 * 传了 `open` 就是受控,否则自持 —— **派生**而不是 watcher 镜像
 * (镜像会在一个 tick 内往返的场景静默失步,判例见 Popover)。
 */
const uncontrolled = ref(false)
const isOpen = computed<boolean>({
  get: () => props.open ?? uncontrolled.value,
  set: (value) => {
    uncontrolled.value = value
    emit('update:open', value)
  },
})

function toggle() {
  isOpen.value = !isOpen.value
}

const flyoutStyle = computed(() => ({ minWidth: `${props.flyoutWidth}px` }))
</script>

<style scoped>
.status-chip-host {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  min-width: 0;
}

.status-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  max-width: 280px;
  padding: 0 9px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ui-text-secondary-fg);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  /* 数字对齐是壳的职责:成员各自的曲名/目标名不改字体,只有数字走等宽位。 */
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.status-chip:hover {
  border-color: var(--ui-border-strong-border);
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

.status-chip.is-open {
  border-color: var(--ui-accent-primary-fg);
  background: var(--ui-state-selected-bg);
  color: var(--ui-text-primary-fg);
}

.status-chip:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg);
  outline-offset: 1px;
}

/* 静态 chip 不是控件:没有指针反馈,也不抢焦点。 */
.status-chip.is-static {
  cursor: default;
}

.status-chip.is-static:hover {
  border-color: var(--ui-border-default-border);
  background: transparent;
  color: var(--ui-text-secondary-fg);
}

/* 成员在自己的作用域里给数字打上 `.chip-num`,等宽字形由壳统一提供。 */
.status-chip :deep(.chip-num) {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
}

/* 浮层壳:面由 Popover 的 `menu` 档画,这里只调内边距与正文排版。
   2026-08-09 拍板的族色(S 带/trigger/ctx 三类浮层统一菜单面 —— floating 在夜间
   比 ⋯ 菜单/下拉亮一档,输入区一带两族面色打架)从此由**档名**表达,而不是在
   这里覆写一枚 `--app-popover-bg`:换族只换档名,边框与圆角也跟着一起走。
   (波 4 的差:边 subtle → strong、角 --radius-sm → --radius-md,与菜单族对齐。) */
.status-chip-flyout {
  --app-popover-padding: 12px 14px;
}

.status-chip-flyout-body {
  font-size: 12px;
  color: var(--ui-text-secondary-fg);
}

/*
 * chip 进出:只做透明度,不做位移。
 * 输入区一带的位移跳变要走 FLIP 才不难看(判例 project_composer_sidebar_glide),
 * 而 chip 的进出是**列表变化**不是布局搬家 —— 位移动画只会让邻座跟着抖。
 * 成员用 `<Transition name="s-chip">` 包住自己的 StatusChip 即可命中这里
 * (过渡类挂在 StatusChip 的根元素上,带的正是本组件的 scope id)。
 */
.s-chip-enter-active,
.s-chip-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default);
}

.s-chip-enter-from,
.s-chip-leave-to {
  opacity: 0;
}
</style>
