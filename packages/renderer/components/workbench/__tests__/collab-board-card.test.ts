import { describe, expect, it } from 'vitest'
import type { CollabTask } from '@shared/ipc.js'
import {
  BOARD_CONFLICT_HINT,
  BOARD_NO_EVIDENCE_TEXT,
  BOARD_USER_COMPLETE_SUMMARY,
  buildBoardCardAction,
  buildBoardCardMenuItems,
  collectBoardDeliverables,
  countBoardDeliverables,
  formatBoardEvidence,
  formatBoardEvidenceLabel,
  isBoardRevConflict,
  resolveDeliverablePath,
  splitDeliverablePath,
  taskDeliverables,
} from '../collab-board-card'

const AGENTS = [
  { id: 'pm', name: '阿明', avatar: '📋' },
  { id: 'fe', name: '小李', avatar: '🔧' },
  { id: 'faceless', name: '无脸' },
]

function task(patch: Partial<CollabTask> = {}): CollabTask {
  return {
    id: 'task-1',
    rev: 3,
    title: '写登录页',
    status: 'todo',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

describe('buildBoardCardMenuItems', () => {
  it('offers every column and greys the one the card is already in', () => {
    const items = buildBoardCardMenuItems({ task: task({ status: 'doing' }), agents: AGENTS, memberAgentIds: [] })
    const moves = items.filter(item => item.id.startsWith('move:'))
    expect(moves.map(item => item.id)).toEqual([
      'move:backlog', 'move:todo', 'move:doing', 'move:review', 'move:done', 'move:blocked',
    ])
    expect(moves.find(item => item.id === 'move:doing')?.disabled).toBe(true)
    expect(moves.filter(item => item.disabled)).toHaveLength(1)
    expect(moves.find(item => item.id === 'move:done')?.label).toBe('移到 完成')
  })

  it('lists the room roster with avatars and greys the current assignee', () => {
    const items = buildBoardCardMenuItems({
      task: task({ assigneeAgentId: 'fe' }),
      agents: AGENTS,
      memberAgentIds: ['pm', 'fe'],
    })
    const assigns = items.filter(item => item.id.startsWith('assign:'))
    expect(assigns.map(item => item.label)).toEqual(['指派给 📋 阿明', '指派给 🔧 小李'])
    expect(assigns.map(item => item.disabled)).toEqual([false, true])
    // The roster block is separated from the move block, not run together.
    expect(assigns[0].separatorBefore).toBe(true)
    expect(assigns[1].separatorBefore).toBeUndefined()
  })

  it('falls back to the neutral stamp, and to the tombstone for a missing agent', () => {
    // 域模型 M4:名字不可考时说「已注销」,不把原始 id 印在菜单里;而一个指不动
    // 的目标必须是灰的(§3.2:退休/不存在的成员不被指派)。
    const items = buildBoardCardMenuItems({
      task: task(),
      agents: AGENTS,
      memberAgentIds: ['faceless', 'ghost'],
    })
    const assigns = items.filter(item => item.id.startsWith('assign:'))
    expect(assigns.map(item => item.label))
      .toEqual(['指派给 🤖 无脸', '指派给 🤖 已注销 · 已注销'])
    expect(assigns.map(item => item.disabled)).toEqual([false, true])
  })

  it('greys a retired member instead of offering it as an assignee', () => {
    const items = buildBoardCardMenuItems({
      task: task(),
      agents: [...AGENTS, { id: 'gone', name: '老王', avatar: '🎨', status: 'retired' as const }],
      memberAgentIds: ['pm', 'gone'],
    })
    const assigns = items.filter(item => item.id.startsWith('assign:'))
    expect(assigns.map(item => item.label)).toEqual(['指派给 📋 阿明', '指派给 🎨 老王 · 已注销'])
    expect(assigns.map(item => item.disabled)).toEqual([false, true])
  })

  it('offers 标记完成 only where the reducer accepts it (doing/todo)', () => {
    const has = (status: CollabTask['status']) =>
      buildBoardCardMenuItems({ task: task({ status }), agents: AGENTS, memberAgentIds: [] })
        .some(item => item.id === 'complete')
    expect([has('todo'), has('doing')]).toEqual([true, true])
    expect([has('review'), has('done'), has('blocked'), has('backlog')])
      .toEqual([false, false, false, false])
  })

  it('adds 重新排队 to a blocked card only', () => {
    const has = (status: CollabTask['status']) =>
      buildBoardCardMenuItems({ task: task({ status }), agents: AGENTS, memberAgentIds: [] })
        .some(item => item.id === 'requeue')
    expect(has('blocked')).toBe(true)
    expect([has('todo'), has('doing'), has('done')]).toEqual([false, false, false])
  })
})

describe('buildBoardCardAction', () => {
  it('stamps the rev the user was looking at onto every write', () => {
    const card = task({ rev: 9 })
    expect(buildBoardCardAction('move:done', card))
      .toEqual({ action: 'move', taskId: 'task-1', status: 'done', expectedRev: 9 })
    expect(buildBoardCardAction('assign:fe', card))
      .toEqual({ action: 'assign', taskId: 'task-1', assigneeAgentId: 'fe', expectedRev: 9 })
    expect(buildBoardCardAction('complete', card))
      .toEqual({ action: 'complete', taskId: 'task-1', summary: BOARD_USER_COMPLETE_SUMMARY, expectedRev: 9 })
  })

  it('turns 重新排队 into the move that actually re-spawns work (W9b.1 requeue)', () => {
    expect(buildBoardCardAction('requeue', task({ status: 'blocked', assigneeAgentId: 'fe', rev: 2 })))
      .toEqual({ action: 'move', taskId: 'task-1', status: 'todo', expectedRev: 2 })
  })

  it('produces nothing for a no-op or an unknown row rather than a bogus write', () => {
    expect(buildBoardCardAction('move:todo', task({ status: 'todo' }))).toBeUndefined()
    expect(buildBoardCardAction('assign:fe', task({ assigneeAgentId: 'fe' }))).toBeUndefined()
    expect(buildBoardCardAction('requeue', task({ status: 'todo' }))).toBeUndefined()
    expect(buildBoardCardAction('move:limbo', task())).toBeUndefined()
    expect(buildBoardCardAction('assign:', task())).toBeUndefined()
    expect(buildBoardCardAction('delete', task())).toBeUndefined()
  })

  it('returns plain literals — a reactive card must not ride across IPC', () => {
    const action = buildBoardCardAction('move:done', task())
    expect(JSON.parse(JSON.stringify(action))).toEqual(action)
  })
})

describe('evidence rendering (W9b.4)', () => {
  it('orders by count desc then name, matching the room line', () => {
    expect(formatBoardEvidence({ toolCounts: { read: 2, write: 1, bash: 2 } }))
      .toBe('bash×2, read×2, write×1')
  })

  it('treats zero counts as no evidence at all', () => {
    expect(formatBoardEvidence({ toolCounts: { read: 0 } })).toBe('')
    expect(formatBoardEvidence(undefined)).toBe('')
  })

  it('says 无执行记录 for a done card no tool call backs', () => {
    expect(formatBoardEvidenceLabel(task({ status: 'done' }))).toBe(BOARD_NO_EVIDENCE_TEXT)
    expect(formatBoardEvidenceLabel(task({ status: 'done', report: { summary: '搞定了' } })))
      .toBe(BOARD_NO_EVIDENCE_TEXT)
    expect(formatBoardEvidenceLabel(task({
      status: 'done',
      report: { summary: '搞定了', evidence: { toolCounts: {} } },
    }))).toBe(BOARD_NO_EVIDENCE_TEXT)
  })

  it('prints the receipt when the work session really ran', () => {
    expect(formatBoardEvidenceLabel(task({
      status: 'done',
      report: { summary: '搞定了', evidence: { toolCounts: { write: 1, read: 2 } } },
    }))).toBe('执行记录: read×2, write×1')
  })
})

describe('交付物 (W17)', () => {
  function delivered(patch: Partial<CollabTask>, files: string[]): CollabTask {
    return task({ ...patch, report: { summary: '交付', evidence: { toolCounts: { write: files.length }, files } } })
  }

  it('reads files off the evidence and tolerates every pre-W17 shape', () => {
    expect(taskDeliverables(task())).toEqual([])
    expect(taskDeliverables(task({ report: { summary: '交付' } }))).toEqual([])
    expect(taskDeliverables(task({ report: { summary: '交付', evidence: { toolCounts: { write: 1 } } } })))
      .toEqual([])
    expect(taskDeliverables(delivered({}, ['a.txt']))).toEqual(['a.txt'])
  })

  it('groups by task newest-first and drops tasks that produced nothing', () => {
    const groups = collectBoardDeliverables([
      delivered({ id: 'old', title: '旧任务', updatedAt: 10 }, ['src/a.ts']),
      task({ id: 'bare', title: '没产出' }),
      delivered({ id: 'new', title: '新任务', updatedAt: 99 }, ['src/b.ts', 'README.md']),
    ])
    expect(groups).toEqual([
      { taskId: 'new', title: '新任务', files: ['src/b.ts', 'README.md'] },
      { taskId: 'old', title: '旧任务', files: ['src/a.ts'] },
    ])
  })

  it('counts distinct files across the whole board', () => {
    expect(countBoardDeliverables([
      delivered({ id: 't1' }, ['src/a.ts', 'src/b.ts']),
      delivered({ id: 't2' }, ['src/a.ts']),
      task({ id: 't3' }),
    ])).toBe(2)
    expect(countBoardDeliverables([])).toBe(0)
  })

  it('resolves a stored relative path against the room workdir', () => {
    expect(resolveDeliverablePath('src/a.ts', '/repo')).toBe('/repo/src/a.ts')
    expect(resolveDeliverablePath('src/a.ts', '/repo/')).toBe('/repo/src/a.ts')
    expect(resolveDeliverablePath('  src/a.ts  ', '/repo')).toBe('/repo/src/a.ts')
  })

  it('hands absolute paths straight through, whatever the platform', () => {
    expect(resolveDeliverablePath('/etc/hosts', '/repo')).toBe('/etc/hosts')
    expect(resolveDeliverablePath('C:\\tmp\\a.txt', 'D:\\repo')).toBe('C:\\tmp\\a.txt')
    expect(resolveDeliverablePath('\\\\host\\share\\a.txt', 'D:\\repo')).toBe('\\\\host\\share\\a.txt')
    expect(resolveDeliverablePath('src\\a.ts', 'D:\\repo')).toBe('D:\\repo\\src\\a.ts')
  })

  it('refuses to guess when there is no workdir to resolve against', () => {
    expect(resolveDeliverablePath('src/a.ts', undefined)).toBe('')
    expect(resolveDeliverablePath('src/a.ts', '')).toBe('')
    expect(resolveDeliverablePath('   ', '/repo')).toBe('')
  })

  it('splits filename from directory for the two-part row', () => {
    expect(splitDeliverablePath('src/app/main.ts')).toEqual({ name: 'main.ts', dir: 'src/app' })
    expect(splitDeliverablePath('README.md')).toEqual({ name: 'README.md', dir: '' })
    expect(splitDeliverablePath('D:\\repo\\a.txt')).toEqual({ name: 'a.txt', dir: 'D:\\repo' })
    expect(splitDeliverablePath('/abs/x/')).toEqual({ name: 'x', dir: '/abs' })
  })
})

describe('isBoardRevConflict', () => {
  it('recognises the reducer wording and nothing else', () => {
    expect(isBoardRevConflict('Task t1 changed (rev 7) — re-read the board (action:"list") and retry'))
      .toBe(true)
    expect(isBoardRevConflict('Not a room session')).toBe(false)
    expect(isBoardRevConflict(undefined)).toBe(false)
    expect(BOARD_CONFLICT_HINT).toBe('看板已被他人更新,已刷新')
  })
})
