import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronChatIpcHandlers } from '../chat.js'

describe('electron chat IPC host', () => {
  it('registers chat handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getHistory = vi.fn().mockResolvedValue({ success: true, messages: [] })
    const generateTitle = vi.fn().mockResolvedValue({ success: true, title: 'Hello' })
    const getSystemPromptSnapshot = vi.fn().mockResolvedValue({ success: true, snapshot: {} })
    const updateMessageThinkingTime = vi.fn().mockResolvedValue({ success: true })
    const abortStream = vi.fn().mockResolvedValue({ success: true })
    const getActiveStreams = vi.fn().mockResolvedValue({ success: true, sessionIds: [] })
    const resumeAfterToolConfirm = vi.fn().mockResolvedValue({ success: true })

    registerElectronChatIpcHandlers({
      channels: {
        getHistory: 'chat:get-history',
        generateTitle: 'chat:generate-title',
        getSystemPromptSnapshot: 'chat:get-system-prompt-snapshot',
        updateMessageThinkingTime: 'chat:update-thinking-time',
        abortStream: 'chat:abort-stream',
        getActiveStreams: 'chat:get-active-streams',
        resumeAfterToolConfirm: 'chat:resume-after-tool-confirm',
      },
      getHistory,
      generateTitle,
      getSystemPromptSnapshot,
      updateMessageThinkingTime,
      abortStream,
      getActiveStreams,
      resumeAfterToolConfirm,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(7)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'chat:get-history',
      'chat:generate-title',
      'chat:get-system-prompt-snapshot',
      'chat:update-thinking-time',
      'chat:abort-stream',
      'chat:get-active-streams',
      'chat:resume-after-tool-confirm',
    ])

    const sessionRequest = { sessionId: 'session-1' }
    const titleRequest = { message: 'hello' }
    const thinkingRequest = { sessionId: 'session-1', messageId: 'm1', thinkingTime: 12 }
    const abortRequest = { sessionId: 'session-1' }
    const resumeRequest = { sessionId: 'session-1', messageId: 'm2' }
    const sender = { id: 7 }

    await expect(handle.mock.calls[0][1]({}, sessionRequest)).resolves.toEqual({ success: true, messages: [] })
    await expect(handle.mock.calls[1][1]({}, titleRequest)).resolves.toEqual({ success: true, title: 'Hello' })
    await expect(handle.mock.calls[2][1]({}, sessionRequest)).resolves.toEqual({ success: true, snapshot: {} })
    await expect(handle.mock.calls[3][1]({}, thinkingRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({}, abortRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[5][1]({})).resolves.toEqual({ success: true, sessionIds: [] })
    await expect(handle.mock.calls[6][1]({ sender }, resumeRequest)).resolves.toEqual({ success: true })

    expect(getHistory).toHaveBeenCalledWith(sessionRequest)
    expect(generateTitle).toHaveBeenCalledWith(titleRequest)
    expect(getSystemPromptSnapshot).toHaveBeenCalledWith(sessionRequest)
    expect(updateMessageThinkingTime).toHaveBeenCalledWith(thinkingRequest)
    expect(abortStream).toHaveBeenCalledWith(abortRequest)
    expect(getActiveStreams).toHaveBeenCalledTimes(1)
    expect(resumeAfterToolConfirm).toHaveBeenCalledWith(resumeRequest, sender)
  })
})
