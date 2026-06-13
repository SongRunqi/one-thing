<template>
  <LayoutGrid v-bind="props">
    <slot />
  </LayoutGrid>
</template>

<script setup lang="ts">
import LayoutGrid from './LayoutGrid.vue'
import type { LayoutGridProps } from './layout'

defineOptions({
  name: 'Layout',
})

const props = defineProps<LayoutGridProps>()
</script>
