/**
 * **真机验收:中途追话真的插得进去**(2026-08-12)。
 *
 * 默认跳过 —— 它花钱、要网络、要本机装着 claude。跑它:
 *
 * ```
 * ONETHING_REAL_CLI=1 npx vitest run \
 *   packages/onething-runtime/src/external-agents/__tests__/claude-code-steering.real-cli.test.ts
 * ```
 *
 * 存在的理由是「代理可自证」:`claude-code-steering.test.ts` 验的是我们**以为**
 * 发出去的形状,而 `priority:'now'` 的真实语义在 sdk.d.ts 里一个字都没写 —— 它是
 * 实测出来的。所以这条断言必须打在**模型的输出**上:一个正在数数的回合,被一句
 * 「别数了,只回 PIVOT-OK-PARIS」就地掰弯,而且掰弯发生在它数完 60 之前。
 *
 * 用的是**真的连接器**(不是直接调 SDK):要验的正是我们那条输入迭代器 +
 * `steer()` + 「result 不是终点」的收口判据串起来还成不成立。
 */
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import { createClaudeCodeConnector } from '../claude-code-connector.js'
import type { ExternalAgentEvent } from '../types.js'

const PIVOT = 'PIVOT-OK-PARIS'
/**
 * 一个**够长**的回合,好让追话有地方插进去。
 *
 * 注意这里**没有**「Do not stop early」之类的话:第一版写了,于是这条用例实际在测
 * 「模型听原指令还是听插话」—— 一个模型自己的选择,不是传输层的事。真机上因此出现
 * 过截断成功、模型却接着把数字数完的跑法。要验的是「插话到没到模型眼前」,所以别把
 * 一条互相打架的指令塞进题面。
 */
const LONG_PROMPT = 'Write the numbers 1 through 60, one per line, each formatted exactly as '
  + '"N -- <a five word english phrase>". No preamble.'
/**
 * 追话是一个**问句**而不是一道反命令。同上:反命令测的是服从性,问句测的是到达性。
 */
const STEER = `Quick side question, answer this instead: what is the capital of France? `
  + `Reply with exactly this one line and nothing else: ${PIVOT}`

describe.skipIf(!process.env.ONETHING_REAL_CLI)('claude-code steering (real CLI)', () => {
  it('长回合中途追话:模型可见地转向', async () => {
    const connector = createClaudeCodeConnector({
      // 提问 / 审批都不装:这一轮纯文本,不该碰任何工具。装上反而多一条变量。
      userDialogKinds: [],
      logger: console,
    })

    const text: string[] = []
    let steerOutcome: string | undefined
    let steeredAt = -1
    let steerScheduled = false

    const events: ExternalAgentEvent[] = []
    const run = (async () => {
      for await (const event of connector.streamTurn({
        localSessionId: 'real-cli-steer',
        messageId: 'msg-1',
        prompt: LONG_PROMPT,
        cwd: tmpdir(),
        model: 'haiku',
        thinking: 'disabled',
        turn: 0,
      })) {
        events.push(event)
        if (event.type !== 'text-delta') continue
        text.push(event.delta)
        // 等它真的数出一截来再插话(不是等墙钟:真机上从起进程到第一个 token
        // 的时间摇摆得很厉害,拿秒数当判据只会测到一个随机的时刻)。
        if (!steerScheduled && text.join('').length > 600) {
          steerScheduled = true
          steeredAt = text.join('').length
          setTimeout(() => {
            steerOutcome = connector.steer?.('real-cli-steer', STEER)
          }, 0)
        }
      }
    })()


    await run
    const full = text.join('')
    // 失败时要看得出**为什么**:一次真机跑不成的原因(模型没转向 / 转向了但正文
    // 没过来 / 回合收场收错了)在断言消息里是分不开的。
    console.log(`[real-cli] steerOutcome=${steerOutcome} steeredAt=${steeredAt} len=${full.length}`)
    console.log(`[real-cli] tail=${JSON.stringify(full.slice(-240))}`)
    console.log(`[real-cli] finishes=${JSON.stringify(
      events.flatMap(event => (event.type === 'finish' ? [event.finishReason] : [])),
    )}`)

    // 1. 追话被判成「就地插进去了」,不是排队、不是没送到。
    expect(steerOutcome).toBe('steered')
    // 2. 模型可见地转向:追话要的那一行真的出现在正文里。
    expect(full).toContain(PIVOT)
    // 3. 转向发生在**插话之后**,而且**没数完** —— 正在跑的那一轮真的被截断了,
    //    不是等它自然跑完再答。
    expect(full.indexOf(PIVOT)).toBeGreaterThanOrEqual(steeredAt)
    expect(full).not.toContain('60 -- ')
    /**
     * 4. **收场只有一次,分界正好一次**。
     *
     * 两条 result(被截断的那一轮 + 追话那一轮)翻成两条 finish,但它们是**两种**
     * 东西,不能混为一谈:
     *
     *  - `tool_calls` —— 轮分界。追话的回答因此开在**新的一轮**里,而不是黏在
     *    「…45 -- The birds fly」后面成为一句没头没尾的续写。执行器正是在这条边界上
     *    重开 turn 状态(见 `withRoundBoundary`)。
     *  - `stop` —— 真正的终点,只能有一条。多一条就是提前把回合结算掉,追话那一轮
     *    的正文会流进一个已经收场的消息里。
     */
    const finishes = events.flatMap(event => (event.type === 'finish' ? [event.finishReason] : []))
    expect(finishes).toEqual(['tool_calls', 'stop'])

    await connector.dispose()
  }, 180_000)
})
