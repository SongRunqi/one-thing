import { describe, expect, it, vi } from 'vitest'
import { TimeTool } from '../time.js'
import {
  executeCoreTimeTool,
  parseFixedOffsetMinutes,
  resolveCoreTimezone,
} from '../time-runtime.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
  } as any
}

describe('runtime time tool', () => {
  it('converts a local datetime from one timezone to another', async () => {
    const result = await TimeTool.execute({
      action: 'convert',
      time: '2026-05-16 09:00:00',
      from_timezone: 'Asia/Shanghai',
      to_timezone: 'UTC',
      format: 'iso',
    }, createContext())

    expect(result.metadata.result?.iso).toBe('2026-05-16T01:00:00.000Z')
    expect(result.metadata.result?.zonedIso).toBe('2026-05-16T01:00:00.000+00:00')
    expect(result.output).toContain('2026-05-16T01:00:00.000+00:00')
  })

  it('calculates differences across timezones by instant', async () => {
    const result = await TimeTool.execute({
      action: 'diff',
      start_time: '2026-05-16 09:00:00',
      start_timezone: 'Asia/Shanghai',
      end_time: '2026-05-15 21:00:00',
      end_timezone: 'America/New_York',
      unit: 'hour',
    }, createContext())

    expect(result.metadata.difference?.milliseconds).toBe(0)
    expect(result.metadata.difference?.requestedValue).toBe(0)
    expect(result.output).toContain('Difference (end - start): 0 milliseconds')
  })

  it('owns fixed offset parsing and core time conversion without host adapters', () => {
    expect(parseFixedOffsetMinutes('UTC+08:30')).toBe(510)
    expect(resolveCoreTimezone('UTC-05:00')).toMatchObject({
      kind: 'fixed',
      displayName: 'UTC-05:00',
      offsetMinutes: -300,
    })

    const converted = executeCoreTimeTool({
      action: 'convert',
      time: '2026-05-16 09:00:00',
      from_timezone: 'Asia/Shanghai',
      to_timezone: 'UTC',
      format: 'iso',
    }, { now: new Date('2026-05-01T00:00:00.000Z') })

    expect(converted.metadata.result?.iso).toBe('2026-05-16T01:00:00.000Z')
    expect(converted.output).toContain('2026-05-16T01:00:00.000+00:00')

    const difference = executeCoreTimeTool({
      action: 'diff',
      start_time: '2026-05-16 09:00:00',
      start_timezone: 'UTC+08:00',
      end_time: '2026-05-15 20:00:00',
      end_timezone: 'UTC-05:00',
      unit: 'hour',
    })

    expect(difference.metadata.difference?.milliseconds).toBe(0)
    expect(difference.metadata.difference?.requestedValue).toBe(0)
  })
})
