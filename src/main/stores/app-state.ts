import { getAppStatePath, readJsonFile, writeJsonFile } from './paths.js'

interface AppState {
  currentSessionId: string
  currentWorkspaceId: string | null  // null = default mode (no workspace)
}

const defaultAppState: AppState = {
  currentSessionId: '',
  currentWorkspaceId: null,
}

export function getAppState(): AppState {
  return readJsonFile(getAppStatePath(), defaultAppState)
}

export function saveAppState(state: AppState): void {
  writeJsonFile(getAppStatePath(), state)
}

export function getCurrentSessionId(): string {
  return getAppState().currentSessionId
}

export function setCurrentSessionId(sessionId: string): void {
  const state = getAppState()
  state.currentSessionId = sessionId
  saveAppState(state)
}

export function getCurrentWorkspaceId(): string | null {
  return getAppState().currentWorkspaceId ?? null
}

export function setCurrentWorkspaceId(workspaceId: string | null): void {
  const state = getAppState()
  state.currentWorkspaceId = workspaceId
  saveAppState(state)
}
