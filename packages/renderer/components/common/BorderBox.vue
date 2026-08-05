<template>
  <component
    :is="props.as"
    class="border-box"
    :class="{ 'is-interactive': props.interactive, 'is-unstyled': props.unstyled }"
    :style="borderStyle"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import { createBorderBoxStyle, type BorderBoxProps } from './border'

defineOptions({
  name: 'BorderBox',
})

const props = withDefaults(defineProps<BorderBoxProps>(), {
  as: 'div',
  borderStyle: 'solid',
  radius: 'md',
  radiusValue: undefined,
  shadow: 'none',
  shadowValue: undefined,
  hoverShadowValue: undefined,
  tone: 'default',
  surface: 'transparent',
  background: undefined,
  hoverBackground: undefined,
  borderColor: undefined,
  hoverBorderColor: undefined,
  focusRingColor: undefined,
  width: 1,
  padding: 0,
  interactive: false,
  unstyled: false,
})

const borderStyle = computed<StyleValue>(() => createBorderBoxStyle(props))
</script>

<style>
/*
 * UA 中和层(非 scoped,:where 全包 → 特异性 0,0,0)。
 *
 * withdrawal 撤走涂装规则后,unstyled 按钮不再有任何 BorderBox 规则去覆盖
 * 原生 <button> 的 UA 默认(黑边框 + buttonface 底 + 内边距)——以前涂装
 * 规则顺带充当了 reset,消费者大多没自己写 border:none,于是真机上裸露出
 * 系统按钮外观(实例:workbench 关闭钮、file tree 切换钮)。
 *
 * 这层只做"中和",不做设计:零特异性意味着任何消费者规则(包括行内到
 * 不能再低的单类规则)都能压过它,而作者级规则无论特异性都天然赢 UA 默认。
 */
:where(.border-box.is-unstyled) {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: inherit;
}
</style>

<style scoped>
/*
 * Layout is unconditional; PAINT is gated on `:where(:not(.is-unstyled))`.
 *
 * `:where()` contributes ZERO specificity, so both rules below weigh exactly
 * what they weighed before the gate existed — every styled consumer keeps its
 * current standing in the cascade, and this change cannot flip an existing
 * tie. What it does change is the `unstyled` case: the rule stops matching
 * altogether, so BorderBox emits no `border` / `background` / `box-shadow` for
 * the consumer's scoped rule to compete with, in any state.
 *
 * Why that matters (P2 incident): an unstyled Button used to hand BorderBox a
 * transparent hover border, and `.border-box.is-interactive:hover` out-weighs a
 * consumer's `.card:hover` — so a consumer that drew its own border watched it
 * vanish on hover. Painting "nothing" is not the same as not painting.
 */
.border-box {
  box-sizing: border-box;
  min-width: 0;
}

.border-box:where(:not(.is-unstyled)) {
  border:
    var(--border-box-border-width, 1px)
    var(--border-box-border-style, solid)
    var(--border-box-border-color, var(--ui-border-default-border));
  border-radius: var(--border-box-border-radius, var(--radius-md));
  background: var(--border-box-background, transparent);
  box-shadow: var(--border-box-shadow, none);
  padding: var(--border-box-padding, 0);
  color: var(--ui-text-primary-fg);
  transition:
    border-color var(--duration-fast, 0.15s) var(--ease-default, ease),
    background var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.border-box.is-interactive {
  cursor: pointer;
}

.border-box.is-interactive:where(:not(.is-unstyled)):hover {
  border-color: var(--border-box-hover-border-color, var(--border-box-border-color, var(--ui-border-default-border)));
  background: var(--border-box-hover-background, var(--border-box-background, transparent));
  box-shadow: var(--border-box-hover-shadow, var(--border-box-shadow, none));
}

.border-box.is-interactive:focus-visible {
  outline: none;
  box-shadow:
    var(--border-box-shadow, none),
    0 0 0 2px var(--ui-surface-app-bg),
    0 0 0 4px var(--border-box-focus-ring-color, var(--ui-border-focus-ring, var(--ui-accent-primary-fg)));
}
</style>
