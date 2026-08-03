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
  CollabAgentMind,
  CollabCoordinatorBlockedBy,
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

/**
 * 「这个人的大脑在哪」的读口 —— 由调用方从 collabBoard 的 agents 账注入
 * (D8 观测体系 §4.6:全部 UI 从两本快照账派生,这一面一个字段都不新增)。
 *
 * 不给 = 一律当空闲。「读不到」与「空闲」在界面上刻意是同一个样子:为"还没补上水"
 * 单开一个加载态,只会让安静的房间每次开面闪一下。
 */
export type CoordinatorMindResolver = (agentId: string) => CollabAgentMind | null | undefined

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
  /**
   * 这间房的 actor 处理事件失败了几次(D8 §3.4)。>0 时条尾亮一颗红点。
   *
   * 死信在 D8 之前是一个**没有消费者**的内存环:一封信炸了,循环继续跑,而系统
   * 静默地变哑 —— 用户看到的是「它没回应」,真相是「它试过但炸了」。这颗点是分开
   * 这两件事的地方,详情在后台面板的时间轴上。
   */
  deadLetters: number
}

/**
 * 常驻条那一行。**优先级是刻意的**:先说"被什么拦住了",再说"谁在动"。
 *
 * 一个正在跑的回合旁边挂着一道已经撞上的闸时,用户要先知道后者 —— 前者自己会
 * 结束,后者不动手就永远不会。
 *
 * 「谁在动」这一句在 D8 里改了词(蓝图 §4.1)。旧词是「N 人正在说」,而 v3 有
 * **第三种状态**:牌发出去之后要先躺进那个 agent 的信箱,等它的心智循环取到这一批
 * 才起跑,而那颗大脑此刻可能正在别的房里想。「持牌等大脑」在 v2 的词汇表里没有
 * 对应词,于是状态条把它画成「正在说」—— 用户看见一个在说话、实则一个字都还没写
 * 的人。两个数字分开写,那句谎就说不出来了。
 */
export function buildCoordinatorBar(
  state: CollabCoordinatorState | null,
  /**
   * 留着但**不再用**:改词之后这一行只说数字了(见上)。名字下沉到「现在」那几行
   * (那儿有整行宽度写「(在别处思考)」这样的后缀)。参数保留是为了不动四个调用点
   * 与整套用例的形状 —— 而那正是这次改词最容易夹带回归的地方。
   */
  _resolveName: (agentId: string) => string,
): CoordinatorBarView {
  const modeLabel = state?.mode === 'serial'
    ? '顺序'
    : state?.mode === 'auto' ? '智能' : '并行'
  const deadLetters = state?.deadLetterCount ?? 0
  const base = { tail: modeLabel, action: null as 'resume' | null, deadLetters }
  if (!state) return { ...base, lamp: 'off', text: '空闲' }

  if (state.frozen) {
    return { ...base, lamp: 'idle', text: '已暂停 · 队列已清空', tail: '', action: 'resume' }
  }

  const chain = state.gates.chain
  if (chain.max > 0 && chain.value >= chain.max) {
    return { ...base, lamp: 'wait', text: `已按住 · 连聊 ${chain.max} 条` }
  }

  const budget = state.gates.budget
  if (budget.max > 0 && budget.value >= budget.max) {
    return { ...base, lamp: 'wait', text: '已按住 · 今日预算用尽' }
  }

  if (state.judging > 0) {
    // 判定阶段刻意不点名:候选面没有被单独记下来,而编一份名字比不给更糟。
    const asked = state.judgingAgentIds.length
    return {
      ...base,
      lamp: 'wait',
      text: asked > 0 ? `${asked} 人在判断要不要接话` : '正在判断谁接话',
    }
  }

  const holding = state.turns.length
  if (holding > 0) {
    const generating = countCoordinatorGenerating(state)
    return {
      ...base,
      // 一个人都没在生成 = 满屋子的牌都在等大脑 —— 那是 wait,不是 run。
      lamp: generating > 0 ? 'run' : 'wait',
      text: `持牌 ${holding} · 生成中 ${generating}`,
      tail: state.plan ? `${modeLabel} · 第 ${state.plan.waveCount + 1} 批` : modeLabel,
    }
  }

  if (state.queue.length > 0) {
    return { ...base, lamp: 'wait', text: `${state.queue.length} 人排队中` }
  }

  return { ...base, lamp: 'off', text: '空闲' }
}

/** 此刻**真在生成**的牌数(判据是 turn-context 登记簿,不是租约表)。 */
export function countCoordinatorGenerating(state: CollabCoordinatorState | null): number {
  return (state?.turns ?? []).filter(turn => turn.executing).length
}

// ── 「现在」 ──────────────────────────────────────────────────────────────

/**
 * 一张牌此刻的三态(D8 §1 词汇表修正)。
 *
 * `waiting-mind` 与 `thinking-elsewhere` 在旧词汇表里都读作「正在说」,而它们要
 * 用户做的事完全不同:前者是这颗大脑一会儿就轮到这间房(等就是了),后者是它此刻
 * 正被**别的房**占着 —— 「怎么半天不说话」的答案在另一扇窗里。
 */
export type CoordinatorHoldState = 'generating' | 'thinking-elsewhere' | 'waiting-mind'

/** 持牌未执行时名字后面那一截。 */
const HOLD_SUFFIX: Readonly<Record<CoordinatorHoldState, string>> = {
  generating: '',
  'thinking-elsewhere': '(在别处思考)',
  'waiting-mind': '(等大脑)',
}

export interface CoordinatorNowRow {
  key: string
  /** 状态字形 —— 头像在下面的线程列表里已经是主角,这一段要的是阶段。 */
  glyph: '▶' | '◐' | '○' | '◌'
  running: boolean
  name: string
  reason: string
  /** 在跑的行才有:下钻/停 的靶子。 */
  agentSessionId: string
  /** 排队的行才有:撤 的靶子。 */
  activationId: string
  startedAt: number
  /** 持牌行才有;其余行是 null。 */
  hold: CoordinatorHoldState | null
}

/**
 * 一张牌的三态。`executing` 说得出前一种,后两种要问 agents 账 ——
 * 「等大脑」与「在别处思考」的分界只有那本账知道(房间账里根本没有别的房)。
 */
export function resolveCoordinatorHoldState(input: {
  roomSessionId: string
  agentId: string
  executing: boolean
  resolveMind?: CoordinatorMindResolver
}): CoordinatorHoldState {
  if (input.executing) return 'generating'
  const mind = input.resolveMind?.(input.agentId)
  if (mind?.state === 'thinking' && mind.roomSessionId && mind.roomSessionId !== input.roomSessionId) {
    return 'thinking-elsewhere'
  }
  // 大脑说它就在这间房想,但登记簿里没有这张牌 —— 那也是"还没起跑",归「等大脑」:
  // 这一格说的是牌的处境,不是大脑的处境。
  return 'waiting-mind'
}

export function buildCoordinatorNowRows(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
  resolveMind?: CoordinatorMindResolver,
): CoordinatorNowRow[] {
  if (!state) return []
  const rows: CoordinatorNowRow[] = state.turns.map(turn => {
    const hold = resolveCoordinatorHoldState({
      roomSessionId: state.roomSessionId,
      agentId: turn.agentId,
      executing: turn.executing,
      ...(resolveMind ? { resolveMind } : {}),
    })
    return {
      key: `turn:${turn.agentSessionId}`,
      // 实心 ▶ 只给真在写字的那一张。空心 ◐ = 牌在手上,人还没开始 ——
      // 两个字形之外不加别的记号:这一列本来就只回答"处在什么阶段"。
      glyph: hold === 'generating' ? ('▶' as const) : ('◐' as const),
      running: true,
      name: `${resolveName(turn.agentId)}${HOLD_SUFFIX[hold]}`,
      reason: coordinatorReasonLabel(turn.reason),
      agentSessionId: turn.agentSessionId,
      activationId: '',
      startedAt: turn.startedAt,
      hold,
    }
  })

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
      hold: null,
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
      hold: null,
    })
  }
  return rows
}

// ── 排队:六道闸的细分 ────────────────────────────────────────────────────

export interface CoordinatorQueueBadge {
  key: CollabCoordinatorBlockedBy
  /** 徽标上那三个字。 */
  label: string
  count: number
  /** hover 明细:这道闸要用户做什么 + 卡在上面的人。 */
  hint: string
  /**
   * 这道闸**要人动手**吗。
   *
   * 前两道(裁决中、等座位)几秒后自解,后四道(链闸、相位、冻结、预算)不动手
   * 就永远不会开 —— 而在细分之前它们在界面上长得一模一样,「怎么没人理我」这个
   * 问题因此只能靠猜。这一格就是那条分界线,呈现层据它决定要不要扎眼。
   */
  actionable: boolean
}

const BLOCKED_LABEL: Readonly<Record<CollabCoordinatorBlockedBy, string>> = {
  judging: '裁决中',
  seats: '等座位',
  chain: '链闸',
  phase: '相位挂起',
  frozen: '冻结',
  budget: '预算',
}

/** 每道闸的一句人话:说清**下一步要谁做什么**,而不是复述闸的名字。 */
const BLOCKED_HINT: Readonly<Record<CollabCoordinatorBlockedBy, string>> = {
  judging: '正在判谁先说,几秒后自解',
  seats: '同时发言已满,等人让位',
  chain: '连聊到上限,你说句话就放开',
  phase: '不在活跃相,要换相才轮得到',
  frozen: '房间已暂停,恢复后才排得上',
  budget: '今日预算用尽,明天恢复或改配额',
}

/** 自解的两道 vs 要人动手的四道(见 `CoordinatorQueueBadge.actionable`)。 */
const BLOCKED_ACTIONABLE: ReadonlySet<CollabCoordinatorBlockedBy> = new Set<CollabCoordinatorBlockedBy>([
  'chain',
  'phase',
  'frozen',
  'budget',
])

/** 闸的呈现次序:自解的在前,要动手的在后 —— 读到最后一个才是"该你出手了"。 */
const BLOCKED_ORDER: readonly CollabCoordinatorBlockedBy[] = [
  'judging',
  'seats',
  'chain',
  'phase',
  'frozen',
  'budget',
]

/**
 * 「N 人排队中」→ 按 `blockedBy` 细分的徽标(蓝图 §4.1)。
 *
 * 一个笼统的排队数底下是六件成因完全不同的事,而这个函数就是把它们分开。空的闸
 * 整格不出现(不画「链闸 0」)。
 */
export function buildCoordinatorQueueBadges(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
): CoordinatorQueueBadge[] {
  if (!state?.queue.length) return []
  const names = new Map<CollabCoordinatorBlockedBy, string[]>()
  for (const queued of state.queue) {
    const key = queued.blockedBy
    const bucket = names.get(key) ?? []
    bucket.push(resolveName(queued.agentId))
    names.set(key, bucket)
  }
  return BLOCKED_ORDER
    .filter(key => names.has(key))
    .map(key => {
      const who = names.get(key) ?? []
      return {
        key,
        label: BLOCKED_LABEL[key],
        count: who.length,
        hint: `${BLOCKED_HINT[key]} · ${who.join(' ')}`,
        actionable: BLOCKED_ACTIONABLE.has(key),
      }
    })
}

// ── 裁决窗三态 ────────────────────────────────────────────────────────────

/** 降级要**亮牌**:回落 FIFO 是一次失败,不是一个答案。 */
export const COORDINATOR_JUDGMENT_DEGRADED_TEXT = '裁决降级:FIFO'

export type CoordinatorJudgmentView =
  /** 还没开始问。`countdown` 是那个虚点旁边的倒计秒(`opensAt` 到了就是 0)。 */
  | { state: 'debouncing'; opensAt: number; countdown: string; text: string }
  /** 在飞:候选头像 + 转圈。 */
  | { state: 'inflight'; candidates: string[]; since: number; text: string }
  /** 降级:黄牌。`reason` 是账上那句占位,完整成因在时间轴的 judge-degraded 行。 */
  | { state: 'degraded'; reason: string; at: number; text: string }

/**
 * 裁决窗此刻画成什么。`idle` 给 `null` —— **不画**,而不是画一句「空闲」:
 * 状态条那一格只在有事发生时占位置。
 *
 * 三态各画各的样子,是因为它们在旧的两格里(`judging` / `judgingAgentIds`)会塌成
 * 同一个答案:一次回落 FIFO 表现为 `judging: 0`,与「没有裁决在跑」一模一样,而它
 * 恰恰是必须修的那一类。
 */
export function buildCoordinatorJudgment(
  state: CollabCoordinatorState | null,
  resolveName: (agentId: string) => string,
  now: number,
): CoordinatorJudgmentView | null {
  const judgment = state?.judgment
  if (!judgment || judgment.state === 'idle') return null
  if (judgment.state === 'debouncing') {
    const seconds = Math.max(0, Math.ceil((judgment.opensAt - now) / 1000))
    return {
      state: 'debouncing',
      opensAt: judgment.opensAt,
      countdown: `${seconds}s`,
      text: '准备裁决',
    }
  }
  if (judgment.state === 'inflight') {
    const candidates = judgment.candidates.map(resolveName).filter(Boolean)
    return {
      state: 'inflight',
      candidates,
      since: judgment.since,
      text: candidates.length > 0 ? `裁决 ${candidates.length} 人` : '裁决中',
    }
  }
  return {
    state: 'degraded',
    reason: judgment.reason,
    at: judgment.at,
    text: COORDINATOR_JUDGMENT_DEGRADED_TEXT,
  }
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
