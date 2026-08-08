import { describe, expect, it } from 'vitest'
import { createSseParser, type SseFrame } from '../sse'

function collect(): { frames: SseFrame[]; parser: ReturnType<typeof createSseParser> } {
  const frames: SseFrame[] = []
  const parser = createSseParser((frame) => frames.push(frame))
  return { frames, parser }
}

describe('createSseParser', () => {
  it('parses a complete session:event frame with id', () => {
    const { frames, parser } = collect()
    parser.push(
      'id: 7\nevent: session:event\ndata: {"sessionId":"s1","sequence":7,"event":{"type":"stream:end"}}\n\n',
    )
    expect(frames).toEqual([
      {
        id: '7',
        event: 'session:event',
        data: '{"sessionId":"s1","sequence":7,"event":{"type":"stream:end"}}',
      },
    ])
  })

  it('ignores the server ": connected" comment', () => {
    const { frames, parser } = collect()
    parser.push(': connected\n\nid: 1\nevent: session:event\ndata: {}\n\n')
    expect(frames).toHaveLength(1)
    expect(frames[0].id).toBe('1')
  })

  it('assembles frames split across chunks', () => {
    const { frames, parser } = collect()
    parser.push('id: 3\nev')
    parser.push('ent: session:stre')
    parser.push('am\nda')
    parser.push('ta: {"a":1}\n')
    expect(frames).toHaveLength(0)
    parser.push('\n')
    expect(frames).toEqual([{ id: '3', event: 'session:stream', data: '{"a":1}' }])
  })

  it('handles CRLF line endings', () => {
    const { frames, parser } = collect()
    parser.push('id: 9\r\nevent: session:event\r\ndata: {"x":true}\r\n\r\n')
    expect(frames).toEqual([{ id: '9', event: 'session:event', data: '{"x":true}' }])
  })

  it('parses session:stream frames (no id stamped by server)', () => {
    const { frames, parser } = collect()
    parser.push(
      'event: session:stream\ndata: {"sessionId":"s1","chunk":{"type":"text-delta","textDelta":"hi"}}\n\n',
    )
    expect(frames[0].id).toBeUndefined()
    expect(frames[0].event).toBe('session:stream')
  })

  it('joins multi-line data with newline', () => {
    const { frames, parser } = collect()
    parser.push('event: message\ndata: line1\ndata: line2\n\n')
    expect(frames[0].data).toBe('line1\nline2')
  })

  it('defaults event to "message" when the event line is absent', () => {
    const { frames, parser } = collect()
    parser.push('data: plain\n\n')
    expect(frames[0].event).toBe('message')
  })

  it('flushes a trailing unterminated frame on end()', () => {
    const { frames, parser } = collect()
    parser.push('event: session:event\ndata: {"tail":true}\n')
    parser.end()
    expect(frames).toHaveLength(1)
    expect(frames[0].data).toBe('{"tail":true}')
  })

  it('parses multiple frames in one chunk in order', () => {
    const { frames, parser } = collect()
    parser.push(
      'id: 1\nevent: session:event\ndata: {"n":1}\n\nid: 2\nevent: session:event\ndata: {"n":2}\n\n',
    )
    expect(frames.map((f) => f.id)).toEqual(['1', '2'])
  })

  it('handles a realistic coalesced burst in the server wire format', () => {
    const { frames, parser } = collect()
    const burst =
      ': connected\n\n'
      + 'id: 1\nevent: session:event\ndata: {"sessionId":"s","sequence":1,"event":{"type":"message:created"}}\n\n'
      + 'event: session:stream\ndata: {"sessionId":"s","chunk":{"type":"text-delta","textDelta":"Hel"}}\n\n'
      + 'event: session:stream\ndata: {"sessionId":"s","chunk":{"type":"text-delta","textDelta":"lo"}}\n\n'
      + 'id: 2\nevent: session:event\ndata: {"sessionId":"s","sequence":2,"event":{"type":"stream:end"}}\n\n'
    // Simulate 16ms coalesced flushes arriving as two TCP chunks.
    const mid = Math.floor(burst.length / 2)
    parser.push(burst.slice(0, mid))
    parser.push(burst.slice(mid))
    expect(frames).toHaveLength(4)
    expect(frames[0]).toMatchObject({ id: '1', event: 'session:event' })
    expect(frames[3]).toMatchObject({ id: '2', event: 'session:event' })
    expect(frames.filter((f) => f.event === 'session:stream')).toHaveLength(2)
  })
})
