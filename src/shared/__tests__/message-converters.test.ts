/**
 * Message Converter Tests
 * REQ-005/REQ-007: Tests for chatMessageToUIMessage() and related converters
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1',
}))

import {
  chatMessageToUIMessage,
  toolCallToUIPart,
  attachmentToFilePart,
} from '../message-converters'
import type {
  ChatMessage,
  ToolCall,
  MessageAttachment,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  FileUIPart,
  ErrorDataUIPart,
  StepsDataUIPart,
} from '../ipc'

// ── Helper: minimal ChatMessage ──────────────────────────────────────────

function makeMsg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: '',
    timestamp: 1000,
    ...overrides,
  }
}

// ============================================================================

describe('chatMessageToUIMessage', () => {
  // ── Basic role conversion ───────────────────────────────────────────────

  describe('普通消息转换', () => {
    it('user 消息 → role:user, text part', () => {
      const msg = makeMsg({ role: 'user', content: 'Hello' })
      const ui = chatMessageToUIMessage(msg)

      expect(ui.id).toBe('msg-1')
      expect(ui.role).toBe('user')
      expect(ui.parts).toHaveLength(1)

      const text = ui.parts[0] as TextUIPart
      expect(text.type).toBe('text')
      expect(text.text).toBe('Hello')
      expect(text.state).toBe('done')
    })

    it('assistant 消息 → role:assistant, text part', () => {
      const msg = makeMsg({ role: 'assistant', content: 'Hi there' })
      const ui = chatMessageToUIMessage(msg)

      expect(ui.role).toBe('assistant')
      const text = ui.parts[0] as TextUIPart
      expect(text.text).toBe('Hi there')
    })

    it('system 消息 → role:system', () => {
      const msg = makeMsg({ role: 'system', content: 'System prompt' })
      const ui = chatMessageToUIMessage(msg)
      expect(ui.role).toBe('system')
    })

    it('空内容消息 → 没有 text part', () => {
      const msg = makeMsg({ role: 'user', content: '' })
      const ui = chatMessageToUIMessage(msg)
      // No text part because content is empty
      expect(ui.parts.filter(p => p.type === 'text')).toHaveLength(0)
    })

    it('streaming 消息 → state:streaming', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'Typing...',
        isStreaming: true,
      })
      const ui = chatMessageToUIMessage(msg)
      const text = ui.parts[0] as TextUIPart
      expect(text.state).toBe('streaming')
    })
  })

  // ── Legacy error role conversion ────────────────────────────────────────

  describe('旧格式 role:error 消息', () => {
    it('role:error → 转为 role:assistant + isError + data-error part', () => {
      const msg = makeMsg({
        role: 'error' as any,
        content: 'Something went wrong',
      })
      const ui = chatMessageToUIMessage(msg)

      // Role should be converted to assistant
      expect(ui.role).toBe('assistant')

      // metadata.isError flag should be set
      expect(ui.metadata?.isError).toBe(true)

      // Should have a data-error part
      const errorPart = ui.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('Something went wrong')
    })

    it('role:error with empty content → data-error text defaults to "Unknown error"', () => {
      const msg = makeMsg({
        role: 'error' as any,
        content: '',
      })
      const ui = chatMessageToUIMessage(msg)
      const errorPart = ui.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart.text).toBe('Unknown error')
    })
  })

  // ── errorDetails handling ───────────────────────────────────────────────

  describe('errorDetails 消息', () => {
    it('assistant with errorDetails → data-error part with details', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'API error occurred',
        errorDetails: 'Status 429: rate limit exceeded',
      })
      const ui = chatMessageToUIMessage(msg)

      expect(ui.role).toBe('assistant')
      expect(ui.metadata?.isError).toBeFalsy()
      expect(ui.metadata?.errorDetails).toBe('Status 429: rate limit exceeded')

      const errorPart = ui.parts.find(p => p.type === 'data-error') as ErrorDataUIPart
      expect(errorPart).toBeDefined()
      expect(errorPart.text).toBe('API error occurred')
      expect(errorPart.details).toBe('Status 429: rate limit exceeded')
    })
  })

  // ── Tool calls ──────────────────────────────────────────────────────────

  describe('工具调用消息', () => {
    it('toolCalls → tool-* parts', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'Let me search.',
        toolCalls: [
          {
            id: 'tc-1',
            toolId: 'grep',
            toolName: 'grep',
            arguments: { pattern: 'foo' },
            status: 'completed',
            result: 'found 3 matches',
            timestamp: 1000,
          },
        ],
      })
      const ui = chatMessageToUIMessage(msg)

      const toolParts = ui.parts.filter(p => p.type.startsWith('tool-')) as ToolUIPart[]
      expect(toolParts).toHaveLength(1)
      expect(toolParts[0].toolCallId).toBe('tc-1')
      expect(toolParts[0].toolName).toBe('grep')
      expect(toolParts[0].state).toBe('output-available') // completed → output-available
      expect(toolParts[0].output).toBe('found 3 matches')
    })

    it('failed tool → state:output-error', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'tc-2',
            toolId: 'bash',
            toolName: 'bash',
            arguments: { command: 'rm -rf /' },
            status: 'failed',
            error: 'Permission denied',
            timestamp: 1000,
          },
        ],
      })
      const ui = chatMessageToUIMessage(msg)
      const toolParts = ui.parts.filter(p => p.type.startsWith('tool-')) as ToolUIPart[]
      expect(toolParts[0].state).toBe('output-error')
      expect(toolParts[0].errorText).toBe('Permission denied')
    })
  })

  // ── Attachments ─────────────────────────────────────────────────────────

  describe('附件消息', () => {
    it('attachments → file parts', () => {
      const msg = makeMsg({
        role: 'user',
        content: 'Check this image',
        attachments: [
          {
            id: 'att-1',
            fileName: 'photo.jpg',
            mimeType: 'image/jpeg',
            size: 12345,
            mediaType: 'image',
            base64Data: 'abc123',
          },
        ],
      })
      const ui = chatMessageToUIMessage(msg)

      const fileParts = ui.parts.filter(p => p.type === 'file') as FileUIPart[]
      expect(fileParts).toHaveLength(1)
      expect(fileParts[0].filename).toBe('photo.jpg')
      expect(fileParts[0].mediaType).toBe('image/jpeg')
      expect(fileParts[0].url).toBe('data:image/jpeg;base64,abc123')
    })

    it('attachment without base64 → uses url field', () => {
      const msg = makeMsg({
        role: 'user',
        content: 'PDF',
        attachments: [
          {
            id: 'att-2',
            fileName: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 999,
            mediaType: 'document',
            url: 'file:///tmp/doc.pdf',
          },
        ],
      })
      const ui = chatMessageToUIMessage(msg)
      const fileParts = ui.parts.filter(p => p.type === 'file') as FileUIPart[]
      expect(fileParts[0].url).toBe('file:///tmp/doc.pdf')
    })
  })

  // ── contentParts (structured content) ──────────────────────────────────

  describe('contentParts 消息', () => {
    it('contentParts with text → uses contentParts instead of flat fields', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'should be ignored',
        contentParts: [
          { type: 'text', content: 'From contentParts' },
        ],
      })
      const ui = chatMessageToUIMessage(msg)

      // Should use contentParts, not fallback to msg.content
      expect(ui.parts).toHaveLength(1)
      const text = ui.parts[0] as TextUIPart
      expect(text.text).toBe('From contentParts')
    })

    it('contentParts with tool-call → tool parts', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: '',
        contentParts: [
          {
            type: 'tool-call',
            toolCalls: [
              {
                id: 'tc-cp-1',
                toolId: 'read',
                toolName: 'read',
                arguments: { path: '/tmp/a.txt' },
                status: 'completed',
                result: 'file content',
                timestamp: 1000,
              },
            ],
          },
        ],
      })
      const ui = chatMessageToUIMessage(msg)
      const toolParts = ui.parts.filter(p => p.type.startsWith('tool-')) as ToolUIPart[]
      expect(toolParts).toHaveLength(1)
      expect(toolParts[0].toolCallId).toBe('tc-cp-1')
    })
  })

  // ── Reasoning ───────────────────────────────────────────────────────────

  describe('推理消息', () => {
    it('reasoning → reasoning part before text', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'The answer is 42.',
        reasoning: 'Let me think step by step...',
      })
      const ui = chatMessageToUIMessage(msg)

      expect(ui.parts.length).toBeGreaterThanOrEqual(2)
      const reasoning = ui.parts[0] as ReasoningUIPart
      expect(reasoning.type).toBe('reasoning')
      expect(reasoning.text).toBe('Let me think step by step...')
      expect(reasoning.state).toBe('done')

      const text = ui.parts[1] as TextUIPart
      expect(text.text).toBe('The answer is 42.')
    })
  })

  // ── Metadata ────────────────────────────────────────────────────────────

  describe('元数据', () => {
    it('preserves timestamp, model, thinkingTime in metadata', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: 'Hi',
        timestamp: 1234567890,
        model: 'gpt-4',
        thinkingTime: 5.2,
        thinkingStartTime: 1234567885,
        skillUsed: 'agent-plan',
      })
      const ui = chatMessageToUIMessage(msg)

      expect(ui.metadata?.timestamp).toBe(1234567890)
      expect(ui.metadata?.model).toBe('gpt-4')
      expect(ui.metadata?.thinkingTime).toBe(5.2)
      expect(ui.metadata?.thinkingStartTime).toBe(1234567885)
      expect(ui.metadata?.skillUsed).toBe('agent-plan')
    })
  })

  // ── Steps ───────────────────────────────────────────────────────────────

  describe('步骤消息', () => {
    it('steps → data-steps parts grouped by turnIndex', () => {
      const msg = makeMsg({
        role: 'assistant',
        content: '',
        steps: [
          {
            id: 's1',
            type: 'tool-call',
            title: 'Step 1',
            status: 'completed',
            timestamp: 1000,
            turnIndex: 0,
          },
          {
            id: 's2',
            type: 'tool-call',
            title: 'Step 2',
            status: 'completed',
            timestamp: 1001,
            turnIndex: 1,
          },
          {
            id: 's3',
            type: 'thinking',
            title: 'Step 3',
            status: 'completed',
            timestamp: 1002,
            turnIndex: 0,
          },
        ],
      })
      const ui = chatMessageToUIMessage(msg)
      const stepsParts = ui.parts.filter(p => p.type === 'data-steps') as StepsDataUIPart[]

      // Should be grouped by turnIndex: turn 0 has 2 steps, turn 1 has 1
      expect(stepsParts).toHaveLength(2)
      const turn0 = stepsParts.find(p => p.turnIndex === 0)!
      const turn1 = stepsParts.find(p => p.turnIndex === 1)!
      expect(turn0.steps).toHaveLength(2)
      expect(turn1.steps).toHaveLength(1)
    })
  })
})

// ============================================================================

describe('toolCallToUIPart', () => {
  it('converts a completed ToolCall', () => {
    const tc: ToolCall = {
      id: 'tc-1',
      toolId: 'bash',
      toolName: 'bash',
      arguments: { command: 'ls' },
      status: 'completed',
      result: 'file1.txt\nfile2.txt',
      timestamp: 1000,
      startTime: 1000,
      endTime: 1500,
    }
    const part = toolCallToUIPart(tc)

    expect(part.type).toBe('tool-bash')
    expect(part.toolCallId).toBe('tc-1')
    expect(part.toolName).toBe('bash')
    expect(part.state).toBe('output-available')
    expect(part.input).toEqual({ command: 'ls' })
    expect(part.output).toBe('file1.txt\nfile2.txt')
    expect(part.startTime).toBe(1000)
    expect(part.endTime).toBe(1500)
  })

  it('converts a failed ToolCall with error', () => {
    const tc: ToolCall = {
      id: 'tc-2',
      toolId: 'write',
      toolName: 'write',
      arguments: { path: '/etc/passwd' },
      status: 'failed',
      error: 'Permission denied',
      timestamp: 1000,
    }
    const part = toolCallToUIPart(tc)

    expect(part.state).toBe('output-error')
    expect(part.errorText).toBe('Permission denied')
  })

  it('preserves requiresConfirmation and commandType', () => {
    const tc: ToolCall = {
      id: 'tc-3',
      toolId: 'bash',
      toolName: 'bash',
      arguments: { command: 'rm -rf /tmp/test' },
      status: 'pending',
      timestamp: 1000,
      requiresConfirmation: true,
      commandType: 'dangerous',
    }
    const part = toolCallToUIPart(tc)

    expect(part.requiresConfirmation).toBe(true)
    expect(part.commandType).toBe('dangerous')
  })
})

// ============================================================================

describe('attachmentToFilePart', () => {
  it('creates data URL from base64Data', () => {
    const att: MessageAttachment = {
      id: 'a1',
      fileName: 'img.png',
      mimeType: 'image/png',
      size: 100,
      mediaType: 'image',
      base64Data: 'iVBORw0KGgo=',
    }
    const part = attachmentToFilePart(att)

    expect(part.type).toBe('file')
    expect(part.mediaType).toBe('image/png')
    expect(part.filename).toBe('img.png')
    expect(part.url).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('uses url field when no base64Data', () => {
    const att: MessageAttachment = {
      id: 'a2',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 500,
      mediaType: 'document',
      url: 'https://example.com/doc.pdf',
    }
    const part = attachmentToFilePart(att)

    expect(part.url).toBe('https://example.com/doc.pdf')
  })

  it('empty string url when neither base64 nor url', () => {
    const att: MessageAttachment = {
      id: 'a3',
      fileName: 'mystery.bin',
      mimeType: 'application/octet-stream',
      size: 0,
      mediaType: 'file',
    }
    const part = attachmentToFilePart(att)

    expect(part.url).toBe('')
  })
})
