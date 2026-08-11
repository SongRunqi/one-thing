<template>
  <component
    :is="props.as"
    :class="SURFACE_CLASS"
    :data-surface="props.surface"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
/**
 * 区域面原语(G7-1)—— 单根元素 + 一枚档位声明,别的一概不管。
 *
 * 极薄是刻意的:区域根各自有大量几何/布局的 scoped 规则钉在自己的类名上
 * (`.media-panel` / `.right-workbench` …),原语再多画一笔都是在和它们抢。
 * 它只做两件事 —— 加画笔类、盖章。档位表与理由在 `./surface.ts`。
 *
 * 不新增 DOM:`as` 渲染的就是原来那一个根元素,消费者的 class / scopeId /
 * 指令(v-show 等)照旧落在它身上。
 */
import type { Component } from 'vue'
import { SURFACE_CLASS, type SurfaceTier } from './surface'

defineOptions({
  name: 'Surface',
})

const props = withDefaults(
  defineProps<{
    as?: string | Component
    surface: SurfaceTier
  }>(),
  {
    as: 'div',
  },
)
</script>
