import { agentContentToText } from '@onething/core/agent-loop'
import type {
  AgentProvider,
  AgentTurnRequest,
  AgentTurnStreamEvent,
} from '@onething/core/agent-loop'
import type {
  ExternalAgentConnector,
  ExternalAgentSessionLink,
} from './types.js'

export interface CreateExternalAgentProviderOptions {
  providerId: string
  connector: ExternalAgentConnector
  localSessionId?: string
  workingDirectory?: string
  messageId?: string
  /** Previously persisted link for this session, to resume the external session. */
  resolveSessionLink?: (localSessionId: string) => ExternalAgentSessionLink | undefined
  /** Persist the (new or refreshed) link as soon as the turn establishes it. */
  onSessionLink?: (link: ExternalAgentSessionLink) => void
}

/** 未绑工作目录时回给用户的那句人话。导出是为了让测试与宿主复用同一份措辞。 */
export const UNBOUND_WORKING_DIRECTORY_NOTICE =
  '⚠️ 此会话未绑定工作目录,外部 agent 没有启动。\n\n'
  + '请先用 `/cd <路径>` 指定一个目录,或在会话设置里绑定工作目录,然后重发这条消息。'

function latestUserPrompt(request: AgentTurnRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index--) {
    const message = request.messages[index]
    if (message.role !== 'user') continue
    const text = agentContentToText(message.content).trim()
    if (text) return text
  }
  return ''
}

/**
 * 整份 system prompt(E4/G9)。
 *
 * 在此之前这里只取最后一条 user 文本,system 位**整个被丢掉** —— 于是群里的 Iris
 * 不是 Iris:她的 persona(agents.json 里那段「a designer with sharp taste and a
 * sharper tongue」)在房间回合里就是 system prompt 的全部内容
 * (`app/engine/prompt/system-prompt.ts:151` 注释:persona already IS the system
 * prompt),丢了它就只剩一台通用的 Claude Code。
 *
 * 引擎把 system prompt 放在 `messages` 的 system 位(`core/agent-loop/prompts.ts`),
 * 与 claude/gemini provider 的取法逐字一致;多条按顺序拼(压缩摘要也走这一位)。
 */
function systemPrompt(request: AgentTurnRequest): string {
  return request.messages
    .filter(message => message.role === 'system')
    .map(message => agentContentToText(message.content).trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Adapts an ExternalAgentConnector to the engine's AgentProvider seam:
 * connector-level events (session-established, agent-status) are consumed
 * here; everything else is the AgentTurnStreamEvent vocabulary already.
 */
export function createExternalAgentProvider(
  options: CreateExternalAgentProviderOptions,
): AgentProvider {
  return {
    id: options.providerId,
    // Capabilities come from the connected agent, not the model ledger.
    capabilitiesAreSelfDeclared: true,
    capabilities: {
      capabilities: ['text-input', 'text-output', 'streaming', 'reasoning'],
      inputModalities: ['text'],
      outputModalities: ['text'],
      supportsStreaming: true,
      supportsReasoning: options.connector.capabilities.thinking,
      /**
       * 仍是 false —— 而 E3 之后这句话的含义变了,值得写清楚。
       *
       * 它答的是「**引擎的工具循环**要不要为这个 provider 装载工具」,答案是不要:
       * 外部 agent 的工具在它自己的循环里执行,引擎再装一份只会把同一批工具发两遍,
       * 然后等一个永远不会回到我们这条循环里的结果。
       *
       * 协作工具**不走这条路**:它们经进程内 MCP 直接注入 SDK(E3,§2
       * `host-mcp/`),由 connector 的 `hostToolSurface` 在每一轮解析、由**我们的**
       * 执行器执行。所以「没有工具面」这个 §0 诊断已经不成立了 —— 工具面回来了,
       * 只是它接在 connector 上,不接在这里。
       *
       * 这一位翻真要等 E2:那时 AgentExecutor 抽象接管「工具装载看 `hostTools`」,
       * 引擎不再从 provider 的这一位推断任何东西。
       */
      supportsTools: false,
    },

    async *streamTurn(request: AgentTurnRequest): AsyncGenerator<AgentTurnStreamEvent, void, void> {
      const prompt = latestUserPrompt(request)
      if (!prompt) throw new Error(`${options.providerId} prompt is empty`)

      /**
       * **未绑工作目录 = 不开跑**(2026-08-11 止血,审计「四堵墙」之二)。
       *
       * 这里以前兜底 `process.cwd()`:开发时那恰好是仓库根,于是看着像能用;
       * 打包之后主进程的 cwd 是 `/`,外部 agent 于是在一个空目录里困惑地摸索,
       * 而界面上一个字的提示都没有。兜底给的不是韧性,是一次静默的错误现场。
       *
       * 拒绝的形状与失败 result 同一套(`claude-code-connector.ts` 的
       * `claudeCodeFailureNotice`):一条可见正文 + `finish(error)`。不 throw ——
       * 抛出去只会在别处变成一条堆栈,用户要的是「我该做什么」。
       */
      const cwd = options.workingDirectory?.trim()
      if (!cwd) {
        yield { type: 'text-delta', turn: request.turn, delta: UNBOUND_WORKING_DIRECTORY_NOTICE }
        yield { type: 'finish', turn: request.turn, finishReason: 'error' }
        return
      }

      const system = systemPrompt(request)
      const localSessionId = options.localSessionId ?? `${options.providerId}-${request.model}`
      const resume = options.connector.capabilities.resume
        ? options.resolveSessionLink?.(localSessionId)
        : undefined

      for await (const event of options.connector.streamTurn({
        localSessionId,
        messageId: options.messageId,
        prompt,
        ...(system ? { systemPrompt: system } : {}),
        // `||`: unbound sessions arrive with an empty-string working dir.
        cwd,
        // The provider id doubles as the picker's pseudo-model; only a real
        // model override is forwarded to the connector.
        model: request.model === options.providerId ? undefined : request.model,
        thinking: request.thinking,
        reasoningEffort: request.reasoningEffort,
        turn: request.turn,
        abortSignal: request.abortSignal,
        resume,
      })) {
        if (event.type === 'session-established') {
          options.onSessionLink?.(event.link)
          continue
        }
        if (event.type === 'agent-status') continue
        yield event
      }
    },
  }
}
