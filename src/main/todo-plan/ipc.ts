import {
  registerElectronTodoPlanIpcHandlers,
  type ElectronTodoPlanPinnedRequest,
} from '@onething/electron-host/ipc/todo-plan'
import {
  IPC_CHANNELS,
  type TodoPlanCreateRequest,
  type TodoPlanDeleteRequest,
  type TodoPlanGetRequest,
  type TodoPlanRenameRequest,
  type TodoPlanUpdateRequest,
  type TodoPlanWindowActionRequest,
} from '../../shared/ipc.js'
import { hideTodoPlanWindow, openTodoPlanWindow, setTodoPlanWindowPinned, toggleTodoPlanWindow } from '../window.js'
import {
  createOnethingTodoNoteForIpc,
  deleteOnethingTodoNoteForIpc,
  getOnethingTodoPlanForIpc,
  renameOnethingTodoNoteForIpc,
  revealOnethingTodoPlanDirectoryForIpc,
  runOnethingTodoPlanWindowActionForIpc,
  setOnethingTodoPlanWindowPinnedForIpc,
  updateOnethingTodoPlanDocumentForIpc,
} from '@onething/runtime/todo-plan'
import {
  createUserTodoNote,
  deleteUserTodoNote,
  readTodoPlanSnapshot,
  renameUserTodoNote,
  revealTodoPlanDirectory,
  updateTodoPlanDocument,
} from './store.js'

export function registerTodoPlanHandlers(): void {
  registerElectronTodoPlanIpcHandlers({
    channels: {
      get: IPC_CHANNELS.TODO_PLAN_GET,
      create: IPC_CHANNELS.TODO_PLAN_CREATE,
      update: IPC_CHANNELS.TODO_PLAN_UPDATE,
      rename: IPC_CHANNELS.TODO_PLAN_RENAME,
      delete: IPC_CHANNELS.TODO_PLAN_DELETE,
      revealDirectory: IPC_CHANNELS.TODO_PLAN_REVEAL_DIRECTORY,
      openWindow: IPC_CHANNELS.TODO_PLAN_OPEN_WINDOW,
      hideWindow: IPC_CHANNELS.TODO_PLAN_HIDE_WINDOW,
      toggleWindow: IPC_CHANNELS.TODO_PLAN_TOGGLE_WINDOW,
      setWindowPinned: IPC_CHANNELS.TODO_PLAN_SET_WINDOW_PINNED,
    },
    get: request =>
      getOnethingTodoPlanForIpc({
        request: request as TodoPlanGetRequest | undefined,
        readSnapshot: readTodoPlanSnapshot,
      }),
    create: request =>
      createOnethingTodoNoteForIpc({
        request: request as TodoPlanCreateRequest,
        createUserNote: createUserTodoNote,
      }),
    update: request =>
      updateOnethingTodoPlanDocumentForIpc({
        request: request as TodoPlanUpdateRequest,
        updateDocument: updateTodoPlanDocument,
      }),
    rename: request =>
      renameOnethingTodoNoteForIpc({
        request: request as TodoPlanRenameRequest,
        renameUserNote: renameUserTodoNote,
      }),
    delete: request =>
      deleteOnethingTodoNoteForIpc({
        request: request as TodoPlanDeleteRequest,
        deleteUserNote: deleteUserTodoNote,
      }),
    revealDirectory: () =>
      revealOnethingTodoPlanDirectoryForIpc({ revealDirectory: revealTodoPlanDirectory }),
    openWindow: request =>
      runOnethingTodoPlanWindowActionForIpc({
        request: request as TodoPlanWindowActionRequest | undefined,
        action: openTodoPlanWindow,
      }),
    hideWindow: request =>
      runOnethingTodoPlanWindowActionForIpc({
        request: request as TodoPlanWindowActionRequest | undefined,
        action: hideTodoPlanWindow,
      }),
    toggleWindow: request =>
      runOnethingTodoPlanWindowActionForIpc({
        request: request as TodoPlanWindowActionRequest | undefined,
        action: toggleTodoPlanWindow,
      }),
    setWindowPinned: (request: ElectronTodoPlanPinnedRequest) =>
      setOnethingTodoPlanWindowPinnedForIpc({
        pinned: request.pinned,
        setPinned: setTodoPlanWindowPinned,
      }),
  })
}
