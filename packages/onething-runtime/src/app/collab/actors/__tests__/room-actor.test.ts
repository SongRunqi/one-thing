import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryMailbox, createActorEvent, type ActorEvent } from '@onething/core/actors'
import {
  classifyCollabRoomMessage,
  computeCollabChainCount,
  isCollabRoomFact,
  isCollabSayMessage,
} from '@onething/runtime/collab'
import {
  collabActorRef,
  collabAgentRaiseHand,
  collabAgentSpeak,
  collabAgentYield,
  collabRoomPosted,
  createCollabRoomAccount,
  type CollabActorVerb,
  type CollabRoomTranscriptMessage,
} from '@onething/runtime/collab/actors'

const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-collab-actor-'))
vi.mock('../../../stores/paths.js', () => ({ getStorePath: () => storeRootRef.value }))
const storeRootRef = { value: storeRoot }

const {
  CollabRoomActor,
  CollabRoomBroadcastError,
  buildCollabRoomActorSnapshot,
  collabRoomAccountPath,
  collabRoomBroadcastRecipients,
  createCollabRoomAccountFileStore,
  createCollabRoomAccountMemoryStore,
} = await import('../index.js')
type CollabRoomActorHost = import('../room-actor.js').CollabRoomActorHost
type CollabRoomAccountStore = import('../room-account.js').CollabRoomAccountStore

afterAll(() => {
  fs.rmSync(storeRoot, { recursive: true, force: true })
})

const ROOM = 'room-actor-test'
const MEMBERS = [
  { id: 'ana', name: '阿娜' },
  { id: 'bo', name: '阿波' },
  { id: 'cy', name: '小西' },
]

interface Harness {
  actor: InstanceType<typeof CollabRoomActor>
  messages: CollabRoomTranscriptMessage[]
  inbox: Map<string, ActorEvent<CollabActorVerb>[]>
  mailbox: InMemoryMailbox<ActorEvent<CollabActorVerb>>
  clock: { now: number }
  failFor: Set<string>
}

function harness(options: {
  store?: CollabRoomAccountStore
  maxChain?: number
  maxConcurrent?: number
  frozen?: boolean
} = {}): Harness {
  const messages: CollabRoomTranscriptMessage[] = []
  const inbox = new Map<string, ActorEvent<CollabActorVerb>[]>()
  const failFor = new Set<string>()
  const clock = { now: 1_000 }
  const mailbox = new InMemoryMailbox<ActorEvent<CollabActorVerb>>()

  const host: CollabRoomActorHost = {
    members: () => MEMBERS,
    frozen: () => options.frozen === true,
    overBudget: () => false,
    maxChain: () => options.maxChain ?? Number.POSITIVE_INFINITY,
    maxConcurrent: () => options.maxConcurrent ?? 0,
    appendMessage: (_roomId, message) => {
      messages.push(message)
    },
    memberMailbox: agentId => ({
      append: async event => {
        if (failFor.has(agentId)) throw new Error(`mailbox ${agentId} is down`)
        const list = inbox.get(agentId) ?? []
        list.push(event)
        inbox.set(agentId, list)
        await Promise.resolve()
      },
    }),
    newMessageId: seed => seed,
    now: () => clock.now,
  }

  const actor = new CollabRoomActor({
    roomId: ROOM,
    host,
    mailbox,
    ...(options.store ? { store: options.store } : {}),
  })
  return { actor, messages, inbox, mailbox, clock, failFor }
}

function userPosted(text: string, mentionIds: string[] = [], id = 'u1'): CollabActorVerb {
  return collabRoomPosted({
    roomId: ROOM,
    author: collabActorRef('user', 'user'),
    message: {
      id,
      role: 'user',
      content: text,
      timestamp: 1_000,
      ...(mentionIds.length
        ? { mentions: mentionIds.map(agentId => ({ agentId, label: agentId })) }
        : {}),
    },
  })
}

function envelope(verb: CollabActorVerb, id: string): ActorEvent<CollabActorVerb> {
  return createActorEvent<CollabActorVerb>({
    id,
    at: 1_000,
    type: verb.type,
    from: collabActorRef('user', 'user'),
    to: collabActorRef('room', ROOM),
    payload: verb,
  })
}

beforeEach(() => {
  fs.rmSync(path.join(storeRoot, 'collab'), { recursive: true, force: true })
})

describe('广播', () => {
  it('房间消息播给全体成员;发牌只播给拿牌的那个', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore() })
    await h.actor.commit(h.actor.decide(userPosted('@阿娜 看一下', ['ana'])))

    expect([...h.inbox.keys()].sort()).toEqual(['ana', 'bo', 'cy'])
    expect(h.inbox.get('bo')?.map(event => event.type)).toEqual(['room:posted'])
    // 一张牌是私事:广播它等于把「轮到谁了」变成全房噪声。
    expect(h.inbox.get('ana')?.map(event => event.type)).toEqual(['room:posted', 'room:floor-granted'])
  })

  it('作者不收自己发言的回声', () => {
    expect(collabRoomBroadcastRecipients(
      collabRoomPosted({
        roomId: ROOM,
        author: collabActorRef('agent', 'ana'),
        message: { id: 'm', role: 'assistant', agentId: 'ana', content: 'hi', timestamp: 1 },
      }),
      MEMBERS.map(member => member.id),
    )).toEqual(['bo', 'cy'])
  })

  it('同一封信在每个成员那里是同一个事件 id(消费端才去重得掉)', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore() })
    await h.actor.commit(h.actor.decide(userPosted('大家看看')))
    const ids = MEMBERS.map(member => h.inbox.get(member.id)?.[0].id)
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(`evt:${ROOM}:u1`)
  })

  it('广播到一半崩溃:重启续播,已经收到的成员不重复收', async () => {
    const store = createCollabRoomAccountMemoryStore()
    const first = harness({ store })
    first.failFor.add('cy')

    await expect(first.actor.commit(first.actor.decide(userPosted('大家看看'))))
      .rejects.toBeInstanceOf(CollabRoomBroadcastError)

    expect(first.inbox.get('ana')).toHaveLength(1)
    expect(first.inbox.get('bo')).toHaveLength(1)
    expect(first.inbox.get('cy')).toBeUndefined()
    // 账里留着"还欠 cy 一封信"。
    expect(store.load(ROOM).broadcasts).toEqual([
      expect.objectContaining({ eventId: `evt:${ROOM}:u1`, pending: ['cy'] }),
    ])

    // 重启:同一份账,新的 actor,信箱都好了。
    const second = harness({ store })
    await second.actor.resumeBroadcasts()

    expect(second.inbox.get('ana')).toBeUndefined()
    expect(second.inbox.get('bo')).toBeUndefined()
    expect(second.inbox.get('cy')).toHaveLength(1)
    expect(second.inbox.get('cy')?.[0].id).toBe(`evt:${ROOM}:u1`)
    expect(store.load(ROOM).broadcasts).toEqual([])
  })

  it('续播是幂等的:再续一次不会又投一遍', async () => {
    const store = createCollabRoomAccountMemoryStore()
    const h = harness({ store })
    await h.actor.commit(h.actor.decide(userPosted('大家看看')))
    await h.actor.resumeBroadcasts()
    expect(h.inbox.get('ana')).toHaveLength(1)
  })
})

describe('事件循环', () => {
  it('动词从 mailbox 进来,房间照常发牌与落转录', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore() })
    h.actor.start()

    await h.mailbox.append(envelope(userPosted('@阿娜 说说', ['ana']), 'e1'))
    await h.actor.drain()

    const lease = h.actor.account.floor.active[0]
    expect(lease.agentId).toBe('ana')

    await h.mailbox.append(envelope(
      collabAgentSpeak({ roomId: ROOM, agentId: 'ana', leaseId: lease.leaseId, content: '我说完了' }),
      'e2',
    ))
    await h.actor.drain()
    await h.actor.stop()

    expect(h.messages.map(message => message.content)).toEqual(['我说完了'])
    expect(h.actor.deadLetterCount).toBe(0)
  })

  it('房间自己的输出回流进自己的信箱时被吞掉,不成自激环', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore() })
    const posted = h.actor.decide(userPosted('@阿娜', ['ana']))
    const granted = posted.broadcast.find(verb => verb.type === 'room:floor-granted')
    expect(granted).toBeDefined()

    const before = h.actor.account.seq
    const effects = h.actor.decide(granted as CollabActorVerb)
    expect(effects.broadcast).toEqual([])
    expect(h.actor.account.seq).toBe(before)
  })
})

describe('账落盘', () => {
  it('牌与链数跨重启活着,而且落的不是 v2 那个文件', async () => {
    const store = createCollabRoomAccountFileStore()
    const first = harness({ store })
    await first.actor.commit(first.actor.decide(userPosted('@阿娜 @阿波', ['ana', 'bo'])))

    const accountPath = collabRoomAccountPath(ROOM)
    expect(accountPath.endsWith(path.join('actors', 'room.json'))).toBe(true)
    expect(fs.existsSync(accountPath)).toBe(true)
    // v2 的 state.json 一个字都没被碰过 —— 两份账两个文件(D6 才删 v2 那份)。
    expect(fs.existsSync(path.join(storeRoot, 'collab', ROOM, 'state.json'))).toBe(false)

    const restarted = harness({ store })
    expect(restarted.actor.account.chainCount).toBe(2)
    expect(restarted.actor.account.floor.active.map(lease => lease.agentId)).toEqual(['ana', 'bo'])
  })

  it('换代跨重启作废旧牌:重启后拿旧牌开口被拒', async () => {
    const store = createCollabRoomAccountFileStore()
    const first = harness({ store })
    const posted = first.actor.decide(userPosted('@阿娜', ['ana']))
    await first.actor.commit(posted)
    const lease = posted.granted[0]
    await first.actor.bumpEpoch('epoch-bumped')

    const restarted = harness({ store })
    const refused = restarted.actor.decide(
      collabAgentSpeak({ roomId: ROOM, agentId: 'ana', leaseId: lease.leaseId, content: '我还在说' }),
    )
    expect(refused.refusal).toBeTruthy()
    expect(refused.messages).toEqual([])
    expect(restarted.messages).toEqual([])
  })

  it('文件坏了当新账,不当半份账', () => {
    const accountPath = collabRoomAccountPath(ROOM)
    fs.mkdirSync(path.dirname(accountPath), { recursive: true })
    fs.writeFileSync(accountPath, '{"version":1,"floor":')
    expect(createCollabRoomAccountFileStore().load(ROOM)).toEqual(createCollabRoomAccount(ROOM))
  })
})

describe('C4 快照', () => {
  it('speaking 的口径就是持牌人;queue 是举手队列', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore(), maxConcurrent: 1 })
    await h.actor.commit(h.actor.decide(userPosted('@阿娜 @阿波', ['ana', 'bo'])))

    const snapshot = h.actor.snapshot()
    expect(snapshot.roomSessionId).toBe(ROOM)
    expect(snapshot.speaking).toEqual(['ana'])
    expect(snapshot.turns.map(turn => turn.agentId)).toEqual(['ana'])
    expect(snapshot.turns[0].reason).toBe('mention')
    expect(snapshot.queue.map(entry => entry.agentId)).toEqual(['bo'])
    expect(snapshot.gates.concurrency).toEqual({ value: 1, max: 1 })
    expect(snapshot.gates.chain.value).toBe(1)
    expect(snapshot.mode).toBe('parallel')
    // D1 还给不出的字段诚实地给空,而不是编一个。
    expect(snapshot.typing).toEqual([])
    expect(snapshot.plan).toBeNull()
    expect(snapshot.judging).toBe(0)
  })

  it('seq 单调:每一次状态变化都比上一帧新', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore() })
    const seen: number[] = [h.actor.snapshot().seq]

    await h.actor.commit(h.actor.decide(userPosted('一', [], 'a')))
    seen.push(h.actor.snapshot().seq)
    await h.actor.commit(h.actor.decide(collabAgentRaiseHand({ roomId: ROOM, agentId: 'cy' })))
    seen.push(h.actor.snapshot().seq)
    await h.actor.commit(h.actor.decide(userPosted('二', [], 'b')))
    seen.push(h.actor.snapshot().seq)

    for (let index = 1; index < seen.length; index += 1) {
      expect(seen[index]).toBeGreaterThan(seen[index - 1])
    }
  })

  it('不限的闸在快照里读作 0(与 v2 的 finiteMax 同口径)', () => {
    const snapshot = buildCollabRoomActorSnapshot({
      account: createCollabRoomAccount(ROOM),
      gates: {
        frozen: false,
        overBudget: false,
        maxChain: Number.POSITIVE_INFINITY,
        maxConcurrent: 0,
        members: MEMBERS,
        now: 1,
      },
    })
    expect(snapshot.gates.chain.max).toBe(0)
    expect(snapshot.gates.concurrency.max).toBe(0)
  })
})

describe('转录零迁移', () => {
  it('RoomActor 落的消息,v2 的分类器读出来语义一致', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore(), frozen: false })
    const posted = h.actor.decide(userPosted('@阿娜 讲讲', ['ana']))
    await h.actor.commit(posted)
    const lease = posted.granted[0]

    await h.actor.commit(h.actor.decide(collabAgentSpeak({
      roomId: ROOM,
      agentId: 'ana',
      leaseId: lease.leaseId,
      content: '讲完了。',
    })))
    await h.actor.commit(h.actor.decide(collabAgentYield({
      roomId: ROOM,
      agentId: 'ana',
      leaseId: lease.leaseId,
    })))

    const said = h.messages[0]
    expect(classifyCollabRoomMessage(said)).toBe('say')
    expect(isCollabSayMessage(said)).toBe(true)
    expect(isCollabRoomFact(said)).toBe(true)
    // v2 的转录重算把它数成一格发言:这是"格式兼容"最硬的那条判据。
    expect(computeCollabChainCount([said])).toBe(1)
  })

  it('闸贴的系统行是运营噪声,进不了模型视野', async () => {
    const h = harness({ store: createCollabRoomAccountMemoryStore(), frozen: true })
    await h.actor.commit(h.actor.decide(userPosted('@阿娜 在吗', ['ana'])))

    const line = h.messages[0]
    expect(classifyCollabRoomMessage(line)).toBe('operational-line')
    expect(isCollabRoomFact(line)).toBe(false)
    expect(computeCollabChainCount([line])).toBe(0)
  })
})
