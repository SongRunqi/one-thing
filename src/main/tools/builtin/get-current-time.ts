/**
 * Built-in Tool: Get Current Time
 *
 * Returns the current date and time in various formats.
 */

import type { ToolDefinition, ToolHandler } from '../types.js'

export const definition: ToolDefinition = {
  id: 'get_current_time',
  name: 'Get Current Time',
  description: 'Get the current date and time. Useful when the user asks about the current time, date, or needs timestamp information.',
  parameters: [
    {
      name: 'timezone',
      type: 'string',
      description: 'The timezone to use (e.g., "UTC", "Asia/Shanghai", "America/New_York"). Defaults to local timezone.',
      required: false,
    },
    {
      name: 'format',
      type: 'string',
      description: 'The format of the output: "full" (date and time), "date" (date only), "time" (time only), "iso" (ISO 8601 format)',
      required: false,
      enum: ['full', 'date', 'time', 'iso'],
    },
  ],
  enabled: true,
  autoExecute: true,
  category: 'builtin',
  icon: 'clock',
}

export const handler: ToolHandler = async (args) => {
  try {
    const { timezone, format = 'full' } = args

    const now = new Date()
    let options: Intl.DateTimeFormatOptions = {}

    // Set timezone if provided
    if (timezone) {
      options.timeZone = timezone
    }

    let result: string

    switch (format) {
      case 'date':
        options = {
          ...options,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        }
        result = now.toLocaleDateString('en-US', options)
        break

      case 'time':
        options = {
          ...options,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }
        result = now.toLocaleTimeString('en-US', options)
        break

      case 'iso':
        result = now.toISOString()
        break

      case 'full':
      default:
        options = {
          ...options,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }
        result = now.toLocaleString('en-US', options)
        break
    }

    return {
      success: true,
      data: {
        formatted: result,
        timestamp: now.getTime(),
        iso: now.toISOString(),
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to get current time',
    }
  }
}
