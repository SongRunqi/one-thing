/**
 * 协调器状态条的**纯逻辑** —— docs/design/collab-coordinator-inspector.md。
 *
 * 快照进来,四段的行和常驻条那一句出去。不碰 DOM,所以每一条措辞与每一个阈值
 * 都判定得了 —— 这一面全是"数字怎么读"的判断,而那正是最容易悄悄写错的地方。
 *
 * 与 `room-threads.ts` / `room-backstage.ts` 同一条纪律:**一份账都不新增**。
 * 这里连状态都不存,只是把后端那一份快照翻译成人话。
 */
import type {
  CollabCoordinatorGate,
  CollabCoordinatorLogEntry,
  CollabCoordinatorState,
} from '@shared/ipc'

/** 闸逼近上限时转橙的阈值。80% 是"还能跑但该知道了"。 */
export const COORDINATOR_GATE_WARN_RATIO = 0.8

/** 「刚才」最多画几条。缓冲本身留 32,面板上给 6 —— 再多就成了日志。 */
export const COORDINATOR_LOG_ROWS = 6

/** 激活理由 → 行上那三个字。与 `COLLAB_ACTIVATION_LABELS` 同源同文案。 */
const REASON_LABEL: Record<string, string> = {
  mention: '被 @ 激活',
  'self-elected': '主动接话',
  'task-event': '任务事件',
  schedule: '定时触发',
  relay: '轮到发言',
}

export function coordinatorReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? ''
}

// ── 常驻条 ────────────────────────────────────────────────────────────────

export type CoordinatorLamp = 'run' | 'wait' | 'idle' | 'off'

export interface CoordinatorBarView {
  lamp: CoordinatorLamp
  /** 主句:此刻卡在哪儿。 */
  text: string
  /** 右端那一小截:模式 + 一个关键数字。 */
  tail: string
  /** 暂停/撞闸时条上直接给动作 —— 那两种状态用户唯一想做的事就是解开它。 */
  action: 'resume' | null
}

/**
 * 常驻条那一行。**优先级是刻意的**:先说"被什么拦住了",再说"谁在动"。
 *
 * 一个正在跑的回合旁边挂着一道已经撞上的闸时,用户要先知道后者 —— 前者自己会
 * 结束,后者不动手就永远不会。
 */
export function buildCoordinatorBar(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
): CoordinatorBarView {
  const modeLabel = state?.mode === 'serial'
    ? '顺序'
    : state?.mode === 'auto' ? '智能' : '并行'
  if (!state) return { lamp: 'off', text: '空闲', tail: modeLabel, action: null }

  if (state.frozen) {
    return { lamp: 'idle', text: '已暂停 · 队列已清空', tail: '', action: 'resume' }
  }

  const chain = state.gates.chain
  if (chain.max > 0 && chain.value >= chain.max) {
    return {
      lamp: 'wait',
      text: `已按住 · 连聊 ${chain.max} 条`,
      tail: modeLabel,
      action: null,
    }
  }

  const budget = state.gates.budget
  if (budget.max > 0 && budget.value >= budget.max) {
    return { lamp: 'wait', text: '已按住 · 今日预算用尽', tail: modeLabel, action: null }
  }

  if (state.judging > 0) {
    // 判定阶段刻意不点名:候选面没有被单独记下来,而编一份名字比不给更糟。
    const asked = state.judgingAgentIds.length
    return {
      lamp: 'wait',
      text: asked > 0 ? `${asked} 人在判断要不要接话` : '正在判断谁接话',
      tail: modeLabel,
      action: null,
    }
  }

  const running = state.turns[0]
  if (running) {
    const others = state.turns.length - 1
    const who = resolveName(running.agentId)
    return {
      lamp: 'run',
      text: others > 0 ? `${who} 等 ${state.turns.length} 人正在说` : `${who} 正在说`,
      tail: state.plan ? `${modeLabel} · 第 ${state.plan.waveCount + 1} 批` : modeLabel,
      action: null,
    }
  }

  if (state.queue.length > 0) {
    return { lamp: 'wait', text: `${state.queue.length} 人排队中`, tail: modeLabel, action: null }
  }

  return { lamp: 'off', text: '空闲', tail: modeLabel, action: null }
}

// ── 「现在」 ──────────────────────────────────────────────────────────────

export interface CoordinatorNowRow {
  key: string
  /** 状态字形 —— 头像在下面的线程列表里已经是主角,这一段要的是阶段。 */
  glyph: '▶' | '○' | '◌'
  running: boolean
  name: string
  reason: string
  /** 在跑的行才有:下钻/停 的靶子。 */
  agentSessionId: string
  /** 排队的行才有:撤 的靶子。 */
  activationId: string
  startedAt: number
}

export function buildCoordinatorNowRows(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
): CoordinatorNowRow[] {
  if (!state) return []
  const rows: CoordinatorNowRow[] = state.turns.map(turn => ({
    key: `turn:${turn.agentSessionId}`,
    glyph: '▶' as const,
    running: true,
    name: resolveName(turn.agentId),
    reason: coordinatorReasonLabel(turn.reason),
    agentSessionId: turn.agentSessionId,
    activationId: '',
    startedAt: turn.startedAt,
  }))

  for (const queued of state.queue) {
    rows.push({
      key: `queue:${queued.id}`,
      glyph: '○',
      running: false,
      name: resolveName(queued.agentId),
      reason: coordinatorReasonLabel(queued.reason),
      agentSessionId: '',
      activationId: queued.id,
      startedAt: 0,
    })
  }

  if (state.judging > 0) {
    rows.push({
      key: 'judging',
      glyph: '◌',
      running: false,
      name: '意愿判定',
      reason: state.judgingAgentIds.map(resolveName).join(' '),
      agentSessionId: '',
      activationId: '',
      startedAt: 0,
    })
  }
  return rows
}

// ── 闸 ────────────────────────────────────────────────────────────────────

export interface CoordinatorGateRow {
  key: 'chain' | 'concurrency' | 'budget'
  label: string
  /** 0–100。上限关着(max=0)时恒 0 —— 一条走满的线会让"不限"看起来像"撞死了"。 */
  percent: number
  value: string
  warn: boolean
}

function gateRow(
  key: CoordinatorGateRow['key'],
  label: string,
  gate: CollabCoordinatorGate,
  format: (gate: CollabCoordinatorGate) => string,
): CoordinatorGateRow {
  const unlimited = !(gate.max > 0)
  const ratio = unlimited ? 0 : gate.value / gate.max
  return {
    key,
    label,
    percent: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    value: format(gate),
    warn: !unlimited && ratio >= COORDINATOR_GATE_WARN_RATIO,
  }
}

export function buildCoordinatorGateRows(
  state: CollabCoordinatorState | null,
): CoordinatorGateRow[] {
  if (!state) return []
  return [
    gateRow('chain', '连续发言', state.gates.chain, gate =>
      gate.max > 0 ? `${gate.value}/${gate.max}` : `${gate.value}/∞`),
    gateRow('concurrency', '同时发言', state.gates.concurrency, gate =>
      gate.max > 0 ? `${gate.value}/${gate.max}` : `${gate.value}/∞`),
    gateRow('budget', '今日花费', state.gates.budget, gate =>
      gate.max > 0 ? `$${gate.value.toFixed(2)}/${gate.max}` : `$${gate.value.toFixed(2)}`),
  ]
}

// ── 编排 ──────────────────────────────────────────────────────────────────

export interface CoordinatorPlanView {
  /** 一批一行:批内的人 + 这一批是不是正在跑。 */
  waves: Array<{ names: string[]; current: boolean }>
  /** 「第 6 批 · 第 2 轮」。 */
  progress: string
  /** 「不限轮」或「上限 3 轮」。 */
  limit: string
  /** 协调器给的一句话理由 —— 用户第一次能看到它为什么这么排。 */
  why: string
}

/**
 * 编排视图。
 *
 * 接力时代这里是一条 `名字 › 名字 › 名字` 的环。编排之后画的是**批**:
 * 单人批连起来看着仍然像那条环,而多人批(`阿般 · 小李`)是环画不出来的 ——
 * 而那恰恰是编排比模式多出来的表达力。
 */
export function buildCoordinatorPlan(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
): CoordinatorPlanView | null {
  const plan = state?.plan
  if (!plan || plan.waves.length === 0) return null
  // 「当前第几批」= 已完成批数 + 1(2026-08-02 三审):`waveCount` 数的是**跑完**
  // 的批,而编排装上那一刻第一批就已经发牌 —— 拿 0 说「尚未开跑」,同一面板的
  // 「现在」里成员却亮着 ▶,自相矛盾。轮号与批号用同一个基数才对得上:
  // 每轮 4 批、正跑第 5 批时是「第 5 批 · 第 2 轮」,而不是批号一轮、轮号下一轮。
  const current = plan.waveCount + 1
  const lap = Math.floor(plan.waveCount / plan.waves.length) + 1
  return {
    waves: plan.waves.map((wave, index) => ({
      names: wave.map(resolveName),
      current: index === plan.waveIndex,
    })),
    progress: plan.cycle ? `第 ${current} 批 · 第 ${lap} 轮` : `第 ${current} 批`,
    limit: plan.cycle ? (plan.loops > 0 ? `上限 ${plan.loops} 轮` : '不限轮') : '走一遍',
    why: plan.why,
  }
}

// ── 「刚才」 ──────────────────────────────────────────────────────────────

export interface CoordinatorLogRow {
  key: string
  at: number
  text: string
  /** 灰行:没有发生实质动作的那些(没说话、被按住)。 */
  muted: boolean
}

/**
 * 判定成因的人话(状态条 §8)。`yes` 不列 —— 它已经在主句的「N 人接话」里了,
 * 再说一遍是噪音。
 *
 * 次序是**故意**的:先说链断了的那几种(超时/没发出去/读不懂/出错),最后才说
 * "说不"。用户来看这一行是要判断"要不要修",而前四种才是要修的。
 */
const JUDGED_OUTCOME_TEXT: ReadonlyArray<[string, string]> = [
  ['timeout', '超时'],
  ['unresolved', '没发出去'],
  ['unparsable', '读不懂'],
  ['error', '出错'],
  ['aborted', '被打断'],
  ['no', '说不'],
]

function formatJudgedBreakdown(outcomes: Record<string, number> | undefined): string {
  if (!outcomes) return ''
  const parts: string[] = []
  for (const [kind, label] of JUDGED_OUTCOME_TEXT) {
    const count = outcomes[kind]
    if (count) parts.push(`${count} ${label}`)
  }
  // 全员「说不」时不加括号:那是正常的沉默,不是需要解释的事故。
  if (parts.length === 1 && outcomes.no) return ''
  return parts.join(' · ')
}

const BLOCKED_TEXT: Record<string, string> = {
  chain: '按住 · 连聊到上限',
  budget: '按住 · 今日预算用尽',
  loops: '按住 · 轮次用尽',
  frozen: '房间已暂停',
}

function logText(
  entry: CollabCoordinatorLogEntry,
  resolveName: (agentId: string) => string,
): string {
  const who = entry.agentId ? resolveName(entry.agentId) : ''
  switch (entry.kind) {
    case 'received':
      return '收到你的消息'
    case 'judging':
      return `判定 ${entry.count ?? 0} 人…`
    case 'judged': {
      // 「都没接话」比「0 人接话」像人话,而这一行恰恰是最常被读到的那一条。
      const head = entry.count
        ? `判定 ${entry.total ?? 0} 人 → ${entry.count} 人接话`
        : `判定 ${entry.total ?? 0} 人 → 都没接话`
      const why = formatJudgedBreakdown(entry.outcomes)
      return why ? `${head}(${why})` : head
    }
    case 'relay-pass':
      return `插队 → ${who}`
    case 'planned': {
      // 编排的完整决定进这一行:谁、什么次序、为什么 —— 编排跑完 `state.plan`
      // 就没了,「刚才」是它唯一活得久的地方。空编排(这轮没人该说)也必须开口:
      // 读懂了的沉默和坏掉的链不能在界面上长一个样(2026-08-02 真机)。
      if (!entry.count) {
        return entry.detail ? `编排:这轮无人发言(${entry.detail})` : '编排:这轮无人发言'
      }
      const order = (entry.waves ?? [])
        .map(wave => wave.map(resolveName).filter(Boolean).join('·'))
        .filter(Boolean)
        .join(' → ')
      const head = order ? `编排:${order}` : `编排 ${entry.count} 批`
      return entry.detail ? `${head}(${entry.detail})` : head
    }
    case 'wave':
      return entry.count && entry.count > 1
        ? `${entry.count} 人一起说`
        : who ? `轮到 ${who}` : '下一批'
    case 'plan-failed':
      return `编排没要到(${PLAN_FAILURE_TEXT[entry.detail ?? ''] ?? entry.detail ?? '未知'}),改为逐个问`
    case 'spoke':
      return `${who} 说了 ${entry.count ?? 1} 句`
    case 'silent':
      return `${who} 没说话`
    case 'unsent':
      // 与「没说话」分开:那是选择,这是事故 —— 回合写好了答复却没通过 say 发出,
      // 那段话躺在执行会话里谁也看不见。刻意不进 MUTED(它该扎眼)。
      return `${who} 写了话但没发送`
    case 'adopted':
      // 收养式兜底(2026-08-02):话已由框架代为送达,但「忘了按发送」这个事实
      // 保留在账上 —— 哪位同事总栽在这里,一眼要能看出来。同样不进 MUTED。
      return `${who} 写了话没按发送 · 已代发`
    case 'blocked':
      return BLOCKED_TEXT[entry.detail ?? ''] ?? '被按住了'
    case 'stopped':
      return '你喊了停 · 已清场'
    default:
      return ''
  }
}

const PLAN_FAILURE_TEXT: Record<string, string> = {
  timeout: '超时',
  unresolved: '没发出去',
  unparsable: '读不懂',
  aborted: '被打断',
  error: '出错',
}

const MUTED_KINDS = new Set(['silent', 'blocked', 'judging', 'wave', 'plan-failed'])

/**
 * 「刚才」的行,**新在前**(后端存的是旧在前:那是缓冲的自然顺序,而读的时候
 * 人先看最近发生的事)。
 */
export function buildCoordinatorLogRows(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
  limit: number = COORDINATOR_LOG_ROWS,
): CoordinatorLogRow[] {
  if (!state) return []
  const rows: CoordinatorLogRow[] = []
  for (let index = state.log.length - 1; index >= 0 && rows.length < limit; index--) {
    const entry = state.log[index]
    const text = logText(entry, resolveName)
    if (!text) continue
    rows.push({
      key: `${entry.at}:${index}`,
      at: entry.at,
      text,
      muted: MUTED_KINDS.has(entry.kind),
    })
  }
  return rows
}

/**
 * 相对时刻:`12s` / `3m` / `2h`。
 *
 * 与线程列表右端那一格同一个register(短、mono、不带"前"字)—— 两处一上一下
 * 挨着,措辞不同会读成两套时间。
 */
export function formatCoordinatorAgo(at: number, now: number): string {
  if (!at) return ''
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

/** 在跑的行右端那一格:`0:12` —— 计时用分:秒,它在走,和"多久以前"不是一回事。 */
export function formatCoordinatorElapsed(startedAt: number, now: number): string {
  if (!startedAt) return ''
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
