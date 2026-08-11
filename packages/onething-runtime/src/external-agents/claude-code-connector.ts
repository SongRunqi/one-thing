import type {
  AgentReasoningEffort,
  AgentToolCall,
  AgentToolResult,
  AgentTurnStreamEvent,
  AgentUsage,
} from '@onething/core/agent-loop'
import { createTwoFilesPatch } from 'diff'
import { findAgentExecutorDescriptor } from '../agents/executor/capabilities.js'
import { onethingClaudeModelFamily } from '../providers/model-capability.js'
import { countLineChanges } from '../tools/file-snapshot.js'
import { trimDiff, truncateDiffForDisplay } from '../tools/replacers.js'
import {
  isHostMcpToolName,
  stripHostMcpToolPrefix,
  type HostMcpSurfaceResolver,
} from './host-mcp/index.js'
import type {
  ExternalAgentCapabilities,
  ExternalAgentConnector,
  ExternalAgentEvent,
  ExternalAgentInteractionHandler,
  ExternalAgentObserver,
  ExternalAgentPermissionHandler,
  ExternalAgentSessionLink,
  ExternalAgentTurnRequest,
} from './types.js'
import type { InteractionAnswer, InteractionQuestion } from '@onething/core/interaction'

export const CLAUDE_CODE_AGENT_CONNECTOR_ID = 'claude-code-agent'

/**
 * Structural subsets of the Claude Agent SDK message stream
 * (@anthropic-ai/claude-agent-sdk SDKMessage). Kept structural so tests can
 * replay fixtures and the SDK stays a soft dependency of this module.
 */
interface SdkStreamEventDelta {
  type: string
  text?: string
  thinking?: string
  partial_json?: string
}

interface SdkContentBlock {
  type: string
  id?: string
  name?: string
  input?: unknown
  text?: string
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

export interface ClaudeCodeSdkMessage {
  type: string
  subtype?: string
  session_id?: string
  parent_tool_use_id?: string | null
  event?: {
    type: string
    index?: number
    content_block?: SdkContentBlock
    delta?: SdkStreamEventDelta
  }
  message?: {
    role?: string
    content?: SdkContentBlock[] | string
  }
  result?: string
  is_error?: boolean
  /**
   * `SDKPermissionDeniedMessage`(`sdk.d.ts:4113-4137`)独有的几位。它是
   * `type:'system'` 的一个 subtype,与上面那些字段住在同一条消息类型上。
   *
   * 注意它的**拒绝原文写在 `message` 字段里,而那是一个 string** —— 与助手/用户
   * 消息上的 `message: { role, content }` 同名不同型。两者不合并:合成一个联合类型
   * 会把所有 `message.content` 的读点都变成带守卫的分支,而它们要读的从来只有对象
   * 那一支。这一位在 `permissionDeniedNotice` 里就地取,只在那一处。
   */
  tool_name?: string
  tool_use_id?: string
  decision_reason?: string
  decision_reason_type?: string
  num_turns?: number
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface ClaudeCodeQueryOptions {
  cwd?: string
  model?: string
  resume?: string
  pathToClaudeCodeExecutable?: string
  includePartialMessages?: boolean
  permissionMode?: string
  env?: Record<string, string | undefined>
  /**
   * SDK 的 `ThinkingConfig`(`sdk.d.ts` 的 `ThinkingAdaptive`/`ThinkingEnabled`/
   * `ThinkingDisabled`)。`display` 不是装饰:缺省时 SDK 走 redacted,
   * `thinking_delta` 只有事件没有正文,思考面板因此永远是空的。
   */
  thinking?:
    | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
    | { type: 'enabled'; budgetTokens: number; display?: 'summarized' | 'omitted' }
    | { type: 'disabled' }
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  abortController?: AbortController
  /**
   * 进程内 MCP 服务器(E3 宿主工具面)。键是服务器名,值是
   * `{ type: 'sdk', name, instance }`(SDK 的 `McpSdkServerConfigWithInstance`)。
   * 结构保持宽松,SDK 因此仍是这个模块的软依赖。
   */
  mcpServers?: Record<string, unknown>
  /**
   * SDK 的 `systemPrompt`(`sdk.d.ts:1990`)。三种形状里我们用 preset+append:
   * 换成裸字符串会把 Claude Code 自己那份操作说明(Read/Write/Bash 怎么用)
   * 整个替掉,persona 到位了工具却不会用了。
   */
  systemPrompt?: string | string[] | {
    type: 'preset'
    preset: 'claude_code'
    append?: string
    excludeDynamicSections?: boolean
  }
  /**
   * SDK 的 `settingSources`(`sdk.d.ts:1873-1883`,取值 `SettingSource =
   * 'user' | 'project' | 'local'`,见 `sdk.d.ts:6541`)。三者是**三个并列的源**:
   * `~/.claude/settings.json` / `<cwd>/.claude/settings.json` /
   * `<cwd>/.claude/settings.local.json` —— 'project' 不含 local。
   * 缺席 = 全加载(CLI 默认),`[]` = 一份文件系统设置都不读。
   */
  settingSources?: ('user' | 'project' | 'local')[]
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
    /** SDK 的 options 还有 suggestions/title/requestId 等;这里只取用得上的。 */
    options: { signal: AbortSignal; toolUseID?: string },
  ) => Promise<
    | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
    | { behavior: 'deny'; message: string }
  >
  /**
   * `request_user_dialog` 的宿主渲染回调(`sdk.d.ts:1287-1289`)。
   * 结果只有两种形状:`{behavior:'completed', result}` 与 `{behavior:'cancelled'}`,
   * 后者是「答不上来」的**规定答法**(CLI 转而执行该 dialog 的默认行为)。
   */
  onUserDialog?: (
    request: { dialogKind: string; payload: Record<string, unknown>; toolUseID?: string },
    options: { signal: AbortSignal },
  ) => Promise<{ behavior: 'completed'; result: unknown } | { behavior: 'cancelled' }>
  /**
   * 我们真能画出来的 dialog kinds(`sdk.d.ts:1551` / `3405`,注意名字是
   * `supportedDialogKinds`,不是方案里写的 `userDialogKinds`)。
   *
   * **缺席 = 不能显示,CLI 就地失败关闭** —— 只给 `onUserDialog` 而不声明这张表,
   * 一个 dialog 都不会发过来。这正是今天那一半静默。
   */
  supportedDialogKinds?: string[]
}

export type ClaudeCodeQueryFn = (params: {
  prompt: string
  options: ClaudeCodeQueryOptions
}) => AsyncIterable<ClaudeCodeSdkMessage>

export interface ClaudeCodeConnectorOptions {
  /** Absolute path to the locally installed claude executable. */
  executablePath?: string
  permissionHandler?: ExternalAgentPermissionHandler
  /**
   * 提问落点(E4,§4)。**不装 = 没有落点**:`AskUserQuestion` 与 `onUserDialog`
   * 都退回「当场拒绝 / cancelled」,而不是挂着等一个不会来的答案。
   */
  interactionHandler?: ExternalAgentInteractionHandler
  /**
   * 覆盖 `supportedDialogKinds`。给空数组 = 一个 dialog 都不接(退回 E4 之前的
   * 形状:CLI 走每个 dialog 的默认行为)。装配层因此不必改代码就能关掉这条路。
   */
  userDialogKinds?: string[]
  /**
   * The SDK's query(); injectable for fixture-replay tests. Default lazily
   * imports @anthropic-ai/claude-agent-sdk.
   */
  queryFn?: ClaudeCodeQueryFn
  now?: () => number
  logger?: Pick<Console, 'log' | 'warn'>
  /**
   * Environment for the spawned CLI, resolved per turn. Hosts use this to
   * inject the app's proxy settings — a GUI-launched app has no shell proxy
   * env, and a direct connection gets region-blocked by the API (403
   * "Request not allowed").
   */
  resolveSpawnEnv?: () => Record<string, string | undefined> | undefined
  /**
   * 宿主工具面(E3,§2)。装配层实现它 —— 它认识 store、工具注册表、v3 回合登记簿,
   * 而这个模块一个都不该认识。
   *
   * **不装 = 不注入**,与 E3 之前逐字同形:外部 agent 只有 SDK 自带的工具,发言
   * 靠收养兜底。装上之后协作工具经进程内 MCP 进去,发言权回到房间。
   */
  hostToolSurface?: HostMcpSurfaceResolver
  /**
   * 观测口(E6,§6)。**不装 = 不记账**,外部回合在调度时间轴上退回 E6 之前的
   * 那一片空白 —— 不影响这一轮跑不跑得成。
   */
  observer?: ExternalAgentObserver
}

/**
 * 这个执行器接不接宿主工具 —— **从 E0 的能力表读**,不在这里硬编码。
 *
 * 判据写死成 `providerId === 'claude-code-agent'` 的话,能力表就成了一份没人读的
 * 文档:把 `hostTools` 翻成 false 不会改变任何行为,而那正是「声明与真实能力分家」
 * 的开始(原则 5)。表里那一行现在有了读者,翻它就真的会停掉注入。
 */
function executorAcceptsHostTools(): boolean {
  return findAgentExecutorDescriptor(CLAUDE_CODE_AGENT_CONNECTOR_ID)
    ?.capabilities.hostTools === true
}

const CLAUDE_CODE_CAPABILITIES: ExternalAgentCapabilities = {
  streamingText: true,
  thinking: true,
  toolSteps: true,
  permissionBridge: 'callback',
  resume: true,
  fork: true,
  steer: false,
  imagesIn: false,
  mcpInjection: 'in-process',
  concurrentSessions: 'per-process',
}

function claudeCodeEffort(
  effort: AgentReasoningEffort,
): NonNullable<ClaudeCodeQueryOptions['effort']> {
  return effort === 'minimal' ? 'low' : effort
}

/**
 * The CLI's default model when no override is sent. `provider.ts` erases the
 * picker's pseudo-model to `undefined` (the pseudo-model is not a real model
 * id), so "no model" is the **common** case here, not an edge one — and the
 * family semantics below must therefore have an answer for it rather than
 * bailing out. Whatever the CLI ships as default is an adaptive-family,
 * non-alwaysThinking model; that is the assumption encoded here.
 */
const CLAUDE_CODE_DEFAULT_MODEL_FAMILY = { adaptive: true, alwaysThinking: false } as const

/**
 * Thinking/effort knobs for the CLI, mirroring the claude API provider's
 * family semantics (`agent-loop/providers/claude.ts` streamTurn): Fable/Mythos
 * reject the `thinking` param outright and take only the effort knob; the 4.6+
 * adaptive family takes `{type:'adaptive'}` + effort; older families take
 * neither (their fixed-budget dialect is not wired through the CLI).
 *
 * Two deliberate departures from the raw API body:
 *
 * - `display: 'summarized'` is attached to the adaptive config. Without it the
 *   SDK streams **redacted** thinking — `thinking_delta` events arrive with no
 *   text — so the thinking panel stays empty however hard the model thinks.
 *   It is the only switch that puts prose on the wire.
 * - An unknown model is treated as the CLI default (see the constant above)
 *   instead of skipping the override. Otherwise `thinking: 'disabled'` is
 *   never sent on the pseudo-model path, and the Off setting is unswitchable.
 */
function claudeCodeThinkingOptions(
  request: Pick<ExternalAgentTurnRequest, 'model' | 'thinking' | 'reasoningEffort'>,
): Pick<ClaudeCodeQueryOptions, 'thinking' | 'effort'> {
  const family = request.model
    ? onethingClaudeModelFamily(request.model)
    : CLAUDE_CODE_DEFAULT_MODEL_FAMILY

  if (request.thinking === 'disabled') {
    if (family.adaptive && !family.alwaysThinking) {
      return { thinking: { type: 'disabled' } }
    }
    return {}
  }

  if (request.thinking === 'enabled') {
    const effort = request.reasoningEffort
      ? { effort: claudeCodeEffort(request.reasoningEffort) }
      : {}
    // Fable/Mythos think unconditionally and reject the param — sending it
    // would fail the turn outright, so the summarized display is not
    // available there.
    if (family.alwaysThinking || !family.adaptive) return effort
    return { thinking: { type: 'adaptive', display: 'summarized' }, ...effort }
  }

  return {}
}

async function defaultQueryFn(params: {
  prompt: string
  options: ClaudeCodeQueryOptions
}): Promise<AsyncIterable<ClaudeCodeSdkMessage>> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  return sdk.query(params as never) as AsyncIterable<ClaudeCodeSdkMessage>
}

function usageFromResult(message: ClaudeCodeSdkMessage): AgentUsage | undefined {
  const usage = message.usage
  if (!usage) return undefined
  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ...(usage.cache_read_input_tokens !== undefined
      ? { cacheReadTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage.cache_creation_input_tokens !== undefined
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
  }
}

/**
 * 一条失败 result 的**人话**。SDK 把「为什么失败」写在 `result` 字段里(限流提示、
 * 额度用尽、登录过期、resume 的会话不存在……),这里原样带出来 —— 我们既不解读也不
 * 改写它,只保证它上得了屏。`subtype` 一并写进去:`error_max_turns` 与
 * `error_during_execution` 在排障时是两个完全不同的结论。
 */
export function claudeCodeFailureNotice(message: ClaudeCodeSdkMessage): string {
  const subtype = (message.subtype || 'error').trim()
  const detail = typeof message.result === 'string' ? message.result.trim() : ''
  const head = `⚠️ Claude Code 回合失败(${subtype})`
  return detail
    ? `${head}:\n\n${detail}`
    : `${head}。SDK 没有给出更多信息 —— 常见原因是限流、额度用尽或登录过期,请到设置里核对 Claude Code 的登录状态。`
}

/**
 * 一次 **auto-deny 的人话**(P1-3,`docs/audit/claude-code-sdk-audit-2026-08-11.md`
 * 「两不管地带」)。
 *
 * `SDKPermissionDeniedMessage` 覆盖的是 CLI 侧**没有走交互审批**就拒掉的那一支
 * (deny 规则、dontAsk、classifier、headless auto-deny)。它不经 `canUseTool`,
 * 所以 onething 的审批面从头到尾没见过这次调用 —— 翻译器又只认四种消息类型,
 * 于是被拒的工具在 UI 上凭空消失:用户只看到模型忽然改口,不知道是谁拦的。
 *
 * `decision_reason` 是拒的那个组件写的人话,`message` 是回给模型的那句;两者都可能
 * 缺席,所以逐级回落,并把 `decision_reason_type`(rule / mode / classifier …)带上
 * —— 「被规则拦了」与「被模型分类器拦了」在排障时是两个完全不同的结论。
 */
export function claudeCodePermissionDeniedNotice(message: ClaudeCodeSdkMessage): string {
  const toolName = normalizeToolName(message.tool_name)
  // 拒绝原文住在 string 形态的 `message` 上(见 ClaudeCodeSdkMessage 的说明)。
  const rejection = (message as { message?: unknown }).message
  const detail = [
    message.decision_reason,
    typeof rejection === 'string' ? rejection : '',
  ].map(text => (text ?? '').trim()).find(Boolean)
  const reasonType = message.decision_reason_type?.trim()
  const head = `⚠️ 工具 ${toolName} 被 Claude Code 侧配置拒绝`
    + (reasonType ? `(${reasonType})` : '')
  return detail
    ? `${head}:${detail}`
    : `${head}。CLI 没有给出理由 —— 常见来源是 settings 里的 deny 规则或权限模式。`
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * The CLI's Edit/Write results are plain confirmation text, so the diff the
 * app's file-edit UI expects is synthesized from the tool arguments (the
 * edited hunk, same as Claude Code's own UI) and delivered through the
 * tool-metadata channel the builtin edit tool uses.
 */
function fileChangeMetadata(
  toolName: string,
  argumentsJson: string,
): { path: string; diff: string; additions: number; deletions: number } | null {
  let args: Record<string, unknown>
  try {
    const parsed = JSON.parse(argumentsJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    args = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const path = typeof args.file_path === 'string' ? args.file_path : null
  if (!path) return null

  const lower = toolName.toLowerCase()
  let before: string | null = null
  let after: string | null = null
  if (lower === 'edit' && typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    before = args.old_string
    after = args.new_string
  } else if (lower === 'write' && typeof args.content === 'string') {
    before = ''
    after = args.content
  } else if (lower === 'multiedit' && Array.isArray(args.edits)) {
    const olds: string[] = []
    const news: string[] = []
    for (const entry of args.edits) {
      const edit = entry as { old_string?: unknown; new_string?: unknown } | null
      if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') return null
      olds.push(edit.old_string)
      news.push(edit.new_string)
    }
    if (olds.length === 0) return null
    before = olds.join('\n\n')
    after = news.join('\n\n')
  } else {
    return null
  }

  if (before === after) return null
  const diff = truncateDiffForDisplay(trimDiff(createTwoFilesPatch(path, path, before, after)))
  const { additions, deletions } = countLineChanges(before, after)
  return { path, diff, additions, deletions }
}

/* ── 提问(E4 / G6+G7) ─────────────────────────────────────────────────── */

/** SDK 自带的「问用户」工具(`sdk-tools.d.ts:847-900` 的 `AskUserQuestionInput`)。 */
export const ASK_USER_QUESTION_TOOL = 'AskUserQuestion'

/**
 * 默认声明的 dialog kinds。
 *
 * d.ts 里唯一被点名的 kind 就是 `refusal_fallback_prompt`(拒答后要不要重试),
 * 而**每个 kind 的 payload / result 形状在类型里是不透明的**
 * (`payload: Record<string, unknown>`、`result: unknown`)。所以这里的纪律是:
 *
 *  - 声明的 kind → 走通用映射去问人;答上来了才回 `completed`,
 *  - 没声明 / 没落点 / 没答上来 → 一律 `cancelled`(SDK 规定的「答不上来」答法,
 *    CLI 转而执行该 dialog 的默认行为 —— 也就是 E4 之前的形状,只会更好不会更坏)。
 *
 * 装配层可用 `userDialogKinds: []` 就地关掉这条路,不必改代码。
 */
export const DEFAULT_USER_DIALOG_KINDS = ['refusal_fallback_prompt']

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

/**
 * `AskUserQuestionInput` → E1 的 `InteractionQuestion[]`。字段逐一对得上
 * (E1 的形状就是照它设计的),两处刻意的不同:
 *
 * 1. **主键用 `id` 不用 `header`**:header 是给人看的短标签(SDK 自己写「max 12
 *    chars」),两题撞名就静默串答案。这里按下标造稳定 id。
 * 2. `allowFreeText` 恒真:SDK 说「There should be no 'Other' option, that will be
 *    provided automatically」—— 那个自动的「其他」在我们这边要显式声明出来。
 */
export function askUserQuestionToInteraction(input: unknown): InteractionQuestion[] {
  const questions = asRecord(input)?.questions
  if (!Array.isArray(questions)) return []
  const mapped: InteractionQuestion[] = []
  questions.forEach((entry, index) => {
    const question = asRecord(entry)
    const text = question ? readString(question, 'question') : undefined
    if (!question || !text) return
    const options = Array.isArray(question.options) ? question.options : []
    mapped.push({
      id: `q${index}`,
      ...(readString(question, 'header') ? { header: readString(question, 'header')! } : {}),
      question: text,
      multiSelect: question.multiSelect === true,
      options: options.flatMap(raw => {
        const option = asRecord(raw)
        const label = option ? readString(option, 'label') : undefined
        if (!option || !label) return []
        return [{
          label,
          ...(readString(option, 'description') ? { description: readString(option, 'description')! } : {}),
          ...(readString(option, 'preview') ? { preview: readString(option, 'preview')! } : {}),
        }]
      }),
      allowFreeText: true,
    })
  })
  return mapped
}

/**
 * `InteractionAnswer` → SDK 的 `AskUserQuestionOutput` 形状。
 *
 * 键是**问题原文**,不是 questionId —— d.ts 写死了「question text -> answer
 * string; multi-select answers are comma-separated」。所以这里做一次
 * questionId → 问题原文的回译;E1 用 id 当主键换来的是「两题撞名不串答案」,
 * 代价只有这一次回译。
 *
 * `response` 是「用户没选选项、自己写了一句」那一格(d.ts 的 freeform text)。
 */
export function askUserQuestionOutput(
  questions: InteractionQuestion[],
  answer: InteractionAnswer,
): Record<string, unknown> {
  const answers: Record<string, string> = {}
  let freeform: string | undefined
  for (const question of questions) {
    const entry = answer.answers[question.id]
    if (!entry) continue
    const selected = entry.selected.filter(Boolean)
    const text = selected.length > 0 ? selected.join(', ') : (entry.freeText ?? '')
    answers[question.question] = text
    if (!freeform && entry.freeText) freeform = entry.freeText
  }
  return {
    answers,
    ...(freeform ? { response: freeform } : {}),
  }
}

/**
 * `request_user_dialog` 的 payload → 一道提问。
 *
 * payload 的形状按 kind 定义,而 d.ts 把它透明地放过去(`Record<string, unknown>`),
 * 所以这里只认三样**跨 kind 都成立**的东西:一句问题、一组选项、一个标题。
 * 认不出问题就返回空表 —— 上层据此回 `cancelled`,绝不拿一张空卡去占住一个人。
 */
export function userDialogToInteraction(
  dialogKind: string,
  payload: Record<string, unknown>,
): InteractionQuestion[] {
  const question =
    readString(payload, 'question')
    ?? readString(payload, 'message')
    ?? readString(payload, 'prompt')
    ?? readString(payload, 'title')
  if (!question) return []
  const rawOptions = Array.isArray(payload.options) ? payload.options : []
  const options = rawOptions.flatMap(raw => {
    const option = asRecord(raw)
    if (!option) return typeof raw === 'string' && raw ? [{ label: raw }] : []
    const label = readString(option, 'label') ?? readString(option, 'value')
    if (!label) return []
    return [{
      label,
      ...(readString(option, 'description') ? { description: readString(option, 'description')! } : {}),
    }]
  })
  return [{
    id: 'dialog',
    header: dialogKind,
    question,
    options: options.length > 0 ? options : [{ label: '继续' }, { label: '取消' }],
    allowFreeText: true,
  }]
}

/**
 * 事件流出口的**名字归一化**(E3)。
 *
 * SDK 侧宿主工具叫 `mcp__onething__send_message`(MCP 全名的规矩),而它就是本地
 * 回合里那个 `send_message` —— 前缀说的是「这次它是怎么进到 SDK 里的」,不是
 * 「它是什么」。归一化放在这里(翻译器出口)之后,下游一个都不必改:
 *
 *  - 打字灯的 `isCollabSendCall` 认得出它,外部 agent 说话时群里的「正在输入」
 *    终于会亮 —— 此前 W19 那盏灯对外部 agent 是恒灭的;
 *  - 步骤渲染、调度日志、退役名表看到的都是与本地回合逐字相同的名字。
 *
 * `canUseTool` 那一侧**刻意不归一化**:那是 SDK 的审批口,两类工具的分界线就画在
 * 那个前缀上(见下面的 `canUseTool`)。同一个字符串在两个面上承担两件事,所以只
 * 在事件面上抹掉。
 */
function normalizeToolName(name: string | undefined): string {
  return name ? stripHostMcpToolPrefix(name) : 'tool'
}

/**
 * Per-turn translator: Claude Agent SDK message stream → normalized agent
 * events. Tool calls stream as content blocks (start → input_json_delta →
 * stop) and are marked externallyExecuted; their results arrive as
 * tool_result blocks in user messages. Everything nested under a subagent
 * (parent_tool_use_id set) is skipped — the parent Task tool call already
 * represents it.
 */
class ClaudeCodeTurnTranslator {
  private toolCallsByIndex = new Map<number, { id: string; name: string; args: string }>()
  private toolCallsById = new Map<string, AgentToolCall>()
  private settled = new Set<string>()
  /** 已经报过 `tool-call-start` 的调用 id(流式与回填两条出口共用一张表)。 */
  private started = new Set<string>()
  /** 本轮(一次模型应答)已经报出去的工具调用数。 */
  private roundToolCalls = 0
  /** 本轮的工具结果已经到齐,下一段助手内容属于**新的一轮**。 */
  private roundClosePending = false

  constructor(private turn: number) {}

  translate(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    if (message.parent_tool_use_id) return []

    switch (message.type) {
      case 'stream_event':
        return this.withRoundBoundary(this.translateStreamEvent(message))
      case 'assistant':
        return this.withRoundBoundary(this.translateAssistant(message))
      case 'user':
        return this.translateUser(message)
      case 'result':
        return this.translateResult(message)
      case 'system':
        return this.translateSystem(message)
      default:
        return []
    }
  }

  /**
   * `type:'system'` 下唯一需要上屏的一支:**auto-deny**(P1-3)。init / 其它
   * subtype 照旧沉默。
   *
   * 优先翻成**那张工具卡自己的失败结局**:这次调用的 `tool_use_id` 在流上已经有
   * 一张卡时,补一条 error 的 `tool-result` —— 卡就地结算成失败,理由写在卡上,
   * 与本地工具被拒时长得一样。CLI 随后可能还会回一条 is_error 的 tool_result,
   * `settled` 会把它挡掉,不会出现两次结算。
   *
   * 卡还没建(拒得比 `content_block_start` 还早)或已结算时才回落到一句正文 ——
   * 与失败 result 那条(`claudeCodeFailureNotice`)同一个先例:`AgentTurnStreamEvent`
   * 词表里没有 error 事件,能上屏的只有正文。
   */
  private translateSystem(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    if (message.subtype !== 'permission_denied') return []
    const notice = claudeCodePermissionDeniedNotice(message)
    const toolUseId = message.tool_use_id
    const toolCall = toolUseId ? this.toolCallsById.get(toolUseId) : undefined
    if (toolCall && toolUseId && !this.settled.has(toolUseId)) {
      this.settled.add(toolUseId)
      // 与 translateUser 同款的收尾:本轮工具结果到齐,下一段正文属于新的一轮。
      if (this.roundToolCalls > 0) this.roundClosePending = true
      return [{
        type: 'tool-result',
        turn: this.turn,
        toolCall,
        result: { content: notice, error: notice },
      }]
    }
    return this.withRoundBoundary([{ type: 'text-delta', turn: this.turn, delta: `\n\n${notice}\n` }])
  }

  /**
   * **回合分界**(F4)。
   *
   * 本地 provider 的一次 provider 请求 = 一个 turn,turn 与 turn 之间由一条
   * `finish(tool_calls)` 分开;执行器正是在这条边界上把上一 turn 的 contentParts
   * 落库、重开 turn 状态、并允许下一 turn 再种一个 `data-steps` 锚点(工具卡在正文
   * 里的落点)。一个 turn 只种一次锚点是对的 —— 本地一轮里正文永远在工具调用之前。
   *
   * Claude Code 把「应答 → 工具 → 再应答 → 再工具 → 收尾」整段跑在**一次**
   * `streamTurn` 里。不发分界的话,这一整段共用一个 turn:所有工具卡都塌到第一个
   * 锚点上,而夹在两次调用之间的正文全被甩到卡片之后 —— 这就是真机上看到的乱序。
   *
   * 所以每当上一轮的工具结果到齐、又有新的助手内容开始时,这里补一条与本地通路
   * **逐字相同**的 `finish(tool_calls)`。次序保证因此只有一套,而不是在 renderer
   * 侧另写一套排序把问题藏起来。
   */
  private withRoundBoundary(events: AgentTurnStreamEvent[]): AgentTurnStreamEvent[] {
    if (!this.roundClosePending || events.length === 0) return events
    // 只有「新的助手内容」才算新的一轮开始:tool-call-delta / done / metadata 都是
    // 上一条 start 的续集,拿它们开新轮会把一次调用劈成两轮。
    const opensRound = events.some(event =>
      event.type === 'text-delta'
      || event.type === 'reasoning-delta'
      || event.type === 'tool-call-start')
    if (!opensRound) return events
    this.roundClosePending = false
    this.roundToolCalls = 0
    return [
      { type: 'finish', turn: this.turn, finishReason: 'tool_calls' },
      ...events,
    ]
  }

  private translateStreamEvent(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    const event = message.event
    if (!event) return []

    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const index = event.index ?? 0
      const id = event.content_block.id ?? `tool-${index}`
      const name = normalizeToolName(event.content_block.name)
      this.toolCallsByIndex.set(index, { id, name, args: '' })
      this.started.add(id)
      return [{ type: 'tool-call-start', turn: this.turn, toolCallId: id, toolName: name }]
    }

    if (event.type === 'content_block_delta' && event.delta) {
      const delta = event.delta
      if (delta.type === 'text_delta' && delta.text) {
        return [{ type: 'text-delta', turn: this.turn, delta: delta.text }]
      }
      if (delta.type === 'thinking_delta' && delta.thinking) {
        return [{ type: 'reasoning-delta', turn: this.turn, delta: delta.thinking }]
      }
      if (delta.type === 'input_json_delta' && delta.partial_json) {
        const pending = this.toolCallsByIndex.get(event.index ?? 0)
        if (!pending) return []
        pending.args += delta.partial_json
        return [{
          type: 'tool-call-delta',
          turn: this.turn,
          toolCallId: pending.id,
          toolName: pending.name,
          argumentsDelta: delta.partial_json,
        }]
      }
      return []
    }

    if (event.type === 'content_block_stop') {
      const pending = this.toolCallsByIndex.get(event.index ?? 0)
      if (!pending || this.toolCallsById.has(pending.id)) return []
      this.toolCallsByIndex.delete(event.index ?? 0)
      return this.completeToolCall(pending.id, pending.name, pending.args || '{}')
    }

    return []
  }

  private translateAssistant(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    // Text/thinking already streamed via stream_events; the full assistant
    // message only backfills tool calls the partial stream did not complete.
    const content = message.message?.content
    if (!Array.isArray(content)) return []
    const events: AgentTurnStreamEvent[] = []
    for (const block of content) {
      if (block.type !== 'tool_use' || !block.id) continue
      if (this.toolCallsById.has(block.id)) continue
      const name = normalizeToolName(block.name)
      /**
       * **报过的 start 不再报第二遍**(F4)。
       *
       * 判据此前只看 `toolCallsById`(它在 `content_block_stop` 才落),于是「start
       * 流过了、stop 没到」这一支会在回填时再发一条 `tool-call-start`:下游据它
       * 再建一个占位 toolCall 与一个 step,同一次调用在步骤面上变成两张卡,
       * 而第二张永远停在 input-streaming。
       */
      if (!this.started.has(block.id)) {
        this.started.add(block.id)
        events.push({ type: 'tool-call-start', turn: this.turn, toolCallId: block.id, toolName: name })
      }
      // 还挂在 index 表上的同一次调用(stop 没到)清掉,否则迟到的 stop 会把它
      // 再完成一遍。
      for (const [index, pending] of this.toolCallsByIndex) {
        if (pending.id === block.id) this.toolCallsByIndex.delete(index)
      }
      events.push(...this.completeToolCall(block.id, name, JSON.stringify(block.input ?? {})))
    }
    return events
  }

  private translateUser(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    const content = message.message?.content
    if (!Array.isArray(content)) return []
    const events: AgentTurnStreamEvent[] = []
    for (const block of content) {
      if (block.type !== 'tool_result' || !block.tool_use_id) continue
      const toolCall = this.toolCallsById.get(block.tool_use_id)
      if (!toolCall || this.settled.has(block.tool_use_id)) continue
      this.settled.add(block.tool_use_id)
      const text = toolResultText(block.content)
      const result: AgentToolResult = {
        content: text,
        ...(block.is_error ? { error: text || 'Tool call failed' } : {}),
      }
      events.push({ type: 'tool-result', turn: this.turn, toolCall, result })
    }
    // 结果到齐 = 本轮结束。分界不在这里发,而是等下一段助手内容真的开始时再发
    // (`withRoundBoundary`):并行调用的结果可能分几条 user 消息回来,提前发会
    // 凭空多出几个空 turn。
    if (events.length > 0 && this.roundToolCalls > 0) this.roundClosePending = true
    return events
  }

  private translateResult(message: ClaudeCodeSdkMessage): AgentTurnStreamEvent[] {
    const events: AgentTurnStreamEvent[] = [...this.settleRemaining()]
    /**
     * **失败要说人话**(2026-08-11 止血,`docs/audit/claude-code-sdk-audit-2026-08-11.md`
     * 「四堵墙」之一)。
     *
     * 在此之前一条 `subtype !== 'success'` 的 result 只翻成 `finish(error)`,而
     * `finish` 不带任何文本 —— 限流、额度用尽、登录过期、resume 失效在 UI 上
     * 全长成同一副样子:「回合突然结束,什么都没说」。错误原文只进 console.warn,
     * 用户看不到,自举开发时连「为什么停了」都判不出来。
     *
     * 所以在 finish 之前补一条**可见的正文**。走 `text-delta` 而不是别的形状,
     * 因为 `AgentTurnStreamEvent` 词表里没有 error 事件:能上屏的只有正文。
     * 经 `withRoundBoundary` 是为了让它落在工具卡之后而不是塌回上一轮里。
     */
    if (message.subtype !== 'success') {
      events.push(...this.withRoundBoundary([
        { type: 'text-delta', turn: this.turn, delta: claudeCodeFailureNotice(message) },
      ]))
    }
    if (typeof message.total_cost_usd === 'number') {
      events.push({
        type: 'provider-data',
        turn: this.turn,
        providerData: {
          provider: CLAUDE_CODE_AGENT_CONNECTOR_ID,
          type: 'cost',
          costUSD: message.total_cost_usd,
        },
      })
    }
    events.push({
      type: 'finish',
      turn: this.turn,
      finishReason: message.subtype === 'success' ? 'stop' : 'error',
      usage: usageFromResult(message),
    })
    return events
  }

  private completeToolCall(id: string, name: string, args: string): AgentTurnStreamEvent[] {
    const toolCall: AgentToolCall = {
      id,
      name,
      arguments: args,
      externallyExecuted: true,
    }
    this.toolCallsById.set(id, toolCall)
    this.roundToolCalls += 1
    const events: AgentTurnStreamEvent[] = [
      { type: 'tool-call-done', turn: this.turn, toolCall },
    ]
    const change = fileChangeMetadata(name, args)
    if (change) {
      events.push({
        type: 'tool-metadata',
        turn: this.turn,
        toolCall,
        update: { metadata: change },
      })
    }
    return events
  }

  /** Stream ended without results for some calls — settle them so steps never hang. */
  settleRemaining(): AgentTurnStreamEvent[] {
    const events: AgentTurnStreamEvent[] = []
    for (const [id, toolCall] of this.toolCallsById) {
      if (this.settled.has(id)) continue
      this.settled.add(id)
      events.push({
        type: 'tool-result',
        turn: this.turn,
        toolCall,
        result: { content: '' },
      })
    }
    return events
  }
}

export function createClaudeCodeConnector(
  options: ClaudeCodeConnectorOptions = {},
): ExternalAgentConnector {
  const abortControllers = new Map<string, AbortController>()
  const now = options.now ?? (() => Date.now())
  const dialogKinds = options.userDialogKinds ?? DEFAULT_USER_DIALOG_KINDS

  /**
   * `AskUserQuestion` 的四种收场,逐一翻成 SDK 看得懂的答复(原则 3:每一种收场
   * 都要有翻译,不能有一种是「继续等」)。
   *
   *  - `answered` → allow,答案按 `AskUserQuestionOutput` 的形状回填进 input;
   *  - 其余三种 → deny,理由用 E1 的 `answer.reason` 原文(它本来就是写给模型看的
   *    一句人话:「无人应答……请按你自己的判断选一条最稳妥的路继续」)。
   *
   * 没有落点(装配层没装 handler)也是**当场拒绝**,不是挂着 —— 挂着就是 F3。
   */
  async function askUserQuestion(
    request: ExternalAgentTurnRequest,
    input: Record<string, unknown>,
    toolUseID: string | undefined,
  ): Promise<
    | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
    | { behavior: 'deny'; message: string }
  > {
    if (!options.interactionHandler) {
      return {
        behavior: 'deny',
        message: '此处没有可以回答问题的人。请不要提问,按你自己的判断继续,并在回答里说明你替用户做了哪个假设。',
      }
    }
    const questions = askUserQuestionToInteraction(input)
    if (questions.length === 0) {
      return { behavior: 'deny', message: 'AskUserQuestion input carried no answerable question.' }
    }
    try {
      const answer = await options.interactionHandler({
        connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
        localSessionId: request.localSessionId,
        ...(request.messageId ? { messageId: request.messageId } : {}),
        ...(toolUseID ? { toolCallId: toolUseID } : {}),
        questions,
      })
      if (answer.outcome === 'answered') {
        return {
          behavior: 'allow',
          updatedInput: { ...input, ...askUserQuestionOutput(questions, answer) },
        }
      }
      return {
        behavior: 'deny',
        message: answer.reason || `Question settled as ${answer.outcome}.`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { behavior: 'deny', message: `Interaction bridge failed: ${message}` }
    }
  }

  return {
    id: CLAUDE_CODE_AGENT_CONNECTOR_ID,
    capabilities: CLAUDE_CODE_CAPABILITIES,

    async *streamTurn(request: ExternalAgentTurnRequest): AsyncIterable<ExternalAgentEvent> {
      const abortController = new AbortController()
      abortControllers.set(request.localSessionId, abortController)
      const forwardAbort = () => abortController.abort()
      request.abortSignal?.addEventListener('abort', forwardAbort, { once: true })
      if (request.abortSignal?.aborted) abortController.abort()

      const translator = new ClaudeCodeTurnTranslator(request.turn)
      let linkEmitted = false

      /**
       * 宿主工具面的注入(E3 §2)。
       *
       * 两道门缺一不可:能力表说这个执行器接得住(`hostTools`),装配层装上了
       * 解析器。任何一道不过就退回 E3 之前的形状 —— 只有 SDK 自带工具。
       *
       * 解析失败**不炸回合**:注入不上的代价是这一轮没有发言权(收养兜底还在),
       * 抛出去的代价是这一轮什么都没有。
       */
      let hostTools: Awaited<ReturnType<HostMcpSurfaceResolver>> | undefined
      if (options.hostToolSurface && executorAcceptsHostTools()) {
        try {
          hostTools = await options.hostToolSurface({
            localSessionId: request.localSessionId,
            ...(request.messageId ? { messageId: request.messageId } : {}),
            cwd: request.cwd,
          })
        } catch (error) {
          options.logger?.warn?.(
            `[ClaudeCodeConnector] host tool surface failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }

      /**
       * 一轮的起 / 落(E6,§6)。
       *
       * 起点画在这里而不是 `streamTurn` 的第一行:宿主工具面解析失败要退回「只有 SDK
       * 自带工具」,那不是一轮的开始出了问题。落点在 `finally` —— 它是这个生成器
       * **唯一**的收场出口,正常跑完、抛错、被 abort 掐断走的都是它,所以「起了却
       * 没落」在账上只可能意味着进程没了,不可能意味着漏记。
       */
      const turnStartedAt = now()
      let turnOutcome: 'complete' | 'error' | 'aborted' = 'complete'
      observeTurn('start')

      function observeTurn(phase: 'start' | 'end'): void {
        if (!options.observer) return
        try {
          options.observer.turn({
            connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
            localSessionId: request.localSessionId,
            phase,
            ...(phase === 'end'
              ? { outcome: turnOutcome, elapsedMs: Math.max(0, now() - turnStartedAt) }
              : {}),
          })
        } catch {
          // 观测绝不能变成第二个故障源(与落盘层同一条纪律)。
        }
      }

      try {
        const spawnEnv = options.resolveSpawnEnv?.()
        const queryOptions: ClaudeCodeQueryOptions = {
          cwd: request.cwd,
          model: request.model,
          resume: request.resume?.externalSessionId,
          pathToClaudeCodeExecutable: options.executablePath,
          includePartialMessages: true,
          permissionMode: 'default',
          /**
           * **显式只收项目层**(P1-2,`docs/audit/claude-code-sdk-audit-2026-08-11.md`
           * 「两不管地带」)。
           *
           * 不传这个字段时 SDK 加载**全部**文件系统设置,于是用户全局
           * `~/.claude/settings.json` 里的 allow 规则在 **CLI 侧先行放行**:
           * `canUseTool` 根本不被调用,onething 的审批面一个字都看不到。开发者
           * 机器上那份白名单几乎人人都有,自举场景下这是致命的。所以:
           *
           *  1. **不含 `'user'`** —— 全局 allow 规则会绕过 onething 的审批,信任面
           *     必须收在 `canUseTool` 这一处;不含 `'local'` 同理:
           *     `.claude/settings.local.json` 不进版本库,是另一份看不见的白名单。
           *     留下的 `'project'`(`<cwd>/.claude/settings.json`)在仓库里看得见、
           *     评审得到,那才是可以谈信任的一层。
           *  2. **必须含 `'project'`** —— 仓库 CLAUDE.md 的读取依赖它
           *     (d.ts 原话:「Must include 'project' to load CLAUDE.md files」)。
           *     此前 CLAUDE.md 是靠「默认全加载」白捡来的:SDK 默认值一变即静默
           *     丢失。写成显式取值之后,自举刚需从白捡变成明拿。
           */
          settingSources: ['project'],
          ...(spawnEnv ? { env: spawnEnv } : {}),
          ...(hostTools ? { mcpServers: hostTools.mcpServers } : {}),
          /**
           * **persona 进 system 位**(E4/G9)。E0 能力表里 claude-code 的
           * `persona: 'system'` 说的就是这里。
           *
           * 用 `preset + append` 而不是裸字符串:裸字符串会把 Claude Code 自己那份
           * 操作说明整个替掉 —— persona 到位了,Read/Write/Bash 却不会用了。追加的
           * 位置在预设之后,于是「这一轮的你是谁」是模型读到的最后一段。
           */
          ...(request.systemPrompt?.trim()
            ? {
                systemPrompt: {
                  type: 'preset' as const,
                  preset: 'claude_code' as const,
                  append: request.systemPrompt.trim(),
                },
              }
            : {}),
          ...claudeCodeThinkingOptions(request),
          abortController,
          /**
           * `request_user_dialog` 的落点(E4/G7)。声明表必须与回调同时给 ——
           * d.ts 明写「Requires `onUserDialog`;passing a non-empty list without
           * the callback throws at option intake」。
           */
          ...(dialogKinds.length > 0
            ? {
                supportedDialogKinds: dialogKinds,
                onUserDialog: async (dialogRequest, { signal }) => {
                  if (signal.aborted) return { behavior: 'cancelled' as const }
                  if (!options.interactionHandler) return { behavior: 'cancelled' as const }
                  const questions = userDialogToInteraction(
                    dialogRequest.dialogKind,
                    dialogRequest.payload ?? {},
                  )
                  // 认不出这个 payload。`cancelled` 是 SDK 规定的「答不上来」答法,
                  // CLI 转而执行该 dialog 的默认行为(= E4 之前的形状)。
                  if (questions.length === 0) return { behavior: 'cancelled' as const }
                  try {
                    const answer = await options.interactionHandler({
                      connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
                      localSessionId: request.localSessionId,
                      ...(request.messageId ? { messageId: request.messageId } : {}),
                      ...(dialogRequest.toolUseID ? { toolCallId: dialogRequest.toolUseID } : {}),
                      questions,
                    })
                    if (answer.outcome !== 'answered') return { behavior: 'cancelled' as const }
                    return {
                      behavior: 'completed' as const,
                      result: askUserQuestionOutput(questions, answer),
                    }
                  } catch (error) {
                    options.logger?.warn?.(
                      `[ClaudeCodeConnector] user dialog bridge failed: ${
                        error instanceof Error ? error.message : String(error)
                      }`,
                    )
                    return { behavior: 'cancelled' as const }
                  }
                },
              }
            : {}),
          /**
           * **两类工具在这里分家**(§2)。
           *
           * 判据是 MCP 全名的前缀 `mcp__onething__`:
           *
           *  - **宿主工具**(带前缀):跑在我们自己的执行器里,而那条路上已经有
           *    完整的一套 —— 场子门、`permissionGuard`、`enforcePermissionPolicy`、
           *    v3 持牌校验。再过一遍 `canUseTool` 就是同一个动作被审两次:用户
           *    要点两下,而第二下问的是一件他刚刚已经答过的事。所以直接放行,
           *    真正的门在下游。
           *  - **SDK 自带工具**(不带前缀):Read/Write/Bash 跑在 CLI 进程里,
           *    我们对它们只剩这一座桥,照旧走宿主的审批。
           */
          /**
           * 决定 + 记账。**记账只在这一处**(E6):`decideToolUse` 有六个 return,
           * 逐个去记必然漏掉其中一两个,而漏掉的多半是 deny 那几支 —— 恰恰是回查时
           * 最想看见的。所以决定与记账在这里分层:内层只管答,外层只管记。
           */
          canUseTool: async (toolName, input, context) => {
            const decision = await decideToolUse(toolName, input, context)
            if (options.observer) {
              try {
                options.observer.toolDecision({
                  connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
                  localSessionId: request.localSessionId,
                  // 账上与事件流上是同一个名字(E3 的归一化),否则同一次调用在
                  // 时间轴与步骤面上看起来像两件事。
                  toolName: normalizeToolName(toolName),
                  decision: decision.behavior,
                  hostTool: isHostMcpToolName(toolName),
                  ...(context.toolUseID ? { toolCallId: context.toolUseID } : {}),
                })
              } catch { /* 观测绝不能变成第二个故障源 */ }
            }
            return decision
          },
        }

        async function decideToolUse(
          toolName: string,
          input: Record<string, unknown>,
          { signal, toolUseID }: { signal: AbortSignal; toolUseID?: string },
        ): Promise<
          | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
          | { behavior: 'deny'; message: string }
        > {
          if (isHostMcpToolName(toolName)) {
            return { behavior: 'allow', updatedInput: input }
          }
          if (signal.aborted) return { behavior: 'deny', message: 'Aborted.' }

          /**
           * **提问不是审批**(E4/G6)。`AskUserQuestion` 问的是「A 还是 B」,
           * 答案是结构化的;拿审批那套四选一去接它,只能翻成一个「允许 / 拒绝」,
           * 而模型要的那个选择就丢了。所以它在这里拐进 InteractionRegistry。
           */
          if (toolName === ASK_USER_QUESTION_TOOL) {
            return askUserQuestion(request, input, toolUseID)
          }

          if (!options.permissionHandler) {
            return { behavior: 'deny', message: 'No permission handler registered in host.' }
          }
          try {
            const decision = await options.permissionHandler({
              connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
              localSessionId: request.localSessionId,
              messageId: request.messageId,
              cwd: request.cwd,
              toolName,
              input,
              // G1:丢了它,卡就画不出来(见 `ExternalAgentPermissionAsk.toolCallId`)。
              toolCallId: toolUseID,
            })
            return decision.behavior === 'allow'
              ? { behavior: 'allow', updatedInput: input }
              : { behavior: 'deny', message: decision.message }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { behavior: 'deny', message: `Permission bridge failed: ${message}` }
          }
        }

        const stream = options.queryFn
          ? options.queryFn({ prompt: request.prompt, options: queryOptions })
          : await defaultQueryFn({ prompt: request.prompt, options: queryOptions })

        for await (const message of stream) {
          if (message.type === 'system' && message.subtype === 'init') {
            const init = message as ClaudeCodeSdkMessage & { apiKeySource?: string; model?: string; cwd?: string }
            options.logger?.log?.(
              `[ClaudeCodeConnector] init session=${message.session_id} model=${init.model}`
                + ` apiKeySource=${init.apiKeySource} cwd=${init.cwd}`
                // 这一轮到底给了它哪几个宿主工具。注入静静地失败是最坏的结局
                // (发言权没了却看不出来),所以每一轮都把答案写进日志。
                + ` hostTools=[${hostTools?.toolNames.join(', ') ?? ''}]`,
            )
          }
          if (message.type === 'result' && message.subtype !== 'success') {
            options.logger?.warn?.(
              `[ClaudeCodeConnector] error result: ${JSON.stringify(message).slice(0, 800)}`,
            )
          }
          if (!linkEmitted && message.session_id) {
            linkEmitted = true
            const link: ExternalAgentSessionLink = {
              localSessionId: request.localSessionId,
              connectorId: CLAUDE_CODE_AGENT_CONNECTOR_ID,
              externalSessionId: message.session_id,
              cwd: request.cwd,
              createdAt: request.resume?.createdAt ?? now(),
              lastUsedAt: now(),
            }
            yield { type: 'session-established', link }
          }
          yield* translator.translate(message)
        }
      } catch (error) {
        // abort 先判:SDK 把一次中断也抛成异常,而「被人停掉」与「炸了」在回查时
        // 是两个完全不同的结论(E5 的三级停止正是要在账上看得见)。
        turnOutcome = abortController.signal.aborted ? 'aborted' : 'error'
        throw error
      } finally {
        // 生成器被下游提前丢弃(`return()`)时既不进 catch 也不抛,但流确实没跑完 ——
        // 靠信号补判,否则那一支会被记成 `complete`。
        if (turnOutcome === 'complete' && abortController.signal.aborted) turnOutcome = 'aborted'
        observeTurn('end')
        request.abortSignal?.removeEventListener('abort', forwardAbort)
        abortControllers.delete(request.localSessionId)
        // 语境解绑。漏解的条目会让下一轮之后的迟到调用打在一份过期语境上,而那
        // 是最难查的一类串房 —— 所以它在 `finally` 里,与 abort 清理并列。
        hostTools?.release?.()
      }
    },

    async interrupt(localSessionId: string): Promise<void> {
      abortControllers.get(localSessionId)?.abort()
    },

    async dispose(): Promise<void> {
      for (const controller of abortControllers.values()) controller.abort()
      abortControllers.clear()
    },
  }
}
