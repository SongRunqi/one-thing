/**
 * 左栏「进行中」的判定(C1,docs/design/im-workbench-layout.md §3 W1 / §4 W-Q1)。
 *
 * 三件事各钉一遍:哪些卡进第一区(W-Q1)、状态标只有三档、跨房聚合的排序与
 * 补齐候选。判定全在纯函数里,所以这里喂的是假数据而不是 store。
 */
import { describe, expect, it } from 'vitest'
import type { CollabBoard, CollabTask } from '@shared/ipc'
import {
  ACTIVE_WORK_HYDRATION_LIMIT,
  activeWorkHydrationTargets,
  collectActiveWork,
  groupActiveWorkCards,
  hasActiveWorkSignal,
  isActiveWorkStatus,
  resolveActiveWorkRowMeta,
  resolveActiveWorkStage,
  resolveActiveWorkTag,
  type ActiveWorkCardModel,
  type ActiveWorkTone,
} from '../active-work'

function task(patch: Partial<CollabTask> & Pick<CollabTask, 'id' | 'status'>): CollabTask {
  return {
    rev: 1,
    title: '',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  } as CollabTask
}

function board(tasks: CollabTask[]): CollabBoard {
  return { version: 1, tasks }
}

const IDENTITY = (agentId: string) => ({ name: agentId ? `名-${agentId}` : '未指派' })

describe('W-Q1:哪些卡算「在跑」', () => {
  it('只收 doing / review / blocked —— todo 是待办不是在做', () => {
    const statuses = (list: string[]) => list.map(s => s as CollabTask['status'])
    expect(statuses(['doing', 'review', 'blocked']).every(isActiveWorkStatus)).toBe(true)
    expect(statuses(['backlog', 'todo', 'done']).some(isActiveWorkStatus)).toBe(false)
  })

  it('聚合时 todo/backlog/done 一张都不进来', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([
          task({ id: 'a', status: 'doing' }),
          task({ id: 'b', status: 'todo' }),
          task({ id: 'c', status: 'done' }),
          task({ id: 'd', status: 'review' }),
          task({ id: 'e', status: 'blocked' }),
        ]),
      },
      identityOf: IDENTITY,
    })
    expect(cards.map(card => card.taskId).sort()).toEqual(['a', 'd', 'e'])
  })
})

describe('状态标只有三档', () => {
  it('doing → 执行中(绿)', () => {
    expect(resolveActiveWorkTag({ status: 'doing' })).toMatchObject({ tone: 'running', label: '执行中' })
  })

  it('review → 已交付(墨)', () => {
    expect(resolveActiveWorkTag({ status: 'review' })).toMatchObject({ tone: 'delivered', label: '已交付' })
  })

  it('blocked 不自成一档:归入待审批,blockReason 当补语挂出去', () => {
    const tag = resolveActiveWorkTag({ status: 'blocked', blockReason: '等 API key' })
    expect(tag.tone).toBe('awaiting')
    expect(tag.label).toBe('待审批')
    expect(tag.hint).toBe('等 API key')
  })

  it('blockReason 是空白就不编一句补语出来', () => {
    expect(resolveActiveWorkTag({ status: 'blocked', blockReason: '  ' }).hint).toBeUndefined()
  })

  it('doing 卡卡在权限上时改报待审批;拿不到这个信号就还是执行中', () => {
    expect(resolveActiveWorkTag({ status: 'doing' }, { awaitingPermission: true }).tone).toBe('awaiting')
    expect(resolveActiveWorkTag({ status: 'doing' }, { awaitingPermission: false }).tone).toBe('running')
  })
})

describe('进度是阶段刻度不是百分比', () => {
  it('领了活 → 开过工作台 → 有执行痕迹 → 交付,四档单调递增', () => {
    expect(resolveActiveWorkStage(task({ id: 'a', status: 'doing' }))).toBe('assigned')
    expect(resolveActiveWorkStage(task({ id: 'a', status: 'doing', workSessionIds: ['w1'] }))).toBe('started')
    expect(resolveActiveWorkStage(task({
      id: 'a',
      status: 'doing',
      workSessionIds: ['w1'],
      report: { summary: '', evidence: { toolCounts: { edit: 3 } } },
    }))).toBe('producing')
    expect(resolveActiveWorkStage(task({ id: 'a', status: 'review' }))).toBe('delivered')
  })

  it('blocked 停在停下来的那一档上,不因为卡住而更完成或更不完成', () => {
    const before = resolveActiveWorkStage(task({ id: 'a', status: 'doing', workSessionIds: ['w1'] }))
    const after = resolveActiveWorkStage(task({ id: 'a', status: 'blocked', workSessionIds: ['w1'] }))
    expect(after).toBe(before)
  })

  it('空 evidence 不算执行痕迹', () => {
    expect(resolveActiveWorkStage(task({
      id: 'a',
      status: 'doing',
      workSessionIds: ['w1'],
      report: { summary: '', evidence: { toolCounts: {}, files: [] } },
    }))).toBe('started')
  })
})

describe('跨房聚合', () => {
  it('活是主体房是属性:多房摊平后按 updatedAt 倒序,不按房分组', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([task({ id: 'old', status: 'doing', updatedAt: 10 })]),
        'room-2': board([task({ id: 'new', status: 'doing', updatedAt: 30 })]),
        'room-3': board([task({ id: 'mid', status: 'review', updatedAt: 20 })]),
      },
      identityOf: IDENTITY,
    })
    expect(cards.map(card => card.taskId)).toEqual(['new', 'mid', 'old'])
    expect(cards.map(card => card.roomSessionId)).toEqual(['room-2', 'room-3', 'room-1'])
  })

  it('房已经不在会话列表里就不画卡 —— 点开一间不存在的房是死链', () => {
    const cards = collectActiveWork({
      boards: { 'room-gone': board([task({ id: 'a', status: 'doing' })]) },
      identityOf: IDENTITY,
      isKnownRoom: () => false,
    })
    expect(cards).toEqual([])
  })

  it('负责人身份走 displayAgent 投影:查无此人照渲染墓碑,不冒充 default', () => {
    const cards = collectActiveWork({
      boards: { 'room-1': board([task({ id: 'a', status: 'doing', assigneeAgentId: 'gone' })]) },
      identityOf: () => ({ name: '已注销' }),
    })
    expect(cards[0].assigneeName).toBe('已注销')
  })

  it('没写标题就退到短号,`workSessionId` 取尾条(C3 右栏线程的靶)', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([task({ id: 'abcdefgh1234', status: 'doing', workSessionIds: ['w1', 'w2'] })]),
      },
      identityOf: IDENTITY,
    })
    expect(cards[0].title).toBe('#abcdefgh')
    expect(cards[0].workSessionId).toBe('w2')
  })

  it('一个人压着两张 doing 卡时,只有最新那张算「此刻在干的」', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([
          task({ id: 'old', status: 'doing', assigneeAgentId: 'fe', updatedAt: 10 }),
          task({ id: 'new', status: 'doing', assigneeAgentId: 'fe', updatedAt: 20 }),
        ]),
      },
      identityOf: IDENTITY,
    })
    expect(cards.find(c => c.taskId === 'new')?.isAssigneeCurrent).toBe(true)
    expect(cards.find(c => c.taskId === 'old')?.isAssigneeCurrent).toBe(false)
  })

  it('待审批覆盖只认这张卡自己的尾条工作台会话', () => {
    const cards = collectActiveWork({
      boards: {
        'room-1': board([
          task({ id: 'a', status: 'doing', workSessionIds: ['w-blocked'] }),
          task({ id: 'b', status: 'doing', workSessionIds: ['w-free'] }),
        ]),
      },
      identityOf: IDENTITY,
      awaitingPermission: sessionId => sessionId === 'w-blocked',
    })
    expect(cards.find(c => c.taskId === 'a')?.tag.tone).toBe('awaiting')
    expect(cards.find(c => c.taskId === 'b')?.tag.tone).toBe('running')
  })
})

describe('定向补齐:不为了聚合把每间房都拉一遍', () => {
  const sessions = [
    { id: 'room-1', kind: 'room', updatedAt: 100 },
    { id: 'room-2', kind: 'room', updatedAt: 100 },
    { id: 'chat-1', kind: 'chat', updatedAt: 999 },
    { id: 'w-1', kind: 'work', updatedAt: 10, collab: { roomSessionId: 'room-1' } },
    { id: 'w-2', kind: 'work', updatedAt: 40, collab: { roomSessionId: 'room-2' } },
    { id: 'a-1', kind: 'agent', updatedAt: 50, collab: { roomSessionId: 'room-1' } },
  ]

  it('候选只来自开过工作台的房 —— 没干过活的房一次都不拉', () => {
    expect(activeWorkHydrationTargets({ sessions })).toEqual(['room-1', 'room-2'])
  })

  it('按房里最近一次活动排序(room-1 的 agent 会话比 room-2 新)', () => {
    const targets = activeWorkHydrationTargets({ sessions })
    expect(targets[0]).toBe('room-1')
  })

  it('已经在 store 里的板不重复拉', () => {
    expect(activeWorkHydrationTargets({ sessions, loadedRoomIds: ['room-1'] })).toEqual(['room-2'])
  })

  it('房没了就别去拉它的板', () => {
    expect(activeWorkHydrationTargets({ sessions, isKnownRoom: id => id === 'room-2' })).toEqual(['room-2'])
  })

  it('有上限,冷启不会变成 N 次 IPC', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `w-${i}`,
      kind: 'work',
      updatedAt: i,
      collab: { roomSessionId: `room-${i}` },
    }))
    expect(activeWorkHydrationTargets({ sessions: many })).toHaveLength(ACTIVE_WORK_HYDRATION_LIMIT)
    expect(activeWorkHydrationTargets({ sessions: many, limit: 3 })).toEqual(['room-39', 'room-38', 'room-37'])
  })
})

// ── 方案三:类内分组 + 行副文(样板 `.grp` / `.r .meta`)────────────────────

function card(patch: Partial<ActiveWorkCardModel> & { taskId: string; tone: ActiveWorkTone }): ActiveWorkCardModel {
  const { tone, ...rest } = patch
  return {
    shortId: `#${patch.taskId}`,
    roomSessionId: 'room-1',
    title: patch.taskId,
    assigneeAgentId: 'fe',
    assigneeName: '小林',
    tag: { tone, label: tone },
    stage: 'started',
    progress: 0.45,
    updatedAt: 0,
    isAssigneeCurrent: false,
    workSessionId: '',
    ...rest,
  } as ActiveWorkCardModel
}

describe('类内分组(样板 .grp)', () => {
  it('三组定序:执行中 / 待你 / 已交付', () => {
    const groups = groupActiveWorkCards([
      card({ taskId: 'c', tone: 'delivered' }),
      card({ taskId: 'a', tone: 'running' }),
      card({ taskId: 'b', tone: 'awaiting' }),
    ])
    expect(groups.map(group => group.label)).toEqual(['执行中', '待你', '已交付'])
    expect(groups.map(group => group.cards.map(entry => entry.taskId))).toEqual([['a'], ['b'], ['c']])
  })

  it('空组不画组头 —— 一个永远在那儿的空标题占的是最贵的那段视线', () => {
    const groups = groupActiveWorkCards([card({ taskId: 'a', tone: 'running' })])
    expect(groups.map(group => group.tone)).toEqual(['running'])
  })

  it('组内顺序照抄入参(collectActiveWork 已按 updatedAt 倒序排好)', () => {
    const groups = groupActiveWorkCards([
      card({ taskId: 'new', tone: 'running', updatedAt: 30 }),
      card({ taskId: 'old', tone: 'running', updatedAt: 10 }),
    ])
    expect(groups[0].cards.map(entry => entry.taskId)).toEqual(['new', 'old'])
  })

  it('一张卡都没有时一组都不画', () => {
    expect(groupActiveWorkCards([])).toEqual([])
  })
})

describe('rail 徽标的「进行中」那一路', () => {
  it('在跑或待你 → 亮', () => {
    expect(hasActiveWorkSignal([card({ taskId: 'a', tone: 'running' })])).toBe(true)
    expect(hasActiveWorkSignal([card({ taskId: 'b', tone: 'awaiting' })])).toBe(true)
  })

  it('只剩已交付 → 不亮(交付了就不催人)', () => {
    expect(hasActiveWorkSignal([card({ taskId: 'c', tone: 'delivered' })])).toBe(false)
    expect(hasActiveWorkSignal([])).toBe(false)
  })
})

describe('行副文(样板 .r .meta 的三种形状)', () => {
  const now = new Date(2026, 6, 31, 12, 0, 0).getTime()

  it('执行中 → 跑了多久', () => {
    expect(resolveActiveWorkRowMeta(card({ taskId: 'a', tone: 'running', updatedAt: now - 30_000 }), now)).toBe('刚刚')
    expect(resolveActiveWorkRowMeta(card({ taskId: 'a', tone: 'running', updatedAt: now - 12 * 60_000 }), now)).toBe('12m')
    expect(resolveActiveWorkRowMeta(card({ taskId: 'a', tone: 'running', updatedAt: now - 3 * 3_600_000 }), now)).toBe('3h')
    expect(resolveActiveWorkRowMeta(card({ taskId: 'a', tone: 'running', updatedAt: now - 2 * 86_400_000 }), now)).toBe('2d')
  })

  /**
   * 样板那一格画的是 `bash`,但系统手上只有整句(blockReason / 「等你放行」)——
   * 从中文里截一段工具名出来是编造,所以整句照出,长了由 CSS 收。
   */
  it('待你 → 等你什么(整句照出,不去解析里面的工具名)', () => {
    const awaiting = card({ taskId: 'b', tone: 'awaiting', updatedAt: now })
    awaiting.tag = { tone: 'awaiting', label: '待审批', hint: '等你放行 bash' }
    expect(resolveActiveWorkRowMeta(awaiting, now)).toBe('等你放行 bash')
    awaiting.tag = { tone: 'awaiting', label: '待审批' }
    expect(resolveActiveWorkRowMeta(awaiting, now)).toBe('')
  })

  it('已交付 → 今天给钟点,昨天给「昨天」,更早给月/日', () => {
    const at = new Date(2026, 6, 31, 9, 21, 0).getTime()
    expect(resolveActiveWorkRowMeta(card({ taskId: 'c', tone: 'delivered', updatedAt: at }), now)).toBe('09:21')
    expect(resolveActiveWorkRowMeta(card({ taskId: 'c', tone: 'delivered', updatedAt: at - 86_400_000 }), now)).toBe('昨天')
    expect(resolveActiveWorkRowMeta(card({ taskId: 'c', tone: 'delivered', updatedAt: new Date(2026, 6, 12, 8, 0, 0).getTime() }), now)).toBe('7/12')
  })

  it('没有时间戳就不编一个出来', () => {
    expect(resolveActiveWorkRowMeta(card({ taskId: 'd', tone: 'running', updatedAt: 0 }), now)).toBe('')
  })
})
