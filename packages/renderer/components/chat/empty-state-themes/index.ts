/**
 * Holiday Theme Configuration
 * Handles holiday detection and date matching for EmptyState themes
 */

// @ts-ignore - lunar-javascript doesn't have types
import { Lunar, Solar } from 'lunar-javascript'

// Holiday type definitions
export type HolidayId =
  | 'new-year'
  | 'spring-festival'
  | 'valentine'
  | 'dragon-boat'
  | 'mid-autumn'
  | 'halloween'
  | 'christmas'
  | 'default'

export interface HolidayConfig {
  id: HolidayId
  name: string
  nameEn: string
  // Fixed date holidays (Gregorian calendar)
  month?: number
  day?: number
  // Lunar calendar holidays
  lunarMonth?: number
  lunarDay?: number
  // Display period (relative to holiday date)
  daysBefore: number
  daysAfter: number
  // Priority (higher = more important, used when holidays overlap)
  priority: number
}

/**
 * Holiday configurations
 * Note: Lunar holidays (spring-festival, dragon-boat, mid-autumn) use lunarMonth/lunarDay
 */
export const holidays: HolidayConfig[] = [
  {
    id: 'new-year',
    name: '元旦',
    nameEn: 'New Year',
    month: 1,
    day: 1,
    daysBefore: 4,
    daysAfter: 5,  // Extended to Jan 6 for viewing
    priority: 8,
  },
  {
    id: 'spring-festival',
    name: '春节',
    nameEn: 'Spring Festival',
    lunarMonth: 1,
    lunarDay: 1,
    daysBefore: 3,  // Start from 除夕前2天
    daysAfter: 7,   // Until 正月初七
    priority: 10,   // Highest priority
  },
  {
    id: 'valentine',
    name: '情人节',
    nameEn: "Valentine's Day",
    month: 2,
    day: 14,
    daysBefore: 2,
    daysAfter: 1,
    priority: 6,
  },
  {
    id: 'dragon-boat',
    name: '端午节',
    nameEn: 'Dragon Boat Festival',
    lunarMonth: 5,
    lunarDay: 5,
    daysBefore: 2,
    daysAfter: 1,
    priority: 7,
  },
  {
    id: 'mid-autumn',
    name: '中秋节',
    nameEn: 'Mid-Autumn Festival',
    lunarMonth: 8,
    lunarDay: 15,
    daysBefore: 2,
    daysAfter: 1,
    priority: 7,
  },
  {
    id: 'halloween',
    name: '万圣节',
    nameEn: 'Halloween',
    month: 10,
    day: 31,
    daysBefore: 3,
    daysAfter: 1,
    priority: 5,
  },
  {
    id: 'christmas',
    name: '圣诞节',
    nameEn: 'Christmas',
    month: 12,
    day: 25,
    daysBefore: 5,
    daysAfter: 2,
    priority: 8,
  },
]

/**
 * Get the Gregorian date for a lunar holiday in a given year
 */
function getLunarHolidayDate(lunarMonth: number, lunarDay: number, year: number): Date {
  try {
    const lunar = Lunar.fromYmd(year, lunarMonth, lunarDay)
    const solar = lunar.getSolar()
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
  } catch {
    // If conversion fails (e.g., invalid lunar date), return far future date
    return new Date(9999, 11, 31)
  }
}

/**
 * Get the target date for a holiday in a given year
 */
function getHolidayDate(holiday: HolidayConfig, year: number): Date {
  if (holiday.lunarMonth !== undefined && holiday.lunarDay !== undefined) {
    return getLunarHolidayDate(holiday.lunarMonth, holiday.lunarDay, year)
  }
  if (holiday.month !== undefined && holiday.day !== undefined) {
    return new Date(year, holiday.month - 1, holiday.day)
  }
  return new Date(9999, 11, 31) // Invalid config
}

/**
 * Calculate days difference between two dates (ignoring time)
 */
function daysDiff(date1: Date, date2: Date): number {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate())
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate())
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Check if a date falls within a holiday's display period
 */
function isInHolidayPeriod(
  today: Date,
  holiday: HolidayConfig,
  holidayDate: Date
): boolean {
  const diff = daysDiff(today, holidayDate)
  // diff > 0 means holiday is in the future
  // diff < 0 means holiday has passed
  return diff >= -holiday.daysAfter && diff <= holiday.daysBefore
}

/**
 * Get the currently active holiday based on today's date
 * Returns 'default' if no holiday is active
 */
export function getCurrentHoliday(today: Date = new Date()): HolidayId {
  const year = today.getFullYear()
  const activeHolidays: Array<{ holiday: HolidayConfig; date: Date }> = []

  for (const holiday of holidays) {
    // Check current year
    const dateThisYear = getHolidayDate(holiday, year)
    if (isInHolidayPeriod(today, holiday, dateThisYear)) {
      activeHolidays.push({ holiday, date: dateThisYear })
      continue
    }

    // For holidays at year boundaries, check previous/next year
    // e.g., New Year (Jan 1) might be active on Dec 28 of previous year
    if (holiday.month === 1) {
      const dateNextYear = getHolidayDate(holiday, year + 1)
      if (isInHolidayPeriod(today, holiday, dateNextYear)) {
        activeHolidays.push({ holiday, date: dateNextYear })
        continue
      }
    }

    // For lunar new year, also check if we're near previous year's holiday
    if (holiday.lunarMonth === 1 && holiday.lunarDay === 1) {
      const datePrevYear = getHolidayDate(holiday, year - 1)
      if (isInHolidayPeriod(today, holiday, datePrevYear)) {
        activeHolidays.push({ holiday, date: datePrevYear })
      }
    }
  }

  if (activeHolidays.length === 0) {
    return 'default'
  }

  // If multiple holidays are active, return the one with highest priority
  activeHolidays.sort((a, b) => b.holiday.priority - a.holiday.priority)
  return activeHolidays[0].holiday.id
}

/**
 * Get holiday configuration by ID
 */
export function getHolidayConfig(id: HolidayId): HolidayConfig | undefined {
  return holidays.find(h => h.id === id)
}
