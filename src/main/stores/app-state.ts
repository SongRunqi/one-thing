import { getAppStatePath, readJsonFile, writeJsonFile } from './paths.js'

interface AppState {
  currentSessionId: string
  currentWorkspaceId: string | null  // null = default mode (no workspace)
  pinnedAgentIds: string[]  // Agent IDs pinned to sidebar top
}

const defaultAppState: AppState = {
  currentSessionId: '',
  currentWorkspaceId: null,
  pinnedAgentIds: [],
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

export function getPinnedAgentIds(): string[] {
  return getAppState().pinnedAgentIds ?? []
}

export function setPinnedAgentIds(agentIds: string[]): void {
  const state = getAppState()
  state.pinnedAgentIds = agentIds
  saveAppState(state)
}

export function pinAgent(agentId: string): string[] {
  const state = getAppState()
  // Ensure pinnedAgentIds exists (for backwards compatibility with old app-state.json)
  if (!state.pinnedAgentIds) {
    state.pinnedAgentIds = []
  }
  if (!state.pinnedAgentIds.includes(agentId)) {
    state.pinnedAgentIds.push(agentId)
    saveAppState(state)
  }
  return state.pinnedAgentIds
}

export function unpinAgent(agentId: string): string[] {
  const state = getAppState()
  // Ensure pinnedAgentIds exists (for backwards compatibility with old app-state.json)
  if (!state.pinnedAgentIds) {
    state.pinnedAgentIds = []
  }
  state.pinnedAgentIds = state.pinnedAgentIds.filter(id => id !== agentId)
  saveAppState(state)
  return state.pinnedAgentIds
}
