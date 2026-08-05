/**
 * Collab handler wiring. 这一层的全部职责是**把 patch 原样送过河**:请求减去它的
 * 地址(roomSessionId)就是 patch,一个字段名都不该在中转里出现,抛出来的错翻译
 * 成一次线上失败。
 *
 * 逐字段手抄的那一版活生生丢过一个字段(budgets 的 `maxConcurrentTurns` 抄漏了
 * 几个月,而且不报错),所以下面除了行为测试还钉了两条**穷尽性**:枚举 shared
 * patch 类型的 keyof,逐键断言它真的到得了 app 层。新加字段漏抄就是红的 ——
 * 类型层(Record<keyof …> 少一个键编译不过)和运行时层各挡一道。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/ipc.js'
import type {
  CollabAgentActivityGetRequest,
  CollabRoomBudgetsPatch,
  CollabRoomRevokeLeaseRequest,
  CollabRoomRevokeLeaseResult,
  CollabRoomUpdatePatch,
} from '@shared/ipc.js'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, request: unknown) => unknown>(),
  getCollabAgentActivity: vi.fn((_agentIds?: readonly string[]) => [] as unknown[]),
  setCollabRoomConfig: vi.fn((_roomSessionId: string, _patch: unknown) => ({ success: true })),
  setCollabRoomBudgets: vi.fn((_roomSessionId: string, _patch: unknown) => true),
  ensureUserDmRoom: vi.fn((_agentId: string): string | null => 'agent-dm-fe'),
  reactToCollabMessage: vi.fn(() => ({ success: true, reactions: [] })),
  applyUserCollabBoardAction: vi.fn(async () => ({ success: true, board: { version: 1, tasks: [] } })),
  clearCollabRoomHistory: vi.fn(async () => ({ success: true, clearedMessageCount: 3 })),
  // 显式标注返回类型:成功与三条失败原因是**同一个**联合类型,让 vi.fn 从初值
  // 推断的话它只会认得成功那一半,后面 mock 一条 `epoch-stale` 就编译不过。
  revokeCollabRoomLease: vi.fn(
    async (_request: unknown): Promise<CollabRoomRevokeLeaseResult> => ({ ok: true, revoked: true }),
  ),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, request: unknown) => unknown) => {
      mocks.handlers.set(channel, handler)
    },
  },
}))

vi.mock('@onething/app/collab/board-store.js', () => ({ loadCollabBoard: () => ({ version: 1, tasks: [] }) }))

vi.mock('@onething/app/collab/index.js', () => ({
  setCollabRoomBudgets: (...args: unknown[]) => mocks.setCollabRoomBudgets(...(args as [string, unknown])),
  setCollabRoomFrozen: () => true,
  setCollabRoomConfig: (...args: unknown[]) => mocks.setCollabRoomConfig(...(args as [string, unknown])),
  ensureUserDmRoom: (...args: unknown[]) => mocks.ensureUserDmRoom(...(args as [string])),
  reactToCollabMessage: (...args: unknown[]) => mocks.reactToCollabMessage(...(args as [])),
  applyUserCollabBoardAction: (...args: unknown[]) => mocks.applyUserCollabBoardAction(...(args as [])),
  clearCollabRoomHistory: (...args: unknown[]) => mocks.clearCollabRoomHistory(...(args as [])),
  getCollabAgentActivity: (...args: unknown[]) =>
    mocks.getCollabAgentActivity(...(args as [readonly string[] | undefined])),
  revokeCollabRoomLease: (...args: unknown[]) => mocks.revokeCollabRoomLease(...(args as [unknown])),
}))

const { registerCollabHandlers } = await import('../ipc/collab.js')

function invoke(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_ROOM_UPDATE)?.({}, request)
}

function invokeBudgets(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_ROOM_SET_BUDGETS)?.({}, request)
}

function invokeReact(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_MESSAGE_REACT)?.({}, request)
}

function invokeAct(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_BOARD_ACT)?.({}, request)
}

function invokeEnsureDm(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_DM_ROOM_ENSURE)?.({}, request)
}

function invokeClearHistory(request: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_ROOM_CLEAR_HISTORY)?.({}, request)
}

function invokeAgentActivity(request?: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_AGENT_ACTIVITY_GET)?.({}, request)
}

function invokeRevokeLease(request?: unknown): unknown {
  return mocks.handlers.get(IPC_CHANNELS.COLLAB_ROOM_REVOKE_LEASE)?.({}, request)
}

const EMPTY_BOARD = { version: 1, tasks: [] }

beforeEach(() => {
  mocks.handlers.clear()
  mocks.setCollabRoomConfig.mockClear()
  mocks.setCollabRoomConfig.mockReturnValue({ success: true })
  mocks.setCollabRoomBudgets.mockClear()
  mocks.setCollabRoomBudgets.mockReturnValue(true)
  mocks.ensureUserDmRoom.mockClear()
  mocks.ensureUserDmRoom.mockReturnValue('agent-dm-fe')
  mocks.reactToCollabMessage.mockClear()
  mocks.reactToCollabMessage.mockReturnValue({ success: true, reactions: [] })
  mocks.applyUserCollabBoardAction.mockClear()
  mocks.applyUserCollabBoardAction.mockResolvedValue({ success: true, board: EMPTY_BOARD })
  mocks.clearCollabRoomHistory.mockClear()
  mocks.clearCollabRoomHistory.mockResolvedValue({ success: true, clearedMessageCount: 3 })
  mocks.getCollabAgentActivity.mockClear()
  mocks.getCollabAgentActivity.mockReturnValue([])
  mocks.revokeCollabRoomLease.mockClear()
  mocks.revokeCollabRoomLease.mockResolvedValue({ ok: true, revoked: true })
  registerCollabHandlers()
})

describe('COLLAB_ROOM_UPDATE', () => {
  it('forwards only the fields present in the request', () => {
    expect(invoke({ roomSessionId: 'room-1', memberAgentIds: ['pm'] })).toEqual({ success: true })
    expect(mocks.setCollabRoomConfig).toHaveBeenCalledWith('room-1', { memberAgentIds: ['pm'] })
  })

  it('keeps an explicit null PM (clear) distinct from an absent one', () => {
    invoke({ roomSessionId: 'room-1', pmAgentId: null })
    expect(mocks.setCollabRoomConfig).toHaveBeenCalledWith('room-1', { pmAgentId: null })
  })

  it('passes the app layer error through instead of a bare boolean', () => {
    mocks.setCollabRoomConfig.mockReturnValue({ success: false, error: 'PM must be a room member' } as never)
    expect(invoke({ roomSessionId: 'room-1', pmAgentId: 'ghost' }))
      .toEqual({ success: false, error: 'PM must be a room member' })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.setCollabRoomConfig.mockImplementation(() => { throw new Error('store exploded') })
    expect(invoke({ roomSessionId: 'room-1', name: 'x' }))
      .toEqual({ success: false, error: 'store exploded' })
  })

  /**
   * 穷尽性:`CollabRoomUpdatePatch` 的每一个键都真的穿得过 handler。
   *
   * `Record<keyof CollabRoomUpdatePatch, …>` 是类型层的那道闸 —— shared 里加一个
   * 字段而这里没补,编译就红;下面的 toHaveBeenCalledWith 是运行时那道 ——
   * 中转要是又开始逐字段手抄且抄漏,断言就红。
   */
  it('shared patch 的每个键都到得了 app 层(keyof 穷尽)', () => {
    const patch: Record<keyof CollabRoomUpdatePatch, unknown> = {
      name: '官网改版组',
      memberAgentIds: ['pm', 'fe'],
      pmAgentId: 'pm',
      permissionMode: 'normal',
      responseMode: 'serial',
      speakOrder: ['fe', 'pm'],
      relayLoops: 3,
    }
    invoke({ roomSessionId: 'room-1', ...patch })
    expect(mocks.setCollabRoomConfig).toHaveBeenCalledWith('room-1', patch)
    // 地址不是 patch 的一部分 —— 它是**哪间房**,不是"改什么"。
    expect(mocks.setCollabRoomConfig.mock.calls[0][1]).not.toHaveProperty('roomSessionId')
  })
})

/**
 * COLLAB_ROOM_SET_BUDGETS —— 在这次收敛之前全仓没有一条测试引用过这个通道,
 * 而它恰好就是"逐字段手抄漏了一个"那起事故的现场。
 */
describe('COLLAB_ROOM_SET_BUDGETS', () => {
  it('carries the patch across and reports success', () => {
    expect(invokeBudgets({ roomSessionId: 'room-1', dailyCostUSD: 12 })).toEqual({ success: true })
    expect(mocks.setCollabRoomBudgets).toHaveBeenCalledWith('room-1', { dailyCostUSD: 12 })
  })

  it('"不是房间"翻译成一句明确的失败,而不是一个裸 false', () => {
    mocks.setCollabRoomBudgets.mockReturnValue(false)
    expect(invokeBudgets({ roomSessionId: 'chat-1', maxChain: 4 }))
      .toEqual({ success: false, error: 'Not a room session' })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.setCollabRoomBudgets.mockImplementation(() => { throw new Error('store exploded') })
    expect(invokeBudgets({ roomSessionId: 'room-1', dailyCostUSD: 1 }))
      .toEqual({ success: false, error: 'store exploded' })
  })

  /** 同一条穷尽性纪律。`maxConcurrentTurns` 正是被抄漏的那一个,它在这张表里。 */
  it('shared patch 的每个键都到得了 app 层(keyof 穷尽)', () => {
    const patch: Record<keyof CollabRoomBudgetsPatch, unknown> = {
      dailyCostUSD: 12,
      maxChain: 4,
      maxTurnToolCalls: 20,
      maxTurnSayCalls: 3,
      maxConcurrentTurns: 2,
    }
    invokeBudgets({ roomSessionId: 'room-1', ...patch })
    expect(mocks.setCollabRoomBudgets).toHaveBeenCalledWith('room-1', patch)
    expect(mocks.setCollabRoomBudgets.mock.calls[0][1]).not.toHaveProperty('roomSessionId')
  })
})

describe('COLLAB_BOARD_ACT (W16)', () => {
  it('carries the action across verbatim — the reducer owns what is legal', async () => {
    const action = { action: 'move', taskId: 't1', status: 'done', expectedRev: 4 }
    await expect(invokeAct({ roomSessionId: 'room-1', action })).resolves
      .toEqual({ success: true, board: EMPTY_BOARD })
    expect(mocks.applyUserCollabBoardAction).toHaveBeenCalledWith('room-1', action)
  })

  it('never lets the renderer choose the actor (user is pinned app-side)', async () => {
    await invokeAct({
      roomSessionId: 'room-1',
      action: { action: 'complete', taskId: 't1', summary: 's' },
      actor: { type: 'agent', agentId: 'fe' },
    })
    expect(mocks.applyUserCollabBoardAction).toHaveBeenCalledWith('room-1', {
      action: 'complete',
      taskId: 't1',
      summary: 's',
    })
  })

  it('returns the rev conflict WITH the fresh board so the panel can repaint', async () => {
    mocks.applyUserCollabBoardAction.mockResolvedValue({
      success: false,
      error: 'Task t1 changed (rev 7) — re-read the board (action:"list") and retry with the current rev',
      board: EMPTY_BOARD,
    } as never)
    await expect(invokeAct({
      roomSessionId: 'room-1',
      action: { action: 'move', taskId: 't1', status: 'done', expectedRev: 4 },
    })).resolves.toEqual({
      success: false,
      error: 'Task t1 changed (rev 7) — re-read the board (action:"list") and retry with the current rev',
      board: EMPTY_BOARD,
    })
  })

  it('passes the room validation refusal through', async () => {
    mocks.applyUserCollabBoardAction.mockResolvedValue({ success: false, error: 'Not a room session' } as never)
    await expect(invokeAct({ roomSessionId: 'chat-1', action: { action: 'list' } }))
      .resolves.toEqual({ success: false, error: 'Not a room session' })
  })

  it('refuses an action-less request instead of calling the app layer', async () => {
    await expect(invokeAct({ roomSessionId: 'room-1' }))
      .resolves.toEqual({ success: false, error: 'Missing board action' })
    expect(mocks.applyUserCollabBoardAction).not.toHaveBeenCalled()
  })

  it('turns a thrown error into a failed response', async () => {
    mocks.applyUserCollabBoardAction.mockRejectedValue(new Error('store exploded'))
    await expect(invokeAct({ roomSessionId: 'room-1', action: { action: 'list' } }))
      .resolves.toEqual({ success: false, error: 'store exploded' })
  })
})

describe('COLLAB_MESSAGE_REACT (W8)', () => {
  it('carries the four fields across in order', () => {
    const actor = { type: 'user' as const }
    expect(invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F44D}', actor }))
      .toEqual({ success: true, reactions: [] })
    expect(mocks.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'm1', '\u{1F44D}', actor)
  })

  it('passes the app layer refusal through (palette / room validation lives there)', () => {
    mocks.reactToCollabMessage.mockReturnValue({ success: false, error: 'Unsupported reaction emoji' } as never)
    expect(invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F680}', actor: { type: 'user' } }))
      .toEqual({ success: false, error: 'Unsupported reaction emoji' })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.reactToCollabMessage.mockImplementation(() => { throw new Error('store exploded') })
    expect(invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F44D}', actor: { type: 'user' } }))
      .toEqual({ success: false, error: 'store exploded' })
  })

  /**
   * P2-20: the actor is pinned here, exactly like COLLAB_BOARD_ACT pins it. A
   * reaction is attribution — §3.5 B makes a silent member's emoji its ANSWER —
   * so a renderer able to name the actor could put words in a member's mouth.
   */
  it('pins the actor to the user, whatever the renderer claims', () => {
    invokeReact({
      roomSessionId: 'room-1',
      messageId: 'm1',
      emoji: '\u{1F44D}',
      actor: { type: 'agent', agentId: 'pm' },
    })
    expect(mocks.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'm1', '\u{1F44D}', { type: 'user' })
  })

  it('works with no actor field at all — the wire no longer needs to send one', () => {
    invokeReact({ roomSessionId: 'room-1', messageId: 'm1', emoji: '\u{1F44D}' })
    expect(mocks.reactToCollabMessage).toHaveBeenCalledWith('room-1', 'm1', '\u{1F44D}', { type: 'user' })
  })
})

/**
 * 托管私聊房的 get-or-create(agent-im-dm.md D1)。同一条纪律:校验(同事/在职/
 * 查得到)全在 app 层,handler 只负责把 null 翻译成一句用户读得懂的失败。
 */
describe('COLLAB_DM_ROOM_ENSURE', () => {
  it('returns the derived room id the app layer resolved', () => {
    expect(invokeEnsureDm({ agentId: 'fe' })).toEqual({ success: true, roomSessionId: 'agent-dm-fe' })
    expect(mocks.ensureUserDmRoom).toHaveBeenCalledWith('fe')
  })

  it('turns "no room for this agent" into an explicit refusal, not an empty success', () => {
    mocks.ensureUserDmRoom.mockReturnValue(null)
    expect(invokeEnsureDm({ agentId: 'gone' })).toEqual({
      success: false,
      error: '这个 agent 不能开私聊(已退休、不是同事,或者查无此人)',
    })
  })

  it('turns a thrown error into a failed response', () => {
    mocks.ensureUserDmRoom.mockImplementation(() => { throw new Error('store exploded') })
    expect(invokeEnsureDm({ agentId: 'fe' })).toEqual({ success: false, error: 'store exploded' })
  })
})

/**
 * 清空聊天记录。次序(先停后删再播)与"到底清哪几处"全在 app 层 —— handler
 * 只负责把房间 id 带过去,以及把抛出来的错翻译成一次线上失败。
 */
describe('COLLAB_ROOM_CLEAR_HISTORY', () => {
  it('carries the room id across and returns the app layer answer verbatim', async () => {
    expect(await invokeClearHistory({ roomSessionId: 'room-1' }))
      .toEqual({ success: true, clearedMessageCount: 3 })
    // includeMemberDms 缺席时显式落 false —— handler 归一化,不让 undefined 过河。
    expect(mocks.clearCollabRoomHistory).toHaveBeenCalledWith('room-1', { includeMemberDms: false })
  })

  it('includeMemberDms 只在显式为 true 时透传为 true', async () => {
    await invokeClearHistory({ roomSessionId: 'room-1', includeMemberDms: true })
    expect(mocks.clearCollabRoomHistory).toHaveBeenCalledWith('room-1', { includeMemberDms: true })
  })

  it('turns a thrown error into a failed response', async () => {
    mocks.clearCollabRoomHistory.mockImplementation(() => { throw new Error('store exploded') })
    expect(await invokeClearHistory({ roomSessionId: 'room-1' }))
      .toEqual({ success: false, error: 'store exploded' })
  })
})

/**
 * Agent 活动快照的冷启动补水(D8 观测体系 §3.1)。
 *
 * 同一条整体透传纪律 —— 这扇门只有一格(`agentIds`),而「缺席等于全要」是 app 层
 * 的语义,handler 一个字都不该替它做主。下面那条穷尽性钉的就是这件事:
 * shared 请求类型加一格而中转没跟上,编译当场红。
 */
describe('COLLAB_AGENT_ACTIVITY_GET (D8 O1)', () => {
  const ACTIVITY = {
    agentId: 'iris',
    seq: 3,
    at: 1_000,
    mind: { state: 'idle' as const },
    heldLeases: [],
    inbox: { depth: 0 },
    workers: [],
    deadLetterCount: 0,
  }

  it('把请求里那几位带过去,回一份快照数组', () => {
    mocks.getCollabAgentActivity.mockReturnValue([ACTIVITY])
    expect(invokeAgentActivity({ agentIds: ['iris'] }))
      .toEqual({ success: true, activities: [ACTIVITY] })
    expect(mocks.getCollabAgentActivity).toHaveBeenCalledWith(['iris'])
  })

  it('`agentIds` 缺席就是缺席 —— handler 不替 app 层决定它等于什么', () => {
    invokeAgentActivity({})
    expect(mocks.getCollabAgentActivity).toHaveBeenCalledWith(undefined)
    // 连整个请求都没有也一样(preload 在没有 agentIds 时投的就是 `{}`,
    // 而 daemon / 测试可能一个参数都不给)。
    invokeAgentActivity()
    expect(mocks.getCollabAgentActivity).toHaveBeenLastCalledWith(undefined)
  })

  it('空数组原样过河,不被兜回"全要"', () => {
    invokeAgentActivity({ agentIds: [] })
    expect(mocks.getCollabAgentActivity).toHaveBeenCalledWith([])
  })

  it('turns a thrown error into a failed response', () => {
    mocks.getCollabAgentActivity.mockImplementation(() => { throw new Error('runtime exploded') })
    expect(invokeAgentActivity({ agentIds: ['iris'] }))
      .toEqual({ success: false, error: 'runtime exploded' })
  })

  /** 同一条 keyof 穷尽纪律:请求类型的每一格都到得了 app 层。 */
  it('shared 请求的每个键都到得了 app 层(keyof 穷尽)', () => {
    const request: Record<keyof CollabAgentActivityGetRequest, unknown> = {
      agentIds: ['iris', 'bram'],
    }
    invokeAgentActivity(request)
    expect(mocks.getCollabAgentActivity).toHaveBeenCalledWith(['iris', 'bram'])
  })
})

/**
 * 人级停止(E5)—— 三级停止的第三级。
 *
 * 这扇门的三格全是**地址**(哪间房、哪张牌、界面看见它时是第几代),而
 * `expectedEpoch` 那道乐观并发前置属于 app 层。所以这里钉两件事:整体透传
 * (handler 一个字段都不该拆开或抢先判)、以及失败原因**不被翻译成 error**
 * —— `epoch-stale` / `not-found` / `not-a-room` 三条都是可操作的结果,把它们
 * 塞进 `error` 就等于让界面对着一句人话去做分支。
 */
describe('COLLAB_ROOM_REVOKE_LEASE (E5 人级停止)', () => {
  it('请求原样过河,结果原样回来', async () => {
    const result = await invokeRevokeLease({
      roomSessionId: 'room-1',
      leaseId: 'room-1#L2',
      expectedEpoch: 7,
    })
    expect(result).toEqual({ success: true, result: { ok: true, revoked: true } })
    expect(mocks.revokeCollabRoomLease).toHaveBeenCalledWith({
      roomSessionId: 'room-1',
      leaseId: 'room-1#L2',
      expectedEpoch: 7,
    })
  })

  it('可操作的失败原因原样回给界面,不被翻译成 error', async () => {
    mocks.revokeCollabRoomLease.mockResolvedValue({ ok: false, reason: 'epoch-stale', epoch: 9 })
    expect(await invokeRevokeLease({ roomSessionId: 'room-1', leaseId: 'L1', expectedEpoch: 7 }))
      .toEqual({ success: true, result: { ok: false, reason: 'epoch-stale', epoch: 9 } })
  })

  it('真异常才走 error(运行时炸了,不是一次可操作的拒绝)', async () => {
    mocks.revokeCollabRoomLease.mockRejectedValue(new Error('runtime exploded'))
    expect(await invokeRevokeLease({ roomSessionId: 'room-1', leaseId: 'L1', expectedEpoch: 7 }))
      .toEqual({ success: false, error: 'runtime exploded' })
  })

  /** 同一条 keyof 穷尽纪律:请求类型的每一格都到得了 app 层。 */
  it('shared 请求的每个键都到得了 app 层(keyof 穷尽)', async () => {
    const request: Record<keyof CollabRoomRevokeLeaseRequest, unknown> = {
      roomSessionId: 'room-1',
      leaseId: 'room-1#L4',
      expectedEpoch: 3,
    }
    await invokeRevokeLease(request)
    expect(mocks.revokeCollabRoomLease).toHaveBeenCalledWith(request)
  })
})
