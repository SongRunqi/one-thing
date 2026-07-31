/**
 * 连续消息的「一次发言」切分(docs/design/im-workbench-layout.md §3 W2)。
 *
 * 账页流里每条消息都带一列固定署名。署名一旦每条都印,三条连发就成了三块
 * 标题——所以同一个人短时间内的连发只在**第一条**上署名,后面的挂在同一条
 * 轴上,署名列留白。
 *
 * 这里只放纯函数:它不认识 Vue、不认识 DOM,输入是消息的结构切片,输出是
 * 「哪些行开一段新发言」。房间(kind='room')有自己的一套分组(room-grouping.ts,
 * 按 agentId 走,并被时间胶囊打断),那一套不动;这个模块负责的是**全形态**
 * 通用的说话人轴,房间之外它是唯一的口径。
 */

/** 这个模块读到的消息切片——只读三个字段,任何多读都是耦合。 */
export interface SpeakerRunMessageLike {
  role: string
  /** 群/工作会话里的发言人;普通会话恒为空。 */
  agentId?: string
  timestamp?: number
}

/**
 * 连发时间窗 = 5 分钟。
 *
 * 取值理由:比房间时间胶囊的 10 分钟(`ROOM_TIME_CAPSULE_GAP_MS`)**短**,
 * 于是"胶囊落下来了、署名却还连着上一段"这种自相矛盾的排版不可能出现;
 * 又比一次正常你来我往的间隔长,连着补两句话不会被拆成两块标题。
 */
export const SPEAKER_RUN_WINDOW_MS = 5 * 60 * 1000

/**
 * 说话人身份。用户与助手天然不同人;群里不同 agent 也不同人。
 * 系统行、错误行各自成号——它们本来就不该并进别人的发言。
 */
export function speakerRunKey(message: SpeakerRunMessageLike): string {
  return message.agentId ? `${message.role}:${message.agentId}` : message.role
}

/**
 * 返回「开一段新发言」的行下标集合。
 *
 * 三条打断规则:
 *  1. 换人 —— 说话人 key 变了。
 *  2. 隔得太久 —— 间隔超过时间窗。
 *  3. 时间不可知 —— 任一条缺 timestamp 就当作打断。宁可多印一次署名,
 *     也不要把两个人两小时前后的话默默并成一段。
 *
 * 第 0 行永远是头。空数组返回空集合(不是 null:调用方只会做 `.has()`)。
 */
export function buildSpeakerRunHeads(
  messages: readonly SpeakerRunMessageLike[],
  windowMs: number = SPEAKER_RUN_WINDOW_MS,
): Set<number> {
  const heads = new Set<number>()
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (index === 0) {
      heads.add(index)
      continue
    }
    const previous = messages[index - 1]
    if (speakerRunKey(previous) !== speakerRunKey(message)) {
      heads.add(index)
      continue
    }
    const timestamp = message.timestamp
    const previousTimestamp = previous.timestamp
    if (typeof timestamp !== 'number' || typeof previousTimestamp !== 'number') {
      heads.add(index)
      continue
    }
    if (timestamp - previousTimestamp > windowMs) heads.add(index)
  }
  return heads
}
