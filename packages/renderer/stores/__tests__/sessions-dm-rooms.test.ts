// @vitest-environment happy-dom
/**
 * 托管私聊房从群聊列表里拆出去(docs/design/agent-im-dm.md §4.1)。
 *
 * 拆的是「哪一份列表」,不是「这间房算不算数」:私聊房仍然是一个正常会话 ——
 * 能按 id 找到、能打开、能进页签、看板面板照样选得到它。只有"群聊列表"这一路
 * 语义要把它摘掉,因为侧栏的联系人行是它唯一的入口,两处都画就重复了。
 *
 * 判定只有一处(`isUserDmRoom` / `isAgentPairDmRoom`,人数即形态),所以这里同时
 * 钉住三路的边界:普通群 / 单成员私聊(联系人行)/ 双成员私聊(群聊区里的
 * 「私下」折叠分组,IM P3)。一间房只能有一个侧栏入口。
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

const now = Date.now()

function seed() {
  const store = useSessionsStore()
  store.sessions.push(
    { id: 'chat-1', name: '普通会话', createdAt: now, updatedAt: now },
    {
      id: 'room-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'] },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'agent-dm-fe',
      name: '小李',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe'] },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'agent-dm-room-fe--pm',
      name: '小李 ⇄ 小王',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe', 'pm'] },
      createdAt: now,
      updatedAt: now,
    },
  )
  return store
}

beforeEach(() => {
  setActivePinia(createPinia())
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} })
})

describe('roomSessions 拆分:私聊房归联系人区,群聊区只留群', () => {
  it('群聊那一路只剩普通群:两种 dm 房都被摘走', () => {
    const store = seed()
    expect(store.groupRoomSessions.map(s => s.id)).toEqual(['room-1'])
  })

  it('双成员 dm 房走「私下」那一路,而且不出现在任何其他区', () => {
    const store = seed()
    expect(store.agentPairDmRoomSessions.map(s => s.id)).toEqual(['agent-dm-room-fe--pm'])
    // 群聊区、联系人区(单成员私聊)、普通会话列表 —— 三处都不该有它。
    expect(store.groupRoomSessions.map(s => s.id)).not.toContain('agent-dm-room-fe--pm')
    expect(store.userDmRoomSessions.map(s => s.id)).not.toContain('agent-dm-room-fe--pm')
    expect(store.filteredSessions.map(s => s.id)).not.toContain('agent-dm-room-fe--pm')
  })

  it('私聊房仍是一间房:全量 roomSessions 照收(看板面板选得到它)', () => {
    const store = seed()
    expect(store.roomSessions.map(s => s.id)).toEqual([
      'room-1',
      'agent-dm-fe',
      'agent-dm-room-fe--pm',
    ])
    expect(store.userDmRoomSessions.map(s => s.id)).toEqual(['agent-dm-fe'])
  })

  it('私聊房仍是正常会话:找得到、能当会话打开', () => {
    const store = seed()
    expect(store.getSessionItem('agent-dm-fe')?.name).toBe('小李')
    expect(store.isUserDmRoomSession('agent-dm-fe')).toBe(true)
    expect(store.isUserDmRoomSession('room-1')).toBe(false)
    expect(store.isUserDmRoomSession('agent-dm-room-fe--pm')).toBe(false)
    expect(store.isUserDmRoomSession(undefined)).toBe(false)
  })

  it('私聊房不进普通会话列表 —— 那条规则(kind==="room")本来就管着它', () => {
    const store = seed()
    expect(store.filteredSessions.map(s => s.id)).toEqual(['chat-1'])
    expect(store.sidebarSessions.map(s => s.id)).toEqual(['chat-1'])
  })

  it('按 agent 找到 TA 的私聊房,没聊过的人找不到(房是惰性建的)', () => {
    const store = seed()
    expect(store.findUserDmRoom('fe')?.id).toBe('agent-dm-fe')
    expect(store.findUserDmRoom('pm')).toBeUndefined()
    expect(store.findUserDmRoom('')).toBeUndefined()
  })

  it('没有 dm 标记的单成员房是普通群 —— 标记才是事实,人数只决定形态', () => {
    const store = useSessionsStore()
    store.sessions.push({
      id: 'room-solo',
      name: '一个人的群',
      kind: 'room',
      room: { memberAgentIds: ['fe'] },
      createdAt: now,
      updatedAt: now,
    })
    expect(store.groupRoomSessions.map(s => s.id)).toEqual(['room-solo'])
    expect(store.userDmRoomSessions).toEqual([])
    expect(store.agentPairDmRoomSessions).toEqual([])
  })
})
