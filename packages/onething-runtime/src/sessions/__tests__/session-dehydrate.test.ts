import { describe, expect, it } from 'vitest'
import { dehydrateSessionForStorage, rehydrateSessionFromStorage } from '../session-dehydrate.js'

const base64 = 'iVBORw0KGgoAAAANSUhEUg'.repeat(40_000) // ~880KB

function makeSession() {
  const toolCall = {
    id: 'tc1',
    toolName: 'read',
    arguments: { path: '/tmp/shot.png' },
    status: 'completed',
    result: {
      title: 'Image: shot.png',
      output: '[Image file: /tmp/shot.png]',
      attachments: [{ type: 'image', path: '/tmp/shot.png', content: base64, mimeType: 'image/png' }],
    },
    changes: undefined,
  }
  return {
    id: 's1',
    messages: [
      { id: 'm0', role: 'user', content: 'hi' },
      {
        id: 'm1',
        role: 'assistant',
        content: 'done',
        toolCalls: [toolCall],
        steps: [{
          id: 'step1',
          type: 'tool-call',
          title: 'read shot.png',
          status: 'completed',
          timestamp: 1,
          toolCallId: 'tc1',
          toolCall: { ...toolCall },
          partialResult: {
            content: [
              { type: 'text', text: '[Image file: /tmp/shot.png]' },
              { type: 'image', path: '/tmp/shot.png', data: base64, mimeType: 'image/png' },
            ],
          },
          partialResultIsPartial: false,
        }],
      },
    ],
  }
}

describe('dehydrateSessionForStorage', () => {
  it('drops step duplicates and inline binaries, shrinking the payload', () => {
    const session = makeSession()
    const before = JSON.stringify(session).length
    const dehydrated = dehydrateSessionForStorage(session)
    const after = JSON.stringify(dehydrated).length

    expect(after).toBeLessThan(before / 100) // 3× ~880KB duplicates → tiny
    const message = (dehydrated as ReturnType<typeof makeSession>).messages[1]
    expect(message.steps![0].toolCall).toBeUndefined()
    expect(message.steps![0].partialResult).toBeUndefined()
    const attachment = (message.toolCalls![0].result as { attachments: Array<{ content: string; path: string }> }).attachments[0]
    expect(attachment.content).toContain('data omitted')
    expect(attachment.path).toBe('/tmp/shot.png')
  })

  it('does not mutate the live session object', () => {
    const session = makeSession()
    dehydrateSessionForStorage(session)
    expect(session.messages[1].steps![0].toolCall).toBeTruthy()
    expect(session.messages[1].steps![0].partialResult).toBeTruthy()
    const attachment = (session.messages[1].toolCalls![0].result as { attachments: Array<{ content: string }> }).attachments[0]
    expect(attachment.content).toBe(base64)
  })

  it('keeps mid-stream partial results (only stripped of binaries)', () => {
    const session = makeSession()
    session.messages[1].steps![0].partialResultIsPartial = true as never
    const dehydrated = dehydrateSessionForStorage(session) as ReturnType<typeof makeSession>
    const partial = dehydrated.messages[1].steps![0].partialResult as { content: Array<{ type: string; text?: string; data?: string }> }
    expect(partial).toBeTruthy()
    expect(partial.content[0].text).toBe('[Image file: /tmp/shot.png]')
    expect(partial.content[1].data).toContain('data omitted')
  })
})

describe('rehydrateSessionFromStorage', () => {
  it('restores step.toolCall link and rebuilds the final partialResult', () => {
    const stored = dehydrateSessionForStorage(makeSession())
    const session = rehydrateSessionFromStorage(JSON.parse(JSON.stringify(stored))) as ReturnType<typeof makeSession>
    const message = session.messages[1]
    const step = message.steps![0]

    expect(step.toolCall).toBe(message.toolCalls![0])
    expect(step.partialResult).toBeTruthy()
    expect(step.partialResultIsPartial).toBe(false)
    const parts = (step.partialResult as { content: Array<{ type: string; text?: string }> }).content
    expect(parts.some(part => part.type === 'text' && part.text?.includes('[Image file: /tmp/shot.png]'))).toBe(true)
  })

  it('round-trips already-hydrated sessions without harm', () => {
    const session = makeSession()
    const rehydrated = rehydrateSessionFromStorage(session)
    expect(rehydrated.messages[1].steps![0].toolCall?.id).toBe('tc1')
  })
})
