import { describe, expect, it, vi } from 'vitest'
import { FartTool } from '../fart.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  } as any
}

describe('runtime buddy tool', () => {
  it('renders a single-frame action and streams metadata', async () => {
    const ctx = createContext()
    const result = await FartTool.execute({
      action: 'wave',
      character: 'robot',
      loudness: 1,
      text: 'hi',
    }, ctx)

    expect(result.output).toContain('frame 1/1')
    expect(result.metadata).toMatchObject({
      action: 'wave',
      character: 'robot',
      loudness: 1,
      text: 'hi',
      frameIndex: 0,
      totalFrames: 1,
    })
    expect(ctx.metadata).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        action: 'wave',
        character: 'robot',
      }),
    }))
    expect(ctx.updateResult).toHaveBeenCalled()
  })
})
