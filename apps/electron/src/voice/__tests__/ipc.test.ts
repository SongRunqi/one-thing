import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronVoiceIpcHandlers } from '../ipc.js'

describe('electron voice IPC host', () => {
  it('registers voice handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getState = vi.fn(() => ({ success: true, state: { status: 'idle' } }))
    const start = vi.fn().mockResolvedValue({ success: true })
    const stop = vi.fn().mockResolvedValue({ success: true })
    const submitUtterance = vi.fn().mockResolvedValue({ success: true })
    const submitTranscript = vi.fn().mockResolvedValue({ success: true })
    const synthesize = vi.fn().mockResolvedValue({ success: true })
    const testASR = vi.fn().mockResolvedValue({ success: true, transcript: 'hello' })
    const testTTS = vi.fn().mockResolvedValue({ success: true })
    const getTTSModels = vi.fn().mockResolvedValue({ success: true, models: [] })
    const runtimeReady = vi.fn().mockReturnValue({ success: true })
    const runtimeEvent = vi.fn().mockReturnValue({ success: true })

    registerElectronVoiceIpcHandlers({
      channels: {
        getState: 'voice:get-state',
        start: 'voice:start',
        stop: 'voice:stop',
        submitUtterance: 'voice:submit-utterance',
        submitTranscript: 'voice:submit-transcript',
        synthesize: 'voice:synthesize',
        testASR: 'voice:test-asr',
        testTTS: 'voice:test-tts',
        getTTSModels: 'voice:get-tts-models',
        runtimeReady: 'voice:runtime-ready',
        runtimeEvent: 'voice:runtime-event',
      },
      getState,
      start,
      stop,
      submitUtterance,
      submitTranscript,
      synthesize,
      testASR,
      testTTS,
      getTTSModels,
      runtimeReady,
      runtimeEvent,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(11)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'voice:get-state',
      'voice:start',
      'voice:stop',
      'voice:submit-utterance',
      'voice:submit-transcript',
      'voice:synthesize',
      'voice:test-asr',
      'voice:test-tts',
      'voice:get-tts-models',
      'voice:runtime-ready',
      'voice:runtime-event',
    ])

    const sender = { id: 7 }
    const request = { sessionId: 'session-1' }
    const ttsModelsRequest = { force: true }
    const event = { type: 'recording-started' }

    expect(handle.mock.calls[0][1]({})).toEqual({ success: true, state: { status: 'idle' } })
    await expect(handle.mock.calls[1][1]({}, request)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[8][1]({}, ttsModelsRequest)).resolves.toEqual({
      success: true,
      models: [],
    })
    expect(handle.mock.calls[9][1]({ sender })).toEqual({ success: true })
    expect(handle.mock.calls[10][1]({}, event)).toEqual({ success: true })

    expect(start).toHaveBeenCalledWith(request)
    expect(getTTSModels).toHaveBeenCalledWith(ttsModelsRequest)
    expect(runtimeReady).toHaveBeenCalledWith(sender)
    expect(runtimeEvent).toHaveBeenCalledWith(event)
  })
})
