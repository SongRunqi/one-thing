/**
 * 右栏「线程」tab 的纯逻辑 —— 工作台式外壳 C3-B
 * (docs/design/im-workbench-layout.md §3 W4)。
 *
 * 这里只放**纯函数**:把一条执行会话的消息流折成「指令 / 执行 / 出错」三种账目,
 * 以及那一行表头统计。理由与 useShellMode.ts / active-work.ts 同一条:.vue 里挂
 * 不起测试,而"哪些消息算一次执行、序号怎么排"恰恰是最容易在下一次改动里长出
 * 第二份口径的地方。
 *
 * 纪律:
 *  1. **一个账本都不新增。** 步骤全部来自 `ChatMessage.steps`(引擎既有的那份),
 *     线程只是它的一个读法。步号/动词/目标/耗时/diff 一律由 `StepsPanel` 渲染,
 *     这里连一个 Step 字段都不解释。
 *  2. **右栏只承载"已发生的执行"**(W6)。助手的散文不进线程 —— 那是中栏的活;
 *     线程收下的只有"谁让干的(user)"、"干了什么(steps)"、"哪儿炸了(error)"。
 *  3. **不吞错。** role='error' 的消息单独成一档,否则一次失败的执行在右栏会
 *     表现成"没有步骤",比不画更糟。
 */
import type { ChatMessage, Step } from '@/types'

/** 指令行的单行摘要上限 —— 协调器派下来的 drive 正文可以很长。 */
export const THREAD_INSTRUCTION_EXCERPT = 140

export interface ThreadInstructionEntry {
  kind: 'instruction'
  id: string
  timestamp: number
  /** 已折成单行并截断的正文;空正文的消息不会走到这里。 */
  text: string
  /** 插话(steering)与正常指令画法不同:它插在一次执行中间。 */
  steered: boolean
}

export interface ThreadRunEntry {
  kind: 'run'
  id: string
  timestamp: number
  /** 1-based 执行序号 —— 线程里第几次动手,不是第几条消息。 */
  index: number
  steps: Step[]
  /** 这一次执行还在跑(消息在流,或还有步骤停在 pending/running)。 */
  running: boolean
}

export interface ThreadNoteEntry {
  kind: 'note'
  id: string
  timestamp: number
  text: string
}

export type ThreadEntry = ThreadInstructionEntry | ThreadRunEntry | ThreadNoteEntry

const RUNNING_STEP_STATUS = new Set<Step['status']>(['pending', 'running', 'awaiting-confirmation'])

/** 折成单行:线程是账目不是正文,换行与连续空白一律压平。 */
export function excerptInstruction(content: string, limit = THREAD_INSTRUCTION_EXCERPT): string {
  const flat = (content || '').replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit)}…`
}

function isRunningRun(message: ChatMessage, steps: Step[]): boolean {
  if (message.isStreaming) return true
  return steps.some(step => RUNNING_STEP_STATUS.has(step.status))
}

/**
 * 消息流 → 线程账目。
 *
 * 助手消息**只有带步骤时**才成一档:一次纯说话的回合在右栏没有"已发生的执行",
 * 画一个空号头等于告诉用户"这一步什么都没干",不如不画。
 */
export function buildThreadEntries(messages: readonly ChatMessage[]): ThreadEntry[] {
  const entries: ThreadEntry[] = []
  let runIndex = 0

  for (const message of messages) {
    if (message.role === 'user') {
      const text = excerptInstruction(message.content)
      if (!text) continue
      entries.push({
        kind: 'instruction',
        id: message.id,
        timestamp: message.timestamp,
        text,
        steered: message.steered === true,
      })
      continue
    }

    if (message.role === 'error') {
      const text = excerptInstruction(message.content || message.errorDetails || '')
      if (!text) continue
      entries.push({ kind: 'note', id: message.id, timestamp: message.timestamp, text })
      continue
    }

    if (message.role !== 'assistant') continue

    const steps = message.steps ?? []
    if (steps.length === 0) continue

    runIndex += 1
    entries.push({
      kind: 'run',
      id: message.id,
      timestamp: message.timestamp,
      index: runIndex,
      steps,
      running: isRunningRun(message, steps),
    })
  }

  return entries
}

export interface ThreadSummary {
  /** 全线程的步数(表头那句「N 步」)。 */
  stepCount: number
  /** 有几次动手(run 档的数量)。 */
  runCount: number
  /** 还在跑。 */
  running: boolean
  /** 最后一条账目的时间;没有账目时为 0。 */
  lastActivityAt: number
}

export function summarizeThread(entries: readonly ThreadEntry[]): ThreadSummary {
  let stepCount = 0
  let runCount = 0
  let running = false
  let lastActivityAt = 0

  for (const entry of entries) {
    if (entry.timestamp > lastActivityAt) lastActivityAt = entry.timestamp
    if (entry.kind !== 'run') continue
    runCount += 1
    stepCount += entry.steps.length
    if (entry.running) running = true
  }

  return { stepCount, runCount, running, lastActivityAt }
}
