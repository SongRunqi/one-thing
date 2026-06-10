/**
 * Built-in Tool: Time
 *
 * Timezone-aware current time, conversion, duration difference, and exact
 * duration addition. Uses Intl so it works without native dependencies.
 */

import { z } from 'zod'
import { Tool } from '../core/tool.js'

type TimeAction = 'now' | 'convert' | 'diff' | 'add'
type TimeFormat = 'full' | 'date' | 'time' | 'iso' | 'compact'
type DurationUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week'

interface TimeMetadata {
  action: TimeAction
  timezone?: string
  timestamp?: number
  iso?: string
  zonedIso?: string
  formatted?: string
  start?: TimePointMetadata
  end?: TimePointMetadata
  difference?: DifferenceMetadata
  result?: TimePointMetadata
  [key: string]: unknown
}

interface TimePointMetadata {
  input?: string
  timezone: string
  timestamp: number
  iso: string
  zonedIso: string
  formatted: string
  offset: string
  offsetMinutes: number
  [key: string]: unknown
}

interface DifferenceMetadata {
  milliseconds: number
  seconds: number
  minutes: number
  hours: number
  days: number
  human: string
  requestedUnit?: DurationUnit
  requestedValue?: number
  [key: string]: unknown
}

type TimeZoneSpec = {
  kind: 'iana' | 'fixed'
  id: string
  displayName: string
  offsetMinutes?: number
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

type ParsedTime = {
  date: Date
  timezone: TimeZoneSpec
  input?: string
}

type LocalDateTimeParts = ZonedParts & {
  millisecond: number
}

const TimeParameters = z.object({
  action: z.enum(['now', 'convert', 'diff', 'add'])
    .describe('Operation to perform: now gets current time, convert changes display timezone, diff compares two instants, add adds an exact duration.'),
  timezone: z.string().optional()
    .describe('Default timezone for parsing and formatting. Supports IANA names like Asia/Shanghai or fixed offsets like UTC+08:00. Defaults to the system timezone.'),
  format: z.enum(['full', 'date', 'time', 'iso', 'compact']).optional()
    .describe('Output format. full is human-readable with timezone, iso is ISO-8601 with zone offset, compact is YYYY-MM-DD HH:mm:ss offset.'),
  time: z.string().optional()
    .describe('Time for convert/add. Use ISO with offset (2026-05-16T09:00:00+08:00), local datetime (2026-05-16 09:00:00) plus timezone, epoch milliseconds, or "now". Defaults to now for add.'),
  from_timezone: z.string().optional()
    .describe('Source timezone for time when it has no explicit offset. Defaults to timezone.'),
  to_timezone: z.string().optional()
    .describe('Target timezone for convert, or output timezone for add/now. Defaults to timezone.'),
  start_time: z.string().optional()
    .describe('Start time for diff. Use ISO with offset, local datetime plus start_timezone/timezone, epoch milliseconds, or "now".'),
  start_timezone: z.string().optional()
    .describe('Timezone used to parse start_time when it has no explicit offset. Defaults to timezone.'),
  end_time: z.string().optional()
    .describe('End time for diff. Defaults to now. Use ISO with offset, local datetime plus end_timezone/timezone, epoch milliseconds, or "now".'),
  end_timezone: z.string().optional()
    .describe('Timezone used to parse end_time when it has no explicit offset. Defaults to timezone.'),
  amount: z.number().optional()
    .describe('Duration amount for add. Can be negative.'),
  unit: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week']).optional()
    .describe('Duration unit for add, and optional preferred unit for diff. Days are exact 24-hour days; weeks are exact 7-day weeks.'),
})

const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
const EXPLICIT_OFFSET_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/
const INTEGER_RE = /^-?\d+$/

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const UNIT_TO_MS: Record<DurationUnit, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function parseFixedOffsetMinutes(raw: string): number | undefined {
  const value = raw.trim()
  const upper = value.toUpperCase()
  if (upper === 'Z' || upper === 'UTC' || upper === 'GMT') return 0

  const match = upper.match(/^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) return undefined

  const hours = Number.parseInt(match[2], 10)
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid UTC offset: ${raw}`)
  }

  const sign = match[1] === '-' ? -1 : 1
  return sign * (hours * 60 + minutes)
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

function resolveTimezone(timezone?: string): TimeZoneSpec {
  const raw = timezone?.trim()
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  if (!raw || /^(local|system|default)$/i.test(raw)) {
    return { kind: 'iana', id: localTimezone, displayName: localTimezone }
  }

  const offsetMinutes = parseFixedOffsetMinutes(raw)
  if (offsetMinutes !== undefined) {
    const offset = formatOffset(offsetMinutes)
    return {
      kind: 'fixed',
      id: `UTC${offset}`,
      displayName: `UTC${offset}`,
      offsetMinutes,
    }
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date())
  } catch {
    throw new Error(`Invalid timezone "${raw}". Use an IANA timezone such as "Asia/Shanghai" or a fixed offset such as "UTC+08:00".`)
  }

  return { kind: 'iana', id: raw, displayName: raw }
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number.parseInt(parts.find(part => part.type === type)?.value || '0', 10)
}

function getZonedParts(date: Date, timezone: TimeZoneSpec): ZonedParts {
  if (timezone.kind === 'fixed') {
    const shifted = new Date(date.getTime() + (timezone.offsetMinutes || 0) * 60 * 1000)
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    }
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone.id,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  return {
    year: getPart(parts, 'year'),
    month: getPart(parts, 'month'),
    day: getPart(parts, 'day'),
    hour: getPart(parts, 'hour'),
    minute: getPart(parts, 'minute'),
    second: getPart(parts, 'second'),
  }
}

function getOffsetMinutes(date: Date, timezone: TimeZoneSpec): number {
  if (timezone.kind === 'fixed') return timezone.offsetMinutes || 0

  const parts = getZonedParts(date, timezone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  )
  return Math.round((asUtc - date.getTime()) / (60 * 1000))
}

function formatIsoWithZone(date: Date, timezone: TimeZoneSpec): string {
  const parts = getZonedParts(date, timezone)
  const offset = formatOffset(getOffsetMinutes(date, timezone))
  const millis = pad(date.getUTCMilliseconds(), 3)
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${millis}${offset}`
}

function formatCompact(date: Date, timezone: TimeZoneSpec): string {
  const parts = getZonedParts(date, timezone)
  const offset = formatOffset(getOffsetMinutes(date, timezone))
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} UTC${offset} (${timezone.displayName})`
}

function formatZoned(date: Date, timezone: TimeZoneSpec, format: TimeFormat = 'full'): string {
  const parts = getZonedParts(date, timezone)
  const offset = formatOffset(getOffsetMinutes(date, timezone))

  if (format === 'iso') return formatIsoWithZone(date, timezone)
  if (format === 'compact') return formatCompact(date, timezone)
  if (format === 'date') {
    return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} (${timezone.displayName})`
  }
  if (format === 'time') {
    return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} UTC${offset} (${timezone.displayName})`
  }

  const weekday = WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()]
  return `${weekday}, ${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} UTC${offset} (${timezone.displayName})`
}

function validateLocalParts(parts: LocalDateTimeParts, input: string): void {
  const check = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  ))
  const valid = (
    check.getUTCFullYear() === parts.year &&
    check.getUTCMonth() + 1 === parts.month &&
    check.getUTCDate() === parts.day &&
    check.getUTCHours() === parts.hour &&
    check.getUTCMinutes() === parts.minute &&
    check.getUTCSeconds() === parts.second &&
    check.getUTCMilliseconds() === parts.millisecond
  )

  if (!valid) {
    throw new Error(`Invalid local datetime: ${input}`)
  }
}

function parseLocalDateTime(input: string): LocalDateTimeParts | undefined {
  const match = input.match(LOCAL_DATE_TIME_RE)
  if (!match) return undefined

  const millis = match[7] ? Number.parseInt(match[7].padEnd(3, '0').slice(0, 3), 10) : 0
  const parts: LocalDateTimeParts = {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
    hour: match[4] ? Number.parseInt(match[4], 10) : 0,
    minute: match[5] ? Number.parseInt(match[5], 10) : 0,
    second: match[6] ? Number.parseInt(match[6], 10) : 0,
    millisecond: millis,
  }
  validateLocalParts(parts, input)
  return parts
}

function localDateTimeToUtc(parts: LocalDateTimeParts, timezone: TimeZoneSpec, input: string): Date {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  )

  let utc = localAsUtc - getOffsetMinutes(new Date(localAsUtc), timezone) * 60 * 1000
  for (let i = 0; i < 3; i++) {
    const next = localAsUtc - getOffsetMinutes(new Date(utc), timezone) * 60 * 1000
    if (next === utc) break
    utc = next
  }

  const date = new Date(utc)
  const check = getZonedParts(date, timezone)
  if (
    check.year !== parts.year ||
    check.month !== parts.month ||
    check.day !== parts.day ||
    check.hour !== parts.hour ||
    check.minute !== parts.minute ||
    check.second !== parts.second ||
    date.getUTCMilliseconds() !== parts.millisecond
  ) {
    throw new Error(`Local datetime "${input}" does not exist in ${timezone.displayName}, likely because of a daylight-saving transition.`)
  }

  return date
}

function parseEpoch(text: string): Date | undefined {
  if (!INTEGER_RE.test(text)) return undefined

  const value = Number.parseInt(text, 10)
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid epoch timestamp: ${text}`)
  }

  const millis = Math.abs(value) < 10_000_000_000 ? value * 1000 : value
  const date = new Date(millis)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid epoch timestamp: ${text}`)
  }
  return date
}

function parseTimeInput(input: string | undefined, timezoneInput: string | undefined, now: Date): ParsedTime {
  const timezone = resolveTimezone(timezoneInput)
  const raw = input?.trim() || 'now'

  if (/^(now|current|current time)$/i.test(raw)) {
    return { date: new Date(now.getTime()), timezone, input: raw }
  }

  const epoch = parseEpoch(raw)
  if (epoch) {
    return { date: epoch, timezone, input: raw }
  }

  const localParts = parseLocalDateTime(raw)
  if (localParts && !EXPLICIT_OFFSET_RE.test(raw)) {
    return {
      date: localDateTimeToUtc(localParts, timezone, raw),
      timezone,
      input: raw,
    }
  }

  if (EXPLICIT_OFFSET_RE.test(raw)) {
    const timestamp = Date.parse(raw)
    if (Number.isNaN(timestamp)) {
      throw new Error(`Invalid offset datetime: ${raw}`)
    }
    return { date: new Date(timestamp), timezone, input: raw }
  }

  throw new Error(`Unsupported time value "${raw}". Use "now", epoch milliseconds, ISO with offset, or YYYY-MM-DD HH:mm:ss with a timezone.`)
}

function describeTimePoint(parsed: ParsedTime, format: TimeFormat): TimePointMetadata {
  const offsetMinutes = getOffsetMinutes(parsed.date, parsed.timezone)
  return {
    input: parsed.input,
    timezone: parsed.timezone.displayName,
    timestamp: parsed.date.getTime(),
    iso: parsed.date.toISOString(),
    zonedIso: formatIsoWithZone(parsed.date, parsed.timezone),
    formatted: formatZoned(parsed.date, parsed.timezone, format),
    offset: formatOffset(offsetMinutes),
    offsetMinutes,
  }
}

function humanizeDuration(milliseconds: number): string {
  if (milliseconds === 0) return '0 milliseconds'

  const sign = milliseconds < 0 ? '-' : ''
  let remaining = Math.abs(milliseconds)
  const days = Math.floor(remaining / UNIT_TO_MS.day)
  remaining -= days * UNIT_TO_MS.day
  const hours = Math.floor(remaining / UNIT_TO_MS.hour)
  remaining -= hours * UNIT_TO_MS.hour
  const minutes = Math.floor(remaining / UNIT_TO_MS.minute)
  remaining -= minutes * UNIT_TO_MS.minute
  const seconds = Math.floor(remaining / UNIT_TO_MS.second)
  remaining -= seconds * UNIT_TO_MS.second

  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (seconds) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`)
  if (remaining) parts.push(`${remaining} millisecond${remaining === 1 ? '' : 's'}`)
  return `${sign}${parts.join(' ')}`
}

function buildDifference(milliseconds: number, unit?: DurationUnit): DifferenceMetadata {
  const difference: DifferenceMetadata = {
    milliseconds,
    seconds: milliseconds / UNIT_TO_MS.second,
    minutes: milliseconds / UNIT_TO_MS.minute,
    hours: milliseconds / UNIT_TO_MS.hour,
    days: milliseconds / UNIT_TO_MS.day,
    human: humanizeDuration(milliseconds),
  }

  if (unit) {
    difference.requestedUnit = unit
    difference.requestedValue = milliseconds / UNIT_TO_MS[unit]
  }

  return difference
}

function outputNow(point: TimePointMetadata): string {
  return [
    `Current time: ${point.formatted}`,
    `Zoned ISO: ${point.zonedIso}`,
    `UTC ISO: ${point.iso}`,
    `Unix milliseconds: ${point.timestamp}`,
  ].join('\n')
}

function outputConvert(source: TimePointMetadata, target: TimePointMetadata): string {
  return [
    `Source: ${source.formatted}`,
    `Target: ${target.formatted}`,
    `Target zoned ISO: ${target.zonedIso}`,
    `UTC ISO: ${target.iso}`,
  ].join('\n')
}

function outputDiff(start: TimePointMetadata, end: TimePointMetadata, difference: DifferenceMetadata): string {
  const lines = [
    `Start: ${start.formatted}`,
    `End: ${end.formatted}`,
    `Difference (end - start): ${difference.human}`,
    `Milliseconds: ${difference.milliseconds}`,
    `Seconds: ${difference.seconds}`,
    `Minutes: ${difference.minutes}`,
    `Hours: ${difference.hours}`,
    `Days: ${difference.days}`,
  ]

  if (difference.requestedUnit && difference.requestedValue !== undefined) {
    lines.push(`${difference.requestedUnit}: ${difference.requestedValue}`)
  }

  return lines.join('\n')
}

function outputAdd(base: TimePointMetadata, result: TimePointMetadata, amount: number, unit: DurationUnit): string {
  return [
    `Base: ${base.formatted}`,
    `Added: ${amount} ${unit}${amount === 1 ? '' : 's'}`,
    `Result: ${result.formatted}`,
    `Result zoned ISO: ${result.zonedIso}`,
    `UTC ISO: ${result.iso}`,
  ].join('\n')
}

export const TimeTool = Tool.define<typeof TimeParameters, TimeMetadata>('time', {
  name: 'Time',
  description: `Timezone-aware time utility.

Use this tool to:
- Get the current time in a specific timezone with action="now".
- Convert a time from one timezone or offset to another with action="convert".
- Calculate the signed difference between two times with action="diff"; end_time defaults to now.
- Add an exact duration to a time with action="add".

Timezone rules:
- Prefer IANA timezone names such as "Asia/Shanghai", "America/New_York", or "UTC".
- Fixed UTC offsets such as "UTC+08:00", "GMT-05:00", "+0800", and "Z" are also accepted.
- If a datetime has no explicit offset, provide timezone/from_timezone/start_timezone/end_timezone so it can be interpreted correctly.
- Date-only inputs are interpreted as midnight in the selected timezone.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'text',

  parameters: TimeParameters,

  async execute(args, ctx) {
    ctx.updateResult?.({
      content: [{ type: 'text', text: `Calculating time ${args.action}...` }],
      details: { phase: 'running', action: args.action },
    })
    const format = args.format || 'full'
    const now = new Date()

    if (args.action === 'now') {
      const timezone = resolveTimezone(args.to_timezone || args.timezone)
      const parsed: ParsedTime = { date: now, timezone, input: 'now' }
      const point = describeTimePoint(parsed, format)

      ctx.metadata({
        title: `Current time in ${timezone.displayName}`,
        metadata: point,
      })

      return {
        title: `Current time in ${timezone.displayName}`,
        output: outputNow(point),
        metadata: {
          action: 'now',
          timezone: timezone.displayName,
          timestamp: point.timestamp,
          iso: point.iso,
          zonedIso: point.zonedIso,
          formatted: point.formatted,
          result: point,
        },
      }
    }

    if (args.action === 'convert') {
      const source = parseTimeInput(args.time, args.from_timezone || args.timezone, now)
      const targetTimezone = resolveTimezone(args.to_timezone || args.timezone)
      const target: ParsedTime = {
        date: source.date,
        timezone: targetTimezone,
        input: args.time || 'now',
      }
      const sourcePoint = describeTimePoint(source, format)
      const targetPoint = describeTimePoint(target, format)

      ctx.metadata({
        title: `Converted time to ${targetTimezone.displayName}`,
        metadata: {
          source: sourcePoint,
          target: targetPoint,
        },
      })

      return {
        title: `Converted time to ${targetTimezone.displayName}`,
        output: outputConvert(sourcePoint, targetPoint),
        metadata: {
          action: 'convert',
          timezone: targetTimezone.displayName,
          iso: targetPoint.iso,
          zonedIso: targetPoint.zonedIso,
          formatted: targetPoint.formatted,
          start: sourcePoint,
          result: targetPoint,
        },
      }
    }

    if (args.action === 'diff') {
      if (!args.start_time) {
        throw new Error('start_time is required for action="diff"')
      }

      const start = parseTimeInput(args.start_time, args.start_timezone || args.timezone, now)
      const end = parseTimeInput(args.end_time || 'now', args.end_timezone || args.timezone, now)
      const startPoint = describeTimePoint(start, format)
      const endPoint = describeTimePoint(end, format)
      const difference = buildDifference(end.date.getTime() - start.date.getTime(), args.unit)

      ctx.metadata({
        title: `Time difference: ${difference.human}`,
        metadata: {
          start: startPoint,
          end: endPoint,
          difference,
        },
      })

      return {
        title: `Time difference: ${difference.human}`,
        output: outputDiff(startPoint, endPoint, difference),
        metadata: {
          action: 'diff',
          start: startPoint,
          end: endPoint,
          difference,
        },
      }
    }

    if (args.action === 'add') {
      if (args.amount === undefined) {
        throw new Error('amount is required for action="add"')
      }
      if (!args.unit) {
        throw new Error('unit is required for action="add"')
      }

      const base = parseTimeInput(args.time || 'now', args.from_timezone || args.timezone, now)
      const targetTimezone = resolveTimezone(args.to_timezone || args.timezone || base.timezone.displayName)
      const resultDate = new Date(base.date.getTime() + args.amount * UNIT_TO_MS[args.unit])
      const result: ParsedTime = {
        date: resultDate,
        timezone: targetTimezone,
        input: `${args.time || 'now'} + ${args.amount} ${args.unit}`,
      }
      const basePoint = describeTimePoint(base, format)
      const resultPoint = describeTimePoint(result, format)

      ctx.metadata({
        title: `Added ${args.amount} ${args.unit}`,
        metadata: {
          base: basePoint,
          result: resultPoint,
        },
      })

      return {
        title: `Added ${args.amount} ${args.unit}`,
        output: outputAdd(basePoint, resultPoint, args.amount, args.unit),
        metadata: {
          action: 'add',
          timezone: targetTimezone.displayName,
          iso: resultPoint.iso,
          zonedIso: resultPoint.zonedIso,
          formatted: resultPoint.formatted,
          start: basePoint,
          result: resultPoint,
        },
      }
    }

    throw new Error(`Unsupported action: ${args.action}`)
  },
})
