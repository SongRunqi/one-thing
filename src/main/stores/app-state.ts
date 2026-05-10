import { getAppStatePath, readJsonFile, writeJsonFile } from './paths.js'

export interface SerializedTab {
  type: 'chat' | 'file'
  sessionId?: string
  filePath?: string
  title?: string
}

export interface AppState {
  currentSessionId: string
  currentWorkspaceId: string | null  // null = default mode (no workspace)
  openTabs?: SerializedTab[]
  activeTabIndex?: number
  sidebarCollapsed?: boolean
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
