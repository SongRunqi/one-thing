/**
 * 已读水位(docs/design/agent-im-dm.md §6 P4 / D9)的**纯**形状与规则。
 *
 * 水位是「用户读到哪儿了」——一份阅读状态,不是会话内容。所以它跟着 UI 状态走
 * (app-state.json 的 uiState,与工作区分栏树同一层),既不进 session meta.json
 * 也不进 messages.jsonl:每次扫一眼就写一次会话文件,等于让阅读行为去抖动会话
 * 索引与 mtime 排序,而"我读到哪儿"对引擎、对 agent、对另一台设备本就无意义。
 *
 * 一条水位两个数,缺一不可:
 * - `readAt`   最后一次"看见"的时刻(打开/切到该 tab/窗口重新聚焦/自己说话);
 * - `inboundAt` 最后一条**对方消息**的时刻。
 *
 * 未读 = `inboundAt > readAt`。两个数都持久化 —— 只存 readAt 的话,重启后
 * inboundAt 归零,昨晚小李说的那句话的红点就凭空消失了;而 desktop-only 的房
 * 在应用关着的时候根本不会有新消息,所以这份缓存不会过期。
 *
 * 没有条目 = **已读**。这是"首启不爆徽标"的全部机制:存量会话一条水位都没有,
 * 判定天然全绿,水位从此刻起算 —— 不需要开机扫一遍全量会话去补种。
 */

/** 一个会话的阅读状态。两个时间戳都是 epoch ms。 */
export interface SessionReadMark {
  /** 最后一次看见这个会话的时刻。 */
  readAt: number
  /** 最后一条对方消息的时刻(自己的消息不算未读源)。 */
  inboundAt: number
}

/** app-state.json 里的落盘形状。 */
export interface PersistedSessionReadMarks {
  version: 1
  marks: Record<string, SessionReadMark>
}

export const SESSION_READ_MARKS_VERSION = 1

export function createReadMark(): SessionReadMark {
  return { readAt: 0, inboundAt: 0 }
}

/** 未读的唯一定义。消费方一律读它,别在别处重写这个比较。 */
export function isMarkUnread(mark: SessionReadMark | undefined): boolean {
  if (!mark) return false
  return mark.inboundAt > mark.readAt
}

function finiteTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

/**
 * 落盘 → 内存。两道过滤:
 * - `isKnownSessionId` 剔掉已删除的会话(不然这份表只增不减);
 * - 非法/缺失时间戳归零 —— 归零就是"已读",宁可漏报也不误报。
 */
export function parsePersistedReadMarks(
  persisted: PersistedSessionReadMarks | null | undefined,
  isKnownSessionId: (sessionId: string) => boolean,
): Map<string, SessionReadMark> {
  const marks = new Map<string, SessionReadMark>()
  if (!persisted || persisted.version !== SESSION_READ_MARKS_VERSION) return marks
  const raw = persisted.marks
  if (!raw || typeof raw !== 'object') return marks
  for (const [sessionId, mark] of Object.entries(raw)) {
    if (!sessionId || !isKnownSessionId(sessionId)) continue
    const readAt = finiteTimestamp((mark as SessionReadMark | undefined)?.readAt)
    const inboundAt = finiteTimestamp((mark as SessionReadMark | undefined)?.inboundAt)
    if (readAt === 0 && inboundAt === 0) continue
    marks.set(sessionId, { readAt, inboundAt })
  }
  return marks
}

/**
 * 内存 → 落盘。同样按"会话还在不在"剪枝(草稿会话的 id 不在列表里,顺带被剪),
 * 并且丢掉既没读过也没来过消息的空条目 —— 空条目在判定上等价于不存在。
 */
export function serializeReadMarks(
  marks: Map<string, SessionReadMark>,
  isKnownSessionId: (sessionId: string) => boolean,
): PersistedSessionReadMarks {
  const serialized: Record<string, SessionReadMark> = {}
  for (const [sessionId, mark] of marks) {
    if (!sessionId || !isKnownSessionId(sessionId)) continue
    if (mark.readAt === 0 && mark.inboundAt === 0) continue
    serialized[sessionId] = { readAt: mark.readAt, inboundAt: mark.inboundAt }
  }
  return { version: SESSION_READ_MARKS_VERSION, marks: serialized }
}
