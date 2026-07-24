import { getAppStatePath } from './paths.js'
import {
  getOnethingCurrentSessionId,
  getOnethingCurrentWorkspaceId,
  readOnethingAppState,
  setOnethingCurrentSessionId,
  setOnethingCurrentWorkspaceId,
  writeOnethingAppState,
  type OnethingAppState,
  type OnethingSerializedTab,
} from '@onething/runtime/storage'

export interface SerializedTab extends OnethingSerializedTab {}
export interface AppState extends OnethingAppState {}

export function getAppState(): AppState {
  return readOnethingAppState(getAppStatePath()) as AppState
}

export function saveAppState(state: AppState): void {
  writeOnethingAppState(getAppStatePath(), state)
}

export function getCurrentSessionId(): string {
  return getOnethingCurrentSessionId(getAppStatePath())
}

export function setCurrentSessionId(sessionId: string): void {
  setOnethingCurrentSessionId(getAppStatePath(), sessionId)
}

export function getCurrentWorkspaceId(): string | null {
  return getOnethingCurrentWorkspaceId(getAppStatePath())
}

export function setCurrentWorkspaceId(workspaceId: string | null): void {
  setOnethingCurrentWorkspaceId(getAppStatePath(), workspaceId)
}
