/**
 * Collab v3 协议动词表(docs/design/collab-actor-v3.md §2)。
 *
 * v2 的编排是**代码路径**:coordinator 调 planner 调 willingness-runner,谁能说话
 * 藏在四个文件的控制流里。v3 把它翻成**动词**:举手、发牌、说话、让位、换相 ——
 * 每一个都是一封持久事件,谁发的、发给谁、什么时候发的,全都落在信封上。
 * 好处不是「更优雅」,是**可重放**:一间房昨天为什么是那个人说话,重放同一串动词
 * 就能重现;藏在控制流里的判断重放不出来。
 *
 * 纪律(C3 沿用):动词是联合类型,`collabActorVerbDirection()` 用 `never` 穷尽 ——
 * **新增一个动词却漏了处理,typecheck 当场红**。协议演进不能靠记性。
 *
 * 这一层是纯类型 + 纯构造函数:不碰 fs、不碰事件总线、不认识 StreamEngine。
 * 谁把这些动词投进 mailbox 是 D1/D2 的事。
 */
import type { FloorLease } from '@onething/core/actors'

import type { CollabMentionLike, CollabMessageLike } from '../types.js'

/** 协议里有身份的五种角色(docs/design/collab-actor-v3.md §1.1)。 */
export type CollabActorKind = 'room' | 'agent' | 'user' | 'referee' | 'worker'

/** core 的 `ActorRef` 在 collab 语境里的收窄形态。 */
export interface CollabActorRef {
  kind: CollabActorKind
  id: string
}

export function collabActorRef(kind: CollabActorKind, id: string): CollabActorRef {
  return { kind, id }
}

// ─────────────────────────────────────────────────────────────────────────────
// Room → Agent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 房间广播一条消息。
 *
 * 人类发言也走这一条:UserProxyActor 把它投进房间,房间再广播 —— 所以 `author`
 * 的 kind 可能是 `user`。不给用户单开一个动词,是因为「谁说的」是**身份**问题,
 * 不是**协议**问题;开两个动词的话每个消费方都要写两遍分支。
 */
export interface CollabRoomPostedVerb {
  type: 'room:posted'
  roomId: string
  author: CollabActorRef
  message: CollabMessageLike
}

/** 发牌:拿到租约才能 speak(§1.4)。 */
export interface CollabRoomFloorGrantedVerb {
  type: 'room:floor-granted'
  roomId: string
  agentId: string
  lease: FloorLease
}

export type CollabFloorRevokeReason =
  /** agent 自己让位。 */
  | 'yield'
  /** 墙钟到点。 */
  | 'expired'
  /** 换代作废(换相/重启/人类插话)。 */
  | 'epoch-bumped'
  /** 房间被冻住(闸)。 */
  | 'frozen'
  /** 裁判换了发言策略。 */
  | 'policy-changed'

export interface CollabRoomFloorRevokedVerb {
  type: 'room:floor-revoked'
  roomId: string
  agentId: string
  leaseId: string
  reason: CollabFloorRevokeReason
}

/**
 * 换相。狼人杀这类回合制的裁判第一次有了一等表达:夜晚只激活狼房、白天只激活群房。
 * `epoch` 跟着涨 —— 换相即作废在外的全部租约,不需要逐一通知。
 */
export interface CollabRoomPhaseChangedVerb {
  type: 'room:phase-changed'
  roomId: string
  phase: string
  previousPhase?: string
  epoch: number
}

export interface CollabRoomMembershipChangedVerb {
  type: 'room:membership-changed'
  roomId: string
  joined: string[]
  left: string[]
}

export type CollabCardEventKind = 'created' | 'assigned' | 'started' | 'delivered' | 'blocked' | 'closed'

/** 看板动静。board.json 零迁移,这里只是把它的变化搬上协议面。 */
export interface CollabRoomCardEventVerb {
  type: 'room:card-event'
  roomId: string
  cardId: string
  event: CollabCardEventKind
  assigneeId?: string
  title?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent → Room
// ─────────────────────────────────────────────────────────────────────────────

export type CollabHandUrgency = 'low' | 'normal' | 'high'

/** 举手。`free` 策略下房间一次裁决一批举手(qm P0-2:O(N) → O(1))。 */
export interface CollabAgentRaiseHandVerb {
  type: 'agent:raise-hand'
  roomId: string
  agentId: string
  why?: string
  urgency?: CollabHandUrgency
  /** 触发这次举手的房间消息(链闸清零判定要它)。 */
  sourceMessageId?: string
}

/**
 * 说话 —— **唯一发送面**(send_message 的协议形态,C1/C2 资产原样沿用)。
 * 必须带租约:没牌的 speak 由房间拒收,这是「说话即行动」的结构保证。
 */
export interface CollabAgentSpeakVerb {
  type: 'agent:speak'
  roomId: string
  agentId: string
  leaseId: string
  content: string
  mentions?: CollabMentionLike[]
  replyToMessageId?: string
}

export type CollabYieldReason = 'done' | 'pass' | 'nothing-to-add' | 'budget'

/** 让位:主动交牌。与房间强制收回在账上是同一个事实,理由留在这里。 */
export interface CollabAgentYieldVerb {
  type: 'agent:yield'
  roomId: string
  agentId: string
  leaseId: string
  reason?: CollabYieldReason
}

/** 开一间私聊房(dm)。peer 可能是人,也可能是另一个 agent。 */
export interface CollabAgentDmOpenVerb {
  type: 'agent:dm-open'
  agentId: string
  peerId: string
  peerKind: 'agent' | 'user'
}

/** 跨房唤醒:把另一间房里的人叫过来。带清零标记(A2)。 */
export interface CollabAgentWakeVerb {
  type: 'agent:wake'
  agentId: string
  roomId: string
  peerId: string
  note?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Referee → Room
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 发言策略(§1.5)。v2 的 planner/plan-runner/speaking-order/willingness-runner
 * 四条代码路径,在 v3 是这一个枚举的四个取值。
 */
export type CollabFloorPolicyName =
  /** 自由发言 + 批量举手裁决(默认;裁判缺席时房间内置这一档)。 */
  | 'free'
  /** 免判定的确定性接力环。 */
  | 'ring'
  /** 批内并行、批间串行。 */
  | 'waves'
  /** 相位控制:只有当前相位的成员被激活。 */
  | 'phase'

export interface CollabFloorPolicyParams {
  /** 同时在外的租约上限。0 / 缺省 = 不限(与其它闸同一套约定)。 */
  maxConcurrent?: number
  /** `ring`:接力次序。 */
  order?: string[]
  /** `waves`:批次划分。 */
  waves?: string[][]
  /** `phase`:切到哪个相位。 */
  phase?: string
  /** `phase`:该相位里允许说话的成员。 */
  activeMembers?: string[]
}

export interface CollabRefereeSetFloorPolicyVerb {
  type: 'referee:set-floor-policy'
  roomId: string
  refereeId: string
  policy: CollabFloorPolicyName
  params?: CollabFloorPolicyParams
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent → self
// ─────────────────────────────────────────────────────────────────────────────

/** 私人笔记增量。跨房可见,注入有预算上限 —— 它是唯一显式的跨房知识通道。 */
export interface CollabAgentNoteVerb {
  type: 'agent:note'
  agentId: string
  note: string
  /** 这条笔记记于哪间房(可空:不是每条笔记都有房间语境)。 */
  roomId?: string
}

/** 派生工作子 actor:一张卡一双手。「一个大脑」只约束对话性回合(§1.6)。 */
export interface CollabAgentSpawnWorkerVerb {
  type: 'agent:spawn-worker'
  agentId: string
  workerId: string
  cardId: string
  roomId: string
  title?: string
}

/** 子 actor 的结果回投父 mailbox:父在下一个对话回合自然「知道自己的活干完了」。 */
export interface CollabAgentWorkerResultVerb {
  type: 'agent:worker-result'
  agentId: string
  workerId: string
  cardId: string
  ok: boolean
  summary?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 联合、方向、穷尽守卫
// ─────────────────────────────────────────────────────────────────────────────

export type CollabActorVerb =
  | CollabRoomPostedVerb
  | CollabRoomFloorGrantedVerb
  | CollabRoomFloorRevokedVerb
  | CollabRoomPhaseChangedVerb
  | CollabRoomMembershipChangedVerb
  | CollabRoomCardEventVerb
  | CollabAgentRaiseHandVerb
  | CollabAgentSpeakVerb
  | CollabAgentYieldVerb
  | CollabAgentDmOpenVerb
  | CollabAgentWakeVerb
  | CollabRefereeSetFloorPolicyVerb
  | CollabAgentNoteVerb
  | CollabAgentSpawnWorkerVerb
  | CollabAgentWorkerResultVerb

export type CollabActorVerbType = CollabActorVerb['type']

export type CollabActorVerbDirection = 'room->agent' | 'agent->room' | 'referee->room' | 'agent->self'

/** 动词全表,按方向分组。运行时校验与文档都读它。 */
export const COLLAB_ACTOR_VERB_TYPES = [
  'room:posted',
  'room:floor-granted',
  'room:floor-revoked',
  'room:phase-changed',
  'room:membership-changed',
  'room:card-event',
  'agent:raise-hand',
  'agent:speak',
  'agent:yield',
  'agent:dm-open',
  'agent:wake',
  'referee:set-floor-policy',
  'agent:note',
  'agent:spawn-worker',
  'agent:worker-result',
] as const satisfies readonly CollabActorVerbType[]

/**
 * 双向穷尽守卫:联合里有而表里没有 → 红;表里有而联合里没有 → 也红。
 * 只查一个方向的话,删掉一个动词的类型定义可以悄悄溜过去。
 */
type VerbTableMissing = Exclude<CollabActorVerbType, (typeof COLLAB_ACTOR_VERB_TYPES)[number]>
type VerbTableStray = Exclude<(typeof COLLAB_ACTOR_VERB_TYPES)[number], CollabActorVerbType>
export const COLLAB_ACTOR_VERB_TABLE_IS_EXHAUSTIVE: [VerbTableMissing] extends [never]
  ? [VerbTableStray] extends [never]
    ? true
    : never
  : never = true

/**
 * 动词方向。这个 switch 就是 C3 纪律的落点 —— `default` 分支把 `verb` 收窄成
 * `never`,新增动词没在这里处理的话,`assertNeverVerb` 的参数类型当场红。
 */
export function collabActorVerbDirection(verb: CollabActorVerb): CollabActorVerbDirection {
  switch (verb.type) {
    case 'room:posted':
    case 'room:floor-granted':
    case 'room:floor-revoked':
    case 'room:phase-changed':
    case 'room:membership-changed':
    case 'room:card-event':
      return 'room->agent'
    case 'agent:raise-hand':
    case 'agent:speak':
    case 'agent:yield':
    case 'agent:dm-open':
    case 'agent:wake':
      return 'agent->room'
    case 'referee:set-floor-policy':
      return 'referee->room'
    case 'agent:note':
    case 'agent:spawn-worker':
    case 'agent:worker-result':
      return 'agent->self'
    default:
      return assertNeverVerb(verb)
  }
}

function assertNeverVerb(verb: never): never {
  throw new Error(`[collab-actor] unhandled verb: ${JSON.stringify(verb)}`)
}

export function isCollabActorVerbType(value: string): value is CollabActorVerbType {
  return (COLLAB_ACTOR_VERB_TYPES as readonly string[]).includes(value)
}

/** 动词的发起方地址 —— 投递时当信封的 `from`。 */
export function collabActorVerbSender(verb: CollabActorVerb): CollabActorRef {
  switch (collabActorVerbDirection(verb)) {
    case 'room->agent':
      return collabActorRef('room', (verb as CollabRoomPostedVerb).roomId)
    case 'referee->room':
      return collabActorRef('referee', (verb as CollabRefereeSetFloorPolicyVerb).refereeId)
    case 'agent->room':
    case 'agent->self':
      return collabActorRef('agent', (verb as CollabAgentSpeakVerb).agentId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 构造函数。手搓字面量会把 `type` 打错而 TS 只在赋值处才发现,
// 走构造函数则错在调用点当场暴露。
// ─────────────────────────────────────────────────────────────────────────────

export function collabRoomPosted(input: Omit<CollabRoomPostedVerb, 'type'>): CollabRoomPostedVerb {
  return { type: 'room:posted', ...input }
}

export function collabRoomFloorGranted(
  input: Omit<CollabRoomFloorGrantedVerb, 'type'>,
): CollabRoomFloorGrantedVerb {
  return { type: 'room:floor-granted', ...input }
}

export function collabRoomFloorRevoked(
  input: Omit<CollabRoomFloorRevokedVerb, 'type'>,
): CollabRoomFloorRevokedVerb {
  return { type: 'room:floor-revoked', ...input }
}

export function collabRoomPhaseChanged(
  input: Omit<CollabRoomPhaseChangedVerb, 'type'>,
): CollabRoomPhaseChangedVerb {
  return { type: 'room:phase-changed', ...input }
}

export function collabRoomMembershipChanged(
  input: Omit<CollabRoomMembershipChangedVerb, 'type'>,
): CollabRoomMembershipChangedVerb {
  return { type: 'room:membership-changed', ...input }
}

export function collabRoomCardEvent(input: Omit<CollabRoomCardEventVerb, 'type'>): CollabRoomCardEventVerb {
  return { type: 'room:card-event', ...input }
}

export function collabAgentRaiseHand(
  input: Omit<CollabAgentRaiseHandVerb, 'type'>,
): CollabAgentRaiseHandVerb {
  return { type: 'agent:raise-hand', ...input }
}

export function collabAgentSpeak(input: Omit<CollabAgentSpeakVerb, 'type'>): CollabAgentSpeakVerb {
  return { type: 'agent:speak', ...input }
}

export function collabAgentYield(input: Omit<CollabAgentYieldVerb, 'type'>): CollabAgentYieldVerb {
  return { type: 'agent:yield', ...input }
}

export function collabAgentDmOpen(input: Omit<CollabAgentDmOpenVerb, 'type'>): CollabAgentDmOpenVerb {
  return { type: 'agent:dm-open', ...input }
}

export function collabAgentWake(input: Omit<CollabAgentWakeVerb, 'type'>): CollabAgentWakeVerb {
  return { type: 'agent:wake', ...input }
}

export function collabRefereeSetFloorPolicy(
  input: Omit<CollabRefereeSetFloorPolicyVerb, 'type'>,
): CollabRefereeSetFloorPolicyVerb {
  return { type: 'referee:set-floor-policy', ...input }
}

export function collabAgentNote(input: Omit<CollabAgentNoteVerb, 'type'>): CollabAgentNoteVerb {
  return { type: 'agent:note', ...input }
}

export function collabAgentSpawnWorker(
  input: Omit<CollabAgentSpawnWorkerVerb, 'type'>,
): CollabAgentSpawnWorkerVerb {
  return { type: 'agent:spawn-worker', ...input }
}

export function collabAgentWorkerResult(
  input: Omit<CollabAgentWorkerResultVerb, 'type'>,
): CollabAgentWorkerResultVerb {
  return { type: 'agent:worker-result', ...input }
}
