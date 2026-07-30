// @vitest-environment happy-dom
/**
 * 履历四栏的归类口径(docs/design/agent-im-dm.md D8 / agent-domain-model.md §5)。
 *
 * 归类只有**一处**:在场三路由产品层纯函数 `computeAgentPresence` 回答,直聊
 * 那一路由 store selector 补。组件里禁止再写第二份过滤 —— 两处口径一定会漂。
 *
 * 顺带是那两条**叶子 alias** 的运行期冒烟:
 * `@onething/runtime/agents/{identity,presence}` 缺登记只会在 build/run 期炸,
 * typecheck 的通配路径接受一切,所以必须有人在运行期真的 import 一次。走 barrel
 * (`@onething/runtime/agents`)不行:它拖着吃 node:fs 的 store.ts。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionsStore } from '../sessions'
import { userDmRoomId, execSessionId } from '@onething/runtime/agents/identity'
import { computeAgentPresence } from '@onething/runtime/agents/presence'

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

const now = Date.now()

function seed() {
  const store = useSessionsStore()
  store.sessions.push(
    { id: 'chat-1', name: '排查登录', agentId: 'fe', createdAt: now, updatedAt: 600 },
    { id: 'chat-2', name: '别人的会话', kind: 'chat', agentId: 'pm', createdAt: now, updatedAt: 999 },
    {
      id: 'agent-dm-fe',
      name: '小李',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe'] },
      createdAt: now,
      updatedAt: 900,
    },
    {
      id: 'room-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'] },
      createdAt: now,
      updatedAt: 800,
    },
    {
      id: 'agent-exec-fe-room-1',
      name: '[执行] 小李',
      kind: 'agent',
      agentId: 'fe',
      // 执行会话骑着 archived 标志躲开所有列表 —— 履历必须照样够得着它。
      isArchived: true,
      collab: { roomSessionId: 'room-1' },
      createdAt: now,
      updatedAt: 700,
    },
    {
      id: 'work-9',
      name: '[任务] 修登录',
      kind: 'work',
      agentId: 'fe',
      collab: { roomSessionId: 'room-1', taskId: 'task-1' },
      createdAt: now,
      updatedAt: 500,
    },
  )
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} })
})

describe('叶子 alias 冒烟', () => {
  it('identity / presence 两支纯函数经叶子 alias 真的 import 得到', () => {
    expect(userDmRoomId('fe')).toBe('agent-dm-fe')
    expect(execSessionId('fe', 'room-1')).toBe('agent-exec-fe-room-1')
    expect(typeof computeAgentPresence).toBe('function')
  })
})

describe('agentPresence:履历前三栏的口径', () => {
  it('四路各就各位,archived 的执行会话照样在场', () => {
    const store = seed()
    expect(store.agentPresence('fe')).toEqual({
      dmRoomId: 'agent-dm-fe',
      roomSessionIds: ['room-1'],
      execSessionIds: ['agent-exec-fe-room-1'],
      workSessionIds: ['work-9'],
    })
  })

  it('别人的东西一条都不收;空 id 全空', () => {
    const store = seed()
    const presence = store.agentPresence('pm')
    expect(presence.execSessionIds).toEqual([])
    expect(presence.workSessionIds).toEqual([])
    // pm 是 room-1 的成员,所以房间那一路有它 —— 这正是"读成员表"的证据。
    expect(presence.roomSessionIds).toEqual(['room-1'])
    expect(presence.dmRoomId).toBeNull()

    expect(store.agentPresence('')).toEqual({
      dmRoomId: null,
      roomSessionIds: [],
      execSessionIds: [],
      workSessionIds: [],
    })
  })

  it('与组件里的 selector 用同一个产品层函数 —— 两处不可能漂', () => {
    const store = seed()
    expect(store.agentPresence('fe')).toEqual(computeAgentPresence('fe', store.sessions))
  })
})

describe('agentDirectChatSessions:presence 覆盖不到的那一栏', () => {
  it('只收该 agent 的普通会话(缺 kind 的老会话算 chat),按活跃度排', () => {
    const store = seed()
    store.sessions.push({
      id: 'chat-3',
      name: '更早的直聊',
      kind: 'chat',
      agentId: 'fe',
      createdAt: now,
      updatedAt: 100,
    })

    expect(store.agentDirectChatSessions('fe').map(s => s.id)).toEqual(['chat-1', 'chat-3'])
  })

  it('房间 / 执行会话 / 工作台都不算直聊 —— 那三路是 presence 的活', () => {
    const store = seed()
    const ids = store.agentDirectChatSessions('fe').map(s => s.id)
    expect(ids).not.toContain('agent-dm-fe')
    expect(ids).not.toContain('agent-exec-fe-room-1')
    expect(ids).not.toContain('work-9')
  })

  it('空 id 返回空,不返回"所有没绑 agent 的会话"', () => {
    const store = seed()
    expect(store.agentDirectChatSessions('')).toEqual([])
    expect(store.agentDirectChatSessions(null)).toEqual([])
  })
})
