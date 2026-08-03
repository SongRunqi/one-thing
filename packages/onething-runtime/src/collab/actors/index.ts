/**
 * Collab v3 的 actor 面(`@onething/runtime/collab/actors`)。
 *
 * 这里只有**协议**与**验收架**:动词表(D0)、金重放架(D0)。真正的
 * Room/Agent/Referee actor 是 D1-D3,落地时从这里取动词、从
 * `@onething/core/actors` 取内核。设计:docs/design/collab-actor-v3.md。
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
