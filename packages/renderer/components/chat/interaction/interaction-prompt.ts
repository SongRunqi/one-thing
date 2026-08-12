import type {
  InteractionQuestion,
  InteractionQuestionAnswer,
} from '@/types'

/**
 * 提问栏位的纯逻辑(claude-code-integration-v2 §4,E2)。
 *
 * 与 `permission/permission-ledger.ts` 同一条分工:`.vue` 只画与收集意图,
 * 「这份草稿算不算答完了」「倒计时该显示成什么」这类判断放在这里 —— 它们是真正
 * 会写错的部分,而写错了要在单测里被看见,不是在真机上。
 *
 * 这里**没有**已办态的格式化(答完了什么、几点收的场):提问收场之后栏位整块
 * 撤走,会话里不留痕,于是也就没有一份「回看用的记录」需要排版。
 */

/** 一题的草稿:选中的 label + 「其他」里写的那句。 */
export interface InteractionDraftAnswer {
  selected: string[]
  freeText: string
}

export type InteractionDraft = Record<string, InteractionDraftAnswer>

export function emptyDraft(questions: InteractionQuestion[]): InteractionDraft {
  const draft: InteractionDraft = {}
  for (const question of questions) {
    draft[question.id] = { selected: [], freeText: '' }
  }
  return draft
}

/** 卡片上那行小标题:header 优先(SDK 侧建议 12 字以内),回落到问题原文。 */
export function questionTitle(question: InteractionQuestion): string {
  return question.header?.trim() || question.question
}

/**
 * 点一个选项之后的新选中集。
 *
 * 多选是 toggle,单选是**替换**而不是 toggle —— 单选题上把唯一的选中再点掉,
 * 结果是一份「答了但没选」的草稿,那不是用户的意思。
 */
export function toggleSelection(
  current: string[],
  label: string,
  multiSelect: boolean | undefined,
): string[] {
  if (!multiSelect) return [label]
  return current.includes(label)
    ? current.filter(item => item !== label)
    : [...current, label]
}

/**
 * 这一题答完了没有。
 *
 * 「其他」里写了字也算答完(哪怕一个选项都没选):`allowFreeText` 存在的全部
 * 意义就是「给的选项里没有我要的那个」。
 */
export function isQuestionAnswered(answer: InteractionDraftAnswer | undefined): boolean {
  if (!answer) return false
  return answer.selected.length > 0 || answer.freeText.trim().length > 0
}

/**
 * 整张卡答完了没有 —— **全部题都答完才能交**。
 *
 * 这不是 UI 的偏好,是协议决定的:`Interaction.respond()` 收的是一整张答案表并
 * 当场把这条提问结算掉,没有「逐题提交」这回事。半张表交上去 = 剩下的题以空答案
 * 落定,而模型看到的是「用户回答了」。
 */
export function isDraftComplete(
  questions: InteractionQuestion[],
  draft: InteractionDraft,
): boolean {
  return questions.every(question => isQuestionAnswered(draft[question.id]))
}

/** 草稿 → wire 形状。空的 freeText 不上线(协议里它是可选的)。 */
export function buildAnswers(
  questions: InteractionQuestion[],
  draft: InteractionDraft,
): Record<string, InteractionQuestionAnswer> {
  const answers: Record<string, InteractionQuestionAnswer> = {}
  for (const question of questions) {
    const entry = draft[question.id]
    if (!entry) continue
    const freeText = entry.freeText.trim()
    answers[question.id] = {
      selected: [...entry.selected],
      ...(freeText ? { freeText } : {}),
    }
  }
  return answers
}

/**
 * 倒计时的显示文本。
 *
 * **只显示,不结算** —— 到点之后栏位变成不可点的「已超时」,但真正把这条提问
 * 结成 timeout 的是内核自己挂的那张表(`armDeadline`)。UI 抢着发一次 respond
 * 会变成:一次用户没点过的应答,以及两个都自认为是结算方的地方。
 */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '已超时'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * 排队时脚注那句话。
 *
 * 同一时刻只画一条提问(位置只有一条栏位),但欠账可能有好几条 —— 不说出来,
 * 用户答完一条看见又冒出一条,会以为自己刚才那一下没生效。
 */
export function interactionFootHint(options: {
  expired: boolean
  answered: number
  total: number
  queued: number
}): string {
  if (options.expired) return '已超时,等待后端结算'
  const queueNote = options.queued > 0 ? ` · 还有 ${options.queued} 条提问排队` : ''
  if (options.total > 1) return `${options.answered}/${options.total} 题已选,全部答完才能发送${queueNote}`
  return `awaiting your answer${queueNote}`
}
