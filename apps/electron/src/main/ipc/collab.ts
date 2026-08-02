import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc.js'
import type {
  CollabBoardActRequest,
  CollabBoardGetRequest,
  CollabCoordinatorGetRequest,
  CollabDmRoomEnsureRequest,
  CollabMessageReactRequest,
  CollabRoomBudgetsRequest,
  CollabRoomClearHistoryRequest,
  CollabRoomFolderListRequest,
  CollabRoomFrozenRequest,
  CollabRoomSpendRequest,
  CollabRoomUpdateRequest,
  CollabTaskStopRequest,
} from '@shared/ipc.js'
import { loadCollabBoard } from '@onething/app/collab/board-store.js'
import {
  applyUserCollabBoardAction,
  clearCollabRoomHistory,
  ensureUserDmRoom,
  getCollabCoordinatorState,
  getCollabRoomSpend,
  listCollabRoomFolder,
  reactToCollabMessage,
  setCollabRoomBudgets,
  setCollabRoomConfig,
  setCollabRoomFrozen,
  stopCollabTaskWork,
} from '@onething/app/collab/index.js'

export function registerCollabHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.COLLAB_BOARD_GET, (_event, request: CollabBoardGetRequest) => {
    try {
      return { success: true, board: loadCollabBoard(request.roomSessionId) }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Board mutation from the UI (W16). The action rides across UNTOUCHED — what
  // is legal (statuses, rev preconditions, "only the assignee completes it") is
  // the pure reducer's call, and duplicating any of it here would be a second
  // rulebook to keep in sync. Room existence/kind is the one thing this side
  // owns, because it is session state the reducer never sees.
  ipcMain.handle(IPC_CHANNELS.COLLAB_BOARD_ACT, async (_event, request: CollabBoardActRequest) => {
    try {
      if (!request?.action) return { success: false, error: 'Missing board action' }
      return await applyUserCollabBoardAction(request.roomSessionId, request.action)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 卡级停止(collab-team-v2 §5.1 入口②)。刻意不是一个 board action:动作表
  // 描述的是卡在状态机里怎么走,而"停掉正在跑的那条流"是运行时的事,让模型
  // 也能调它等于给了它一个停别人活的开关。
  ipcMain.handle(IPC_CHANNELS.COLLAB_TASK_STOP, async (_event, request: CollabTaskStopRequest) => {
    try {
      const stopped = await stopCollabTaskWork(request.roomSessionId, request.taskId)
      return { success: true, stopped }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 协调器状态条的冷启动读取。纯读、同步 —— 快照是从运行时现算的,不碰磁盘。
  ipcMain.handle(IPC_CHANNELS.COLLAB_COORDINATOR_GET, (_event, request: CollabCoordinatorGetRequest) => {
    try {
      const state = getCollabCoordinatorState(request.roomSessionId)
      return state ? { success: true, state } : { success: false, error: 'Not a room session' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COLLAB_ROOM_SET_FROZEN, (_event, request: CollabRoomFrozenRequest) => {
    const success = setCollabRoomFrozen(request.roomSessionId, request.frozen)
    return success ? { success } : { success, error: 'Not a room session' }
  })

  ipcMain.handle(IPC_CHANNELS.COLLAB_ROOM_SET_BUDGETS, (_event, request: CollabRoomBudgetsRequest) => {
    const success = setCollabRoomBudgets(request.roomSessionId, {
      dailyCostUSD: request.dailyCostUSD,
      maxChain: request.maxChain,
      maxTurnToolCalls: request.maxTurnToolCalls,
      maxTurnSayCalls: request.maxTurnSayCalls,
      // 2026-08-02:这一行本来是漏的。`CollabRoomBudgetsRequest` 从并行化那天起
      // 就带着 maxConcurrentTurns,`setCollabRoomBudgets` 也一直认它,唯独这个
      // 中转把字段一个个抄过去时抄漏了 —— 于是「同时发言上限」从桌面端根本写不进去,
      // 而且不报错。这正是那个类型的注释警告过的那种漂移。
      maxConcurrentTurns: request.maxConcurrentTurns,
    })
    return success ? { success } : { success, error: 'Not a room session' }
  })

  // Room spend (W13.5): read-only, one shot when the settings panel opens.
  // Deliberately its OWN channel rather than a field on COLLAB_BOARD_GET — the
  // board fetch is a hot path and must not pay a ledger scan per call.
  ipcMain.handle(IPC_CHANNELS.COLLAB_ROOM_SPEND_GET, (_event, request: CollabRoomSpendRequest) =>
    getCollabRoomSpend(request.roomSessionId))

  // Team settings (W6): rename / roster / PM / permission mode. Validation and
  // the membership 群公告 live in the app layer — this handler only carries the
  // patch across, so the CLI/daemon path behaves identically.
  ipcMain.handle(IPC_CHANNELS.COLLAB_ROOM_UPDATE, (_event, request: CollabRoomUpdateRequest) => {
    try {
      return setCollabRoomConfig(request.roomSessionId, {
        ...(request.name !== undefined ? { name: request.name } : {}),
        ...(request.memberAgentIds !== undefined ? { memberAgentIds: request.memberAgentIds } : {}),
        ...(request.pmAgentId !== undefined ? { pmAgentId: request.pmAgentId } : {}),
        ...(request.permissionMode !== undefined ? { permissionMode: request.permissionMode } : {}),
        ...(request.responseMode !== undefined ? { responseMode: request.responseMode } : {}),
        ...(request.speakOrder !== undefined ? { speakOrder: request.speakOrder } : {}),
        ...(request.relayLoops !== undefined ? { relayLoops: request.relayLoops } : {}),
      })
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 清空聊天记录。次序(先停后删再播)与"到底清哪几处"全在 app 层 —— 这里只把
  // 房间 id 带过去,好让 CLI/daemon 将来接同一个函数时行为逐字一致。
  ipcMain.handle(
    IPC_CHANNELS.COLLAB_ROOM_CLEAR_HISTORY,
    async (_event, request: CollabRoomClearHistoryRequest) => {
      try {
        return await clearCollabRoomHistory(request?.roomSessionId, {
          includeMemberDms: request?.includeMemberDms === true,
        })
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  // 托管私聊房的 get-or-create(agent-im-dm.md D1)。校验(同事、在职、查得到)
  // 全在 app 层,所以 CLI/daemon 将来接同一个函数时行为一致;这里只把"开不了房"
  // 翻译成一句用户读得懂的失败。
  ipcMain.handle(IPC_CHANNELS.COLLAB_DM_ROOM_ENSURE, (_event, request: CollabDmRoomEnsureRequest) => {
    try {
      const roomSessionId = ensureUserDmRoom(request?.agentId)
      return roomSessionId
        ? { success: true, roomSessionId }
        : { success: false, error: '这个 agent 不能开私聊(已退休、不是同事,或者查无此人)' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 群 folder 的只读列目录(agent-im-chat-ui.md §3.2)。folder 的位置只有 app
  // 层算得出(workingDirectory ?? <store>/rooms/<id>),所以这是个按房间 id 问的
  // 通道,而不是让渲染进程拿 file:list-directory 去猜路径。只读:没有建/删/写。
  ipcMain.handle(IPC_CHANNELS.COLLAB_ROOM_FOLDER_LIST, (_event, request: CollabRoomFolderListRequest) => {
    try {
      const listing = listCollabRoomFolder(request?.roomSessionId)
      return { success: true, ...listing }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // Emoji reaction (W8): toggle semantics, palette-validated in the app layer.
  // The updated message is broadcast as `message:updated`, so this reply exists
  // only for the caller's own error handling — the UI updates off the event.
  //
  // The actor is pinned here for the same reason COLLAB_BOARD_ACT pins it: a
  // renderer must never be able to act AS an agent. Reactions carry attribution
  // that the room reads back as a member's opinion (§3.5 B — a silent member's
  // emoji is its answer), so an actor field taken off the wire would let the UI
  // put a reaction under someone else's name. The request's own actor field is
  // deliberately ignored rather than validated.
  ipcMain.handle(IPC_CHANNELS.COLLAB_MESSAGE_REACT, (_event, request: CollabMessageReactRequest) => {
    try {
      return reactToCollabMessage(
        request.roomSessionId,
        request.messageId,
        request.emoji,
        { type: 'user' },
      )
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
