<template>
  <LayoutGridItem v-bind="props">
    <slot />
  </LayoutGridItem>
</template>

<script setup lang="ts">
import LayoutGridItem from './LayoutGridItem.vue'
import type { LayoutGridItemProps } from './layout'

defineOptions({
  name: 'LayoutItem',
})

const props = defineProps<LayoutGridItemProps>()
</script>
