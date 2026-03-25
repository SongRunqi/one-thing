<template>
  <component
    :is="themeComponent"
    @suggestion="$emit('suggestion', $event)"
  />
</template>

<script setup lang="ts">
/**
 * EmptyState - Dynamic Holiday Theme Loader
 *
 * Automatically switches between holiday themes based on the current date.
 * Uses async component loading for code splitting.
 */

import { computed, defineAsyncComponent } from 'vue'
import { useHolidayTheme } from './empty-state-themes/useHolidayTheme'

const { currentHoliday } = useHolidayTheme()

// Theme components map - async loaded for code splitting
const themeComponents = {
  'new-year': defineAsyncComponent(() => import('./empty-state-themes/NewYearTheme.vue')),
  'spring-festival': defineAsyncComponent(() => import('./empty-state-themes/NewYearTheme.vue')), // TODO: Create SpringFestivalTheme
  'valentine': defineAsyncComponent(() => import('./empty-state-themes/DefaultTheme.vue')), // TODO: Create ValentineTheme
  'dragon-boat': defineAsyncComponent(() => import('./empty-state-themes/DefaultTheme.vue')), // TODO: Create DragonBoatTheme
  'mid-autumn': defineAsyncComponent(() => import('./empty-state-themes/DefaultTheme.vue')), // TODO: Create MidAutumnTheme
  'halloween': defineAsyncComponent(() => import('./empty-state-themes/DefaultTheme.vue')), // TODO: Create HalloweenTheme
  'christmas': defineAsyncComponent(() => import('./empty-state-themes/DefaultTheme.vue')), // TODO: Create ChristmasTheme
  'default': defineAsyncComponent(() => import('./empty-state-themes/DefaultTheme.vue')),
} as const

const themeComponent = computed(() => {
  return themeComponents[currentHoliday.value] || themeComponents['default']
})

defineEmits<{
  suggestion: [text: string]
}>()
</script>
