<template>
  <component
    :is="themeComponent"
    @suggestion="$emit('suggestion', $event)"
  />
</template>

<script setup lang="ts">
/**
 * EmptyState - Holiday Theme Loader
 *
 * Automatically switches between holiday themes based on the current date.
 */

import { computed, type Component } from 'vue'
import DefaultTheme from './empty-state-themes/DefaultTheme.vue'
import NewYearTheme from './empty-state-themes/NewYearTheme.vue'
import { useHolidayTheme } from './empty-state-themes/useHolidayTheme'
import type { HolidayId } from './empty-state-themes'

const { currentHoliday } = useHolidayTheme()

// Only holidays with a dedicated visual are mapped. Any holiday without a
// bespoke theme (and `default`) falls through to DefaultTheme below, so we
// don't keep placeholder entries that just re-point at the default.
const themeComponents: Partial<Record<HolidayId, Component>> = {
  'new-year': NewYearTheme,
  'spring-festival': NewYearTheme, // reuses the New Year visual until a dedicated one exists
}

const themeComponent = computed<Component>(() => {
  return themeComponents[currentHoliday.value] ?? DefaultTheme
})

defineEmits<{
  suggestion: [text: string]
}>()
</script>
