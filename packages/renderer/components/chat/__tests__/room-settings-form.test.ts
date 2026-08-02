import { describe, expect, it } from 'vitest'
import {
  ROOM_DEFAULT_DAILY_COST_USD,
  ROOM_DEFAULT_MAX_CHAIN,
  ROOM_DEFAULT_MAX_CONCURRENT_TURNS,
  ROOM_DEFAULT_MAX_TURN_SAY_CALLS,
  ROOM_DEFAULT_MAX_TURN_TOOL_CALLS,
  diffRoomSettings,
  hasRoomSettingsChanges,
  orderRoomSpeakers,
  readRoomSettings,
  sameRoomMembers,
  validateRoomSettings,
  type RoomSettingsDraft,
} from '../room-settings-form'

const SOURCE = {
  name: '官网改版组',
  permissionMode: 'auto-accept-edits' as const,
  room: {
    memberAgentIds: ['pm', 'fe'],
    pmAgentId: 'pm',
    budgets: { dailyCostUSD: 12, maxTurnToolCalls: 30, maxTurnSayCalls: 8 },
    frozen: true,
  },
}

function draftOf(overrides: Partial<RoomSettingsDraft> = {}): RoomSettingsDraft {
  return { ...readRoomSettings(SOURCE), ...overrides }
}

describe('readRoomSettings', () => {
  it('reads the room fields, defaulting the budget to the coordinator default', () => {
    expect(readRoomSettings(SOURCE)).toEqual({
      name: '官网改版组',
      memberAgentIds: ['pm', 'fe'],
      pmAgentId: 'pm',
      dailyCostUSD: 12,
      maxTurnToolCalls: 30,
      maxTurnSayCalls: 8,
      maxChain: ROOM_DEFAULT_MAX_CHAIN,
      maxConcurrentTurns: ROOM_DEFAULT_MAX_CONCURRENT_TURNS,
      responseMode: 'parallel',
      speakOrder: ['pm', 'fe'],
      relayLoops: 0,
      permissionMode: 'auto-accept-edits',
      frozen: true,
    })
    expect(readRoomSettings({ name: 'x', room: { memberAgentIds: ['pm'] } })).toEqual({
      name: 'x',
      memberAgentIds: ['pm'],
      pmAgentId: '',
      dailyCostUSD: ROOM_DEFAULT_DAILY_COST_USD,
      maxTurnToolCalls: ROOM_DEFAULT_MAX_TURN_TOOL_CALLS,
      maxTurnSayCalls: ROOM_DEFAULT_MAX_TURN_SAY_CALLS,
      maxChain: ROOM_DEFAULT_MAX_CHAIN,
      maxConcurrentTurns: ROOM_DEFAULT_MAX_CONCURRENT_TURNS,
      responseMode: 'parallel',
      speakOrder: ['pm'],
      relayLoops: 0,
      permissionMode: 'normal',
      frozen: false,
    })
  })

  it('keeps a configured 0 rather than reading it back as the default (0 = 关闭)', () => {
    // The whole reason the caps became settings: a user who turned the breaker
    // off must not find it back on the next time the dialog opens.
    const off = readRoomSettings({
      name: 'x',
      room: { memberAgentIds: ['pm'], budgets: { maxTurnToolCalls: 0, maxTurnSayCalls: 0 } },
    })
    expect(off.maxTurnToolCalls).toBe(0)
    expect(off.maxTurnSayCalls).toBe(0)
  })

  it('reads a configured 连续发言上限 back verbatim, 0 included', () => {
    const room = (maxChain: number) =>
      readRoomSettings({ name: 'x', room: { memberAgentIds: ['pm'], budgets: { maxChain } } }).maxChain
    expect(room(3)).toBe(3)
    expect(room(999)).toBe(999)
    // 关掉闸的人重开对话框必须还看见 0,而不是被悄悄换回默认值。
    expect(room(0)).toBe(0)
  })

  it('copies the roster instead of aliasing it (the draft is edited in place)', () => {
    const draft = readRoomSettings(SOURCE)
    draft.memberAgentIds.push('research')
    expect(SOURCE.room.memberAgentIds).toEqual(['pm', 'fe'])
  })
})

describe('validateRoomSettings', () => {
  it('requires a name, at least one member, a member PM and a non-negative budget', () => {
    expect(validateRoomSettings(draftOf())).toBeNull()
    expect(validateRoomSettings(draftOf({ name: '  ' }))).toBe('房间名不能为空')
    expect(validateRoomSettings(draftOf({ memberAgentIds: [], pmAgentId: '' }))).toBe('房间至少需要一名成员')
    expect(validateRoomSettings(draftOf({ pmAgentId: 'research' }))).toBe('负责人必须是房间成员')
    expect(validateRoomSettings(draftOf({ dailyCostUSD: -1 }))).toBe('日预算必须是不小于 0 的数字')
    expect(validateRoomSettings(draftOf({ dailyCostUSD: Number.NaN }))).toBe('日预算必须是不小于 0 的数字')
    // 0 is a legal value: it disables the gate.
    expect(validateRoomSettings(draftOf({ dailyCostUSD: 0 }))).toBeNull()
  })

  it('holds 连续发言上限 to the same shape as its neighbours — 0 legal, no ceiling', () => {
    expect(validateRoomSettings(draftOf({ maxChain: 1 }))).toBeNull()
    // 0 = 不限,与日预算/断路器同一套约定。
    expect(validateRoomSettings(draftOf({ maxChain: 0 }))).toBeNull()
    // 不设上界:填多少就是多少,不再有一道夹到 32 的隐形天花板。
    expect(validateRoomSettings(draftOf({ maxChain: 5000 }))).toBeNull()
    expect(validateRoomSettings(draftOf({ maxChain: -1 }))).toBe('连续发言上限必须是不小于 0 的数字')
    expect(validateRoomSettings(draftOf({ maxChain: Number.NaN }))).toBe('连续发言上限必须是不小于 0 的数字')
  })

  it('holds the 回合断路器 caps to the same shape — 0 legal, negatives and NaN not', () => {
    expect(validateRoomSettings(draftOf({ maxTurnSayCalls: 0, maxTurnToolCalls: 0 }))).toBeNull()
    expect(validateRoomSettings(draftOf({ maxTurnSayCalls: -1 }))).toBe('单轮发言上限必须是不小于 0 的数字')
    expect(validateRoomSettings(draftOf({ maxTurnToolCalls: Number.NaN })))
      .toBe('单轮工具调用上限必须是不小于 0 的数字')
  })
})

describe('diffRoomSettings — only changed items are sent', () => {
  it('plans nothing for an untouched draft, or one that merely reordered members', () => {
    const initial = readRoomSettings(SOURCE)
    expect(hasRoomSettingsChanges(diffRoomSettings(initial, draftOf()))).toBe(false)
    expect(hasRoomSettingsChanges(diffRoomSettings(initial, draftOf({ memberAgentIds: ['fe', 'pm'] })))).toBe(false)
    expect(sameRoomMembers(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameRoomMembers(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('bundles name / roster / PM / permission mode into one room update', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({
      name: '  新名字 ',
      memberAgentIds: ['pm', 'research'],
      pmAgentId: 'research',
      permissionMode: 'normal',
    }))
    expect(plan.roomUpdate).toEqual({
      name: '新名字',
      memberAgentIds: ['pm', 'research'],
      pmAgentId: 'research',
      permissionMode: 'normal',
    })
    expect(plan.budgets).toBeUndefined()
    expect(plan.frozen).toBeUndefined()
  })

  it('clears the PM with null, not with an empty string', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({ pmAgentId: '' }))
    expect(plan.roomUpdate).toEqual({ pmAgentId: null })
  })

  it('routes the budget and the freeze switch to their own channels', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({ dailyCostUSD: 0, frozen: false }))
    expect(plan.roomUpdate).toBeUndefined()
    expect(plan.budgets).toEqual({ dailyCostUSD: 0 })
    expect(plan.frozen).toBe(false)
    expect(hasRoomSettingsChanges(plan)).toBe(true)
  })

  it('ignores a budget field the user blanked into NaN', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({ dailyCostUSD: Number.NaN }))
    expect(plan.budgets).toBeUndefined()
  })

  it('sends ONLY the caps that changed — the write is a patch', () => {
    // An untouched cap must not ride along: the same channel carries the daily
    // budget, and a full-object write would overwrite a value the user did not
    // touch (and, for a cap sitting at its default, would pin the default).
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({ maxTurnSayCalls: 25 }))
    expect(plan.budgets).toEqual({ maxTurnSayCalls: 25 })
  })

  it('routes 连续发言上限 through the same budgets patch', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({ maxChain: 4 }))
    expect(plan.budgets).toEqual({ maxChain: 4 })
  })

  it('sends a cap the user turned off — 0 is a value, not an absent field', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({
      maxTurnSayCalls: 0,
      maxTurnToolCalls: 0,
    }))
    expect(plan.budgets).toEqual({ maxTurnSayCalls: 0, maxTurnToolCalls: 0 })
  })
})

/** 响应模式三件套(docs/design/collab-speaking-order.md)。 */
describe('响应模式', () => {
  it('次序表读出来始终是完整的一份:配置里列过的在前,其余按名册序补齐', () => {
    const draft = readRoomSettings({
      name: 'x',
      room: { memberAgentIds: ['a', 'b', 'c'], speakOrder: ['c', 'gone'] },
    })
    expect(draft.speakOrder).toEqual(['c', 'a', 'b'])
  })

  it('orderRoomSpeakers 丢掉已离房的 id,并保住其余次序', () => {
    expect(orderRoomSpeakers(['gone', 'b'], ['a', 'b'])).toEqual(['b', 'a'])
  })

  it('切到顺序模式会把模式和次序一起写出去', () => {
    const initial = readRoomSettings(SOURCE)
    const plan = diffRoomSettings(initial, draftOf({
      responseMode: 'serial',
      speakOrder: ['fe', 'pm'],
    }))
    expect(plan.roomUpdate).toEqual({ responseMode: 'serial', speakOrder: ['fe', 'pm'] })
  })

  it('次序相等是序列相等 —— 只换顺序也算改动', () => {
    const initial = readRoomSettings({
      name: 'x',
      room: { memberAgentIds: ['a', 'b'], responseMode: 'serial' },
    })
    const plan = diffRoomSettings(initial, { ...initial, speakOrder: ['b', 'a'] })
    expect(plan.roomUpdate).toEqual({ speakOrder: ['b', 'a'] })
  })

  it('并行模式下不写次序与轮次 —— 一次无关的保存不该钉死一份没人编辑过的次序', () => {
    const initial = readRoomSettings(SOURCE)
    const plan = diffRoomSettings(initial, draftOf({ speakOrder: ['fe', 'pm'], relayLoops: 3 }))
    expect(plan.roomUpdate).toBeUndefined()
  })

  /**
   * 编排(collab-coordinator-plan.md)之后这条**反过来了**。
   *
   * 接力时代顺序模式把并发上限钉死成 1(依次是靠并发压出来的),所以这一格不写。
   * 编排之后串行由**批边界**保证,而批**内**是并行的(`[[a,b,c]]` = 三个人一起说)
   * —— 这一格回到它本来的意思,每一种模式下都要能编辑、能写出去。留着旧断言会把
   * 它在新形态下锁死。
   */
  it('每一种模式都写同时发言上限 —— 编排之后它管的是"一批里几个人一起说"', () => {
    for (const responseMode of ['auto', 'serial', 'parallel'] as const) {
      const initial = readRoomSettings({
        name: 'x',
        room: { memberAgentIds: ['a', 'b'], responseMode },
      })
      const plan = diffRoomSettings(initial, { ...initial, maxConcurrentTurns: 3 })
      expect(plan.budgets).toEqual({ maxConcurrentTurns: 3 })
    }
  })

  it('智能模式同样写次序建议与轮次 —— 次序是给协调器的建议,轮次是天花板', () => {
    const initial = readRoomSettings({
      name: 'x',
      room: { memberAgentIds: ['a', 'b'], responseMode: 'auto' },
    })
    const plan = diffRoomSettings(initial, { ...initial, speakOrder: ['b', 'a'], relayLoops: 2 })
    expect(plan.roomUpdate).toEqual({ speakOrder: ['b', 'a'], relayLoops: 2 })
  })

  it('同时发言上限走 budgets 那条通道', () => {
    const plan = diffRoomSettings(readRoomSettings(SOURCE), draftOf({ maxConcurrentTurns: 2 }))
    expect(plan.budgets).toEqual({ maxConcurrentTurns: 2 })
  })

  it('轮次是负数时拒绝保存', () => {
    expect(validateRoomSettings(draftOf({ relayLoops: -1 }))).toBe('轮次必须是不小于 0 的数字')
  })
})
