/**
 * Collab v3 的 actor 面(`@onething/runtime/collab/actors`)。
 *
 * 这里是**协议**、**验收架**与**纯规则**:动词表(D0)、金重放架(D0)、
 * 房间的账与三道闸(D1 `room-rules.ts`)、发言策略族(D1 `floor-policy.ts`)。
 * 带 IO 的那一半(落盘、mailbox、宿主端口)在 `@onething/app` 的
 * `collab/actors/`。设计:docs/design/collab-actor-v3.md。
 */
export {
  COLLAB_ACTOR_VERB_TABLE_IS_EXHAUSTIVE,
  COLLAB_ACTOR_VERB_TYPES,
  collabActorRef,
  collabActorVerbDirection,
  collabActorVerbSender,
  collabAgentDmOpen,
  collabAgentNote,
  collabAgentRaiseHand,
  collabAgentSpawnWorker,
  collabAgentSpeak,
  collabAgentWake,
  collabAgentWorkerResult,
  collabAgentYield,
  collabRefereeSetFloorPolicy,
  collabRoomCardEvent,
  collabRoomFloorGranted,
  collabRoomFloorRevoked,
  collabRoomMembershipChanged,
  collabRoomPhaseChanged,
  collabRoomPosted,
  isCollabActorVerbType,
} from './protocol.js'
export type {
  CollabActorKind,
  CollabActorRef,
  CollabActorVerb,
  CollabActorVerbDirection,
  CollabActorVerbType,
  CollabAgentDmOpenVerb,
  CollabAgentNoteVerb,
  CollabAgentRaiseHandVerb,
  CollabAgentSpawnWorkerVerb,
  CollabAgentSpeakVerb,
  CollabAgentWakeVerb,
  CollabAgentWorkerResultVerb,
  CollabAgentYieldVerb,
  CollabCardEventKind,
  CollabFloorPolicyName,
  CollabFloorPolicyParams,
  CollabFloorRevokeReason,
  CollabHandUrgency,
  CollabRefereeSetFloorPolicyVerb,
  CollabRoomCardEventVerb,
  CollabRoomFloorGrantedVerb,
  CollabRoomFloorRevokedVerb,
  CollabRoomMembershipChangedVerb,
  CollabRoomPhaseChangedVerb,
  CollabRoomPostedVerb,
  CollabYieldReason,
} from './protocol.js'

export {
  COLLAB_REPLAY_EVENT_ID_PREFIX,
  createCollabActorPassthroughPipeline,
  formatCollabActorReplay,
  formatCollabActorVerb,
  orderTranscriptMessages,
  parseRoomTranscriptJsonl,
  replayMessageAuthor,
  replayRoomTranscript,
  transcriptMessageKey,
} from './replay.js'
export type {
  CollabActorPassthroughPipeline,
  CollabActorReplayContext,
  CollabActorReplayOptions,
  CollabActorReplayPipeline,
  CollabActorReplayResult,
  CollabActorReplayTranscript,
} from './replay.js'

export {
  collabFloorSeats,
  createCollabFreeFloorPolicy,
  orderCollabHands,
  resolveCollabFloorPolicy,
} from './floor-policy.js'
export type {
  CollabFloorDecision,
  CollabFloorDecisionInput,
  CollabFloorGrantCandidate,
  CollabFloorPolicy,
  CollabRaisedHand,
} from './floor-policy.js'

export {
  applyCollabRoomPassthrough,
  applyCollabRoomPhaseChange,
  applyCollabRoomPosted,
  applyCollabRoomRaiseHand,
  applyCollabRoomSetPolicy,
  applyCollabRoomSpeak,
  applyCollabRoomYield,
  buildCollabRoomBudgetHoldLine,
  bumpCollabRoomEpoch,
  COLLAB_ROOM_ACCOUNT_VERSION,
  COLLAB_ROOM_DEFAULT_FLOOR_POLICY,
  COLLAB_ROOM_FROZEN_LINE,
  COLLAB_ROOM_FROZEN_LINE_DM,
  COLLAB_SPEAK_REFUSED_EXPIRED_LEASE,
  COLLAB_SPEAK_REFUSED_LEASE_OWNER,
  COLLAB_SPEAK_REFUSED_NO_LEASE,
  COLLAB_SPEAK_REFUSED_STALE_LEASE,
  collabRoomActiveLeases,
  collabRoomChainEntryOf,
  collabRoomEventId,
  collabRoomHolders,
  createCollabRoomAccount,
  enqueueCollabHand,
  foldCollabRoomChain,
  normalizeCollabRoomAccount,
  openCollabRoomBroadcast,
  pruneCollabRoomFloor,
  settleCollabRoomBroadcast,
} from './room-rules.js'
export type {
  CollabRoomAccount,
  CollabRoomChainEntry,
  CollabRoomEffects,
  CollabRoomGates,
  CollabRoomIdSource,
  CollabRoomPendingBroadcast,
  CollabRoomStep,
  CollabRoomTranscriptMessage,
} from './room-rules.js'
