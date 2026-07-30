/**
 * Worker lifecycle regressions — docs/design/multi-agent-collab-im.md §4 W9b.
 *
 * The 真机 incident this file guards: PM moved a blocked card back to todo and
 * NOTHING happened — no board event, no spawnWork, zero work sessions in the
 * dump. The "retry" degenerated into room theatre (a member whose only tool is
 * `board` moved its own card to done and wrote 「已验证文件存在且内容正确」
 * about a file that never existed).
 *
 * Tests drive the REAL reducer (applyCollabBoardAction) and feed its events to
 * the REAL handleBoardEvent through the board-store listener seam, so the
 * "which move re-executes" condition is covered end to end without a disk
 * board or a live engine.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCollabBoardAction,
  emptyCollabBoard,
  type CollabBoard,
  type CollabBoardAction,
  type CollabBoardActor,
  type CollabBoardEvent,
  type CollabTask,
} from '@onething/runtime/collab'

interface FakeSession {
  id: string
  kind?: string
  name?: string
  workingDirectory?: string
  permissionMode?: string
  modelPinned?: boolean
  room?: { pmAgentId?: string; frozen?: boolean }
  messages: {
    id?: string
    role: string
    content?: string
    agentId?: string
    source?: string
    timestamp?: number
    toolCalls?: {
      toolName: string
      status: string
      rejected?: boolean
      arguments?: unknown
      changes?: { filePath?: unknown } | null
    }[]
  }[]
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  board: { version: 1, tasks: [] } as CollabBoard,
  listener: null as null | ((roomSessionId: string, event: CollabBoardEvent) => void),
  emit: vi.fn(async () => {}),
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  abort: vi.fn(),
  createSession: vi.fn(),
  updateSessionModel: vi.fn(),
  updateSessionPermissionMode: vi.fn(),
  /** P1-4: the assignee's model binding, when a test gives it one. */
  agentModel: null as null | { providerId?: string; modelId?: string; thinking?: string },
}))

vi.mock('../../store.js', () => ({
  updateSessionWorkingDirectory: vi.fn(),
  getSession: (id: string) => mocks.sessions.get(id),
  getCurrentSessionId: () => 'room-1',
  setCurrentSessionId: vi.fn(),
  createSession: (id: string, name: string) => {
    mocks.createSession(id, name)
    mocks.sessions.set(id, { id, kind: 'work', name, messages: [] })
  },
  updateSessionCollab: vi.fn(),
  updateSessionAgent: vi.fn(),
  updateSessionPermissionMode: (...args: unknown[]) => mocks.updateSessionPermissionMode(...args),
  updateSessionModel: (...args: unknown[]) => mocks.updateSessionModel(...args),
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: mocks.emit,
    // W19: the worker hangs a typing observer on the work session for the
    // duration of the turn.
    onAny: (sessionId: string, handler: (envelope: unknown) => void) => {
      const entry = { sessionId, handler }
      mocks.anyListeners.push(entry)
      return () => {
        mocks.anyListeners = mocks.anyListeners.filter(candidate => candidate !== entry)
      }
    },
  }),
}))

vi.mock('../../engine/index.js', () => ({
  getStreamEngineSafe: () => ({ abort: mocks.abort }),
}))

vi.mock('../../agents/index.js', () => ({
  findAgent: (id: string) => ({
    id,
    name: id === 'fe' ? '小李' : id === 'pm' ? '阿明' : id,
    ...(mocks.agentModel ? { model: mocks.agentModel } : {}),
  }),
}))

vi.mock('../board-store.js', () => ({
  loadCollabBoard: () => mocks.board,
  getCollabTask: (_room: string, taskId: string) => mocks.board.tasks.find(task => task.id === taskId),
  onCollabBoardEvent: (listener: (roomSessionId: string, event: CollabBoardEvent) => void) => {
    mocks.listener = listener
    return () => { mocks.listener = null }
  },
  patchCollabTask: async (_room: string, taskId: string, patch: Partial<CollabTask>) => {
    const index = mocks.board.tasks.findIndex(task => task.id === taskId)
    if (index < 0) return undefined
    const task = { ...mocks.board.tasks[index], ...patch, rev: mocks.board.tasks[index].rev + 1 }
    mocks.board = { ...mocks.board, tasks: mocks.board.tasks.map((t, i) => (i === index ? task : t)) }
    return task
  },
}))

const worker = await import('../worker.js')

type TurnOutcome = 'complete' | 'error' | 'aborted' | 'timeout'

const host = {
  postSystemLine: vi.fn(),
  postTaskSystemLine: vi.fn(),
  enqueueRoomActivation: vi.fn(),
  waitForEngineBound: vi.fn(async () => true),
  waitForTurn: vi.fn((_sessionId: string): Promise<TurnOutcome> => Promise.resolve('complete')),
  roomChannel: () => 'ipc' as string | undefined,
  isRoomOverBudget: vi.fn(async () => false),
}

/** A turn we hold open until the test releases it (live-worker scenarios). */
function heldTurn(): { release: (outcome?: TurnOutcome) => void } {
  const holder: { resolve?: (outcome: TurnOutcome) => void } = {}
  host.waitForTurn.mockImplementation(() => new Promise<TurnOutcome>(resolve => {
    holder.resolve = resolve
  }))
  return { release: (outcome: TurnOutcome = 'complete') => holder.resolve?.(outcome) }
}

const ROOM = 'room-1'
const PM: CollabBoardActor = { type: 'agent', agentId: 'pm' }
const USER: CollabBoardActor = { type: 'user' }

let nextId = 0

/** Run the real reducer, keep the fake board, dispatch the real event. */
function act(action: CollabBoardAction, actor: CollabBoardActor = PM): CollabTask | undefined {
  const result = applyCollabBoardAction(mocks.board, action, actor, {
    now: Date.now(),
    createId: () => `task-${++nextId}`,
  })
  mocks.board = result.board
  if (result.event) mocks.listener?.(ROOM, result.event)
  return result.task
}

const FE: CollabBoardActor = { type: 'agent', agentId: 'fe' }

/**
 * 一张已经在跑的卡。
 *
 * collab-team-v2 §3.2 之后这是两个动作:指派只是把话带到,开工是被指派者
 * 自己的动作。绝大多数 worker 用例关心的是"活跑起来之后会怎样",所以夹具把
 * 两步一起做掉;指派本身只通知不开工这件事由它自己的用例守。
 */
function seedAssignedTask(): CollabTask {
  const created = act({ action: 'create', title: '给项目加 status.txt', assigneeAgentId: 'fe' })!
  return act({ action: 'start', taskId: created.id }, FE) ?? created
}

/** Let the spawn chain (async, promise-scheduled) settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function taskLines(): string[] {
  return host.postTaskSystemLine.mock.calls.map(call => String(call[1]))
}

beforeEach(() => {
  worker.shutdownCollabWorkers()
  vi.clearAllMocks()
  mocks.anyListeners = []
  mocks.agentModel = null
  mocks.sessions.clear()
  mocks.sessions.set(ROOM, {
    id: ROOM,
    kind: 'room',
    name: '产品群',
    // W17: deliverable paths are relativised against the room's project root.
    workingDirectory: '/repo',
    room: { pmAgentId: 'pm' },
    messages: [],
  } satisfies FakeSession)
  mocks.board = emptyCollabBoard()
  host.waitForTurn.mockImplementation((): Promise<TurnOutcome> => Promise.resolve('complete'))
  host.isRoomOverBudget.mockImplementation(async () => false)
  worker.initializeCollabWorkers(host)
})

describe('W9b.1 — 重派必须真的叫到人', () => {
  /**
   * W9b.1 的原始 bug 是「解阻重派什么也没发生」——没有事件、没有会话、纯粹是
   * 房间戏剧。collab-team-v2 §3.2 把终点从「立刻开一条会话」改成「把话带到并
   * 叫醒被指派的人」,但 bug 那一端没变:重派必须产生真实的后果。
   */
  it('notifies and activates the assignee when a blocked card is moved back to todo', async () => {
    const task = seedAssignedTask()
    await settle()
    expect(mocks.createSession).toHaveBeenCalledTimes(1) // 夹具里的 start

    act({ action: 'block', taskId: task.id, reason: '缺 write 工具' })
    await settle()
    mocks.createSession.mockClear()
    host.enqueueRoomActivation.mockClear()
    host.postTaskSystemLine.mockClear()

    act({ action: 'move', taskId: task.id, status: 'todo' })
    await settle()

    // 指派是通知,不是发令枪:没有会话凭空出现。
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(host.enqueueRoomActivation).toHaveBeenCalledWith(ROOM, 'fe', 'task-event', expect.any(String))
    expect(taskLines().some(line => line.includes('已指派给') && line.includes('start'))).toBe(true)

    // 被叫到的人自己开工 —— 这才是活重新跑起来的那一刻。这张卡此前跑过,
    // 所以走的是续做:重驱原来那条工作会话,不新建(§5.3)。
    act({ action: 'start', taskId: task.id }, FE)
    await settle()
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'command:send-message' }),
    )
    expect(taskLines().some(line => line.includes('续做'))).toBe(true)
  })

  it('re-notifies on a reopened done card and on an unblocking assign', async () => {
    const task = seedAssignedTask()
    await settle()

    act({ action: 'move', taskId: task.id, status: 'done' }, USER)
    await settle()
    host.enqueueRoomActivation.mockClear()

    act({ action: 'move', taskId: task.id, status: 'todo' }, USER)
    await settle()
    expect(host.enqueueRoomActivation).toHaveBeenCalledWith(ROOM, 'fe', 'task-event', expect.any(String))

    act({ action: 'block', taskId: task.id, reason: 'x' })
    await settle()
    host.enqueueRoomActivation.mockClear()

    act({ action: 'assign', taskId: task.id, assigneeAgentId: 'fe' }, USER)
    await settle()
    expect(host.enqueueRoomActivation).toHaveBeenCalledWith(ROOM, 'fe', 'task-event', expect.any(String))
  })

  it('never spawns twice for a card already executing (idempotence)', async () => {
    const task = seedAssignedTask()
    // Hold the first work session open for the whole test.
    const turn = heldTurn()
    await settle()
    expect(mocks.createSession).toHaveBeenCalledTimes(1)
    mocks.createSession.mockClear()

    // Same assignee, card still doing → no second worker, no abort.
    act({ action: 'assign', taskId: task.id, assigneeAgentId: 'fe' }, USER)
    await settle()
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.abort).not.toHaveBeenCalled()

    turn.release()
    await settle()
  })

  it('aborts the live worker first when the card is pulled back to todo', async () => {
    const task = seedAssignedTask()
    const turn = heldTurn()
    await settle()
    mocks.createSession.mockClear()

    act({ action: 'move', taskId: task.id, status: 'todo' }, USER)
    await settle()
    // D6 abort-first 仍然成立:doing 卡被挪走,在跑的那条流必须先停。
    expect(mocks.abort).toHaveBeenCalledTimes(1)
    expect(mocks.createSession).not.toHaveBeenCalled()

    host.waitForTurn.mockImplementation(() => Promise.resolve('complete'))
    turn.release('aborted')
    await settle()
    // §3.2 之后这里不再自动重开会话——卡回到待办,由被指派的人 start 续做。
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(host.enqueueRoomActivation).toHaveBeenCalledWith(ROOM, 'fe', 'task-event', expect.any(String))
  })

  it('does not re-dispatch an unassigned card', async () => {
    const task = act({ action: 'create', title: '想法' }, USER)!
    act({ action: 'move', taskId: task.id, status: 'todo' }, USER)
    await settle()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})

describe('W9b.2 — per-task halted 计数', () => {
  it('activates the PM on the first halt, goes quiet from the second', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      act({ action: 'block', taskId: task.id, reason: '缺 write 工具' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    expect(host.enqueueRoomActivation).toHaveBeenCalledWith(ROOM, 'pm', 'task-event', expect.any(String))
    expect(taskLines().some(line => line.includes('受阻') && line.includes('请负责人决定下一步'))).toBe(true)

    host.enqueueRoomActivation.mockClear()
    host.postTaskSystemLine.mockClear()

    // 解阻重派 → 被指派者开工 → 再受阻 = 第 2 次
    act({ action: 'move', taskId: task.id, status: 'todo' }, USER)
    await settle()
    host.enqueueRoomActivation.mockClear()
    act({ action: 'start', taskId: task.id }, FE)
    await settle()

    expect(host.enqueueRoomActivation).not.toHaveBeenCalled()
    const capLine = taskLines().find(line => line.includes('已停止自动处置'))
    expect(capLine).toBeDefined()
    expect(capLine).toContain('第 2 次受阻')
    expect(capLine).toContain('等用户决定下一步')
  })

  it('refuses agent-driven re-dispatch past the cap but always obeys the user', async () => {
    const task = seedAssignedTask()
    await settle()
    act({ action: 'block', taskId: task.id, reason: 'a' })
    act({ action: 'move', taskId: task.id, status: 'todo' })
    act({ action: 'move', taskId: task.id, status: 'blocked', reason: 'b' })
    await settle()
    expect(mocks.board.tasks[0].haltedCount).toBe(2)
    mocks.createSession.mockClear()
    host.postTaskSystemLine.mockClear()
    host.enqueueRoomActivation.mockClear()

    // PM tries the loop again → refused, and said out loud (no silent death path).
    act({ action: 'move', taskId: task.id, status: 'todo' }, PM)
    await settle()
    expect(host.enqueueRoomActivation).not.toHaveBeenCalled()
    expect(taskLines().some(line => line.includes('自动重执行已停止') && line.includes('没有派出任何执行'))).toBe(true)

    // The user pushing the same card always gets through the cap.
    host.postTaskSystemLine.mockClear()
    act({ action: 'move', taskId: task.id, status: 'blocked', reason: 'c' }, USER)
    act({ action: 'move', taskId: task.id, status: 'todo' }, USER)
    await settle()
    expect(host.enqueueRoomActivation).toHaveBeenCalledWith(ROOM, 'fe', 'task-event', expect.any(String))
  })

  it('parks a restart-stranded card in todo, not blocked (collab-team-v2 §5.3)', async () => {
    const task = seedAssignedTask()
    const turn = heldTurn()
    await settle()
    turn.release()
    await settle()
    // Card is doing with no live worker — exactly the post-restart shape.
    expect(mocks.board.tasks[0].status).toBe('doing')

    worker.reconcileRoomBoard(ROOM)
    await settle()
    // blocked 的语义是「需要人裁决」,断电不是决定。todo + 留 assignee 才是
    // 可续做态,而 haltedCount 仍然不动 —— 重启几次不该烧光自动处置预算。
    expect(mocks.board.tasks[0].status).toBe('todo')
    expect(mocks.board.tasks[0].assigneeAgentId).toBe(task.assigneeAgentId)
    expect(mocks.board.tasks[0].haltedCount ?? 0).toBe(0)
    expect(taskLines().some(line => line.includes('因重启中断') && line.includes('start'))).toBe(true)
  })
})

describe('W9b.3 — 受阻原因落卡', () => {
  it('keeps the reason the model gave and puts it in the halted line', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      act({ action: 'block', taskId: task.id, reason: '我没有 write 工具,建不了文件' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    expect(mocks.board.tasks[0].blockReason).toBe('我没有 write 工具,建不了文件')
    const halted = taskLines().find(line => line.includes('受阻'))
    expect(halted).toContain('原因: 我没有 write 工具,建不了文件')
    expect(halted).not.toContain('原因见看板任务卡')
  })

  it('falls back to the work session tail when block carried no reason', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (sessionId: string): Promise<TurnOutcome> => {
      const session = mocks.sessions.get(sessionId) as FakeSession
      session.messages.push({ role: 'assistant', content: '  我这个会话里\n没有可用的写文件工具  ' })
      act({ action: 'block', taskId: task.id }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    expect(mocks.board.tasks[0].blockReason).toBe('我这个会话里 没有可用的写文件工具')
    expect(taskLines().find(line => line.includes('受阻'))).toContain('原因: 我这个会话里 没有可用的写文件工具')
  })

  it('falls back to the turn outcome when there is no text either', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      act({ action: 'block', taskId: task.id }, { type: 'agent', agentId: 'fe' })
      return 'timeout'
    })
    await settle()
    expect(mocks.board.tasks[0].blockReason).toBe('执行超时')
  })
})

describe('W13.3 — usageSource on the work briefing', () => {
  it('labels the work turn as collab-work spend', async () => {
    seedAssignedTask()
    await settle()
    const events = mocks.emit.mock.calls.map(call => (call as unknown as unknown[])[1] as {
      type?: string
      usageSource?: string
    })
    const briefing = events.find(event => event?.type === 'command:send-message')
    expect(briefing?.usageSource).toBe('collab-work')
  })
})

describe('W14b — 交付自主化(harvest 不再代笔)', () => {
  /** The worker speaking for itself: a `say` message in the ROOM transcript. */
  function workerSays(content: string): string {
    const room = mocks.sessions.get(ROOM) as FakeSession
    const id = `say-${room.messages.length + 1}`
    room.messages.push({
      id,
      role: 'assistant',
      agentId: 'fe',
      content,
      source: 'collab-say',
      timestamp: Date.now(),
    })
    return id
  }

  it('stays quiet on delivery when the worker already said it itself', async () => {
    const task = seedAssignedTask()
    let sayId = ''
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      sayId = workerSays('status.txt 建好了,@阿明 看一下')
      act({ action: 'complete', taskId: task.id, summary: '建好了' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    // No ghost-written 「【交付】…」 line under the worker's name, and no
    // silent-delivery fallback either — the worker's own words are the report.
    expect(taskLines().some(line => line.includes('没有在群里说明'))).toBe(false)
    // The report points at what the worker ACTUALLY said, so the board and the
    // room reference one message.
    expect(mocks.board.tasks[0].report?.messageId).toBe(sayId)
    // The evidence receipt is untouched — it was never the agent's to write.
    expect(taskLines().some(line => line.includes('交付进入评审'))).toBe(true)
  })

  it('falls back to a SYSTEM line (not an impersonation) when it said nothing', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      act({ action: 'complete', taskId: task.id, summary: '建好了 status.txt' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    const fallback = taskLines().find(line => line.includes('没有在群里说明'))
    expect(fallback).toContain('已标记交付')
    expect(fallback).toContain('建好了 status.txt') // the report survives
    // Nothing was written under the worker's name: the only speaker is 系统.
    expect(mocks.board.tasks[0].report?.messageId).toBeUndefined()
  })

  it('applies the same rule to the progress path', async () => {
    seedAssignedTask()
    await settle() // turn ended without a board complete

    expect(taskLines().some(line => line.includes('本轮结束') && line.includes('没有在群里说明')))
      .toBe(true)
  })

  it('posts no progress line when the worker spoke during the run', async () => {
    seedAssignedTask()
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      workerSays('先说一声:依赖装完了,继续跑')
      return 'complete'
    })
    await settle()

    expect(taskLines().some(line => line.includes('没有在群里说明'))).toBe(false)
  })

  it('never counts an older say from a previous run as this run\'s delivery', async () => {
    const task = seedAssignedTask()
    workerSays('这是上一轮说的话')
    // The stale say sits BEFORE this run starts; only what lands after the
    // briefing counts, or a chatty worker would silence every later harvest.
    await new Promise(resolve => setTimeout(resolve, 2))
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      act({ action: 'complete', taskId: task.id, summary: '建好了' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    // §3.2:挪回 todo 只是通知,真正的第二轮由被指派者 start 开出来。
    act({ action: 'move', taskId: task.id, status: 'todo' })
    act({ action: 'start', taskId: task.id }, FE)
    await settle()

    expect(taskLines().some(line => line.includes('没有在群里说明'))).toBe(true)
  })

  it('leaves the halted path alone — it was already a system line', async () => {
    const task = seedAssignedTask()
    await settle()
    host.postTaskSystemLine.mockClear()
    host.waitForTurn.mockImplementation(async (): Promise<TurnOutcome> => {
      act({ action: 'block', taskId: task.id, reason: '缺 write 工具' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    act({ action: 'move', taskId: task.id, status: 'todo' })
    act({ action: 'start', taskId: task.id }, FE)
    await settle()

    expect(taskLines().some(line => line.includes('受阻'))).toBe(true)
    expect(taskLines().some(line => line.includes('没有在群里说明'))).toBe(false)
  })
})

describe('W9b.4 — done 带执行证据', () => {
  it('counts real tool calls and stamps them on the delivery', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (sessionId: string): Promise<TurnOutcome> => {
      const session = mocks.sessions.get(sessionId) as FakeSession
      session.messages.push({
        role: 'assistant',
        toolCalls: [
          { toolName: 'read', status: 'completed' },
          { toolName: 'read', status: 'completed' },
          { toolName: 'write', status: 'completed' },
          { toolName: 'write', status: 'failed' },        // did not write
          { toolName: 'bash', status: 'completed', rejected: true }, // denied
          { toolName: 'board', status: 'completed' },     // talking, not doing
        ],
      })
      act({ action: 'complete', taskId: task.id, summary: '建好了 status.txt' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    expect(mocks.board.tasks[0].report?.evidence).toEqual({ toolCounts: { read: 2, write: 1 } })
    const delivered = taskLines().find(line => line.includes('交付进入评审'))
    expect(delivered).toContain('执行记录: read×2, write×1')
    expect(delivered).not.toContain('board')

    // Closing the card restates the machine-counted receipt.
    host.postTaskSystemLine.mockClear()
    act({ action: 'move', taskId: task.id, status: 'done' }, USER)
    await settle()
    expect(taskLines().find(line => line.includes('已标记完成'))).toContain('执行记录: read×2, write×1')
  })

  it('marks the room-theatre path 无执行记录', async () => {
    // The incident exactly: a room member whose only tool is `board` completes
    // its own card from the room turn — no work session ever ran.
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation((): Promise<TurnOutcome> => Promise.resolve('complete'))
    await settle()
    // Drop the work sessions so nothing backs the claim.
    mocks.board = {
      ...mocks.board,
      tasks: mocks.board.tasks.map(t => ({ ...t, workSessionIds: [], status: 'todo' as const })),
    }
    host.postTaskSystemLine.mockClear()

    act({ action: 'complete', taskId: task.id, summary: '已验证文件存在且内容正确' }, { type: 'agent', agentId: 'fe' })
    await settle()
    expect(taskLines().find(line => line.includes('交付进入评审'))).toContain('无执行记录')

    host.postTaskSystemLine.mockClear()
    act({ action: 'move', taskId: task.id, status: 'done' }, PM)
    await settle()
    const done = taskLines().find(line => line.includes('已标记完成'))
    expect(done).toContain('无执行记录')
    expect(done).toContain('未经执行验证')
  })
})

/**
 * W17 交付物 — same walk, same 口径 as the tool counts above: what a card
 * claims it produced is what its work session's write/edit calls targeted.
 * The extractor is exercised directly (fault-tolerance matrix) and through the
 * harvest (persistence).
 */
describe('W17 — 交付物收集', () => {
  const { collectDeliverableFiles } = worker

  it('takes write/edit targets and ignores every other tool', () => {
    expect(collectDeliverableFiles([
      { toolName: 'write', arguments: { path: 'a.txt' } },
      { toolName: 'edit', arguments: { file_path: 'b.txt' } },
      { toolName: 'read', arguments: { path: 'c.txt' } },
      { toolName: 'bash', arguments: { path: 'd.txt' } },
      { toolName: 'board', arguments: { path: 'e.txt' } },
    ])).toEqual(['a.txt', 'b.txt'])
  })

  it('accepts every argument spelling and falls back to toolId', () => {
    expect(collectDeliverableFiles([
      { toolName: 'write', arguments: { file_path: 'snake.txt' } },
      { toolName: 'write', arguments: { path: 'plain.txt' } },
      { toolName: 'write', arguments: { filePath: 'camel.txt' } },
      { toolId: 'edit', arguments: { path: 'by-id.txt' } },
    ])).toEqual(['snake.txt', 'plain.txt', 'camel.txt', 'by-id.txt'])
  })

  it('prefers the engine-resolved changes.filePath over the raw argument', () => {
    expect(collectDeliverableFiles(
      [{ toolName: 'write', arguments: { path: '../outside/a.txt' }, changes: { filePath: '/repo/src/a.ts' } }],
      '/repo',
    )).toEqual(['src/a.ts'])
  })

  it('survives junk arguments instead of listing a file that is not one', () => {
    expect(collectDeliverableFiles([
      { toolName: 'write' },
      { toolName: 'write', arguments: undefined },
      { toolName: 'write', arguments: null },
      { toolName: 'write', arguments: 'oops' },
      { toolName: 'write', arguments: ['a.txt'] },
      { toolName: 'write', arguments: { path: 42 } },
      { toolName: 'write', arguments: { path: '' } },
      { toolName: 'write', arguments: { path: '   ' } },
      { toolName: 'write', arguments: { content: 'no path at all' } },
      { toolName: 'write', arguments: { path: '  spaced.txt  ' }, changes: null },
      { toolName: '', arguments: { path: 'nameless.txt' } },
    ])).toEqual(['spaced.txt'])
  })

  it('de-duplicates, keeping the order the worker produced them in', () => {
    expect(collectDeliverableFiles([
      { toolName: 'write', arguments: { path: 'a.txt' } },
      { toolName: 'edit', arguments: { path: 'b.txt' } },
      { toolName: 'edit', arguments: { path: 'a.txt' } },
      { toolName: 'edit', arguments: { path: 'b.txt' } },
    ])).toEqual(['a.txt', 'b.txt'])
  })

  it('relativises inside the room workdir and leaves everything else absolute', () => {
    expect(collectDeliverableFiles([
      { toolName: 'write', arguments: { path: '/repo/src/a.ts' } },
      { toolName: 'write', arguments: { path: '/etc/hosts' } },
      { toolName: 'write', arguments: { path: 'already/relative.ts' } },
      { toolName: 'write', arguments: { path: '/repo' } },
    ], '/repo')).toEqual(['src/a.ts', '/etc/hosts', 'already/relative.ts', '/repo'])
  })

  it('leaves paths untouched when the room has no workdir', () => {
    expect(collectDeliverableFiles([{ toolName: 'write', arguments: { path: '/repo/src/a.ts' } }]))
      .toEqual(['/repo/src/a.ts'])
  })

  it('caps the list so one card cannot become a megabyte', () => {
    const calls = Array.from({ length: 260 }, (_, index) => ({
      toolName: 'write',
      arguments: { path: `file-${index}.txt` },
    }))
    const files = collectDeliverableFiles(calls)
    expect(files).toHaveLength(200)
    expect(files[0]).toBe('file-0.txt')
  })

  it('persists the files on the card, at the same 口径 as the tool counts', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (sessionId: string): Promise<TurnOutcome> => {
      const session = mocks.sessions.get(sessionId) as FakeSession
      session.messages.push({
        role: 'assistant',
        toolCalls: [
          { toolName: 'write', status: 'completed', arguments: { path: '/repo/status.txt' } },
          { toolName: 'edit', status: 'completed', arguments: { path: 'src/app.ts' } },
          // Rejected / failed writes wrote nothing — they must not appear.
          { toolName: 'write', status: 'completed', rejected: true, arguments: { path: 'denied.txt' } },
          { toolName: 'write', status: 'failed', arguments: { path: 'never.txt' } },
          { toolName: 'read', status: 'completed', arguments: { path: 'src/app.ts' } },
        ],
      })
      act({ action: 'complete', taskId: task.id, summary: '建好了 status.txt' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    expect(mocks.board.tasks[0].report?.evidence).toEqual({
      toolCounts: { write: 1, edit: 1, read: 1 },
      files: ['status.txt', 'src/app.ts'],
    })
  })

  it('omits the field entirely when nothing was written (pre-W17 cards stay valid)', async () => {
    const task = seedAssignedTask()
    host.waitForTurn.mockImplementation(async (sessionId: string): Promise<TurnOutcome> => {
      const session = mocks.sessions.get(sessionId) as FakeSession
      session.messages.push({
        role: 'assistant',
        toolCalls: [{ toolName: 'read', status: 'completed', arguments: { path: 'src/app.ts' } }],
      })
      act({ action: 'complete', taskId: task.id, summary: '只是看了看' }, { type: 'agent', agentId: 'fe' })
      return 'complete'
    })
    await settle()

    expect(mocks.board.tasks[0].report?.evidence).toEqual({ toolCounts: { read: 1 } })
    expect(mocks.board.tasks[0].report?.evidence?.files).toBeUndefined()
  })
})

/**
 * W19 真实 typing — the work-session half.
 *
 * A worker speaks into the room with `say` (mid-task or as its delivery), and
 * §4 W19 wants that to light the room's typing line for exactly as long as the
 * words are streaming. The observer is hung on the WORK session for the turn
 * and torn down with it.
 */
describe('W19 — 工作会话的真实 typing', () => {
  function deliver(sessionId: string, event: Record<string, unknown>): void {
    for (const entry of [...mocks.anyListeners]) {
      if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
    }
  }

  function typingLog(): Array<{ sessionId: unknown; agentId: unknown; typing: unknown }> {
    return mocks.emit.mock.calls
      .map(call => call as unknown as [string, Record<string, unknown>])
      .filter(([, event]) => event.type === 'collab:typing')
      .map(([sessionId, event]) => ({ sessionId, agentId: event.agentId, typing: event.typing }))
  }

  function workSessionId(): string {
    return String(mocks.createSession.mock.calls[0]?.[0])
  }

  it('lights the room while a mid-task say streams, then detaches with the turn', async () => {
    const turn = heldTurn()
    seedAssignedTask()
    await settle()

    // Watching the work session — not the room, where nothing streams.
    expect(mocks.anyListeners.map(entry => entry.sessionId)).toEqual([workSessionId()])
    // The briefing drive itself lit nothing: reading a task is not typing.
    expect(typingLog()).toEqual([])

    deliver(workSessionId(), { type: 'tool:input-start', toolCallId: 'c1', toolName: 'say' })
    deliver(workSessionId(), { type: 'tool:input-end', toolCallId: 'c1', toolCall: { toolId: 'say' } })
    expect(typingLog()).toEqual([
      { sessionId: ROOM, agentId: 'fe', typing: true },
      { sessionId: ROOM, agentId: 'fe', typing: false },
    ])

    turn.release()
    await settle()
    expect(mocks.anyListeners).toHaveLength(0)
  })

  it('stays quiet for the worker’s own tools', async () => {
    const turn = heldTurn()
    seedAssignedTask()
    await settle()

    deliver(workSessionId(), { type: 'tool:input-start', toolCallId: 'c1', toolName: 'write' })
    deliver(workSessionId(), { type: 'tool:input-end', toolCallId: 'c1', toolCall: { toolId: 'write' } })
    deliver(workSessionId(), { type: 'tool:input-start', toolCallId: 'c2', toolName: 'board' })
    deliver(workSessionId(), { type: 'tool:input-end', toolCallId: 'c2', toolCall: { toolId: 'board' } })
    expect(typingLog()).toEqual([])

    turn.release()
    await settle()
    expect(typingLog()).toEqual([])
  })

  it('forces the light out when the turn dies mid-utterance', async () => {
    const turn = heldTurn()
    seedAssignedTask()
    await settle()

    deliver(workSessionId(), { type: 'tool:input-start', toolCallId: 'c1', toolName: 'say' })
    expect(typingLog().map(entry => entry.typing)).toEqual([true])

    turn.release('timeout')
    await settle()
    expect(typingLog().map(entry => entry.typing)).toEqual([true, false])
    expect(mocks.anyListeners).toHaveLength(0)
  })
})

/**
 * R0 — the 总闸's two ends on the work path
 * (docs/design/collab-repair-roadmap-2026-07-28.md).
 *
 * Freezing aborts every live worker at once. What it must NOT do is narrate
 * each of those aborts as an individual failure under its own room-wide notice,
 * and what it must not LEAVE is a card that nobody will ever pick up again.
 */
describe('R0 — 冻结与解冻的工作卡处置', () => {
  function setFrozen(frozen: boolean): void {
    const session = mocks.sessions.get(ROOM) as FakeSession
    session.room = { ...session.room, frozen }
  }

  it('does not narrate each aborted worker under the room-wide freeze notice', async () => {
    const turn = heldTurn()
    const task = seedAssignedTask()
    await settle()

    setFrozen(true)
    worker.freezeRoomWork(ROOM)
    turn.release('aborted')
    await settle()

    expect(taskLines().some(line => line.includes('已回到待办'))).toBe(false)
    // The card keeps its column: the work was stopped, not abandoned.
    expect(mocks.board.tasks.find(entry => entry.id === task.id)?.status).toBe('doing')
  })

  it('still reports an interruption that had nothing to do with the freeze', async () => {
    const turn = heldTurn()
    const task = seedAssignedTask()
    await settle()

    turn.release('timeout')
    await settle()

    expect(taskLines().some(line => line.includes('执行超时') && line.includes('已回到待办'))).toBe(true)
    // §5.4: 超时收敛到 todo 并保留 assignee,续做时不必重新指派。
    const settled = mocks.board.tasks.find(entry => entry.id === task.id)
    expect(settled?.status).toBe('todo')
    expect(settled?.assigneeAgentId).toBe(task.assigneeAgentId)
  })

  it('picks the stranded doing card back up on unfreeze', async () => {
    const turn = heldTurn()
    seedAssignedTask()
    await settle()

    setFrozen(true)
    worker.freezeRoomWork(ROOM)
    turn.release('aborted')
    await settle()
    mocks.createSession.mockClear()

    setFrozen(false)
    worker.resumeRoomWork(ROOM)
    await settle()

    // Before R0 this swept 'todo' only, so the card sat in 'doing' until the
    // next app restart noticed it — reconcileRoomBoard's job, one restart late.
    // collab-team-v2 §5.3 续做模式:解冻重驱的是原来那条工作会话,不新建 ——
    // 现场就在它自己的转录里。
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'command:send-message' }),
    )
  })

  it('leaves a card that already has a live worker alone', async () => {
    heldTurn()
    seedAssignedTask()
    await settle()
    mocks.createSession.mockClear()

    worker.resumeRoomWork(ROOM)
    await settle()

    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})

describe('卡级停止(collab-team-v2 §5.1 入口②)', () => {
  it('停掉在跑的执行,把卡放回可续做的待办,只说一遍', async () => {
    const turn = heldTurn()
    const task = seedAssignedTask()
    await settle()
    expect(mocks.board.tasks[0].status).toBe('doing')

    const stopped = await worker.stopCollabTaskWork(ROOM, task.id)
    // abort 之后那条流会以 aborted 收尾,harvest 随之跑一遍。
    turn.release('aborted')
    await settle()

    expect(stopped).toBe(true)
    expect(mocks.abort).toHaveBeenCalled()
    const settledTask = mocks.board.tasks.find(entry => entry.id === task.id)
    expect(settledTask?.status).toBe('todo')
    // 停止不是受阻:不烧自动处置预算,assignee 留着好续做。
    expect(settledTask?.haltedCount ?? 0).toBe(0)
    expect(settledTask?.assigneeAgentId).toBe('fe')
    // 停止的说明由停止那条路径贴,harvest 的中断分支必须闭嘴 —— 否则同一次
    // 停止在群里说两遍。
    expect(taskLines().filter(line => line.includes('已回到待办'))).toHaveLength(1)
    expect(taskLines().some(line => line.includes('执行已被停止'))).toBe(true)
  })

  it('没有在跑的执行时如实返回 false', async () => {
    const task = seedAssignedTask()
    await settle()
    expect(await worker.stopCollabTaskWork(ROOM, task.id)).toBe(false)
  })
})

describe('预算去静默(collab-team-v2 §5.2)', () => {
  it('被预算拦下的卡在群里留一行,而不是原地不动', async () => {
    host.isRoomOverBudget.mockImplementation(async () => true)
    const task = seedAssignedTask()
    await settle()

    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(taskLines().some(line => line.includes('预算已用完'))).toBe(true)

    // 同一天同一张卡不再重复刷屏。
    act({ action: 'assign', taskId: task.id, assigneeAgentId: 'fe2' })
    await settle()
    expect(taskLines().filter(line => line.includes('预算已用完'))).toHaveLength(1)
  })
})

describe('P1-4 — 工作会话的设置不被系统抄写压死', () => {
  /** 走一遍「跑过一轮 → 放回待办 → 被指派者再 start」= 续做(§5.3)。 */
  async function resume(taskId: string): Promise<void> {
    act({ action: 'move', taskId, status: 'todo' }, USER)
    await settle()
    act({ action: 'start', taskId }, FE)
    await settle()
  }

  function briefings(): Array<Record<string, unknown>> {
    return mocks.emit.mock.calls
      .map(call => (call as unknown as unknown[])[1] as Record<string, unknown>)
      .filter(event => event?.type === 'command:send-message')
  }

  function workSessionId(): string {
    return mocks.board.tasks[0].workSessionIds[0]
  }

  it('抄房间权限模式只发生在创建那一次,续做保留会话现值', async () => {
    (mocks.sessions.get(ROOM) as FakeSession).permissionMode = 'dangerously-allow-all'
    const task = seedAssignedTask()
    await settle()

    // 首建:继承房间(headless 自测不该卡在没人答的审批上)。
    expect(mocks.updateSessionPermissionMode).toHaveBeenCalledWith(
      workSessionId(),
      'dangerously-allow-all',
    )

    mocks.updateSessionPermissionMode.mockClear()
    await resume(task.id)

    expect(taskLines().some(line => line.includes('续做'))).toBe(true)
    // 续做不重抄:用户手改过这条会话的话,下一轮不该被房间值盖回去。
    expect(mocks.updateSessionPermissionMode).not.toHaveBeenCalled()
  })

  it('未 pin 的工作会话照抄档案模型,并把 binding 带进 briefing', async () => {
    mocks.agentModel = { providerId: 'claude', modelId: 'claude-sonnet-4', thinking: 'medium' }
    seedAssignedTask()
    await settle()

    expect(mocks.updateSessionModel).toHaveBeenCalledWith(
      workSessionId(),
      'claude',
      'claude-sonnet-4',
      { pinned: false },
    )
    expect(briefings()[0]).toMatchObject({
      providerId: 'claude',
      model: 'claude-sonnet-4',
      thinking: true,
      thinkingEffort: 'medium',
    })
  })

  it('用户手选过模型的工作会话:不抄写、不下发 override', async () => {
    mocks.agentModel = { providerId: 'claude', modelId: 'claude-sonnet-4', thinking: 'medium' }
    const task = seedAssignedTask()
    await settle()

    // 用户在这条工作会话里手选了别的模型。
    ;(mocks.sessions.get(workSessionId()) as FakeSession).modelPinned = true
    mocks.updateSessionModel.mockClear()
    mocks.emit.mockClear()
    await resume(task.id)

    // 系统抄写标的是 pinned:false —— 再抄一遍就等于把用户的选择擦掉。
    expect(mocks.updateSessionModel).not.toHaveBeenCalled()
    const briefing = briefings()[0]
    // override 也不能下发:命令带了 providerId,withAgentModelBinding 就短路,
    // 会话级解析(它才认 modelPinned)再没有机会跑。
    expect(briefing.providerId).toBeUndefined()
    expect(briefing.model).toBeUndefined()
    expect(briefing.thinking).toBeUndefined()
    expect(briefing.thinkingEffort).toBeUndefined()
  })
})
