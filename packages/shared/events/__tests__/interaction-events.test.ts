/**
 * `interaction:*` 事件族与 `command:interaction-respond` 进联合的**穷尽守卫**
 * (claude-code-integration-v2 §4,E1)。
 *
 * 与 `collab-agent-changed.test.ts` 同一条 C3 纪律,盯的是同一个失败模式:一个新
 * 事件类型被定义出来、发射点也写了,却**忘了进联合** —— 那样它在 `SessionEvent`
 * 上是不可达的,IPCBridge 与 SSE 的分发里没有它,而 typecheck 一声不吭。症状是
 * 「后端明明发了,前端什么都没收到」—— 提问链上,这个症状的名字叫 F3。
 *
 * 两个方向都查:只查一个方向的话,**删掉**一个字段可以悄悄溜过去,而删字段正是
 * 最会让下游静默出错的那一类改动。
 */
import { describe, expect, it } from 'vitest'

import type {
  InteractionRequestedEvent,
  InteractionSettledEvent,
  SessionEvent,
} from '../session-events.js'
import type {
  InteractionRespondCommand,
  SessionCommand,
} from '../session-commands.js'

/* ── 事件族全表(§4)────────────────────────────────────────────────────── */

const INTERACTION_EVENT_TYPES = [
  'interaction:requested',
  'interaction:settled',
] as const satisfies readonly Extract<SessionEvent['type'], `interaction:${string}`>[]

type InteractionEventMissing = Exclude<
  Extract<SessionEvent['type'], `interaction:${string}`>,
  (typeof INTERACTION_EVENT_TYPES)[number]
>
type InteractionEventStray = Exclude<
  (typeof INTERACTION_EVENT_TYPES)[number],
  Extract<SessionEvent['type'], `interaction:${string}`>
>
const INTERACTION_EVENTS_ARE_EXHAUSTIVE: [InteractionEventMissing] extends [never]
  ? [InteractionEventStray] extends [never]
    ? true
    : never
  : never = true

/* ── 事件本体的字段表 ───────────────────────────────────────────────────── */

const REQUESTED_FIELDS = ['type', 'request'] as const satisfies
  readonly (keyof InteractionRequestedEvent)[]
type RequestedMissing = Exclude<keyof InteractionRequestedEvent, (typeof REQUESTED_FIELDS)[number]>
type RequestedStray = Exclude<(typeof REQUESTED_FIELDS)[number], keyof InteractionRequestedEvent>
const REQUESTED_IS_EXHAUSTIVE: [RequestedMissing] extends [never]
  ? [RequestedStray] extends [never]
    ? true
    : never
  : never = true

const SETTLED_FIELDS = ['type', 'toolCallId', 'answer'] as const satisfies
  readonly (keyof InteractionSettledEvent)[]
type SettledMissing = Exclude<keyof InteractionSettledEvent, (typeof SETTLED_FIELDS)[number]>
type SettledStray = Exclude<(typeof SETTLED_FIELDS)[number], keyof InteractionSettledEvent>
const SETTLED_IS_EXHAUSTIVE: [SettledMissing] extends [never]
  ? [SettledStray] extends [never]
    ? true
    : never
  : never = true

/* ── 应答命令(与 command:permission-respond 并列)───────────────────────── */

const RESPOND_COMMAND_FIELDS = [
  'type',
  'channel',
  'interactionId',
  'toolCallId',
  'answers',
  'decline',
  'reason',
] as const satisfies readonly (keyof InteractionRespondCommand)[]
type RespondCommandMissing = Exclude<
  keyof InteractionRespondCommand,
  (typeof RESPOND_COMMAND_FIELDS)[number]
>
type RespondCommandStray = Exclude<
  (typeof RESPOND_COMMAND_FIELDS)[number],
  keyof InteractionRespondCommand
>
const RESPOND_COMMAND_IS_EXHAUSTIVE: [RespondCommandMissing] extends [never]
  ? [RespondCommandStray] extends [never]
    ? true
    : never
  : never = true

describe('interaction 事件与命令契约', () => {
  it('事件族全表与 SessionEvent 联合两个方向都对得上', () => {
    expect(INTERACTION_EVENTS_ARE_EXHAUSTIVE).toBe(true)
    expect(INTERACTION_EVENT_TYPES).toHaveLength(2)
  })

  it('两条事件的字段表两个方向都对得上', () => {
    expect(REQUESTED_IS_EXHAUSTIVE).toBe(true)
    expect(SETTLED_IS_EXHAUSTIVE).toBe(true)
  })

  it('应答命令在 SessionCommand 联合里可达,字段表两个方向都对得上', () => {
    expect(RESPOND_COMMAND_IS_EXHAUSTIVE).toBe(true)
    const command: SessionCommand = {
      type: 'command:interaction-respond',
      channel: 'ipc',
      toolCallId: 'call-1',
      answers: { q1: { selected: ['dayjs'] } },
    }
    expect(command.type).toBe('command:interaction-respond')
  })

  it('事件实例能被赋成 SessionEvent(联合里真的有它,不只是文件里有)', () => {
    const requested: SessionEvent = {
      type: 'interaction:requested',
      request: {
        id: 'i-1',
        sessionId: 's-1',
        toolCallId: 'call-1',
        origin: 'external-agent',
        questions: [
          {
            id: 'q1',
            header: 'Library',
            question: '用哪个日期库?',
            options: [{ label: 'dayjs', description: '体积最小' }],
          },
        ],
        deadlineAt: 2_000,
        createdAt: 1_000,
        targetChannel: 'ipc',
      },
    }
    const settled: SessionEvent = {
      type: 'interaction:settled',
      toolCallId: 'call-1',
      answer: { id: 'i-1', answers: {}, outcome: 'timeout', reason: '无人应答' },
    }
    expect(requested.type).toBe('interaction:requested')
    expect(settled.type).toBe('interaction:settled')
  })
})
