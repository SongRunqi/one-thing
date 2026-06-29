import {
  OnethingTodoPlanStore,
  type TodoPlanChangedPayload,
  type TodoPlanContext,
  type TodoPlanDocument,
  type TodoPlanSnapshot,
  type TodoPlanUpdateRequest,
} from '@onething/runtime/todo-plan'
import {
  broadcastElectronTodoPlanChanged,
  revealElectronTodoPlanDirectory,
} from '@onething/electron-host/todo-plan/notifications'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { getSettings } from '../stores/settings.js'
import { getStorePath } from '../stores/paths.js'

function broadcast(payload: TodoPlanChangedPayload): void {
  broadcastElectronTodoPlanChanged({
    channel: IPC_CHANNELS.TODO_PLAN_CHANGED,
    payload,
  })
}

export const todoPlanStore = new OnethingTodoPlanStore({
  getConfiguredDirectory: () => getSettings().general?.todoPlan?.directory,
  getDefaultStorePath: () => getStorePath(),
  notifyChanged: broadcast,
  revealDirectory: revealElectronTodoPlanDirectory,
})

export function getTodoPlanDirectory(): string {
  return todoPlanStore.getDirectory()
}

export function readTodoPlanSnapshot(context: TodoPlanContext = {}): Promise<TodoPlanSnapshot> {
  return todoPlanStore.readSnapshot(context)
}

export function createUserTodoNote(title: string, content?: string): Promise<TodoPlanDocument> {
  return todoPlanStore.createUserNote(title, content)
}

export function updateTodoPlanDocument(request: TodoPlanUpdateRequest): Promise<TodoPlanDocument> {
  return todoPlanStore.updateDocument(request)
}

export function renameUserTodoNote(id: string, title: string): Promise<TodoPlanDocument> {
  return todoPlanStore.renameUserNote(id, title)
}

export function deleteUserTodoNote(id: string): Promise<void> {
  return todoPlanStore.deleteUserNote(id)
}

export function revealTodoPlanDirectory(): Promise<void> {
  return todoPlanStore.revealDirectory()
}

export function broadcastTodoPlanChanged(payload: TodoPlanChangedPayload): void {
  todoPlanStore.notifyChanged(payload)
}
