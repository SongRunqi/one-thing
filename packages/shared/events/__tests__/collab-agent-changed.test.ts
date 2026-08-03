/**
 * `collab:agent-changed` 进 `SessionEvent` 联合的**穷尽守卫**(D8 §3.1)。
 *
 * 与 `ipc/__tests__/collab-observability.test.ts` 同一条 C3 纪律,只是查的是事件族
 * 而不是字段表。这条测试盯的是一个具体的失败模式:一个新事件类型被定义出来、
 * 发射点也写了,却**忘了进联合** —— 那样它在 `SessionEvent` 上是不可达的,
 * IPCBridge 与 SSE 的分发 switch 里没有它的分支,而 typecheck 一声不吭。
 * 症状是「后端明明发了,前端什么都没收到」。
 */
import { describe, expect, it } from 'vitest'

import type { CollabAgentActivitySnapshot } from '../../ipc/collab.js'
import type { CollabAgentChangedEvent, SessionEvent } from '../session-events.js'

/** 联合里的 collab 家族全表。新增一个 collab 事件而没进这里 → 下面两条断言红。 */
const COLLAB_EVENT_TYPES = [
  'collab:board-changed',
  'collab:typing',
  'collab:turn-active',
  'collab:coordinator-changed',
  'collab:agent-changed',
] as const satisfies readonly Extract<SessionEvent['type'], `collab:${string}`>[]

type CollabEventMissing = Exclude<
  Extract<SessionEvent['type'], `collab:${string}`>,
  (typeof COLLAB_EVENT_TYPES)[number]
>
type CollabEventStray = Exclude<
  (typeof COLLAB_EVENT_TYPES)[number],
  Extract<SessionEvent['type'], `collab:${string}`>
>
const COLLAB_EVENTS_ARE_EXHAUSTIVE: [CollabEventMissing] extends [never]
  ? [CollabEventStray] extends [never]
    ? true
    : never
  : never = true

/** 事件本体的字段表(两格:类型 + 载荷)。 */
const AGENT_CHANGED_FIELDS = ['type', 'activity'] as const satisfies
  readonly (keyof CollabAgentChangedEvent)[]
type AgentChangedMissing = Exclude<keyof CollabAgentChangedEvent, (typeof AGENT_CHANGED_FIELDS)[number]>
type AgentChangedStray = Exclude<(typeof AGENT_CHANGED_FIELDS)[number], keyof CollabAgentChangedEvent>
const AGENT_CHANGED_IS_EXHAUSTIVE: [AgentChangedMissing] extends [never]
  ? [AgentChangedStray] extends [never]
    ? true
    : never
  : never = true

const ACTIVITY: CollabAgentActivitySnapshot = {
  agentId: 'iris',
  seq: 3,
  at: 1_000,
  mind: { state: 'thinking', roomSessionId: 'room-1', since: 900 },
  heldLeases: [{ roomSessionId: 'room-1', leaseId: 'room-1#L1', since: 900, executing: true }],
  inbox: { depth: 2, oldestAt: 800 },
  workers: [{ cardId: 'card-1', roomSessionId: 'room-1', status: 'running', since: 700 }],
  lastSpokeAt: 950,
  deadLetterCount: 0,
}

describe('collab:agent-changed', () => {
  it('collab 事件族全表穷尽,agent-changed 在里面', () => {
    expect(COLLAB_EVENTS_ARE_EXHAUSTIVE).toBe(true)
    expect(COLLAB_EVENT_TYPES).toContain('collab:agent-changed')
  })

  it('事件字段穷尽,而且**能被当成 SessionEvent 收窄** —— 那是进联合的证据', () => {
    expect(AGENT_CHANGED_IS_EXHAUSTIVE).toBe(true)
    expect([...AGENT_CHANGED_FIELDS]).toEqual(['type', 'activity'])
    const event: SessionEvent = { type: 'collab:agent-changed', activity: ACTIVITY }
    // 这个 switch 就是分发侧那一个:收窄不到 = 它在联合里不存在。
    switch (event.type) {
      case 'collab:agent-changed':
        expect(event.activity.agentId).toBe('iris')
        break
      default:
        throw new Error('collab:agent-changed 没能从 SessionEvent 收窄出来')
    }
  })

  it('载荷**永不携带正文**:信箱只有深度,工作卡只有卡号(保密纪律 §7)', () => {
    const serialized = JSON.stringify(ACTIVITY)
    expect(serialized).not.toContain('content')
    expect(serialized).not.toContain('summary')
    // 信箱那一格只回答「积压多少、最旧多久」,不回答「里面写了什么」。
    expect(Object.keys(ACTIVITY.inbox).sort()).toEqual(['depth', 'oldestAt'])
    expect(Object.keys(ACTIVITY.workers[0] ?? {}).sort())
      .toEqual(['cardId', 'roomSessionId', 'since', 'status'])
  })
})
