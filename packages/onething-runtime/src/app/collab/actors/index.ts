/**
 * Collab v3 的 actor 装配面(`@onething/app` 的 `collab/actors/`)。
 *
 * 这里是带 IO 的那一半:账落盘、mailbox 广播、宿主端口、C4 快照供数。规则(账的
 * 转换、三道闸、发牌策略)在纯层的 `@onething/runtime/collab/actors`,两边共用
 * **同一个** `decide()`,金重放因此验的是真机的代码而不是它的复制品。
 *
 * D1 是房间,D2 是 AgentActor(心智循环 / 信箱 / 笔记 / MindPort);Referee(D3)、
 * Worker(D4)会挨着它们落在这个目录里。
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

/* ── D2:AgentActor ─────────────────────────────────────────────────────── */

export {
  COLLAB_AGENTS_V3_DIR,
  COLLAB_AGENT_ACCOUNT_FILE,
  COLLAB_AGENT_MAILBOX_NAME,
  COLLAB_AGENT_NOTEBOOK_FILE,
  collabAgentAccountPath,
  collabAgentActorDir,
  collabAgentNotebookPath,
  createCollabAgentAccountFileStore,
  createCollabAgentAccountMemoryStore,
  openCollabAgentMailbox,
} from './agent-mailbox.js'
export type { CollabAgentAccountStore } from './agent-mailbox.js'

export {
  buildCollabAgentNotebookBlock,
  createCollabNotebookFileStore,
  createCollabNotebookMemoryStore,
} from './notebook-store.js'
export type {
  CollabNotebookAppendInput,
  CollabNotebookAppendResult,
  CollabNotebookStore,
} from './notebook-store.js'

export { createCollabScriptedMindPort } from './mind-port.js'
export type {
  CollabMindPort,
  CollabMindSay,
  CollabMindSteerRequest,
  CollabMindTurnMessage,
  CollabMindTurnOutcome,
  CollabMindTurnRequest,
  CollabMindTurnResult,
  CollabScriptedCall,
  CollabScriptedMindPort,
  CollabScriptedTurn,
} from './mind-port.js'

/**
 * **刻意不从这个桶里导出的两样**:
 *
 *  - `engine-mind-port.ts`(生产适配器)—— 它 import 引擎、总线、会话仓库;
 *  - `notebook-tool.ts`(工具接线)—— 它 import 会话仓库。
 *
 * 这个桶今天的读者是**重放与测试**,它们跑在没有引擎、没有 store 的环境里。
 * 把那两个挂上来,等于让每一条 `import '@onething/app' 的 collab/actors` 都
 * 顺带把半个主进程拉起来(D2 实施时真的把 D1 的房间测试整个拖挂了)。两者各自
 * 按路径 import:工具在 `app/tools/builtin/index.ts` 注册,适配器在 D6 接线。
 */
export { CollabAgentActor } from './agent-actor.js'
export type {
  CollabAgentActorHost,
  CollabAgentActorOptions,
  CollabAgentOutbox,
  CollabAgentRoomContextInput,
  CollabAgentTurnFailure,
} from './agent-actor.js'

export { collabDuetMembersOf, replayCollabDuet } from './agent-replay.js'
export type {
  CollabDuetReplayOptions,
  CollabDuetReplayResult,
  CollabDuetRoomSpec,
} from './agent-replay.js'
