// @vitest-environment happy-dom
/**
 * 房间配置的推送落到会话列表上(架构收敛 C4 §3)。
 *
 * 从前房间配置**根本没有会话列表级的推送**:每个写入方(成员条、设置面板、
 * 建房对话框、联系人开私聊、看板面板的两个开关)在写完之后各自
 * `loadSessions()` 全量重拉一遍 —— 七处散在五个文件里,新加一个写入口就漏一处,
 * 而漏掉的症状是"改完不生效,切一下会话又生效了"。
 *
 * 这一面钉两件事:合并是**就地增量**(列表其它项一个都不动),以及它**不再**
 * 触发全量重拉(mock 计数,这正是那七处的替代品要证明的东西)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionsStore } from '../sessions'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  })
})

const mocks = vi.hoisted(() => ({
  getSessionsList: vi.fn(async () => ({ success: true, sessions: [] as unknown[] })),
}))

vi.mock('@/platform', () => ({
  platformApi: {
    getSessionsList: () => mocks.getSessionsList(),
  },
}))

const now = Date.now()

function seed() {
  const store = useSessionsStore()
  store.sessions.push(
    { id: 'chat-1', name: '普通会话', createdAt: now, updatedAt: now },
    {
      id: 'room-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'], pmAgentId: 'pm' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'room-2',
      name: '电台组',
      kind: 'room',
      room: { memberAgentIds: ['dj'] },
      createdAt: now,
      updatedAt: now,
    },
  )
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.getSessionsList.mockClear()
})

describe('session:collab-updated → 会话列表就地合并', () => {
  it('名册当场更新,而且**没有**任何一次全量重拉', () => {
    const store = seed()

    store.applyCollabRoomUpdate('room-1', {
      name: '官网改版组',
      room: { memberAgentIds: ['fe', 'pm', 'design'], pmAgentId: 'pm' },
    })

    expect(store.sessions.find(s => s.id === 'room-1')?.room?.memberAgentIds)
      .toEqual(['fe', 'pm', 'design'])
    // 那七处 `loadSessions()` 的替代品:它的价值一半在"当场生效",另一半在
    // "不为一个字段重拉整张表"。
    expect(mocks.getSessionsList).not.toHaveBeenCalled()
  })

  it('只动这一行:别的会话、别的字段原样不动', () => {
    const store = seed()
    const chat = store.sessions.find(s => s.id === 'chat-1')
    const other = store.sessions.find(s => s.id === 'room-2')

    store.applyCollabRoomUpdate('room-1', { room: { memberAgentIds: ['fe'], frozen: true } })

    expect(store.sessions).toHaveLength(3)
    expect(store.sessions.find(s => s.id === 'chat-1')).toBe(chat)
    expect(store.sessions.find(s => s.id === 'room-2')).toBe(other)
    expect(other?.room?.memberAgentIds).toEqual(['dj'])
    expect(store.sessions.find(s => s.id === 'room-1')?.name).toBe('官网改版组')
  })

  it('room 是**全量替换**,不是字段级合并 —— 刚被清掉的 PM 不该留在屏幕上', () => {
    const store = seed()

    store.applyCollabRoomUpdate('room-1', { room: { memberAgentIds: ['fe'] } })

    const room = store.sessions.find(s => s.id === 'room-1')?.room
    expect(room?.memberAgentIds).toEqual(['fe'])
    expect(room?.pmAgentId).toBeUndefined()
  })

  it('房名跟着走;空名字是"这次写入没碰名字",不是改名', () => {
    const store = seed()

    store.applyCollabRoomUpdate('room-1', { name: '官网组', room: { memberAgentIds: ['fe'] } })
    expect(store.sessions.find(s => s.id === 'room-1')?.name).toBe('官网组')

    store.applyCollabRoomUpdate('room-1', { room: { memberAgentIds: ['fe', 'pm'] } })
    expect(store.sessions.find(s => s.id === 'room-1')?.name).toBe('官网组')
  })

  it('不认识的会话直接忽略 —— 这条事件是"改一行",不是"加一行"', () => {
    const store = seed()

    store.applyCollabRoomUpdate('room-ghost', { room: { memberAgentIds: ['fe'] } })

    expect(store.sessions).toHaveLength(3)
    expect(mocks.getSessionsList).not.toHaveBeenCalled()
  })

  it('没带 room 的畸形事件不改任何东西', () => {
    const store = seed()

    store.applyCollabRoomUpdate('room-1', { name: '改了' })

    expect(store.sessions.find(s => s.id === 'room-1')?.name).toBe('官网改版组')
    expect(store.sessions.find(s => s.id === 'room-1')?.room?.memberAgentIds).toEqual(['fe', 'pm'])
  })
})
