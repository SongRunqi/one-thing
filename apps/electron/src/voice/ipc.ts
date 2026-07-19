import { ipcMain } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
  on?<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronVoiceIpcChannels {
  getState: string
  start: string
  stop: string
  submitUtterance: string
  submitTranscript: string
  synthesize: string
  testASR: string
  testTTS: string
  getTTSModels: string
  runtimeReady: string
  runtimeEvent: string
  audioChunk?: string
}

export interface ElectronVoiceIpcInvokeEvent {
  sender: unknown
}

export interface ElectronVoiceTTSModelsRequest {
  force?: boolean
}

export interface RegisterElectronVoiceIpcHandlersOptions {
  channels: ElectronVoiceIpcChannels
  getState(): unknown
  start(request: unknown): unknown
  stop(request: unknown): unknown
  submitUtterance(request: unknown): unknown
  submitTranscript(request: unknown): unknown
  synthesize(request: unknown): unknown
  testASR(request: unknown): unknown
  testTTS(request: unknown): unknown
  getTTSModels(request?: ElectronVoiceTTSModelsRequest): unknown
  runtimeReady(sender: unknown): unknown
  runtimeEvent(event: unknown): unknown
  audioChunk?(payload: unknown): void
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronVoiceIpcHandlers(
  options: RegisterElectronVoiceIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.getState, () => {
    return options.getState()
  })

  host.handle(options.channels.start, (_event, request: unknown) => {
    return options.start(request)
  })

  host.handle(options.channels.stop, (_event, request: unknown) => {
    return options.stop(request)
  })

  host.handle(options.channels.submitUtterance, (_event, request: unknown) => {
    return options.submitUtterance(request)
  })

  host.handle(options.channels.submitTranscript, (_event, request: unknown) => {
    return options.submitTranscript(request)
  })

  host.handle(options.channels.synthesize, (_event, request: unknown) => {
    return options.synthesize(request)
  })

  host.handle(options.channels.testASR, (_event, request: unknown) => {
    return options.testASR(request)
  })

  host.handle(options.channels.testTTS, (_event, request: unknown) => {
    return options.testTTS(request)
  })

  host.handle(options.channels.getTTSModels, (_event, request?: ElectronVoiceTTSModelsRequest) => {
    return options.getTTSModels(request)
  })

  host.handle(options.channels.runtimeReady, (event: unknown) => {
    return options.runtimeReady((event as ElectronVoiceIpcInvokeEvent).sender)
  })

  host.handle(options.channels.runtimeEvent, (_event, event: unknown) => {
    return options.runtimeEvent(event)
  })

  // High-frequency PCM uplink; fire-and-forget so the runtime window never
  // blocks its audio callback on an invoke round trip.
  if (options.channels.audioChunk && options.audioChunk && host.on) {
    host.on(options.channels.audioChunk, (_event, payload: unknown) => {
      options.audioChunk?.(payload)
    })
  }
}
