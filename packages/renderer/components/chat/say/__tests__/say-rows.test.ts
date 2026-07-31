import { describe, expect, it } from 'vitest'
import {
  buildSayBylineHeads,
  buildSayLayout,
  isAddressedToUser,
  isContextCompactPayload,
  type SayMessageLike,
} from '../say-rows'
import { ROOM_TIME_CAPSULE_GAP_MS } from '../../message/room-grouping'
import { SPEAKER_RUN_WINDOW_MS } from '../../message/speaker-runs'
import { REPLY_USER_LABEL } from '../../message/reply-quote'

const T0 = new Date('2026-07-31T09:00:00').getTime()
const MINUTE = 60 * 1000

function speechRows(layout: ReturnType<typeof buildSayLayout>) {
  return layout.rows.filter(row => row.kind === 'speech')
}

describe('say-rows:署名口径', () => {
  it('连发合并署名:同一人 5 分钟内的后续条不再署名', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', timestamp: T0 },
      { id: 'm2', role: 'assistant', agentId: 'a1', content: '二', timestamp: T0 + MINUTE },
      { id: 'm3', role: 'assistant', agentId: 'a2', content: '三', timestamp: T0 + 2 * MINUTE },
    ]

    expect(speechRows(buildSayLayout(messages, T0)).map(row => row.head)).toEqual([true, false, true])
  })

  /**
   * 与房间既有 `room-grouping.ts` 的 groupHeads **口径不同**,这是 C2′ 明确
   * 选边的地方:groupHeads 只在 assistant + 同 agentId 之间合并,用户连发的
   * 两条各自成头。方案 A 的合并是**按说话人**的,我连着说两句同样不重复署名。
   */
  it('用户连发也合并 —— 这正是不走 room-grouping.groupHeads 的原因', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'user', content: '先说一句', timestamp: T0 },
      { id: 'm2', role: 'user', content: '再补一句', timestamp: T0 + MINUTE },
    ]

    expect(speechRows(buildSayLayout(messages, T0)).map(row => row.head)).toEqual([true, false])
  })

  it('时间胶囊落点强制断开署名 —— 跨天但间隔很短那一下也不漏', () => {
    // 23:59 → 00:01:间隔 2 分钟(连发窗内),但跨天 ⇒ 胶囊落下 ⇒ 必须重新署名。
    const lateNight = new Date('2026-07-31T23:59:00').getTime()
    const afterMidnight = new Date('2026-08-01T00:01:00').getTime()
    expect(afterMidnight - lateNight).toBeLessThan(SPEAKER_RUN_WINDOW_MS)

    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', timestamp: lateNight },
      { id: 'm2', role: 'assistant', agentId: 'a1', content: '二', timestamp: afterMidnight },
    ]

    const layout = buildSayLayout(messages, afterMidnight)
    expect(layout.capsules.has(1)).toBe(true)
    expect(speechRows(layout).map(row => row.head)).toEqual([true, true])
  })

  it('胶囊口径本身仍是房间那一份(10 分钟),不新起一套', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', timestamp: T0 },
      { id: 'm2', role: 'assistant', agentId: 'a1', content: '二', timestamp: T0 + ROOM_TIME_CAPSULE_GAP_MS + MINUTE },
    ]

    expect(buildSayLayout(messages, T0).capsules.has(1)).toBe(true)
  })

  it('buildSayBylineHeads 是并集:连发头 ∪ 胶囊落点', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'assistant', agentId: 'a1', timestamp: T0 },
      { id: 'm2', role: 'assistant', agentId: 'a1', timestamp: T0 + MINUTE },
    ]

    expect([...buildSayBylineHeads(messages, new Map())]).toEqual([0])
    expect([...buildSayBylineHeads(messages, new Map([[1, '今天 09:01']]))].sort()).toEqual([0, 1])
  })
})

describe('say-rows:行种类', () => {
  it('system 行是通告,error 行单独成档 —— 一次炸掉的回合不吞', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'system', content: '阿澈 加入了频道', timestamp: T0 },
      { id: 'm2', role: 'error', content: '连接断了', timestamp: T0 + MINUTE },
      { id: 'm3', role: 'assistant', agentId: 'a1', content: '继续', timestamp: T0 + 2 * MINUTE },
    ]

    expect(buildSayLayout(messages, T0).rows.map(row => row.kind)).toEqual(['notice', 'error', 'speech'])
  })

  it('context-compact 是引擎记账不是聊天:整行不画,连空槽都不留', () => {
    const payload = JSON.stringify({ type: 'context-compact', removed: 12 })
    expect(isContextCompactPayload(payload)).toBe(true)
    expect(isContextCompactPayload('普通通告')).toBe(false)

    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'system', content: payload, timestamp: T0 },
      { id: 'm2', role: 'assistant', agentId: 'a1', content: '继续', timestamp: T0 + MINUTE },
    ]

    const rows = buildSayLayout(messages, T0).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'speech', index: 1 })
  })

  /**
   * 通告线是**看得见的分隔**(方案 A 的 `.sys` 居中细线),它下面那句话要重新
   * 署名 —— 否则分隔之下的第一句就成了无主的话。真正不该打断连发的是那些
   * **看不见**的机器件(驱动行 / pass / 思考记录),而它们在进 buildSayLayout
   * 之前就已经被 filterRoomMessages 摘掉了。
   */
  it('看得见的通告线打断连发,两边各自署名', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', timestamp: T0 },
      { id: 'm2', role: 'system', content: '预算冻结', timestamp: T0 + MINUTE },
      { id: 'm3', role: 'assistant', agentId: 'a1', content: '二', timestamp: T0 + 2 * MINUTE },
    ]

    const rows = speechRows(buildSayLayout(messages, T0))
    expect(rows.map(row => row.head)).toEqual([true, true])
    expect(rows.map(row => row.tail)).toEqual([true, true])
  })
})

describe('say-rows:@我 与执行入口落点', () => {
  /**
   * 数据现实:`mentions` 只装 agent 身份,用户在房里没有 roster id,所以"@我"
   * 只能靠引用识别 —— 一条 agent 消息引的是我说的话,它就是在回我。
   */
  it('左墨条判据 = 这条 agent 消息引的是我说的话', () => {
    expect(isAddressedToUser({ role: 'assistant', replyTo: { authorLabel: REPLY_USER_LABEL } })).toBe(true)
    expect(isAddressedToUser({ role: 'assistant', replyTo: { authorLabel: '小林' } })).toBe(false)
    expect(isAddressedToUser({ role: 'assistant' })).toBe(false)
    // 我自己引我自己不是"有人在回我"
    expect(isAddressedToUser({ role: 'user', replyTo: { authorLabel: REPLY_USER_LABEL } })).toBe(false)
  })

  it('执行入口每个 agent 只挂一处:他最后一段发言的末行', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'assistant', agentId: 'a1', content: '一', timestamp: T0 },
      { id: 'm2', role: 'assistant', agentId: 'a1', content: '二', timestamp: T0 + MINUTE },
      { id: 'm3', role: 'assistant', agentId: 'a2', content: '三', timestamp: T0 + 2 * MINUTE },
      { id: 'm4', role: 'assistant', agentId: 'a1', content: '四', timestamp: T0 + 3 * MINUTE },
    ]

    const layout = buildSayLayout(messages, T0)
    // a1 说过两段(0-1 与 3),入口只落在后一段的末行
    expect(layout.threadAnchorByAgent.get('a1')).toBe(3)
    expect(layout.threadAnchorByAgent.get('a2')).toBe(2)
  })

  it('用户消息没有 agent,不进执行入口的账', () => {
    const messages: SayMessageLike[] = [
      { id: 'm1', role: 'user', content: '开工', timestamp: T0 },
    ]

    expect(buildSayLayout(messages, T0).threadAnchorByAgent.size).toBe(0)
  })

  it('空列表返回空投影', () => {
    const layout = buildSayLayout([], T0)
    expect(layout.rows).toEqual([])
    expect(layout.capsules.size).toBe(0)
  })
})
