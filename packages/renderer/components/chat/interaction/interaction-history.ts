import type {
  InteractionAnswer,
  InteractionOption,
  InteractionOutcome,
  InteractionQuestion,
  InteractionQuestionAnswer,
  InteractionRequest,
} from '@/types'

/**
 * 已办提问的**持久面**:从消息里那次提问工具调用倒推出一张已办卡。
 *
 * 两族工具都认:外部 agent 的 `AskUserQuestion`(SDK 自带)与原生的 `ask_user`。
 * 它们共用同一张卡、同一本 store、同一条归位纪律,区别只在**答案是怎么落到消息上
 * 的** —— 见下面两节。
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
 * ## 只推「答过」的那一种(**仅限外部那一族**)
 *
 * 收场有四种,但外部那条链只认得出一种。跳过 / 超时 / 中止在连接器那边都走
 * `behavior: 'deny'`,落到工具调用上只剩一句给模型看的理由,分不出是哪一种 ——
 * 猜一个 outcome 贴上去,就是拿「已跳过」去盖一次「超时」。所以配对解不出来就
 * **不造卡**:这与 store 里「没见过原文就不编一张卡」是同一条纪律。
 *
 * ## 原生 `ask_user`:判据走结构化字段,不做文本逆运算
 *
 * 原生工具的结果**不是**一句话,而是一个对象:引擎把 `{title, output, metadata}`
 * 整个存进 `toolCalls[].result`(`core/engine/tool-orchestration.ts:827`)。工具在
 * `metadata` 里留了一份结构化记录:
 *
 * ```jsonc
 * {
 *   "id": "toolu_…", "toolName": "ask_user",
 *   "arguments": { "questions": [ { "question": "…", "options": [ … ] } ] },
 *   "status": "completed",
 *   "result": {
 *     "output": "用户已回答:「…」→ …",
 *     "metadata": {
 *       "interaction": "ask_user",
 *       "outcome": "answered",
 *       "answers": [ { "questionId": "toolu_…:0", "question": "…", "selected": ["…"] } ]
 *     }
 *   }
 * }
 * ```
 *
 * 所以这一族**不解析人话**:判据是 `metadata.interaction === 'ask_user'`,答案直接读
 * `metadata.answers`。写出去的是结构,读回来的也该是结构 —— 让持久面去逆运算一句
 * 摘要,等于给自己文案的每一次措辞调整都埋一次静默失效。
 *
 * 附带的一个好处:四种收场这一族**全都认得出**(outcome 就写在那里),所以跳过 /
 * 超时 / 中止的卡也能跨重载重建,不必像外部那族一样只留「答过」的。
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

/** 原生提问工具的注册 id(模型看到的也是这个名字)。 */
const ASK_USER_TOOL_NAME = 'ask_user'

/** 已经跑完的调用才有答案可推;还在执行中的那条归 pending 账本管。 */
const TERMINAL_STATUS = new Set(['completed', 'failed', 'cancelled'])

/** 四种收场。认不出的一律不造卡 —— 猜一个贴上去就是编。 */
const OUTCOMES = new Set<InteractionOutcome>(['answered', 'declined', 'timeout', 'aborted'])

/** `"题"="答"` 配对。CLI 把它包在一句英文里,这里只挑配对,不认那句英文。 */
const ANSWER_PAIR_RE = /"([^"]+)"\s*=\s*"([^"]*)"/g

function normalizeToolName(toolCall: InteractionHistoryToolCall): string {
  return (toolCall.toolName || toolCall.toolId || '').toLowerCase()
}

function isAskUserQuestionCall(toolCall: InteractionHistoryToolCall): boolean {
  return normalizeToolName(toolCall) === ASK_TOOL_NAME
}

function isAskUserCall(toolCall: InteractionHistoryToolCall): boolean {
  return normalizeToolName(toolCall) === ASK_USER_TOOL_NAME
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

/** 原生 `ask_user` 写在 `result.metadata` 里的那份结构化记录(只认用得上的几格)。 */
export interface AskUserResultRecord {
  outcome: InteractionOutcome
  reason?: string
  answers: Array<{ questionId?: string; question?: string; selected: string[]; freeText?: string }>
}

/**
 * `toolCalls[].result` → 原生提问的结构化记录。
 *
 * 判据是 `metadata.interaction === 'ask_user'` 这个**结构化标记**,不是工具名的拼写,
 * 也不是那句人话摘要的措辞:前者改名了会当场对不上(而对不上就是不造卡,安全),
 * 后者调一次文案就静默失效(而失效了没有任何东西会报错)。
 */
export function readAskUserRecord(result: unknown): AskUserResultRecord | undefined {
  if (!result || typeof result !== 'object') return undefined
  const metadata = (result as { metadata?: unknown }).metadata
  if (!metadata || typeof metadata !== 'object') return undefined
  const record = metadata as Record<string, unknown>
  if (record.interaction !== ASK_USER_TOOL_NAME) return undefined
  if (!OUTCOMES.has(record.outcome as InteractionOutcome)) return undefined

  const answers: AskUserResultRecord['answers'] = []
  if (Array.isArray(record.answers)) {
    for (const item of record.answers) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      const selected = Array.isArray(entry.selected)
        ? entry.selected.filter((value): value is string => typeof value === 'string')
        : []
      answers.push({
        ...(typeof entry.questionId === 'string' ? { questionId: entry.questionId } : {}),
        ...(typeof entry.question === 'string' ? { question: entry.question } : {}),
        selected,
        ...(typeof entry.freeText === 'string' && entry.freeText ? { freeText: entry.freeText } : {}),
      })
    }
  }
  return {
    outcome: record.outcome as InteractionOutcome,
    ...(typeof record.reason === 'string' && record.reason ? { reason: record.reason } : {}),
    answers,
  }
}

function buildRequest(
  toolCall: InteractionHistoryToolCall,
  sessionId: string,
  questions: InteractionQuestion[],
  origin: InteractionRequest['origin'],
  settledAt: number,
): InteractionRequest {
  return {
    id: toolCall.id,
    sessionId,
    toolCallId: toolCall.id,
    origin,
    questions,
    deadlineAt: settledAt,
    createdAt: toolCall.timestamp ?? settledAt,
  }
}

/** 外部 agent 的 `AskUserQuestion`:答案只以一句英文存在,只能逆运算,且只认「答过」。 */
function deriveFromAskUserQuestion(
  toolCall: InteractionHistoryToolCall,
  sessionId: string,
): DerivedInteraction | undefined {
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
  return {
    request: buildRequest(toolCall, sessionId, questions, 'external-agent', settledAt),
    answer: { id: toolCall.id, answers, outcome: 'answered' },
    settledAt,
  }
}

/**
 * 原生 `ask_user`:答案是结构,读回来的也是结构。
 *
 * 题 id 优先按 `questionId` 对(工具与这里用的是**同一把公式** `<toolCallId>:<i>`),
 * 对不上再退到题面原文 —— 那是给「id 公式将来变了」留的一条回得来的路,不是主路。
 */
function deriveFromAskUser(
  toolCall: InteractionHistoryToolCall,
  sessionId: string,
): DerivedInteraction | undefined {
  const record = readAskUserRecord(toolCall.result)
  if (!record) return undefined

  const args = (toolCall.arguments ?? {}) as Record<string, unknown>
  const questions = toQuestions(args.questions, toolCall.id)
  if (questions.length === 0) return undefined

  const byText = new Map<string, InteractionQuestion>()
  for (const question of questions) byText.set(question.question.trim(), question)

  const answers: Record<string, InteractionQuestionAnswer> = {}
  for (const entry of record.answers) {
    const question = questions.find(item => item.id === entry.questionId)
      ?? (entry.question ? byText.get(entry.question.trim()) : undefined)
    if (!question) continue
    answers[question.id] = {
      selected: [...entry.selected],
      ...(entry.freeText ? { freeText: entry.freeText } : {}),
    }
  }
  // 「答过」却一条答案都对不上题:画出来是一张「答过但答了什么不知道」的卡,不如不画。
  // 其余三种收场本来就没有答案,那正是它们该有的样子(卡上画的是「已跳过 / 超时 /
  // 已取消」),所以不套这条闸。
  if (record.outcome === 'answered' && Object.keys(answers).length === 0) return undefined

  const settledAt = toolCall.endTime ?? toolCall.timestamp ?? 0
  return {
    request: buildRequest(toolCall, sessionId, questions, 'host-tool', settledAt),
    answer: {
      id: toolCall.id,
      answers,
      outcome: record.outcome,
      ...(record.reason ? { reason: record.reason } : {}),
    },
    settledAt,
  }
}

/** 一次工具调用 → 一条已办记录。推不出答案就返回 undefined(不造卡)。 */
export function deriveInteractionFromToolCall(
  toolCall: InteractionHistoryToolCall,
  sessionId: string,
): DerivedInteraction | undefined {
  if (!toolCall.id) return undefined
  if (toolCall.status && !TERMINAL_STATUS.has(toolCall.status)) return undefined
  if (isAskUserCall(toolCall)) return deriveFromAskUser(toolCall, sessionId)
  if (isAskUserQuestionCall(toolCall)) return deriveFromAskUserQuestion(toolCall, sessionId)
  return undefined
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
