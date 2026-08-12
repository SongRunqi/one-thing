import { createAskUserTool } from '@onething/runtime/tools'

import { Interaction } from '../../interaction/index.js'
import { NO_HUMAN_DECLINE_REASON, noHumanInTheRoom } from '../../interaction/no-human.js'

/**
 * 提问工具的装配(E1/E2 那套交互协议的第二个消费者 —— 第一个是外部 agent 的
 * `AskUserQuestion`)。
 *
 * 与其它 builtin 同一条口径:形状、措辞、收场翻译在产品层
 * (`tools/builtin/ask-user.ts`),真的挂起一条等待、真的往 EventBus 广播、真的做
 * 通道亲和的那台机器在 `@onething/core/interaction`。这里只是那条接线,外加一件
 * 只有装配层知道的事:**这条会话所在的场合里有没有人**。
 *
 * **只进桌面全量档**:headless 与 readonly 都不注册它。那两档没有人在屏幕前 ——
 * 注册一个没有人能答的提问工具,等于在工具清单里写一句谎话,而它的代价是模型
 * 真的会去调,然后挂到 deadline。
 *
 * 派工(task)开出来的工作会话**不屏蔽**:它是一条普通会话,人点进去就能答。
 */
export const AskUserTool = createAskUserTool({
  ask: async input => {
    // pair 房里没有人类。当场 declined 并把「这里没人能回答你」写给模型,
    // 而不是让它在一间空房里等到 deadline —— 与外部 agent 那条桥共用同一道门。
    if (noHumanInTheRoom(input.sessionId)) {
      return { id: '', answers: {}, outcome: 'declined', reason: NO_HUMAN_DECLINE_REASON }
    }
    return Interaction.ask({
      sessionId: input.sessionId,
      origin: 'host-tool',
      questions: input.questions,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      timeoutMs: input.timeoutMs,
    })
  },
  abort: input => {
    Interaction.abort({
      sessionId: input.sessionId,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      reason: input.reason,
    })
  },
})
