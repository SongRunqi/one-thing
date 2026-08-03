export {
  handleCollabRoomSendMessage,
  isCollabRoomSession,
  type CollabRoomInboundCommand,
} from './ingress.js'
export {
  applyUserCollabBoardAction,
  clearCollabRoomHistory,
  getCollabCoordinatorState,
  getCollabRoomSpend,
  initializeCollabCoordinator,
  readCollabRoomSpentTodayUSD,
  setCollabRoomBudgets,
  setCollabRoomConfig,
  setCollabRoomFrozen,
  shutdownCollabCoordinator,
  type CollabBoardActResult,
  type CollabRoomClearHistoryResult,
  type CollabRoomConfigPatch,
  type CollabRoomConfigResult,
} from './coordinator.js'
/**
 * 停止按钮那扇门走 v3 优先的路由(D6-a)。v2 的 `turn.ts` 那份仍在,由这扇门在
 * 「这不是一间 v3 房」时回落 —— 见 `actors/stop-door.ts`。
 */
export { abortCollabRoomTurnForStop } from './actors/stop-door.js'
/** Collab v3 运行时(D6-a):`createOnethingBackend` 的协作装配点。 */
export {
  initializeCollabV3Runtime,
  isCollabV3RuntimeRunning,
  shutdownCollabV3Runtime,
  type CollabV3RuntimeOptions,
} from './actors/runtime.js'
/** 建群房的唯一入口(架构收敛 C3):校验 + 落库,壳层不留业务规则。 */
export {
  ensureCollabGroupRoom,
  type CollabGroupRoomInput,
  type EnsureCollabGroupRoomOptions,
  type EnsureCollabGroupRoomResult,
} from './room-create.js'
/** 群 folder 的只读列目录(agent-im-chat-ui.md §3.2「文件」块)。 */
export {
  listCollabRoomFolder,
  type CollabRoomFolderEntry as CollabRoomFolderListEntry,
  type CollabRoomFolderListing,
} from './room-folder.js'
/** 用户 ↔ agent 托管私聊房的 get-or-create(agent-im-dm.md D1)。 */
export { ensureUserDmRoom } from './user-dm-room.js'
/** agent ↔ agent 私聊房的 get-or-create(agent-im-dm.md D3;`dm` 工具的建房口)。 */
export { ensureAgentDmRoom } from './agent-dm-room.js'
export { hasActiveCollabWork, stopCollabTaskWork } from './worker.js'
export { attachCollabMentions } from './mentions.js'
export { attachCollabReplyTo } from './reply-quote.js'
export {
  reactToCollabMessage,
  type CollabMessageReactionOptions,
  type CollabMessageReactionResult,
} from './reactions.js'
