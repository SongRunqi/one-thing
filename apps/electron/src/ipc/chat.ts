import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronChatIpcChannels {
  getHistory: string
  generateTitle: string
  getSystemPromptSnapshot: string
  updateMessageThinkingTime: string
  abortStream: string
  getActiveStreams: string
  resumeAfterToolConfirm: string
}

export interface ElectronChatSessionRequest {
  sessionId: string
}

export interface ElectronGenerateTitleRequest {
  message: string
}

export interface ElectronUpdateMessageThinkingTimeRequest {
  sessionId: string
  messageId: string
  thinkingTime: number
}

export interface ElectronAbortStreamRequest {
  sessionId?: string
}

export interface ElectronResumeAfterToolConfirmRequest {
  sessionId: string
  messageId: string
}

export interface ElectronChatIpcInvokeEvent {
  sender: unknown
}

export interface RegisterElectronChatIpcHandlersOptions {
  channels: ElectronChatIpcChannels
  getHistory(request: ElectronChatSessionRequest): unknown
  generateTitle(request: ElectronGenerateTitleRequest): unknown
  getSystemPromptSnapshot(request: ElectronChatSessionRequest): unknown
  updateMessageThinkingTime(request: ElectronUpdateMessageThinkingTimeRequest): unknown
  abortStream(request?: ElectronAbortStreamRequest): unknown
  getActiveStreams(): unknown
  resumeAfterToolConfirm(request: ElectronResumeAfterToolConfirmRequest, sender: unknown): unknown
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronChatIpcHandlers(
  options: RegisterElectronChatIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getHistory, (_event, request: ElectronChatSessionRequest) => {
    return options.getHistory(request)
  })

  host.handle(options.channels.generateTitle, (_event, request: ElectronGenerateTitleRequest) => {
    return options.generateTitle(request)
  })

  host.handle(options.channels.getSystemPromptSnapshot, (_event, request: ElectronChatSessionRequest) => {
    return options.getSystemPromptSnapshot(request)
  })

  host.handle(options.channels.updateMessageThinkingTime, (_event, request: ElectronUpdateMessageThinkingTimeRequest) => {
    return options.updateMessageThinkingTime(request)
  })

  host.handle(options.channels.abortStream, (_event, request?: ElectronAbortStreamRequest) => {
    return options.abortStream(request)
  })

  host.handle(options.channels.getActiveStreams, () => {
    return options.getActiveStreams()
  })

  host.handle(options.channels.resumeAfterToolConfirm, (event: unknown, request: ElectronResumeAfterToolConfirmRequest) => {
    return options.resumeAfterToolConfirm(request, (event as ElectronChatIpcInvokeEvent).sender)
  })
}
