/**
 * `ask_user` 的**接线**守卫 —— 走的是真内核(`@onething/core/interaction`)与真工具
 * 注册表,只把「这条会话所在的房里有没有人」那道门换成可控的桩。
 *
 * 上一层(`tools/__tests__/ask-user.test.ts`)钉的是形状与收场翻译;这一层钉的是
 * 只有装配层才知道的三件事:
 *   1. `origin` 必须是 `'host-tool'` —— 卡片、审计、将来的策略都按它区分「谁在问」,
 *      沿用外部 agent 那一格就是把原生提问伪装成 SDK 的提问;
 *   2. 卡片的归位锚是 `toolCallId`,它必须一路从工具执行上下文带到内核的 request 上
 *      (renderer 的 `interactionAnchorIndex` 就靠这一个键在消息里找落点);
 *   3. 回合中止要**真的把内核里那条 pending 摘掉**,而不是只让工具自己走开。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Interaction, type InteractionBusEvent } from '@onething/core/interaction'
import { createOnethingToolRegistry } from '@onething/runtime/tools'

const noHuman = vi.hoisted(() => ({ value: false }))

vi.mock('../../../interaction/no-human.js', () => ({
  noHumanInTheRoom: () => noHuman.value,
  NO_HUMAN_DECLINE_REASON: '这是两个 agent 的私聊,没有人类在场。',
}))

const SESSION = 'ask-user-session'
const MESSAGE = 'assistant-message'
const TOOL_CALL = 'toolu_ask_1'

const ARGS = {
  questions: [{
    question: '这一步要不要先备份?',
    header: '备份',
    options: [{ label: '先备份', description: '慢一点但稳' }, { label: '直接改' }],
  }],
}

const emitted: Array<{ sessionId: string; event: InteractionBusEvent }> = []

const BUS = {
  onAnySession: () => () => {},
  emit: async (sessionId: string, event: InteractionBusEvent) => {
    emitted.push({ sessionId, event })
    return undefined
  },
}

async function registryWithAskUser() {
  const { AskUserTool } = await import('../ask-user.js')
  const registry = createOnethingToolRegistry()
  registry.registerTool(AskUserTool)
  return registry
}

/** 等到内核里真的挂上了一条 pending(ask 是异步落表的)。 */
async function waitForPending(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (Interaction.getPending(SESSION).length > 0) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('no pending interaction appeared')
}

beforeEach(() => {
  emitted.length = 0
  noHuman.value = false
  Interaction.initialize(BUS, () => 'ipc')
})

afterEach(() => {
  Interaction.clearSession(SESSION)
  Interaction.shutdown()
  vi.restoreAllMocks()
})

describe('ask_user 装配接线', () => {
  it('从工具调用一路到内核:origin 是 host-tool,卡片按 toolCallId 归位', async () => {
    const registry = await registryWithAskUser()
    const pending = registry.executeTool('ask_user', ARGS, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
    })

    await waitForPending()
    const [request] = Interaction.getPending(SESSION)
    expect(request.origin).toBe('host-tool')
    // 归位锚:renderer 的 interactionAnchorIndex 在 message.toolCalls 里找的就是它。
    expect(request.toolCallId).toBe(TOOL_CALL)
    expect(request.sessionId).toBe(SESSION)
    expect(request.questions[0]).toMatchObject({
      id: `${TOOL_CALL}:0`,
      question: '这一步要不要先备份?',
      header: '备份',
    })
    // 广播出去的 requested 事件带的是同一份 request(UI 靠它去反查)。
    expect(emitted.map(entry => entry.event.type)).toContain('interaction:requested')

    Interaction.respond({
      sessionId: SESSION,
      toolCallId: TOOL_CALL,
      answers: { [`${TOOL_CALL}:0`]: { selected: ['先备份'] } },
    })

    const result = await pending
    expect(result.success).toBe(true)
    expect((result.data as { metadata: unknown }).metadata).toEqual({
      interaction: 'ask_user',
      outcome: 'answered',
      answers: [{
        questionId: `${TOOL_CALL}:0`,
        question: '这一步要不要先备份?',
        selected: ['先备份'],
      }],
    })
    // 答完内核就把它摘牌了 —— 补水口不该再吐这一条。
    expect(Interaction.getPending(SESSION)).toEqual([])
  })

  /**
   * 答案的**唯一**去处是工具结果与那张卡,不是聊天流里的一条 user message。
   *
   * 这条钉的是一个「没有」:普通会话里作答,总线上只该出现 `interaction:*` 两条,
   * 一条 `message:*` 都不许有。合成一条消息会同时坏两件事 —— 屏幕上冒出一句用户
   * 从没打过的话,而模型那一侧会把同一个答案读两遍(tool result 里已经有了)。
   *
   * 协作房那条链不在这里:房里的系统行走 `postSystemLine`(display-only,不进模型
   * 投影),它是一盏灯不是一句发言,与本条不冲突。
   */
  it('作答不往聊天流里合成消息:总线上只有 interaction:* 两条', async () => {
    const registry = await registryWithAskUser()
    const pending = registry.executeTool('ask_user', ARGS, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
    })

    await waitForPending()
    Interaction.respond({
      sessionId: SESSION,
      toolCallId: TOOL_CALL,
      answers: { [`${TOOL_CALL}:0`]: { selected: ['先备份'] } },
    })
    const result = await pending

    expect(emitted.map(entry => entry.event.type))
      .toEqual(['interaction:requested', 'interaction:settled'])
    // 一条 message:* 都没有 —— 「答案变成一条用户消息气泡」在这里就被挡住。
    expect(emitted.some(entry => entry.event.type.startsWith('message:'))).toBe(false)
    // 而模型那一侧不缺这个答案:它写在工具结果的正文里(下一轮请求体读的就是它)。
    expect((result.data as { output: string }).output).toContain('先备份')
  })

  it('用户跳过:declined 是一次正常的工具成功,理由写给模型', async () => {
    const registry = await registryWithAskUser()
    const pending = registry.executeTool('ask_user', ARGS, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
    })

    await waitForPending()
    Interaction.decline({ sessionId: SESSION, toolCallId: TOOL_CALL, reason: '我还没想好' })

    const result = await pending
    expect(result.success).toBe(true)
    expect((result.data as { metadata: { outcome: string; reason: string } }).metadata)
      .toMatchObject({ outcome: 'declined', reason: '我还没想好' })
  })

  it('回合中止:内核里那条 pending 真的被摘掉,工具收到 aborted', async () => {
    const registry = await registryWithAskUser()
    const controller = new AbortController()
    const pending = registry.executeTool('ask_user', ARGS, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
      abortSignal: controller.signal,
    })

    await waitForPending()
    controller.abort()

    const result = await pending
    expect(result.success).toBe(true)
    expect((result.data as { metadata: { outcome: string } }).metadata.outcome).toBe('aborted')
    // 这一条是重点:停了的回合不许在屏幕上留一张永远等不到人的卡。
    expect(Interaction.getPending(SESSION)).toEqual([])
    expect(emitted.some(entry => entry.event.type === 'interaction:settled')).toBe(true)
  })

  it('pair 房没有人类:当场 declined,根本不挂卡', async () => {
    noHuman.value = true
    const registry = await registryWithAskUser()

    const result = await registry.executeTool('ask_user', ARGS, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
    })

    expect(result.success).toBe(true)
    expect((result.data as { metadata: { outcome: string } }).metadata.outcome).toBe('declined')
    expect(Interaction.getPending(SESSION)).toEqual([])
    expect(emitted).toEqual([])
  })

  it('参数不合法在执行层就被挡下,不会挂出一条永远没人答的 pending', async () => {
    const registry = await registryWithAskUser()
    const result = await registry.executeTool('ask_user', { questions: [] }, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
    })

    expect(result.success).toBe(false)
    expect(Interaction.getPending(SESSION)).toEqual([])
  })

  it('内核抛错结成一次工具错误,而不是炸掉整个回合', async () => {
    const registry = await registryWithAskUser()
    vi.spyOn(Interaction, 'ask').mockRejectedValue(new Error('Interaction registry exploded'))

    const result = await registry.executeTool('ask_user', ARGS, {
      sessionId: SESSION,
      messageId: MESSAGE,
      toolCallId: TOOL_CALL,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Interaction registry exploded')
  })
})
