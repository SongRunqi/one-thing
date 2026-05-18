import { describe, expect, it, vi } from 'vitest'
import { TimeTool } from '../time'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
  } as any
}

describe('time tool', () => {
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

  it('adds exact durations and formats in a target timezone', async () => {
    const result = await TimeTool.execute({
      action: 'add',
      time: '2026-05-16T00:00:00Z',
      to_timezone: 'Asia/Shanghai',
      amount: 90,
      unit: 'minute',
      format: 'compact',
    }, createContext())

    expect(result.metadata.result?.iso).toBe('2026-05-16T01:30:00.000Z')
    expect(result.metadata.result?.zonedIso).toBe('2026-05-16T09:30:00.000+08:00')
    expect(result.output).toContain('2026-05-16 09:30:00 UTC+08:00 (Asia/Shanghai)')
  })

  it('supports fixed UTC offsets as timezones', async () => {
    const result = await TimeTool.execute({
      action: 'convert',
      time: '2026-05-16 09:00:00',
      from_timezone: 'UTC+08:00',
      to_timezone: 'UTC-05:00',
      format: 'iso',
    }, createContext())

    expect(result.metadata.result?.iso).toBe('2026-05-16T01:00:00.000Z')
    expect(result.metadata.result?.zonedIso).toBe('2026-05-15T20:00:00.000-05:00')
  })

  it('rejects invalid timezone names', async () => {
    await expect(TimeTool.execute({
      action: 'now',
      timezone: 'Mars/Olympus_Mons',
    }, createContext())).rejects.toThrow('Invalid timezone')
  })
})
