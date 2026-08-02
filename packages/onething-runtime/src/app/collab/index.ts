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
export { abortCollabRoomTurnForStop } from './turn.js'
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
