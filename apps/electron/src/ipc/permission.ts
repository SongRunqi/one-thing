import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronPermissionIpcChannels {
  getPending: string
  clearSession: string
  listGrants: string
  revokeGrant: string
  clearSessionGrants: string
  clearWorkspaceGrants: string
}

export type ElectronPermissionSessionId = string

export interface ElectronPermissionListGrantsRequest {
  sessionId?: string
  workspaceRoot?: string
}

export interface ElectronPermissionRevokeGrantRequest {
  id: string
}

export interface ElectronPermissionClearSessionGrantsRequest {
  sessionId: string
}

export interface ElectronPermissionClearWorkspaceGrantsRequest {
  workspaceRoot: string
}

export interface RegisterElectronPermissionIpcHandlersOptions {
  channels: ElectronPermissionIpcChannels
  getPending(sessionId: ElectronPermissionSessionId): unknown
  clearSession(sessionId: ElectronPermissionSessionId): unknown
  listGrants(request: ElectronPermissionListGrantsRequest): unknown
  revokeGrant(request: ElectronPermissionRevokeGrantRequest): unknown
  clearSessionGrants(request: ElectronPermissionClearSessionGrantsRequest): unknown
  clearWorkspaceGrants(request: ElectronPermissionClearWorkspaceGrantsRequest): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronPermissionIpcHandlers(
  options: RegisterElectronPermissionIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getPending, (_event, sessionId: ElectronPermissionSessionId) => {
    return options.getPending(sessionId)
  })

  host.handle(options.channels.listGrants, (_event, request: ElectronPermissionListGrantsRequest) => {
    return options.listGrants(request)
  })

  host.handle(options.channels.revokeGrant, (_event, request: ElectronPermissionRevokeGrantRequest) => {
    return options.revokeGrant(request)
  })

  host.handle(options.channels.clearSessionGrants, (_event, request: ElectronPermissionClearSessionGrantsRequest) => {
    return options.clearSessionGrants(request)
  })

  host.handle(options.channels.clearWorkspaceGrants, (_event, request: ElectronPermissionClearWorkspaceGrantsRequest) => {
    return options.clearWorkspaceGrants(request)
  })

  host.handle(options.channels.clearSession, (_event, sessionId: ElectronPermissionSessionId) => {
    return options.clearSession(sessionId)
  })
}
