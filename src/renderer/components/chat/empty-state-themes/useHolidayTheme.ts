/**
 * Holiday Theme Composable
 * Provides reactive access to the current holiday theme
 */

import { computed, ref, onMounted } from 'vue'
import { getCurrentHoliday, getHolidayConfig, type HolidayId } from './index'

export function useHolidayTheme() {
  const currentHoliday = ref<HolidayId>('default')

  onMounted(() => {
    currentHoliday.value = getCurrentHoliday()
  })

  const holidayConfig = computed(() => getHolidayConfig(currentHoliday.value))

  const isHoliday = computed(() => currentHoliday.value !== 'default')

  const holidayName = computed(() => holidayConfig.value?.name || '')

  const holidayNameEn = computed(() => holidayConfig.value?.nameEn || '')

  return {
    currentHoliday,
    holidayConfig,
    isHoliday,
    holidayName,
    holidayNameEn,
  }
}
