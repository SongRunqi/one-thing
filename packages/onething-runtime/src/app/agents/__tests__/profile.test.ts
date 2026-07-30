import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentDefinition, ChatSession } from '@shared/ipc.js'

/* Mock paths are resolved from THIS file, not from the module under test. */
const state = vi.hoisted(() => ({
  agent: null as AgentDefinition | null,
  session: undefined as ChatSession | undefined,
  settings: {} as Record<string, unknown>,
}))

vi.mock('../store.js', () => ({
  // 生产代码走 findAgent ?? defaultAgent();夹具用同一个 state.agent 顶两个口,
  // 与旧 getAgent mock(忽略入参直接回 state.agent)行为一致。
  findAgent: () => state.agent,
  defaultAgent: () => state.agent,
}))

vi.mock('../../stores/sessions.js', () => ({
  getSession: () => state.session,
}))

vi.mock('../../stores/settings.js', () => ({
  getSettings: () => state.settings,
}))

const { resolveAgentProfileForSession } = await import('../profile.js')

function agent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'agent-a',
    name: 'A',
    systemPrompt: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    name: 'S',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    agentId: 'agent-a',
    ...overrides,
  } as ChatSession
}

beforeEach(() => {
  state.agent = agent()
  state.session = session()
  state.settings = {}
})

describe('resolveAgentProfileForSession', () => {
  it('feeds the live stores into the pure rule', () => {
    state.agent = agent({ tools: ['bash'], maxTurns: 250, permissionMode: 'normal' })
    state.settings = { chat: { maxTurns: 40 }, tools: { permissionMode: 'dangerously-allow-all' } }

    expect(resolveAgentProfileForSession('session-1')).toMatchObject({
      agentId: 'agent-a',
      tools: ['bash'],
      maxTurns: 250,
      permissionMode: 'normal',
    })
  })

  it('pins a room turn to the room surface — say + board, not the agent tools', () => {
    state.agent = agent({ tools: ['bash'] })
    state.session = session({ kind: 'agent' })

    // 2026-07-30 收紧:群聊回合的工具面与 agent 白名单无关,与情况说明
    // 「除 say 和 board 外你在群里没有其他工具」对齐。重活走工作台会话。
    expect(resolveAgentProfileForSession('session-1').tools).toEqual(['say', 'board'])
  })

  /**
   * D7 的边界(IM P3):`collab-dm` 那一格是**单成员**私聊的特权,双成员 dm 房
   * 不能顺着 `room.dm` 标记溜进去 —— 分流点是 `isUserDmRoom`(人数即形态),
   * 这里钉的就是"人数真的被数了"。
   *
   * 今天两格的工具清单相同,所以断言写成"与普通群房同解"而不是硬编一个清单:
   * 群房那一格若再次收紧成 replace,双人房必须跟着收紧(它是沟通场),而单成员
   * 私聊必须不动(它是干活现场)—— 这条断言那时会自己说话。
   */
  it('双成员 dm 房与普通群房同解:collab-dm 那一格只归单成员私聊', () => {
    state.agent = agent({ tools: ['bash'] })

    state.session = session({
      kind: 'room',
      room: { memberAgentIds: ['agent-a', 'agent-b'] },
    } as Partial<ChatSession>)
    const group = resolveAgentProfileForSession('session-1').tools

    state.session = session({
      kind: 'room',
      room: { memberAgentIds: ['agent-a', 'agent-b'], dm: true },
    } as Partial<ChatSession>)
    expect(resolveAgentProfileForSession('session-1').tools).toEqual(group)

    // 单成员房才是 dm 那一格(今天同解,分开登记是为了将来能分开动)。
    state.session = session({
      kind: 'room',
      room: { memberAgentIds: ['agent-a'], dm: true },
    } as Partial<ChatSession>)
    expect(resolveAgentProfileForSession('session-1').tools).toEqual(group)
  })

  it('drops the model binding once the user pinned a model', () => {
    state.agent = agent({ model: { providerId: 'claude', modelId: 'sonnet' } })

    expect(resolveAgentProfileForSession('session-1').model)
      .toEqual({ providerId: 'claude', modelId: 'sonnet' })

    state.session = session({ modelPinned: true })
    expect(resolveAgentProfileForSession('session-1').model).toBeUndefined()
  })

  it('survives a session that no longer exists', () => {
    state.session = undefined
    expect(resolveAgentProfileForSession('gone').agentId).toBe('agent-a')
  })
})
