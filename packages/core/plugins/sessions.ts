/**
 * N1 —— 跨会话信使与感知快照的**协议层**(docs/design/pi-benchmark-adoption-2026-08.md)。
 *
 * pi 让用户自己写得出 intercom(会话互聊),靠的不是宽 API 面,而是一个具体原语:
 * **把一个外部事件变成一轮对话** —— `sendMessage(msg, {triggerTurn:true})` +
 * `ctx.isIdle()`。我们缺的就是这两个函数。本文件只放**协议**(枚举、常量、
 * 结果形状),投递与快照的实现在装配层(`app/plugins/sessions.ts`),因为
 * "谁在生成""上下文占了多少"这些事实全住在产品层。
 *
 * 三条纪律:
 *  1. **全部 JSON-可序列化、字段 append-only**(宪法第 2/5 条):这些值过的是一条
 *     将来会变成 RPC 的边界。
 *  2. **零新统计**:快照的每一格都从现成的内存态现算,不为它开第二本账 ——
 *     两本账迟早会漂,而漂的那一刻界面上是一个说谎的状态。
 *  3. **拒绝要结构化**:插件必须**感知得到**自己被拒了以及为什么,否则它只会
 *     以为"发出去了"。所以 sendMessage 从不抛错,它回一份带 reason 的结果。
 */

/* ── 声明门(manifest contributes.permissions)───────────────────────────── */

/** 只入队 / 不起轮的投递(`triggerTurn:false`、`deliverAs:*`、忙时降级)。 */
export const PLUGIN_PERMISSION_SESSIONS_POST = 'sessions:post'
/** 可**起轮** —— 第一个"插件可自发耗 token"的口,单独一档。 */
export const PLUGIN_PERMISSION_SESSIONS_TRIGGER = 'sessions:trigger'
/** 读会话快照(状态 / 标题 / 最后一条消息的摘要)。 */
export const PLUGIN_PERMISSION_SESSIONS_PEEK = 'sessions:peek'

/**
 * 本期新增的三个权限枚举。
 *
 * `contributes.permissions` 本身仍是自由字符串数组(未知值向前兼容地被忽略),
 * 但**这三个名字是被消费的**:未声明即拒绝。
 */
export const PLUGIN_SESSION_PERMISSIONS = [
  PLUGIN_PERMISSION_SESSIONS_POST,
  PLUGIN_PERMISSION_SESSIONS_TRIGGER,
  PLUGIN_PERMISSION_SESSIONS_PEEK,
] as const

export type PluginSessionPermission = (typeof PLUGIN_SESSION_PERMISSIONS)[number]

/** 装前披露的人话文案 —— 用户读的是"它能对我的会话做什么",不是枚举名。 */
export const PLUGIN_SESSION_PERMISSION_NOTES: Record<PluginSessionPermission, string> = {
  [PLUGIN_PERMISSION_SESSIONS_PEEK]: 'can read summaries of your sessions',
  [PLUGIN_PERMISSION_SESSIONS_POST]: 'can post messages into your sessions',
  [PLUGIN_PERMISSION_SESSIONS_TRIGGER]: 'can start a model turn on its own (spends tokens)',
}

export function describePluginPermission(name: string): string {
  const note = PLUGIN_SESSION_PERMISSION_NOTES[name as PluginSessionPermission]
  return note ? `${name} — ${note}` : name
}

/* ── 循环闸(第一个"插件可自发耗 token"的口必须有)────────────────────────── */

/**
 * 链长闸:由插件触发的轮次所产生的**再触发** hop+1,超限拒绝。
 *
 * 与 collab 的链长闸同一条道理:两个会话互相"回个话"是最自然的插件写法,
 * 而它天然是一个不收敛的循环。8 跳足够跑完一次有意义的往返,又短到用户
 * 不会在账单上先发现它。
 */
export const PLUGIN_TRIGGER_MAX_HOP = 8

/** 频率闸:每 `(pluginId, targetSessionId)` 对,每窗口最多这么多次投递。 */
export const PLUGIN_TRIGGER_RATE_LIMIT = 10
export const PLUGIN_TRIGGER_RATE_WINDOW_MS = 60_000

/* ── 投递矩阵 ─────────────────────────────────────────────────────────────── */

/**
 * 既有队列的显式选择。
 *
 * `nextTurn` **不是第三条队列** —— 引擎只有 steering(本轮插话)与 follow-up
 * (本轮 agent-loop 的下一次迭代)两条。它诚实地映射到最接近的既有语义:
 * follow-up。见 `PLUGIN_DELIVER_AS_NOTES`。
 */
export type PluginDeliverAs = 'steer' | 'followUp' | 'nextTurn'

export const PLUGIN_DELIVER_AS_NOTES: Record<PluginDeliverAs, string> = {
  steer: 'steering queue — joins the in-flight turn, or waits for the next one',
  followUp: 'follow-up queue — drained by the running agent loop on its next iteration',
  nextTurn: 'mapped to the follow-up queue (the engine has no third queue)',
}

export interface PluginSendMessageOptions {
  /**
   * `true` = 目标空闲就**起一轮**、忙就降级为 steer(不抛错,结果里如实说);
   * `false` = 只持久化 + 显示,不起轮;
   * 缺省 = 按 `false` 处理(fail-closed:不声明就不花 token)。
   */
  triggerTurn?: boolean
  /** 显式选队列。给了它就**不看** triggerTurn(两者同时给时以 deliverAs 为准)。 */
  deliverAs?: PluginDeliverAs
}

/** 实际走了哪一格 —— 插件据此写自己的文案("已叫醒" vs "已排队")。 */
export type PluginMessageDelivery =
  /** 真的起了一轮(command:send-message 等价路径)。 */
  | 'triggered'
  /** 进了 steering 队列(忙时降级,或显式 deliverAs:'steer')。 */
  | 'steered'
  /** 进了 follow-up 队列(deliverAs:'followUp' | 'nextTurn')。 */
  | 'followed-up'
  /** 持久化 + 显示,不起轮(triggerTurn:false / 缺省)。 */
  | 'posted'

export type PluginSendMessageRejection =
  /** manifest 没声明 sessions:post / sessions:trigger。 */
  | 'not-declared'
  | 'empty-content'
  | 'unknown-session'
  /** 链长闸(PLUGIN_TRIGGER_MAX_HOP)。 */
  | 'hop-limit'
  /** 频率闸(PLUGIN_TRIGGER_RATE_LIMIT / 窗口)。 */
  | 'rate-limited'
  /** 这个宿主没有投递面(headless / server),或目标会话不接受插件投递。 */
  | 'unsupported'
  | 'error'

export interface PluginSendMessageResult {
  ok: boolean
  /** 只在 ok 时有;**如实**说明实际投递方式(三态矩阵的哪一格)。 */
  delivered?: PluginMessageDelivery
  /** 投递时目标是否正在生成 —— `triggerTurn:true` 被降级时用户要知道为什么。 */
  targetWasBusy?: boolean
  /** 这一次投递记在第几跳(循环闸账)。 */
  hop?: number
  reason?: PluginSendMessageRejection
  /** 人话补充(哪个权限没声明、闸的阈值是多少……)。 */
  detail?: string
}

/* ── 感知快照 ─────────────────────────────────────────────────────────────── */

/**
 * 压缩快照的状态词汇(架构图 §0「感知」象限的"只读快照"那一格)。
 *
 * 判定优先序(装配层实现,这里写死语义):
 *   `awaiting-permission` > `tool-running` > `generating` > `idle`。
 * 权限排最前是因为它答的是**"这轮还会不会自己往前走"** —— 挂着一张没人点的
 * 审批卡时,会话在技术上仍是 active stream,但它一步也不会动。信使插件要据此
 * 决定"现在插话还是等等",把它说成 generating 就是在说谎。
 */
export type PluginSessionState =
  | 'idle'
  | 'generating'
  | 'tool-running'
  | 'awaiting-permission'

/** 最后一条消息的**摘要**硬截长度。正文永不整条出境。 */
export const PLUGIN_PEEK_PREVIEW_MAX = 120

export interface PluginSessionPeekLite {
  sessionId: string
  /** 会话标题;没有就是 null(不是空串 —— 插件要分得清"没标题"与"标题是空的")。 */
  title: string | null
  state: PluginSessionState
  /** 仅 `tool-running`:正在跑的工具名。 */
  currentTool?: string
  updatedAt: number
}

export interface PluginSessionPeekLastMessage {
  role: string
  /** ≤ PLUGIN_PEEK_PREVIEW_MAX 字符,换行折成空格。 */
  preview: string
  at: number
}

export interface PluginSessionPeek extends PluginSessionPeekLite {
  lastMessage?: PluginSessionPeekLastMessage
  /**
   * 上下文占用百分比(0–100,四舍五入到整数)。口径与输入框的 ctx 仪表逐字相同:
   * `contextSize ?? lastInputTokens` ÷ 该会话上次用的模型的上下文窗口。
   * 解析不出模型窗口时**这个键不出现**(而不是给 0 —— 0 是一个会被当真的数)。
   */
  contextPercent?: number
}

/** 摘要:硬截 + 折行。协议层出这一个函数,两侧不各写一遍。 */
export function pluginPeekPreview(text: string, max = PLUGIN_PEEK_PREVIEW_MAX): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/**
 * 三态矩阵的**判定**(纯函数,两侧共用):给定选项与目标忙闲,走哪一格。
 *
 * 抽出来是因为矩阵才是这一期的产物 —— pi 的教训是"照抄矩阵,不是布尔"。
 * 把它留在实现里,下一个人改忙闲判定时很容易顺手把矩阵也改了。
 */
export function resolvePluginDelivery(
  options: PluginSendMessageOptions | undefined,
  targetBusy: boolean,
): PluginMessageDelivery {
  const deliverAs = options?.deliverAs
  if (deliverAs === 'steer') return 'steered'
  if (deliverAs === 'followUp' || deliverAs === 'nextTurn') return 'followed-up'
  // 缺省(triggerTurn 未给)按 false 处理:不声明就不花 token。
  if (options?.triggerTurn !== true) return 'posted'
  return targetBusy ? 'steered' : 'triggered'
}

/** 这一格会不会起一轮 —— `sessions:trigger` 声明门的判据。 */
export function pluginDeliveryStartsTurn(delivery: PluginMessageDelivery): boolean {
  return delivery === 'triggered'
}
