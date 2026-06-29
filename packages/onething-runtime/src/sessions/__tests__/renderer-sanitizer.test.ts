import { describe, expect, it } from 'vitest'
import {
  sanitizeOnethingMessageForRenderer,
  sanitizeOnethingMessagesForRenderer,
  sanitizeOnethingSessionForRenderer,
} from '../renderer-sanitizer.js'

describe('renderer sanitizer', () => {
  it('keeps message identity when no provider data is present', () => {
    const message = {
      id: 'message-1',
      contentParts: [{ type: 'text', content: 'hello' }],
    }

    expect(sanitizeOnethingMessageForRenderer(message)).toBe(message)
  })

  it('removes provider data content parts from renderer projections', () => {
    const message = {
      id: 'message-1',
      contentParts: [
        { type: 'text', content: 'visible' },
        { type: 'provider-data', provider: 'codex', encryptedReasoning: 'secret' },
        { type: 'reasoning', content: 'also visible' },
      ],
    }

    expect(sanitizeOnethingMessageForRenderer(message)).toEqual({
      id: 'message-1',
      contentParts: [
        { type: 'text', content: 'visible' },
        { type: 'reasoning', content: 'also visible' },
      ],
    })
  })

  it('sanitizes message arrays and sessions only when needed', () => {
    const cleanMessage = {
      id: 'message-1',
      contentParts: [{ type: 'text', content: 'visible' }],
    }
    const secretMessage = {
      id: 'message-2',
      contentParts: [{ type: 'provider-data', provider: 'codex' }],
    }
    const session = {
      id: 'session-1',
      messages: [cleanMessage, secretMessage],
    }

    expect(sanitizeOnethingMessagesForRenderer([cleanMessage])).toBeDefined()
    expect(sanitizeOnethingSessionForRenderer(session)).toEqual({
      id: 'session-1',
      messages: [
        cleanMessage,
        {
          id: 'message-2',
          contentParts: [],
        },
      ],
    })
  })
})
