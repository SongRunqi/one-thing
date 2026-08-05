/**
 * **E4 的验收(装配层)**:外部通路终于接在了两条既有的等待链上。
 *
 * 三条:
 *
 *  1. **G1 — callId 必须过桥**。core 只在 `callId` 存在时才把这次审批与那个
 *     toolCall 关联起来(`core/permission/index.ts:393-400`),renderer 匹配不到
 *     toolCall 就把事件永久缓存、一个字都不画。E4 之前这里写死 `callId: undefined`
 *     —— 审批卡从未上屏,这就是 F3 那 2 分 11 秒的直接成因。
 *  2. **G2 — 必须走策略门**。直调 `Permission.ask` 绕开了 `enforcePermissionPolicy`,
 *     而 120s 无人值守自动拒绝桥长在那扇门上。注意这两条是**咬合的**:超时桥按
 *     `callId + messageId` 找 pending 去结算,所以丢了 callId 连兜底都找不到东西
 *     可拒 —— 修一条不修另一条等于没修。
 *  3. **提问在没有人的房间里当场拒绝**(§4 末段):pair 房两个 agent 私聊,发起
 *     一次提问就是发起一次空等。
 *
 * 用**真的** core Permission / Interaction / 策略门,只把 store、路径、宿主工具面
 * 这些「认识磁盘的东西」换掉 —— 桥接的正确性正是在这几层之间,mock 掉就什么都没验。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Interaction } from '@onething/core/interaction'
import { Permission } from '@onething/core/permission'

interface FakeMessage {
  id: string
  role: string
  origin?: { transport: string; source: string; receivedAt: number }
}

interface FakeSession {
  id: string
  kind?: string
  room?: { dm?: boolean; memberAgentIds?: string[] }
  collab?: { roomSessionId?: string }
  messages: FakeMessage[]
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  /** E0 能力表的答案。翻它就能验「能力位真的有读者」。 */
  interruptCapable: true,
}))

vi.mock('../../store.js', () => ({
  getSession: (id: string) => mocks.sessions.get(id),
  getSettings: () => ({ network: {} }),
}))

vi.mock('../../stores/paths.js', () => ({
  getStorePath: () => '/tmp/onething-e4-test',
}))

vi.mock('../../logging/index.js', () => ({
  writeAppLog: vi.fn(),
}))

// 授权留存不参与本文件:每一次都必须真的问。
vi.mock('../../permission/permission-grants.js', () => ({
  matchGrant: () => undefined,
}))

// 宿主工具面认识注册表与 v3 登记簿 —— 与本文件无关,别把它拖进来。
vi.mock('../host-tools.js', () => ({
  resolveClaudeCodeHostToolSurface: vi.fn(),
}))

vi.mock('@onething/runtime/agents', () => ({
  findAgentExecutorDescriptor: (id: string) =>
    id === 'claude-code-agent'
      ? { id, kind: 'external', capabilities: { interrupt: mocks.interruptCapable } }
      : undefined,
}))

const GOAL_ORIGIN = { transport: 'system', source: 'goal', receivedAt: 0 }

function seedSessions(): void {
  mocks.sessions.clear()
  // 系统驱动的普通会话 → 走 timeoutAskBridge(120s 自动拒绝)。
  mocks.sessions.set('chat-1', {
    id: 'chat-1',
    kind: 'chat',
    messages: [
      { id: 'u-1', role: 'user', origin: GOAL_ORIGIN },
      { id: 'msg-9', role: 'assistant' },
    ],
  } satisfies FakeSession)
  // pair 房(两个 agent 私聊,没有人类)与它的执行会话。
  mocks.sessions.set('pair-room', {
    id: 'pair-room',
    kind: 'room',
    room: { dm: true, memberAgentIds: ['iris', 'kai'] },
    messages: [],
  } satisfies FakeSession)
  mocks.sessions.set('pair-exec', {
    id: 'pair-exec',
    kind: 'agent',
    collab: { roomSessionId: 'pair-room' },
    messages: [],
  } satisfies FakeSession)
  // 有人类在场的多人房。
  mocks.sessions.set('team-room', {
    id: 'team-room',
    kind: 'room',
    room: { dm: false, memberAgentIds: ['iris', 'kai', 'lin'] },
    messages: [],
  } satisfies FakeSession)
  mocks.sessions.set('team-exec', {
    id: 'team-exec',
    kind: 'agent',
    collab: { roomSessionId: 'team-room' },
    messages: [],
  } satisfies FakeSession)
}

beforeEach(() => {
  seedSessions()
  mocks.interruptCapable = true
  Permission.clearSession('chat-1')
  Interaction.clearSession('pair-exec')
  Interaction.clearSession('team-exec')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('外部审批走策略门(G1 + G2)', () => {
  it('SDK 的 toolUseID 一路带到 core 的 callId —— 卡片靠它才画得出来', async () => {
    const { askExternalAgentPermission } = await import('../index.js')
    const decision = askExternalAgentPermission({
      connectorId: 'claude-code-agent',
      localSessionId: 'chat-1',
      messageId: 'msg-9',
      cwd: '/tmp/p',
      toolName: 'Bash',
      input: { command: 'ls' },
      toolCallId: 'toolu_01ABC',
    })

    await vi.waitFor(() => {
      expect(Permission.getPendingPrompts('chat-1')).toHaveLength(1)
    })
    const prompt = Permission.getPendingPrompts('chat-1')[0]
    expect(prompt.callId).toBe('toolu_01ABC')
    expect(prompt.messageId).toBe('msg-9')
    // 卡片类型与标题与 E4 之前逐字相同 —— 渲染层一个字都不用改。
    expect(prompt.type).toBe('external-agent')
    expect(prompt.title).toBe('Claude Code: Bash')
    expect(prompt.metadata).toMatchObject({ connectorId: 'claude-code-agent', toolName: 'Bash' })

    Permission.respond({ sessionId: 'chat-1', permissionId: prompt.id, response: 'once' })
    await expect(decision).resolves.toEqual({ behavior: 'allow' })
  })

  it('无人应答 120s 后自动拒绝,理由可读地回到 SDK', async () => {
    vi.useFakeTimers()
    const { askExternalAgentPermission } = await import('../index.js')
    const decision = askExternalAgentPermission({
      connectorId: 'claude-code-agent',
      localSessionId: 'chat-1',
      messageId: 'msg-9',
      toolName: 'Bash',
      input: { command: 'rm -rf /' },
      toolCallId: 'toolu_timeout',
    })

    // 还没到点:仍然挂着一张真卡(用户随时可以点)。
    await vi.advanceTimersByTimeAsync(119_000)
    expect(Permission.getPendingPrompts('chat-1')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(2_000)
    const settled = await decision
    expect(settled.behavior).toBe('deny')
    expect(settled).toMatchObject({
      message: expect.stringContaining('自动拒绝'),
    })
    // 从正常的 respond 路径拒的 —— pending 被结算掉,不是留在界面上变成孤儿。
    expect(Permission.getPendingPrompts('chat-1')).toHaveLength(0)
  })

  it('用户拒绝时的理由同样原样回到 SDK', async () => {
    const { askExternalAgentPermission } = await import('../index.js')
    const decision = askExternalAgentPermission({
      connectorId: 'claude-code-agent',
      localSessionId: 'chat-1',
      messageId: 'msg-9',
      toolName: 'Write',
      input: {},
      toolCallId: 'toolu_reject',
    })
    await vi.waitFor(() => {
      expect(Permission.getPendingPrompts('chat-1')).toHaveLength(1)
    })
    Permission.respond({
      sessionId: 'chat-1',
      permissionId: Permission.getPendingPrompts('chat-1')[0].id,
      response: 'reject',
      rejectReason: '这个目录不能动',
    })
    await expect(decision).resolves.toMatchObject({
      behavior: 'deny',
      message: expect.stringContaining('这个目录不能动'),
    })
  })
})

describe('提问的落点(§4)', () => {
  it('pair 房没有人类 → 当场 declined,不发起一次空等', async () => {
    const { askExternalAgentInteraction } = await import('../index.js')
    const answer = await askExternalAgentInteraction({
      connectorId: 'claude-code-agent',
      localSessionId: 'pair-exec',
      toolCallId: 'toolu_ask',
      questions: [{ id: 'q0', question: 'A 还是 B?', options: [{ label: 'A' }, { label: 'B' }] }],
    })
    expect(answer.outcome).toBe('declined')
    expect(answer.reason).toContain('没有人类在场')
    // 一条 pending 都不该留下 —— 空等正是我们要消掉的东西。
    expect(Interaction.getPending('pair-exec')).toHaveLength(0)
  })

  it('有人在的房间照旧起一张真卡,并按 toolCallId 归位', async () => {
    const { askExternalAgentInteraction } = await import('../index.js')
    const answer = askExternalAgentInteraction({
      connectorId: 'claude-code-agent',
      localSessionId: 'team-exec',
      toolCallId: 'toolu_ask',
      questions: [{ id: 'q0', question: 'A 还是 B?', options: [{ label: 'A' }, { label: 'B' }] }],
    })
    await vi.waitFor(() => {
      expect(Interaction.getPending('team-exec')).toHaveLength(1)
    })
    expect(Interaction.getPending('team-exec')[0].toolCallId).toBe('toolu_ask')

    Interaction.respond({
      sessionId: 'team-exec',
      toolCallId: 'toolu_ask',
      answers: { q0: { selected: ['B'] } },
    })
    await expect(answer).resolves.toMatchObject({
      outcome: 'answered',
      answers: { q0: { selected: ['B'] } },
    })
  })
})

describe('停止链上的外部中断(G10)', () => {
  it('能力表说有 interrupt 才调它', async () => {
    const module = await import('../index.js')
    const connector = module.getExternalAgentConnectors()['claude-code-agent']!
    const spy = vi.spyOn(connector, 'interrupt').mockResolvedValue(undefined)

    await module.interruptExternalAgentSessions('exec-1')
    expect(spy).toHaveBeenCalledWith('exec-1')

    // 表里翻一行,行为就跟着变 —— 声明与真实能力不分家(原则 5)。
    spy.mockClear()
    mocks.interruptCapable = false
    await module.interruptExternalAgentSessions('exec-1')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
