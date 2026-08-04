import { describe, expect, it } from 'vitest'
import type { CollabTask } from '@shared/ipc'
import { hasRoomBoardAwaiting } from '../room-board'

const NOW = new Date('2026-08-01T10:00:00').getTime()

function task(partial: Partial<CollabTask> & { id: string }): CollabTask {
  return {
    rev: 1,
    title: '',
    status: 'todo',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: NOW,
    ...partial,
  } as CollabTask
}

/* 窄栏行式看板(`buildRoomBoardGroups`)随房间背台一并退役(2026-08-04):
   右栏收敛成一套页签之后,看板那一页画的是既有的 `CollabBoardPanel`。
   留下的这一支只服务页签上那颗橙点。 */
describe('hasRoomBoardAwaiting — 看板页签那枚橙点', () => {
  it('只回答有没有,与置顶那一撮同一条判定', () => {
    expect(hasRoomBoardAwaiting({ tasks: [task({ id: 'doing-1', status: 'doing' })] })).toBe(false)
    expect(hasRoomBoardAwaiting({ tasks: [task({ id: 'blocked-1', status: 'blocked' })] })).toBe(true)
    expect(hasRoomBoardAwaiting({
      tasks: [task({ id: 'doing-1', status: 'doing', workSessionIds: ['work-1'] })],
      awaitingPermission: () => true,
    })).toBe(true)
  })
})
