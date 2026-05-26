import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type VoiceRuntimeEvent,
  type VoiceStartRequest,
  type VoiceStopRequest,
  type VoiceSubmitTranscriptRequest,
  type VoiceSubmitUtteranceRequest,
  type VoiceSynthesizeRequest,
  type VoiceTestASRRequest,
  type VoiceTestTTSRequest,
} from '../../shared/ipc.js'
import { getVoiceService } from './service.js'
import { getSettings } from '../stores/settings.js'
import { getOpenRouterTTSModels, transcribeUtterance } from './providers.js'

export function registerVoiceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VOICE_GET_STATE, async () => ({
    success: true,
    state: getVoiceService().getState(),
  }))

  ipcMain.handle(IPC_CHANNELS.VOICE_START, async (_event, request: VoiceStartRequest) => {
    return getVoiceService().start(request)
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_STOP, async (_event, request: VoiceStopRequest) => {
    return getVoiceService().stop(request)
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_SUBMIT_UTTERANCE, async (_event, request: VoiceSubmitUtteranceRequest) => {
    return getVoiceService().submitUtterance(request)
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_SUBMIT_TRANSCRIPT, async (_event, request: VoiceSubmitTranscriptRequest) => {
    return getVoiceService().submitTranscript(request)
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_SYNTHESIZE, async (_event, request: VoiceSynthesizeRequest) => {
    return getVoiceService().synthesize(request)
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_TEST_ASR, async (_event, request: VoiceTestASRRequest) => {
    try {
      if (!request.audioBase64 || !request.mimeType) {
        return { success: false, error: 'Attach or record audio before testing ASR.' }
      }
      const transcript = await transcribeUtterance({
        audioBase64: request.audioBase64,
        mimeType: request.mimeType,
      }, getSettings().voice!)
      return { success: true, transcript: transcript.text, transcriptId: transcript.transcriptId }
    } catch (error: any) {
      return { success: false, error: error.message || 'ASR test failed.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_TEST_TTS, async (_event, request: VoiceTestTTSRequest) => {
    try {
      return getVoiceService().synthesize({ text: request.text || 'Voice test succeeded.' })
    } catch (error: any) {
      return { success: false, error: error.message || 'TTS test failed.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_GET_TTS_MODELS, async (_event, request?: { force?: boolean }) => {
    try {
      const result = await getOpenRouterTTSModels(Boolean(request?.force))
      return { success: true, models: result.models, fetchedAt: result.fetchedAt }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load TTS models.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_RUNTIME_READY, async (event) => {
    getVoiceService().handleRuntimeReady(event.sender)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_RUNTIME_EVENT, async (_event, runtimeEvent: VoiceRuntimeEvent) => {
    getVoiceService().handleRuntimeEvent(runtimeEvent)
    return { success: true }
  })
}
