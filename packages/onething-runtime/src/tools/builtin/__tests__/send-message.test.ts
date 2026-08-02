/**
 * 合并后的发送面 —— 契约层(docs/design/collab-send-channel-and-wake.md §2)。
 *
 * 这一层只负责一件事:**这一发走哪条链路**,以及矛盾参数在调用时就被说清。
 * 房间/成员/冻结/预算那些门在执行器里,由 app 层的测试守着;这里守的是路由
 * 本身 —— 合并最容易悄悄坏掉的正是它(一个私聊参数被当成群发送出去,不会
 * 报错,只会送错人)。
 */
import { describe, expect, it, vi } from 'vitest'
import { createSayTool, type SayToolAdapters } from '../say.js'
import {
  COLLAB_SAY_REFUSED_EMPTY,
  COLLAB_SEND_MESSAGE_TOOL_NAME,
} from '../../../collab/index.js'

function adaptersWithSpies() {
  const speak = vi.fn(async () => ({ ok: true, messageId: 'msg-1' }))
  const sendDm = vi.fn(async () => ({
    ok: true,
    targetKind: 'agent' as const,
    roomSessionId: 'pair-room',
    messageId: 'msg-2',
    peerName: '阿明',
  }))
  return { speak, sendDm } satisfies SayToolAdapters
}

const CTX = { sessionId: 'exec-1', messageId: 'm-1', metadata: vi.fn() } as never

describe('channel 路由', () => {
  it('不写 channel:没有 to 就是群发送,走 speak', async () => {
    const adapters = adaptersWithSpies()
    const result = await createSayTool(adapters).execute({ content: '收到' }, CTX)

    expect(adapters.speak).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'exec-1', content: '收到' }),
    )
    expect(adapters.sendDm).not.toHaveBeenCalled()
    expect(result.metadata).toMatchObject({ ok: true, messageId: 'msg-1' })
  })

  it('不写 channel:有 to 就是私聊,走 sendDm,content 原样传过去', async () => {
    const adapters = adaptersWithSpies()
    const result = await createSayTool(adapters).execute(
      { content: '你是狼人。', to: '小明#3f9c' },
      CTX,
    )

    expect(adapters.speak).not.toHaveBeenCalled()
    expect(adapters.sendDm).toHaveBeenCalledWith({
      sessionId: 'exec-1',
      to: '小明#3f9c',
      content: '你是狼人。',
    })
    // 回执必须说清"TA 会回在私聊里",而不是 say 那句"已发出"。
    expect(result.output).toContain('阿明')
    expect(result.metadata).toMatchObject({ ok: true, roomSessionId: 'pair-room' })
  })

  it('wake / wakeRoom 只在私聊档往下传', async () => {
    const adapters = adaptersWithSpies()
    await createSayTool(adapters).execute(
      { content: '牌给你', to: '小明#3f9c', wake: true, wakeRoom: 'room-9' },
      CTX,
    )
    expect(adapters.sendDm).toHaveBeenCalledWith(
      expect.objectContaining({ wake: true, wakeRoom: 'room-9' }),
    )
  })

  it('显式 channel:"dm" 与 to 自洽时照走私聊', async () => {
    const adapters = adaptersWithSpies()
    await createSayTool(adapters).execute(
      { content: '在吗', to: '阿明', channel: 'dm' },
      CTX,
    )
    expect(adapters.sendDm).toHaveBeenCalledTimes(1)
  })
})

describe('校验矩阵:矛盾即拒绝,一个字都没发出去', () => {
  const cases: Array<{ name: string; args: Record<string, unknown>; contains: string }> = [
    {
      name: 'channel:"room" 带 to',
      args: { content: '一', to: '阿明', channel: 'room' },
      contains: 'to 是私聊的参数',
    },
    {
      name: 'channel:"dm" 没有 to',
      args: { content: '一', channel: 'dm' },
      contains: '要发给谁',
    },
    {
      name: 'wake 没有 to(没有人需要被唤醒)',
      args: { content: '一', wake: true },
      contains: 'wake 是私聊的参数',
    },
    {
      name: 'channel:"gateway"(P3 占坑)',
      args: { content: '一', channel: 'gateway' },
      contains: '远程投递',
    },
  ]

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const adapters = adaptersWithSpies()
      const result = await createSayTool(adapters).execute(testCase.args as never, CTX)

      expect(result.title).toContain('未送达')
      expect(result.output).toContain(testCase.contains)
      expect(result.metadata).toEqual({ ok: false })
      expect(adapters.speak).not.toHaveBeenCalled()
      expect(adapters.sendDm).not.toHaveBeenCalled()
    })
  }
})

/**
 * 旧名 `dm` 的**降级**(§5 R1 + §9.2/§9.3)。
 *
 * `dm` 不是工具了 —— 连隐藏的都不是,它只是退役名表里的一个名字。参数不同形
 * (`message` vs `content`)于是转发注定不无缝,这里守的是那次降级**说人话**:
 * `message` 被 zod strip 掉、`content` 缺席,拒绝语必须逐字是那句可操作的
 * 「content 是空的」,而不是一坨 zod issue —— 模型手上还攥着原文,读懂了才会
 * 在下一轮换参数名重发。真实的派发链路(退役名 → 执行器 → 不建房)由
 * `app/collab/__tests__/dm-tool.test.ts` 那一组守。
 */
describe('legacy `dm` 的降级出口', () => {
  const tool = createSayTool(adaptersWithSpies())

  it('工具只有一个,名字是 send_message', () => {
    expect(tool.id).toBe(COLLAB_SEND_MESSAGE_TOOL_NAME)
  })

  it('`{to, message}` 过不了校验,拒绝语逐字是 COLLAB_SAY_REFUSED_EMPTY', () => {
    const parsed = tool.parameters.safeParse({ to: '阿明', message: '接口这块想跟你对一下' })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    // `to` 是合并面的正式参数,活着 —— 丢的只有正文,所以拒绝语说的正是它。
    expect(tool.formatValidationError?.(parsed.error)).toBe(COLLAB_SAY_REFUSED_EMPTY)
  })

  it('与降级无关的校验错误不被冒充成"content 是空的"', () => {
    const parsed = tool.parameters.safeParse({ content: '在吗', mentions: 42 })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const message = tool.formatValidationError?.(parsed.error) ?? ''
    expect(message).not.toBe(COLLAB_SAY_REFUSED_EMPTY)
    expect(message).toContain('mentions')
  })
})
