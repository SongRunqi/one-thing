/**
 * 图片链路(2026-08-12,审计 `claude-code-sdk-audit-2026-08-11` 的
 * 「图片静默丢弃(imagesIn:false 且只取文本)」)。
 *
 * 用户的原话是「我发的图片他是否收到了?我根本没验证过」。这一组断言回答的正是
 * 那句话的三个分支:**送到了**(内容块形状对不对)、**没全送到**(截了要说)、
 * **送不到**(引擎接不住时也要说)。一条都不许静默。
 */
import { describe, expect, it } from 'vitest'
import {
  CLAUDE_CODE_MAX_IMAGES_PER_TURN,
  CLAUDE_CODE_MAX_IMAGE_BYTES,
  CLAUDE_CODE_MAX_IMAGE_TOTAL_BYTES,
  claudeCodePromptContent,
  createClaudeCodeConnector,
} from '../claude-code-connector.js'
import type { ClaudeCodeSdkMessage, ClaudeCodeSdkUserMessage } from '../claude-code-connector.js'
import {
  createExternalAgentProvider,
  externalAgentImagesUnsupportedNotice,
} from '../provider.js'
import type {
  ExternalAgentCapabilities,
  ExternalAgentConnector,
  ExternalAgentEvent,
  ExternalAgentTurnRequest,
} from '../types.js'

/** 一张 1×1 的真 PNG,base64 原样取自 `data:` URL 的负载。 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`

/** 解码后至少 `bytes` 字节的 base64 串(不真的造图 —— 量的是长度)。 */
function base64OfBytes(bytes: number): string {
  return 'A'.repeat(Math.ceil(bytes / 3) * 4)
}

async function collect(events: AsyncIterable<ExternalAgentEvent>): Promise<ExternalAgentEvent[]> {
  const out: ExternalAgentEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

describe('claudeCodePromptContent', () => {
  it('图片随文本进同一条消息,base64 与 media_type 都对得上', () => {
    const { blocks, notice } = claudeCodePromptContent('图里是什么字母?', [
      { image: TINY_PNG_DATA_URL },
    ])
    expect(notice).toBeUndefined()
    expect(blocks).toEqual([
      { type: 'text', text: '图里是什么字母?' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: TINY_PNG_BASE64 },
      },
    ])
  })

  it('多图按原序全部进去', () => {
    const { blocks } = claudeCodePromptContent('两张', [
      { image: TINY_PNG_DATA_URL },
      { image: `data:image/jpeg;base64,${TINY_PNG_BASE64}` },
    ])
    expect(blocks).toHaveLength(3)
    expect(blocks[1]).toMatchObject({ source: { media_type: 'image/png' } })
    expect(blocks[2]).toMatchObject({ source: { media_type: 'image/jpeg' } })
  })

  it('裸 base64 用 mediaType 兜底;http(s) 走 url source', () => {
    const { blocks } = claudeCodePromptContent('x', [
      { image: TINY_PNG_BASE64, mediaType: 'image/webp' },
      { image: 'https://example.com/a.png' },
    ])
    expect(blocks[1]).toMatchObject({ source: { type: 'base64', media_type: 'image/webp' } })
    expect(blocks[2]).toEqual({
      type: 'image',
      source: { type: 'url', url: 'https://example.com/a.png' },
    })
  })

  /**
   * 回归线:这次改动不许动到每一个不发图的普通回合。空文本也保持原样 —— 它是
   * `ClaudeCodePromptStream` 从前的逐字形状。
   */
  it('无图的回合形状逐字不变', () => {
    expect(claudeCodePromptContent('list files').blocks)
      .toEqual([{ type: 'text', text: 'list files' }])
    expect(claudeCodePromptContent('', []).blocks)
      .toEqual([{ type: 'text', text: '' }])
  })

  it('只有图、没有文字时不造空文本块', () => {
    const { blocks } = claudeCodePromptContent('', [{ image: TINY_PNG_DATA_URL }])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'image' })
  })

  it('超过单轮张数上限:截到上限,并把截掉的说清楚', () => {
    const images = Array.from(
      { length: CLAUDE_CODE_MAX_IMAGES_PER_TURN + 2 },
      () => ({ image: TINY_PNG_DATA_URL }),
    )
    const { blocks, notice } = claudeCodePromptContent('好多图', images)
    // 1 个文本块 + 上限张图片
    expect(blocks).toHaveLength(CLAUDE_CODE_MAX_IMAGES_PER_TURN + 1)
    expect(notice).toContain('2 张图片未送达')
    expect(notice).toContain(`超过单轮 ${CLAUDE_CODE_MAX_IMAGES_PER_TURN} 张上限`)
    expect(notice).toContain(`其余 ${CLAUDE_CODE_MAX_IMAGES_PER_TURN} 张已随这条消息送达`)
    // 说明同时写给模型 —— 否则它会以为自己拿到了全部图片。
    expect(blocks[0]).toMatchObject({ type: 'text' })
    expect((blocks[0] as { text: string }).text).toContain('未送达')
  })

  it('单张超限:截掉那一张并报出它的体积', () => {
    const { blocks, notice } = claudeCodePromptContent('大图', [
      { image: base64OfBytes(CLAUDE_CODE_MAX_IMAGE_BYTES + 1024), mediaType: 'image/png' },
      { image: TINY_PNG_DATA_URL },
    ])
    expect(blocks.filter(block => block.type === 'image')).toHaveLength(1)
    expect(notice).toContain('第 1 张')
    expect(notice).toContain('超过单张 5.0 MB 上限')
  })

  it('总量超限:先到先得,超出的如实说明', () => {
    // 每张都在单张上限之内,合起来才越线 —— 这一条量的正是总量那道闸。
    const each = CLAUDE_CODE_MAX_IMAGE_BYTES - 1024
    const fits = Math.floor(CLAUDE_CODE_MAX_IMAGE_TOTAL_BYTES / each)
    const images = Array.from(
      { length: fits + 1 },
      () => ({ image: base64OfBytes(each), mediaType: 'image/png' }),
    )
    const { blocks, notice } = claudeCodePromptContent('一堆大图', images)
    expect(blocks.filter(block => block.type === 'image')).toHaveLength(fits)
    expect(notice).toContain('本轮图片总量超过')
  })

  it('不受支持的格式不上路 —— 一个 400 会打掉整轮', () => {
    const { blocks, notice } = claudeCodePromptContent('heic', [
      { image: `data:image/heic;base64,${TINY_PNG_BASE64}` },
    ])
    expect(blocks.some(block => block.type === 'image')).toBe(false)
    expect(notice).toContain('格式 image/heic 不受支持')
    expect(notice).toContain('本轮仅文本生效')
  })
})

describe('ClaudeCodeConnector 图片输入', () => {
  const initMessage: ClaudeCodeSdkMessage = { type: 'system', subtype: 'init', session_id: 's' }
  const resultMessage: ClaudeCodeSdkMessage = { type: 'result', subtype: 'success', session_id: 's' }

  function connectorCapturing(captured: ClaudeCodeSdkUserMessage[]) {
    return createClaudeCodeConnector({
      queryFn: params => {
        void (async () => {
          for await (const message of params.prompt) captured.push(message)
        })()
        return (async function* () {
          yield initMessage
          yield resultMessage
        })()
      },
    })
  }

  it('把图片送进 SDKUserMessage 的 content 里', async () => {
    const captured: ClaudeCodeSdkUserMessage[] = []
    await collect(connectorCapturing(captured).streamTurn({
      localSessionId: 's',
      prompt: '图里是什么字母?',
      images: [{ image: TINY_PNG_DATA_URL }],
      cwd: '/tmp',
      turn: 1,
    }))
    expect(captured[0]?.message.content).toEqual([
      { type: 'text', text: '图里是什么字母?' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: TINY_PNG_BASE64 } },
    ])
  })

  it('截掉的图片在正文里说清楚 —— 用户看得见,不是只有模型知道', async () => {
    const captured: ClaudeCodeSdkUserMessage[] = []
    const events = await collect(connectorCapturing(captured).streamTurn({
      localSessionId: 's',
      prompt: 'x',
      images: [{ image: `data:image/heic;base64,${TINY_PNG_BASE64}` }],
      cwd: '/tmp',
      turn: 1,
    }))
    const notice = events.find(
      event => event.type === 'text-delta' && event.delta.includes('未送达'),
    )
    expect(notice).toBeDefined()
  })
})

describe('createExternalAgentProvider 图片链路', () => {
  function stubConnector(
    captured: ExternalAgentTurnRequest[],
    capabilities: Partial<ExternalAgentCapabilities> = {},
  ): ExternalAgentConnector {
    return {
      id: 'claude-code-agent',
      capabilities: {
        streamingText: true,
        thinking: true,
        toolSteps: true,
        permissionBridge: 'callback',
        resume: true,
        fork: true,
        steer: false,
        imagesIn: true,
        mcpInjection: 'in-process',
        concurrentSessions: 'per-process',
        ...capabilities,
      },
      async *streamTurn(request) {
        captured.push(request)
        yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
      },
      async interrupt() {},
      async dispose() {},
    }
  }

  it('最后一条用户消息的图片被送到连接器(image 与 image/* file 两种部件都算)', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: stubConnector(captured),
      localSessionId: 'session-1',
      workingDirectory: '/tmp/project',
    })
    for await (const _event of provider.streamTurn!({
      model: 'claude-code-agent',
      messages: [
        { role: 'user', content: [{ type: 'text', text: '旧的一轮' }, { type: 'image', image: 'data:image/png;base64,OLD' }] },
        { role: 'assistant', content: '好' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '图里是什么字母?' },
            { type: 'image', image: TINY_PNG_DATA_URL },
            { type: 'file', data: 'data:image/webp;base64,ZZZ', mediaType: 'image/webp' },
            { type: 'file', data: 'JVBER', mediaType: 'application/pdf' },
          ],
        },
      ],
      turn: 1,
    })) { /* drain */ }

    expect(captured[0]?.prompt).toBe('图里是什么字母?')
    // 只取**这一条**消息的图 —— 上一轮那张不许混进来。
    expect(captured[0]?.images).toEqual([
      { image: TINY_PNG_DATA_URL },
      { image: 'data:image/webp;base64,ZZZ', mediaType: 'image/webp' },
    ])
  })

  it('能力表决定声明:imagesIn 翻假,vision-input 就没了', () => {
    const withImages = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: stubConnector([]),
      workingDirectory: '/tmp',
    })
    expect(withImages.capabilities?.inputModalities).toEqual(['text', 'image'])
    expect(withImages.capabilities?.capabilities).toContain('vision-input')

    const withoutImages = createExternalAgentProvider({
      providerId: 'acp',
      connector: stubConnector([], { imagesIn: false }),
      workingDirectory: '/tmp',
    })
    expect(withoutImages.capabilities?.inputModalities).toEqual(['text'])
    expect(withoutImages.capabilities?.capabilities).not.toContain('vision-input')
  })

  it('接不住图的连接器:不偷偷剥掉,而是当场说没送到', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'acp',
      connector: stubConnector(captured, { imagesIn: false }),
      workingDirectory: '/tmp/project',
    })
    const events: AgentEventLike[] = []
    for await (const event of provider.streamTurn!({
      model: 'acp',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: '看图' }, { type: 'image', image: TINY_PNG_DATA_URL }],
      }],
      turn: 1,
    })) events.push(event as AgentEventLike)

    expect(events[0]).toMatchObject({
      type: 'text-delta',
      delta: externalAgentImagesUnsupportedNotice(1),
    })
    // 文本照跑,图片一张都没塞给接不住的连接器。
    expect(captured[0]?.images).toBeUndefined()
    expect(captured[0]?.prompt).toBe('看图')
  })

  it('只有图、又接不住:一条可见正文 + finish(error),绝不静默', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'acp',
      connector: stubConnector(captured, { imagesIn: false }),
      workingDirectory: '/tmp/project',
    })
    const events: AgentEventLike[] = []
    for await (const event of provider.streamTurn!({
      model: 'acp',
      messages: [{ role: 'user', content: [{ type: 'image', image: TINY_PNG_DATA_URL }] }],
      turn: 1,
    })) events.push(event as AgentEventLike)

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'text-delta' })
    expect(events[1]).toMatchObject({ type: 'finish', finishReason: 'error' })
    expect(captured).toHaveLength(0)
  })

  it('只有图、接得住:不再当成空 prompt 抛错', async () => {
    const captured: ExternalAgentTurnRequest[] = []
    const provider = createExternalAgentProvider({
      providerId: 'claude-code-agent',
      connector: stubConnector(captured),
      workingDirectory: '/tmp/project',
    })
    for await (const _event of provider.streamTurn!({
      model: 'claude-code-agent',
      messages: [{ role: 'user', content: [{ type: 'image', image: TINY_PNG_DATA_URL }] }],
      turn: 1,
    })) { /* drain */ }
    expect(captured[0]?.prompt).toBe('')
    expect(captured[0]?.images).toEqual([{ image: TINY_PNG_DATA_URL }])
  })
})

type AgentEventLike = { type: string; delta?: string; finishReason?: string }
