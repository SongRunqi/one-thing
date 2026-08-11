import type {
  InteractionAnswer,
  InteractionOption,
  InteractionQuestion,
  InteractionQuestionAnswer,
  InteractionRequest,
} from '@/types'

/**
 * 已办提问的**持久面**:从消息里那次 `AskUserQuestion` 工具调用倒推出一张已办卡。
 *
 * ## 为什么需要它
 *
 * 结算之后内核就把这条从 pending 里摘了,而 `interactions` store 里的 `settled`
 * 是**事件转达**——只活在收到那条 `interaction:settled` 的这一个窗口里。窗口重载、
 * 换台电脑、隔天回来重开会话,那本账都是空的:卡片整张消失,用户回看不到自己
 * 当初选了哪条路。
 *
 * 但答案本身**不是没落地**。这次提问是一次货真价实的工具调用,它连同题面与结果
 * 一起写进了消息的 `toolCalls[]`(`sessions/<id>/messages.jsonl`):
 *
 * ```jsonc
 * {
 *   "id": "toolu_01L6…", "toolName": "AskUserQuestion",
 *   "arguments": { "questions": [ { "question": "…", "options": [ … ] } ] },
 *   "status": "completed",
 *   "result": "Your questions have been answered: \"要怎么换?\"=\"直接用 PNG\". …"
 * }
 * ```
 *
 * 所以这里不新开一本账、不加一条 IPC、不往内核塞一张已结算表 —— **渲染层按已有的
 * 数据推态**。一个事实一处存,历史态只是那处存的另一种读法。
 *
 * ## 那句 result 是谁写的
 *
 * 外层的英文是 Claude Code CLI 的措辞,但里面 `"题"="答"` 这些配对是**我们自己**
 * 塞进去的:`askUserQuestionOutput()`(claude-code-connector.ts:782)把答案写成
 * `answers[question.question] = selected.join(', ')` 交回 CLI,CLI 原样念了回来。
 * 也就是说这里解析的是自己写出去的东西,不是在猜一个外部格式。
 *
 * ## 只推「答过」的那一种
 *
 * 收场有四种,但持久面只认得出一种。跳过 / 超时 / 中止在连接器那边都走
 * `behavior: 'deny'`,落到工具调用上只剩一句给模型看的理由,分不出是哪一种 ——
 * 猜一个 outcome 贴上去,就是拿「已跳过」去盖一次「超时」。所以配对解不出来就
 * **不造卡**:这与 store 里「没见过原文就不编一张卡」是同一条纪律。
 */

/** 结构化到手的一条已办记录,形状与 store 的 `SettledInteraction` 对齐。 */
export interface DerivedInteraction {
  request: InteractionRequest
  answer: InteractionAnswer
  settledAt: number
}

/** 只认工具调用里用得上的那几格(不从 `@/types` 收紧,免得把渲染层钉死在某个 ToolCall 版本上)。 */
export interface InteractionHistoryToolCall {
  id: string
  toolName?: string
  toolId?: string
  arguments?: unknown
  status?: string
  result?: unknown
  timestamp?: number
  endTime?: number
}

export interface InteractionHistoryMessage {
  toolCalls?: InteractionHistoryToolCall[]
}

/** 工具名归一后认这一个。与 `tool-preview.ts` 的 `case 'askuserquestion'` 同一把尺。 */
const ASK_TOOL_NAME = 'askuserquestion'

/** 已经跑完的调用才有答案可推;还在执行中的那条归 pending 账本管。 */
const TERMINAL_STATUS = new Set(['completed', 'failed', 'cancelled'])

/** `"题"="答"` 配对。CLI 把它包在一句英文里,这里只挑配对,不认那句英文。 */
const ANSWER_PAIR_RE = /"([^"]+)"\s*=\s*"([^"]*)"/g

function isAskUserQuestionCall(toolCall: InteractionHistoryToolCall): boolean {
  const name = (toolCall.toolName || toolCall.toolId || '').toLowerCase()
  return name === ASK_TOOL_NAME
}

function toOptions(raw: unknown): InteractionOption[] {
  if (!Array.isArray(raw)) return []
  const options: InteractionOption[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : ''
    if (!label) continue
    options.push({
      label,
      ...(typeof record.description === 'string' ? { description: record.description } : {}),
      ...(typeof record.preview === 'string' ? { preview: record.preview } : {}),
    })
  }
  return options
}

/**
 * 持久下来的 `arguments.questions` → 题面。
 *
 * 题**没有 id**:那是连接器在活着的那一刻现盖的,没有随工具入参写进消息。所以这里
 * 按位置补一个 `<toolCallId>:<i>`——派生记录不回内核,只要在渲染层里唯一且稳定就够,
 * 而答案表也用同一把 id 组装,两边自洽。
 */
function toQuestions(
  raw: unknown,
  toolCallId: string,
): InteractionQuestion[] {
  if (!Array.isArray(raw)) return []
  const questions: InteractionQuestion[] = []
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const text = typeof record.question === 'string' ? record.question : ''
    if (!text) return
    const id = typeof record.id === 'string' && record.id ? record.id : `${toolCallId}:${index}`
    questions.push({
      id,
      question: text,
      ...(typeof record.header === 'string' ? { header: record.header } : {}),
      ...(record.multiSelect === true ? { multiSelect: true } : {}),
      ...(record.allowFreeText === true ? { allowFreeText: true } : {}),
      options: toOptions(record.options),
    })
  })
  return questions
}

/** result 文本里的 `"题"="答"` 配对表(键是题面原文 —— 我们自己当初就是这么写出去的)。 */
export function parseAnswerPairs(result: unknown): Map<string, string> {
  const pairs = new Map<string, string>()
  if (typeof result !== 'string' || !result) return pairs
  ANSWER_PAIR_RE.lastIndex = 0
  let match = ANSWER_PAIR_RE.exec(result)
  while (match) {
    pairs.set(match[1].trim(), match[2].trim())
    match = ANSWER_PAIR_RE.exec(result)
  }
  return pairs
}

/**
 * 一句答案文本 → 结构化答案。是 `askUserQuestionOutput()` 的逆运算:
 *  - 文本正好是某个选项 → 选中它;
 *  - 多选题按 `', '` 拆,认得出的算选中,剩下的归「其他」;
 *  - 一个都对不上 → 整句是用户自己写的那句(`allowFreeText` 的正常收场)。
 */
export function toQuestionAnswer(
  question: InteractionQuestion,
  text: string,
): InteractionQuestionAnswer {
  const labels = new Set(question.options.map(option => option.label))
  if (labels.has(text)) return { selected: [text] }
  if (question.multiSelect) {
    const parts = text.split(', ').map(part => part.trim()).filter(Boolean)
    const selected = parts.filter(part => labels.has(part))
    if (selected.length > 0) {
      const rest = parts.filter(part => !labels.has(part)).join(', ')
      return { selected, ...(rest ? { freeText: rest } : {}) }
    }
  }
  return { selected: [], ...(text ? { freeText: text } : {}) }
}

/** 一次工具调用 → 一条已办记录。推不出答案就返回 undefined(不造卡)。 */
export function deriveInteractionFromToolCall(
  toolCall: InteractionHistoryToolCall,
  sessionId: string,
): DerivedInteraction | undefined {
  if (!toolCall.id || !isAskUserQuestionCall(toolCall)) return undefined
  if (toolCall.status && !TERMINAL_STATUS.has(toolCall.status)) return undefined

  const args = (toolCall.arguments ?? {}) as Record<string, unknown>
  const questions = toQuestions(args.questions, toolCall.id)
  if (questions.length === 0) return undefined

  const pairs = parseAnswerPairs(toolCall.result)
  if (pairs.size === 0) return undefined

  const answers: Record<string, InteractionQuestionAnswer> = {}
  for (const question of questions) {
    const text = pairs.get(question.question.trim())
    if (text === undefined) continue
    answers[question.id] = toQuestionAnswer(question, text)
  }
  // 配对一条都没对上题面(题面被改写过 / 换了措辞)—— 那份 answers 是空的,
  // 画出来是一张「答过但答了什么不知道」的卡,不如不画。
  if (Object.keys(answers).length === 0) return undefined

  const settledAt = toolCall.endTime ?? toolCall.timestamp ?? 0
  const request: InteractionRequest = {
    id: toolCall.id,
    sessionId,
    toolCallId: toolCall.id,
    origin: 'external-agent',
    questions,
    deadlineAt: settledAt,
    createdAt: toolCall.timestamp ?? settledAt,
  }
  return {
    request,
    answer: { id: toolCall.id, answers, outcome: 'answered' },
    settledAt,
  }
}

/** 整条会话的消息 → 所有能从持久面推出来的已办提问,按提问时间排。 */
export function deriveInteractionHistory(
  messages: readonly InteractionHistoryMessage[] | undefined,
  sessionId: string,
): DerivedInteraction[] {
  if (!messages || messages.length === 0 || !sessionId) return []
  const derived: DerivedInteraction[] = []
  for (const message of messages) {
    for (const toolCall of message.toolCalls ?? []) {
      const entry = deriveInteractionFromToolCall(toolCall, sessionId)
      if (entry) derived.push(entry)
    }
  }
  return derived.sort((a, b) => a.request.createdAt - b.request.createdAt)
}
