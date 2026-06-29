import { describe, expect, it, vi } from 'vitest'
import {
  buildMessageContent,
  formatMessagesForLog,
  getTextFromContent,
} from '@onething/core/engine'

describe('core message content helpers', () => {
  it('redacts image payloads in log messages', () => {
    const longImage = 'data:image/png;base64,' + 'x'.repeat(120)

    expect(formatMessagesForLog([{
      role: 'user',
      content: [{ type: 'image', image: longImage }],
    }])).toEqual([{
      role: 'user',
      content: [{
        type: 'image',
        image: expect.stringContaining('(142 chars)'),
      }],
    }])
  })

  it('builds multimodal provider content from attachments', () => {
    const onImageAttachment = vi.fn()
    const content = buildMessageContent({
      content: 'see attached',
      attachments: [
        {
          fileName: 'image.png',
          mimeType: 'image/png',
          mediaType: 'image',
          base64Data: 'abc123',
        },
        {
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          mediaType: 'file',
          base64Data: 'ZmlsZQ==',
        },
      ],
    }, { onImageAttachment })

    expect(content).toEqual([
      { type: 'text', text: 'see attached' },
      { type: 'image', image: 'data:image/png;base64,abc123' },
      { type: 'file', data: 'ZmlsZQ==', mediaType: 'text/plain' },
    ])
    expect(onImageAttachment).toHaveBeenCalledWith({
      mimeType: 'image/png',
      base64Length: 6,
      dataUrlPrefix: 'data:image/png;base64,abc123...',
    })
  })

  it('extracts text from string and multimodal content', () => {
    expect(getTextFromContent('plain')).toBe('plain')
    expect(getTextFromContent([
      { type: 'text', text: 'hello' },
      { type: 'image', image: 'data:image/png;base64,x' },
      { type: 'text', text: 'world' },
    ])).toBe('hello\nworld')
  })
})
