/**
 * Collab v3 的 actor 装配面(`@onething/app` 的 `collab/actors/`)。
 *
 * 这里是带 IO 的那一半:账落盘、mailbox 广播、宿主端口、C4 快照供数。规则(账的
 * 转换、三道闸、发牌策略)在纯层的 `@onething/runtime/collab/actors`,两边共用
 * **同一个** `decide()`,金重放因此验的是真机的代码而不是它的复制品。
 *
 * D1 只有房间。AgentActor(D2)、Referee(D3)、Worker(D4)会挨着它落在这个目录里。
 * **本期不接引擎、不接宿主** —— v2 的调度链仍然是生产,接线在 D6。
 */
export {
  COLLAB_ACTORS_DIR,
  COLLAB_ROOM_ACCOUNT_FILE,
  collabRoomAccountPath,
  collabRoomActorsDir,
  createCollabRoomAccountFileStore,
  createCollabRoomAccountMemoryStore,
} from './room-account.js'
export type { CollabRoomAccountStore } from './room-account.js'

export {
  buildCollabRoomActorSnapshot,
  CollabRoomActor,
  CollabRoomBroadcastError,
  collabRoomBroadcastRecipients,
} from './room-actor.js'
export type {
  CollabRoomActorHost,
  CollabRoomActorOptions,
  CollabRoomMemberMailbox,
} from './room-actor.js'

export {
  collabRoomMembersFromTranscript,
  createCollabRoomActorReplayPipeline,
} from './room-replay.js'
export type {
  CollabRoomActorReplayPipeline,
  CollabRoomReplayOptions,
} from './room-replay.js'
