import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type TodoPlanCreateRequest,
  type TodoPlanDeleteRequest,
  type TodoPlanGetRequest,
  type TodoPlanRenameRequest,
  type TodoPlanUpdateRequest,
} from '../../shared/ipc.js'
import { openTodoPlanWindow, setTodoPlanWindowPinned, toggleTodoPlanWindow } from '../window.js'
import {
  createUserTodoNote,
  deleteUserTodoNote,
  readTodoPlanSnapshot,
  renameUserTodoNote,
  revealTodoPlanDirectory,
  updateTodoPlanDocument,
} from './store.js'

export function registerTodoPlanHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_GET, async (_event, request?: TodoPlanGetRequest) => {
    try {
      return { success: true, snapshot: await readTodoPlanSnapshot(request || {}) }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to read todo/plan files' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_CREATE, async (_event, request: TodoPlanCreateRequest) => {
    try {
      return { success: true, document: await createUserTodoNote(request.title, request.content) }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to create todo note' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_UPDATE, async (_event, request: TodoPlanUpdateRequest) => {
    try {
      return { success: true, document: await updateTodoPlanDocument(request) }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to update todo/plan file' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_RENAME, async (_event, request: TodoPlanRenameRequest) => {
    try {
      return { success: true, document: await renameUserTodoNote(request.id, request.title) }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to rename todo note' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_DELETE, async (_event, request: TodoPlanDeleteRequest) => {
    try {
      await deleteUserTodoNote(request.id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to delete todo note' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_REVEAL_DIRECTORY, async () => {
    try {
      await revealTodoPlanDirectory()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to open todo/plan directory' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_OPEN_WINDOW, async () => {
    openTodoPlanWindow()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_TOGGLE_WINDOW, async () => {
    toggleTodoPlanWindow()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.TODO_PLAN_SET_WINDOW_PINNED, async (_event, request: { pinned: boolean }) => {
    return { success: true, pinned: setTodoPlanWindowPinned(request.pinned) }
  })
}
