/**
 * 聊天面(say-only)的行投影 —— 纯逻辑(docs/design/im-workbench-layout.md §3 W2 / §5 C2′)。
 *
 * 「聊天」的定义(2026-07-31 用户澄清):**群聊与私聊里,聊天面只展示 agent
 * `say` 的内容**。say 里本来就有表格、代码、列表,markdown 照常渲染;而工具卡、
 * diff、执行步骤是"某个 agent 在后台干活",它们的归属是右栏线程(W4)。
 *
 * 这里只放纯函数:不认识 Vue、不认识 DOM,输入是消息的结构切片,输出是
 * 「这一行画什么 / 这一行要不要署名 / 展开执行入口挂在谁身上」。
 *
 * ── 与房间既有 `room-grouping.ts` 的关系(本期最关键的一条纪律)────────────
 *
 * `room-grouping.ts` 有两件事,C2′ **拆开对待**:
 *
 *  1. **时间胶囊 + 隐藏机器件**(`filterRoomMessages` / `buildRoomMessageLayout`
 *     的 `capsules`):**照旧复用**。胶囊的口径(10 分钟 / 跨天)与"哪些消息不是
 *     聊天"的判定都在那儿,聊天面不另起一套。
 *  2. **`groupHeads` 署名口径**:**不用**。它只在 `role==='assistant' &&
 *     同一个 agentId` 之间合并,用户连发的两条各自成头 —— 方案 A 的连发合并是
 *     **按说话人**的(我连着说两句同样不重复署名)。所以署名口径统一走
 *     `speaker-runs.ts`,并在胶囊落下的地方**强制断开**(胶囊 10 分钟窗比连发
 *     5 分钟窗长,唯一漏网的是跨天但间隔很短的那一下)。
 *
 * 净结果:**新树里只有一套署名**(speaker-runs ∪ 胶囊断点)。房间既有的
 * `groupHeads` 头像列/`collab-sender`/折叠把手全部随 `MessageItem` 留在旧树里,
 * 两棵树互不挂载,不可能同时渲染两个名字。
 */
import {
  buildRoomMessageLayout,
  type RoomMessageLike,
} from '../message/room-grouping'
import {
  buildSpeakerRunHeads,
  type SpeakerRunMessageLike,
} from '../message/speaker-runs'
import { REPLY_USER_LABEL } from '../message/reply-quote'

/** 这个模块读到的消息切片 —— 多读一个字段就是多一分耦合。 */
export interface SayMessageLike extends RoomMessageLike, SpeakerRunMessageLike {
  role: string
  replyTo?: { authorLabel?: string } | null
}

export interface SaySpeechRow {
  kind: 'speech'
  index: number
  /** 一段发言的第一条:画头像 + 署名行。后续条留白,正文对齐同一条轴。 */
  head: boolean
  /** 一段发言的最后一条:hover 操作行与「展开执行 →」挂在这里。 */
  tail: boolean
  /** 这条消息在回我的话 —— 左墨条。见 `isAddressedToUser`。 */
  addressed: boolean
}

export interface SayNoticeRow {
  kind: 'notice'
  index: number
}

export interface SayErrorRow {
  kind: 'error'
  index: number
}

export type SayRow = SaySpeechRow | SayNoticeRow | SayErrorRow

export interface SayLayout {
  rows: SayRow[]
  /** index → 胶囊文案,画在该行**之前**。复用 room-grouping 的口径。 */
  capsules: Map<number, string>
  /**
   * agentId → 该 agent **最后一段发言的末行**下标。
   *
   * 「展开执行 →」在中栏只留一个入口(W3),所以每个 agent 至多一处,挂在他
   * 最新那段话的末尾;真要不要画,还得看板上有没有一张带工作台会话的 doing 卡
   * (拿不到 `workSessionId` 就不画,不许派空事件)。
   */
  threadAnchorByAgent: Map<string, number>
}

export const EMPTY_SAY_LAYOUT: SayLayout = {
  rows: [],
  capsules: new Map(),
  threadAnchorByAgent: new Map(),
}

/**
 * 引擎的 context-compact 记账:它以 system 消息的形态混在流里,正文是一坨 JSON。
 * 那是引擎在压上下文,不是有人说了句话 —— 聊天面整条不画。
 */
export function isContextCompactPayload(content: string | undefined): boolean {
  if (!content || !content.trimStart().startsWith('{')) return false
  try {
    return (JSON.parse(content) as { type?: string } | null)?.type === 'context-compact'
  } catch {
    return false
  }
}

/**
 * 「这条在跟我说话」——方案 A 里加一条左墨条的那种消息。
 *
 * 数据现实:`ChatMessage.mentions` 只装 **agent** 的身份(`{agentId,label}`),
 * 用户在房间里根本没有一个 roster id,所以"@我"没有一个可读的字段。可读的只有
 * 引用:一条 agent 的消息如果引的是**我**说的话(`replyTo.authorLabel` 就是
 * 用户署名),那它就是在回我。这是唯一有数据支撑的判据,不做正文文本猜测
 * (猜 `@你` / `@我` 会把引号里的原话也标上)。
 */
export function isAddressedToUser(message: SayMessageLike): boolean {
  if (message.role !== 'assistant') return false
  const label = message.replyTo?.authorLabel
  return typeof label === 'string' && label === REPLY_USER_LABEL
}

/**
 * 署名头的口径:说话人连发窗(speaker-runs)**并上**时间胶囊落点。
 *
 * 为什么要并:胶囊是"这里断了一段时间"的视觉断点,断点下面第一条没有署名就是
 * 一句无主的话。连发窗 5 分钟比胶囊 10 分钟短,绝大多数情况下胶囊落下时连发窗
 * 早已过期;唯一的例外是**跨天但间隔很短**(23:59 → 00:01),那一下必须靠这个
 * 并集补上。
 */
export function buildSayBylineHeads(
  messages: readonly SayMessageLike[],
  capsules: ReadonlyMap<number, string>,
): Set<number> {
  const heads = buildSpeakerRunHeads(messages)
  for (const index of capsules.keys()) heads.add(index)
  return heads
}

/**
 * 行投影。传进来的应当是 `filterRoomMessages` 过滤之后的消息(驱动行、pass、
 * 流式中的 agent 回复、思考记录都已经不在了)—— ChatPanel 在进入列表前就做了。
 */
export function buildSayLayout(
  messages: readonly SayMessageLike[],
  now: number = Date.now(),
): SayLayout {
  if (messages.length === 0) return EMPTY_SAY_LAYOUT

  // 胶囊复用房间既有口径(10 分钟 / 跨天);groupHeads 一概不取,见文件头。
  const { capsules } = buildRoomMessageLayout(messages, now)
  const heads = buildSayBylineHeads(messages, capsules)

  const rows: SayRow[] = []
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (message.role === 'error') {
      rows.push({ kind: 'error', index })
      continue
    }
    if (message.role === 'system') {
      // 引擎记账不是聊天:整行不画(连一个空槽都不留,否则滚动测量会多一个洞)。
      if (isContextCompactPayload(message.content)) continue
      rows.push({ kind: 'notice', index })
      continue
    }
    rows.push({
      kind: 'speech',
      index,
      head: heads.has(index),
      tail: false,
      addressed: isAddressedToUser(message),
    })
  }

  // 末行:下一条 speech 是新的一段发言(或后面再没有 speech)。
  //
  // 注意 notice / error 行本身**会**打断连发:`buildSpeakerRunHeads` 跑在完整
  // 数组上,一条 system 通告的 role 与两边都不同,于是它下面那条重新署名。
  // 这是想要的 —— 通告线是**看得见的分隔**(方案 A 的 `.sys` 居中细线),
  // 分隔之下的第一句话没有署名就成了无主的话。真正不该打断的是那些**看不见**
  // 的机器件(驱动行、pass、思考记录),它们在进这个函数之前就已经被
  // `filterRoomMessages` 摘掉了。
  const speechRows = rows.filter((row): row is SaySpeechRow => row.kind === 'speech')
  for (let position = 0; position < speechRows.length; position++) {
    const next = speechRows[position + 1]
    speechRows[position].tail = next === undefined || next.head
  }

  const threadAnchorByAgent = new Map<string, number>()
  for (const row of speechRows) {
    if (!row.tail) continue
    const agentId = messages[row.index]?.agentId
    if (!agentId) continue
    // 后写覆盖先写 = 每个 agent 只留最后那一段发言的末行。
    threadAnchorByAgent.set(agentId, row.index)
  }

  return { rows, capsules, threadAnchorByAgent }
}
