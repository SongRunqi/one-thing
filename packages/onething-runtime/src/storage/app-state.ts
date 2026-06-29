import {
  readJsonFile,
  writeJsonFile,
} from '@onething/core/storage'

export interface OnethingSerializedTab {
  type: 'chat' | 'file' | 'workbench'
  sessionId?: string
  filePath?: string
  initialFilePath?: string
  activeFilePath?: string
  workspaceRoot?: string
  title?: string
}

export interface OnethingAppState {
  currentSessionId: string
  currentWorkspaceId: string | null
  openTabs?: OnethingSerializedTab[]
  activeTabIndex?: number
  sidebarCollapsed?: boolean
}

export interface OnethingUiStatePatch {
  openTabs?: OnethingSerializedTab[]
  activeTabIndex?: number
  sidebarCollapsed?: boolean
}

export const DEFAULT_ONETHING_APP_STATE: OnethingAppState = {
  currentSessionId: '',
  currentWorkspaceId: null,
}

export function readOnethingAppState(appStatePath: string): OnethingAppState {
  return readJsonFile(appStatePath, DEFAULT_ONETHING_APP_STATE)
}

export function writeOnethingAppState(appStatePath: string, state: OnethingAppState): void {
  writeJsonFile(appStatePath, state)
}

export function getOnethingCurrentSessionId(appStatePath: string): string {
  return readOnethingAppState(appStatePath).currentSessionId
}

export function setOnethingCurrentSessionId(appStatePath: string, sessionId: string): OnethingAppState {
  const state = readOnethingAppState(appStatePath)
  const nextState = {
    ...state,
    currentSessionId: sessionId,
  }
  writeOnethingAppState(appStatePath, nextState)
  return nextState
}

export function getOnethingCurrentWorkspaceId(appStatePath: string): string | null {
  return readOnethingAppState(appStatePath).currentWorkspaceId ?? null
}

export function setOnethingCurrentWorkspaceId(appStatePath: string, workspaceId: string | null): OnethingAppState {
  const state = readOnethingAppState(appStatePath)
  const nextState = {
    ...state,
    currentWorkspaceId: workspaceId,
  }
  writeOnethingAppState(appStatePath, nextState)
  return nextState
}

export function mergeOnethingUiState(
  state: OnethingAppState,
  uiState: OnethingUiStatePatch,
): OnethingAppState {
  return {
    ...state,
    ...(uiState.openTabs !== undefined ? { openTabs: uiState.openTabs } : {}),
    ...(uiState.activeTabIndex !== undefined ? { activeTabIndex: uiState.activeTabIndex } : {}),
    ...(uiState.sidebarCollapsed !== undefined ? { sidebarCollapsed: uiState.sidebarCollapsed } : {}),
  }
}

export function saveOnethingUiState(appStatePath: string, uiState: OnethingUiStatePatch): OnethingAppState {
  const state = readOnethingAppState(appStatePath)
  const nextState = mergeOnethingUiState(state, uiState)
  writeOnethingAppState(appStatePath, nextState)
  return nextState
}

export type SaveOnethingUiStateForIpcResult =
  | { success: true; state: OnethingAppState }
  | { success: false; error: string }

export function saveOnethingUiStateForIpc(
  appStatePath: string,
  uiState: OnethingUiStatePatch,
): SaveOnethingUiStateForIpcResult {
  try {
    return {
      success: true,
      state: saveOnethingUiState(appStatePath, uiState),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error && error.message
        ? error.message
        : 'Failed to save UI state',
    }
  }
}
