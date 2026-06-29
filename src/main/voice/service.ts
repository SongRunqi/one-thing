import { randomUUID } from 'crypto'
import {
  IPC_CHANNELS,
  type AppSettings,
  type VoiceEvent,
  type VoiceLatencyMilestone,
  type VoiceLatencyMilestoneName,
  type VoiceRuntimeEvent,
  type VoiceRuntimeState,
  type VoiceRuntimeStatus,
  type VoiceSettings,
  type VoiceStartRequest,
  type VoiceStopRequest,
  type VoiceSubmitTranscriptRequest,
  type VoiceSubmitUtteranceRequest,
  type VoiceSynthesizeRequest,
} from '../../shared/ipc.js'
import { getEventBus, getStreamChannel } from '../events/index.js'
import type { StreamChunk } from '../../shared/events/index.js'
import type { Unsubscribe } from '../events/types.js'
import { getStreamEngineSafe } from '../engine/index.js'
import { getCurrentSessionId } from '../stores/app-state.js'
import { getSettings, saveSettings } from '../stores/settings.js'
import { agentExists } from '../agents/index.js'
import { updateSessionAgent } from '../stores/sessions.js'
import { getVoiceInputConfigurationError, streamSynthesizeSpeech, transcribeUtterance } from './providers.js'
import {
  applyOnethingVoiceRuntimeError,
  applyOnethingVoiceRuntimeMilestone,
  applyOnethingVoiceRuntimeStatus,
  applyOnethingVoiceWakeFailureFallback,
  createOnethingVoiceLatencyMilestone,
  getOnethingSpeakableTextFromDelta,
  getOnethingTTSModelName,
  isOnethingMissingCloudTTSConfiguration,
  normalizeOnethingVoiceError,
  splitOnethingSpeakableSentences,
} from '@onething/runtime/voice'
import {
  broadcastElectronVoiceMessage,
  getElectronWebContentsId,
  sendElectronVoiceMessageToWindow,
  type ElectronVoiceMessageWebContents,
  type ElectronVoiceMessageWindow,
} from '@onething/electron-host/voice/events'
import {
  destroyVoiceRuntimeWindow,
  ensureVoiceRuntimeWindow,
  flushVoiceRuntimeCommands,
  isVoiceRuntimeReady,
  markVoiceRuntimeReady,
  sendVoiceRuntimeCommand,
} from '@onething/electron-host/voice/runtime-window'
import { updateVoiceTray } from '@onething/electron-host/voice/tray'

interface VoiceReplyPlaybackTurn {
  id: number
  sessionId: string
  buffer: string
  flushTimer?: ReturnType<typeof setTimeout>
  unsubscribeStream?: Unsubscribe
  unsubscribeEvents?: Unsubscribe
}

type VoiceWebContents = ElectronVoiceMessageWebContents
type VoiceWindow = ElectronVoiceMessageWindow

class VoiceService {
  private state: VoiceRuntimeState = {
    status: 'disabled',
    enabled: false,
    runtimeReady: false,
    updatedAt: Date.now(),
  }
  private replyPlayback: VoiceReplyPlaybackTurn | null = null
  private replyPlaybackId = 0
  private speechChain: Promise<void> = Promise.resolve()

  applySettings(settings: AppSettings = getSettings()): void {
    const voice = settings.voice
    this.state.enabled = Boolean(voice?.enabled)

    if (!voice?.enabled) {
      this.setStatus('disabled')
      destroyVoiceRuntimeWindow()
      updateVoiceTray()
      return
    }

    ensureVoiceRuntimeWindow()
    const status: VoiceRuntimeStatus = voice.alwaysOn ? 'wake-listening' : 'idle'
    this.setStatus(status)
    sendVoiceRuntimeCommand({
      type: voice.alwaysOn ? 'start-wake' : 'configure',
      settings: voice,
      sessionId: getCurrentSessionId() || undefined,
    })
    updateVoiceTray()
  }

  attachMainWindow(window: VoiceWindow): void {
    if (this.state.enabled) {
      ensureVoiceRuntimeWindow()
    }
    this.broadcastState(window)
  }

  getState(): VoiceRuntimeState {
    return { ...this.state }
  }

  async start(request: VoiceStartRequest = {}): Promise<{ success: boolean; error?: string }> {
    const settings = getSettings().voice!
    if (!settings?.enabled) {
      return { success: false, error: 'Voice is disabled.' }
    }

    const sessionId = request.sessionId || getCurrentSessionId()
    if (!sessionId) {
      return { success: false, error: 'No active session for voice input.' }
    }
    const configurationError = getVoiceInputConfigurationError(settings)
    if (configurationError) {
      this.setError(configurationError)
      return { success: false, error: configurationError }
    }

    ensureVoiceRuntimeWindow()
    if (settings.bargeIn) {
      this.cancelReplyPlayback()
      sendVoiceRuntimeCommand({ type: 'stop-playback' })
      getStreamEngineSafe()?.abort(sessionId)
    }

    this.state.currentSessionId = sessionId
    this.setStatus('recording')
    sendVoiceRuntimeCommand({
      type: 'start-recording',
      settings,
      sessionId,
      reason: request.reason || 'manual',
    })
    return { success: true }
  }

  stop(request: VoiceStopRequest = {}): { success: boolean } {
    sendVoiceRuntimeCommand({
      type: 'stop',
      reason: request.reason,
      submit: request.submit ?? request.reason === 'mic-button',
    })
    const settings = getSettings().voice
    this.setStatus(settings?.enabled && settings.alwaysOn ? 'wake-listening' : settings?.enabled ? 'idle' : 'disabled')
    return { success: true }
  }

  async submitUtterance(request: VoiceSubmitUtteranceRequest): Promise<{ success: boolean; transcript?: string; transcriptId?: string; error?: string }> {
    const settings = getSettings().voice
    if (!settings?.enabled) return { success: false, error: 'Voice is disabled.' }

    const sessionId = request.sessionId || this.state.currentSessionId || getCurrentSessionId()
    if (!sessionId) return { success: false, error: 'No active session for voice transcript.' }

    this.setStatus('transcribing')
    try {
      const transcript = await transcribeUtterance({ ...request, sessionId }, settings)
      return await this.submitRecognizedTranscript({
        sessionId,
        transcriptId: transcript.transcriptId,
        text: transcript.text,
        asrProvider: transcript.provider as any,
        asrModel: transcript.model,
        durationMs: request.durationMs,
      })
    } catch (error: any) {
      const message = normalizeOnethingVoiceError(error, 'Voice transcription failed.')
      this.setError(message)
      return { success: false, error: message }
    }
  }

  async submitTranscript(request: VoiceSubmitTranscriptRequest): Promise<{ success: boolean; transcript?: string; transcriptId?: string; error?: string }> {
    const settings = getSettings().voice
    if (!settings?.enabled) return { success: false, error: 'Voice is disabled.' }
    const sessionId = request.sessionId || this.state.currentSessionId || getCurrentSessionId()
    if (!sessionId) return { success: false, error: 'No active session for voice transcript.' }
    return this.submitRecognizedTranscript({ ...request, sessionId })
  }

  private async submitRecognizedTranscript(request: VoiceSubmitTranscriptRequest & { sessionId: string }): Promise<{ success: boolean; transcript?: string; transcriptId?: string; error?: string }> {
    const settings = getSettings().voice!
    const text = request.text.trim()
    if (!text) return { success: false, error: 'Voice transcription returned an empty transcript.' }

    this.setStatus('transcribing')
    try {
      const transcriptId = request.transcriptId || randomUUID()
      const voiceAgentId = settings.conversation?.defaultAgentId?.trim()
      if (voiceAgentId && agentExists(voiceAgentId)) {
        updateSessionAgent(request.sessionId, voiceAgentId)
      }
      this.state.lastTranscript = text
      this.emit({
        type: 'transcript',
        sessionId: request.sessionId,
        transcriptId,
        text,
        durationMs: request.durationMs,
      })

      this.beginReplyPlayback(request.sessionId)
      await getEventBus().emit(request.sessionId, {
        type: 'command:send-message',
        channel: 'voice',
        source: 'voice',
        content: text,
        voice: {
          transcriptId,
          asrProvider: request.asrProvider,
          asrModel: request.asrModel,
          durationMs: request.durationMs,
        },
      })

      this.setStatus('thinking')
      this.emit({ type: 'submitted', sessionId: request.sessionId, transcriptId, text })
      return { success: true, transcript: text, transcriptId }
    } catch (error: any) {
      const message = normalizeOnethingVoiceError(error, 'Voice transcript submission failed.')
      this.setError(message)
      return { success: false, error: message }
    }
  }

  async synthesize(request: VoiceSynthesizeRequest): Promise<{ success: boolean; requestId?: string; mimeType?: string; error?: string }> {
    const settings = getSettings().voice
    if (!settings?.enabled) return { success: false, error: 'Voice is disabled.' }
    if (!settings.tts.autoSpeak) return { success: false, error: 'Voice auto speak is disabled.' }

    const text = request.text.trim()
    if (!text) return { success: true, requestId: request.requestId }

    try {
      this.setStatus('speaking')
      const requestId = request.requestId || randomUUID()
      const startedAt = Date.now()
      ensureVoiceRuntimeWindow()
      this.emitMilestone('tts-request-start', {
        requestId,
        provider: settings.tts.provider,
        model: getOnethingTTSModelName(settings),
      })

      if (settings.tts.provider === 'system-tts') {
        this.speakWithSystemRuntime(text, requestId, settings)
        this.emitMilestone('tts-system-dispatched', {
          requestId,
          elapsedMs: Date.now() - startedAt,
          provider: 'system-tts',
          model: settings.tts.system.voice || 'system',
        })
        return { success: true, requestId, mimeType: 'text/plain' }
      }

      let streamStarted = false
      let streamMimeType = 'audio/mpeg'
      let firstChunkSent = false
      try {
        await streamSynthesizeSpeech(text, settings, {
          onStart: ({ mimeType }) => {
            streamStarted = true
            streamMimeType = mimeType
            this.emitMilestone('tts-audio-stream-start', {
              requestId,
              elapsedMs: Date.now() - startedAt,
              provider: settings.tts.provider,
              model: getOnethingTTSModelName(settings),
            })
            sendVoiceRuntimeCommand({
              type: 'play-audio-stream-start',
              requestId,
              mimeType,
            })
          },
          onChunk: chunk => {
            if (!streamStarted) {
              streamStarted = true
              sendVoiceRuntimeCommand({
                type: 'play-audio-stream-start',
                requestId,
                mimeType: 'audio/mpeg',
              })
            }
            if (!firstChunkSent) {
              firstChunkSent = true
              this.emitMilestone('tts-first-audio-chunk', {
                requestId,
                elapsedMs: Date.now() - startedAt,
                provider: settings.tts.provider,
                model: getOnethingTTSModelName(settings),
              })
            }
            sendVoiceRuntimeCommand({
              type: 'play-audio-stream-chunk',
              requestId,
              chunkBase64: Buffer.from(chunk).toString('base64'),
            })
          },
        })
        if (streamStarted) {
          sendVoiceRuntimeCommand({ type: 'play-audio-stream-end', requestId })
          this.emitMilestone('tts-audio-stream-end', {
            requestId,
            elapsedMs: Date.now() - startedAt,
            provider: settings.tts.provider,
            model: getOnethingTTSModelName(settings),
          })
        }
      } catch (error: any) {
        if (streamStarted) {
          sendVoiceRuntimeCommand({
            type: 'play-audio-stream-end',
            requestId,
            error: error?.message || 'Voice synthesis stream failed.',
          })
        }
        if (isOnethingMissingCloudTTSConfiguration(error)) {
          this.speakWithSystemRuntime(text, requestId, settings)
          return { success: true, requestId, mimeType: 'text/plain' }
        }
        throw error
      }
      return { success: true, requestId, mimeType: streamMimeType }
    } catch (error: any) {
      const message = normalizeOnethingVoiceError(error, 'Voice synthesis failed.')
      this.setError(message)
      return { success: false, error: message }
    }
  }

  private speakWithSystemRuntime(text: string, requestId: string, settings: VoiceSettings): void {
    sendVoiceRuntimeCommand({
      type: 'speak-text',
      requestId,
      text,
      voice: settings.tts.system.voice,
      language: settings.tts.system.language,
      rate: settings.tts.system.rate,
      pitch: settings.tts.system.pitch,
    })
  }

  handleRuntimeReady(sender: VoiceWebContents): void {
    markVoiceRuntimeReady()
    this.state.runtimeReady = true
    this.emit({ type: 'runtime-ready' }, sender)
    this.applySettings()
    flushVoiceRuntimeCommands()
  }

  handleRuntimeEvent(event: VoiceRuntimeEvent | VoiceEvent): void {
    switch (event.type) {
      case 'wake-detected':
        this.emit(event)
        void this.start({ sessionId: event.sessionId, reason: 'wake' })
        break
      case 'recording-started':
        this.setStatus('recording')
        this.emit(event)
        break
      case 'recording-stopped':
        this.setStatus('idle')
        this.emit(event)
        break
      case 'partial-transcript':
        this.state.lastTranscript = event.text
        this.emit(event)
        break
      case 'latency-milestone':
        this.state = applyOnethingVoiceRuntimeMilestone(this.state, event.milestone)
        this.emit(event)
        break
      case 'playback-start':
        this.setStatus('speaking')
        this.emit(event)
        break
      case 'playback-end': {
        const settings = getSettings().voice
        this.setStatus(settings?.enabled && settings.alwaysOn ? 'wake-listening' : 'idle')
        this.emit(event)
        break
      }
      case 'error':
        if (this.fallbackToMicButtonForWakeError(event.error)) {
          this.setStatus('idle')
          break
        }
        this.setError(event.error)
        break
      default:
        this.emit(event as VoiceEvent)
    }
  }

  shutdown(): void {
    this.cancelReplyPlayback()
    sendVoiceRuntimeCommand({ type: 'stop', reason: 'shutdown' })
    destroyVoiceRuntimeWindow()
    this.state.runtimeReady = false
    this.setStatus('disabled')
  }

  private setStatus(status: VoiceRuntimeStatus): void {
    this.state = applyOnethingVoiceRuntimeStatus(this.state, {
      status,
      voiceEnabled: Boolean(getSettings().voice?.enabled),
      runtimeReady: isVoiceRuntimeReady(),
    })
    this.emit({ type: 'state', state: this.getState() })
  }

  private setError(error: string): void {
    this.state = applyOnethingVoiceRuntimeError(this.state, {
      error,
      voiceEnabled: Boolean(getSettings().voice?.enabled),
      runtimeReady: isVoiceRuntimeReady(),
    })
    this.emit({ type: 'state', state: this.getState() })
    this.emit({ type: 'error', error, recoverable: true })
  }

  private emitMilestone(
    name: VoiceLatencyMilestoneName,
    milestone: Omit<VoiceLatencyMilestone, 'name' | 'at'> = {},
  ): void {
    const nextMilestone: VoiceLatencyMilestone = createOnethingVoiceLatencyMilestone(name, milestone)
    this.state = applyOnethingVoiceRuntimeMilestone(this.state, nextMilestone)
    this.emit({ type: 'latency-milestone', milestone: nextMilestone })
  }

  private beginReplyPlayback(sessionId: string): void {
    this.cancelReplyPlayback()
    const settings = getSettings().voice
    if (!settings?.enabled || !settings.tts.autoSpeak) return

    const turn: VoiceReplyPlaybackTurn = {
      id: ++this.replyPlaybackId,
      sessionId,
      buffer: '',
    }

    turn.unsubscribeStream = getStreamChannel().subscribe(sessionId, chunk => {
      this.handleReplyStreamChunk(turn, chunk)
    })
    turn.unsubscribeEvents = getEventBus().onAny(sessionId, envelope => {
      if (envelope.event.type === 'stream:complete'
        || envelope.event.type === 'stream:error'
        || envelope.event.type === 'stream:aborted') {
        this.finishReplyPlayback(turn.id, true)
      }
    }, 'VoiceService:TTS')
    this.replyPlayback = turn
  }

  private handleReplyStreamChunk(turn: VoiceReplyPlaybackTurn, chunk: StreamChunk): void {
    if (this.replyPlayback?.id !== turn.id) return
    if (chunk.type !== 'text-delta') return
    if (!getSettings().voice?.tts.autoSpeak) return

    const speakText = getOnethingSpeakableTextFromDelta(chunk)
    if (!speakText) return

    turn.buffer += speakText
    this.flushReplySpeech(turn, false)
    this.scheduleReplySpeechFlush(turn)
  }

  private flushReplySpeech(turn: VoiceReplyPlaybackTurn, force: boolean): void {
    if (this.replyPlayback?.id !== turn.id || !turn.buffer) return

    const result = splitOnethingSpeakableSentences(turn.buffer, {
      force,
      lowLatency: !force,
      minSoftChars: 12,
      maxChars: 72,
    })
    turn.buffer = result.remainder

    for (const sentence of result.ready) {
      const text = sentence.trim()
      if (!text) continue
      const turnId = turn.id
      this.speechChain = this.speechChain
        .then(async () => {
          if (this.replyPlaybackId !== turnId && this.replyPlayback?.id !== turnId) return
          const response = await this.synthesize({ text })
          if (!response.success && response.error) this.setError(response.error)
        })
        .catch((error: any) => {
          this.setError(error?.message || 'Voice synthesis failed.')
        })
    }
  }

  private scheduleReplySpeechFlush(turn: VoiceReplyPlaybackTurn): void {
    this.clearReplyFlushTimer(turn)
    if (!turn.buffer.trim()) return

    turn.flushTimer = setTimeout(() => {
      if (this.replyPlayback?.id !== turn.id) return
      if (turn.buffer.trim().length < 8) return
      this.flushReplySpeech(turn, true)
    }, 650)
  }

  private finishReplyPlayback(turnId: number, force: boolean): void {
    const turn = this.replyPlayback
    if (!turn || turn.id !== turnId) return
    this.clearReplyFlushTimer(turn)
    this.flushReplySpeech(turn, force)
    turn.unsubscribeStream?.()
    turn.unsubscribeEvents?.()
    this.replyPlayback = null
  }

  private cancelReplyPlayback(): void {
    this.replyPlaybackId++
    const turn = this.replyPlayback
    if (!turn) return
    this.clearReplyFlushTimer(turn)
    turn.unsubscribeStream?.()
    turn.unsubscribeEvents?.()
    this.replyPlayback = null
  }

  private clearReplyFlushTimer(turn: VoiceReplyPlaybackTurn): void {
    if (!turn.flushTimer) return
    clearTimeout(turn.flushTimer)
    turn.flushTimer = undefined
  }

  private fallbackToMicButtonForWakeError(error: string): boolean {
    const settings = getSettings()
    const fallback = applyOnethingVoiceWakeFailureFallback(settings, error)
    if (!fallback.applied) return false
    const nextSettings = fallback.settings

    saveSettings(nextSettings)
    sendVoiceRuntimeCommand({ type: 'stop', reason: 'wake-unavailable' })
    broadcastElectronVoiceMessage({
      channel: IPC_CHANNELS.SETTINGS_CHANGED,
      payload: nextSettings,
    })
    updateVoiceTray()
    return true
  }

  private emit(event: VoiceEvent, exceptSender?: VoiceWebContents): void {
    const exceptWebContentsId = getElectronWebContentsId(exceptSender)
    if (event.type !== 'state') {
      broadcastElectronVoiceMessage({
        channel: IPC_CHANNELS.VOICE_EVENT,
        payload: event,
        exceptWebContentsId,
      })
    }

    const stateEvent: VoiceEvent = { type: 'state', state: this.getState() }
    broadcastElectronVoiceMessage({
      channel: IPC_CHANNELS.VOICE_EVENT,
      payload: event.type === 'state' ? event : stateEvent,
      exceptWebContentsId,
    })
  }

  private broadcastState(target?: VoiceWindow): void {
    const event: VoiceEvent = { type: 'state', state: this.getState() }
    if (sendElectronVoiceMessageToWindow(target, IPC_CHANNELS.VOICE_EVENT, event)) {
      return
    }
    broadcastElectronVoiceMessage({
      channel: IPC_CHANNELS.VOICE_EVENT,
      payload: event,
    })
  }
}

let service: VoiceService | null = null

export function getVoiceService(): VoiceService {
  if (!service) service = new VoiceService()
  return service
}

export function getVoiceServiceSafe(): VoiceService | null {
  return service
}

export type { VoiceService }
