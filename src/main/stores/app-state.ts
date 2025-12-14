import { getAppStatePath, readJsonFile, writeJsonFile } from './paths.js'

interface AppState {
  currentSessionId: string
}

const defaultAppState: AppState = {
  currentSessionId: '',
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
