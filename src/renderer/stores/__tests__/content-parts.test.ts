import { describe, it, expect } from 'vitest'
import {
  appendOrMergeText,
  appendToolCallPlaceholder,
  popTrailingTransient,
  pushDataStepsIfMissing,
  pushWaiting,
  upsertToolCall,
} from '../helpers/content-parts'
import type { ContentPart, ToolCall } from '@/types'

function makeToolCall(id: string, overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id,
    toolId: 'bash',
    toolName: 'bash',
    arguments: {},
    status: 'pending',
    timestamp: 0,
    ...overrides,
  }
}

describe('content-parts helpers', () => {
  describe('popTrailingTransient', () => {
    it('removes trailing waiting', () => {
      const parts: ContentPart[] = [{ type: 'text', content: 'hi' }, { type: 'waiting' }]
      popTrailingTransient(parts)
      expect(parts).toEqual([{ type: 'text', content: 'hi' }])
    })

    it('removes trailing loading-memory', () => {
      const parts: ContentPart[] = [{ type: 'loading-memory' }]
      popTrailingTransient(parts)
      expect(parts).toEqual([])
    })

    it('leaves non-transient trailing parts alone', () => {
      const parts: ContentPart[] = [{ type: 'text', content: 'hi' }]
      popTrailingTransient(parts)
      expect(parts).toEqual([{ type: 'text', content: 'hi' }])
    })

    it('is a no-op on empty array', () => {
      const parts: ContentPart[] = []
      popTrailingTransient(parts)
      expect(parts).toEqual([])
    })
  })

  describe('appendOrMergeText', () => {
    it('starts a new text part on empty array', () => {
      const parts: ContentPart[] = []
      appendOrMergeText(parts, 'hello')
      expect(parts).toEqual([{ type: 'text', content: 'hello' }])
    })

    it('merges into trailing text', () => {
      const parts: ContentPart[] = [{ type: 'text', content: 'hello' }]
      appendOrMergeText(parts, ' world')
      expect(parts).toEqual([{ type: 'text', content: 'hello world' }])
    })

    it('pops waiting before merging', () => {
      const parts: ContentPart[] = [
        { type: 'text', content: 'a' },
        { type: 'waiting' },
      ]
      appendOrMergeText(parts, 'b')
      expect(parts).toEqual([{ type: 'text', content: 'ab' }])
    })

    it('starts a new text part after a tool-call', () => {
      const parts: ContentPart[] = [
        { type: 'tool-call', toolCalls: [makeToolCall('t1')] },
      ]
      appendOrMergeText(parts, 'next')
      expect(parts).toHaveLength(2)
      expect(parts[1]).toEqual({ type: 'text', content: 'next' })
    })
  })

  describe('upsertToolCall', () => {
    it('creates a new tool-call part on empty', () => {
      const parts: ContentPart[] = []
      const tc = makeToolCall('t1')
      upsertToolCall(parts, tc)
      expect(parts).toEqual([{ type: 'tool-call', toolCalls: [tc] }])
    })

    it('merges into trailing tool-call by appending', () => {
      const a = makeToolCall('a')
      const b = makeToolCall('b')
      const parts: ContentPart[] = [{ type: 'tool-call', toolCalls: [a] }]
      upsertToolCall(parts, b)
      expect(parts).toHaveLength(1)
      expect((parts[0] as { type: 'tool-call'; toolCalls: ToolCall[] }).toolCalls).toEqual([a, b])
    })

    it('updates existing tool call by id', () => {
      const a = makeToolCall('a', { status: 'pending' })
      const updated = makeToolCall('a', { status: 'completed' })
      const parts: ContentPart[] = [{ type: 'tool-call', toolCalls: [a] }]
      upsertToolCall(parts, updated)
      expect((parts[0] as { type: 'tool-call'; toolCalls: ToolCall[] }).toolCalls[0].status).toBe('completed')
    })

    it('updates an existing tool call before data-steps without appending a duplicate part', () => {
      const streaming = makeToolCall('write-1', {
        toolName: 'write',
        status: 'input-streaming',
        streamingArgs: '{"file_path":"a.txt","content":"hello"}',
      })
      const parts: ContentPart[] = [
        { type: 'tool-call', toolCalls: [streaming] },
        { type: 'data-steps', turnIndex: 0 },
      ]
      const finalized = makeToolCall('write-1', {
        toolName: 'write',
        status: 'executing',
        arguments: { file_path: 'a.txt', content: 'hello' },
      })

      upsertToolCall(parts, finalized)

      expect(parts.map(p => p.type)).toEqual(['tool-call', 'data-steps'])
      const toolCalls = (parts[0] as { type: 'tool-call'; toolCalls: ToolCall[] }).toolCalls
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0].status).toBe('executing')
      expect(toolCalls[0].streamingArgs).toBe('{"file_path":"a.txt","content":"hello"}')
    })

    it('pops waiting before merging', () => {
      const a = makeToolCall('a')
      const parts: ContentPart[] = [
        { type: 'tool-call', toolCalls: [a] },
        { type: 'waiting' },
      ]
      const b = makeToolCall('b')
      upsertToolCall(parts, b)
      expect(parts).toHaveLength(1)
      expect((parts[0] as { type: 'tool-call'; toolCalls: ToolCall[] }).toolCalls.map(tc => tc.id)).toEqual(['a', 'b'])
    })
  })

  describe('appendToolCallPlaceholder', () => {
    it('replaces trailing tool-call with cloned part on add', () => {
      const a = makeToolCall('a')
      const partA = { type: 'tool-call' as const, toolCalls: [a] }
      const parts: ContentPart[] = [partA]
      const b = makeToolCall('b', { status: 'input-streaming' })
      appendToolCallPlaceholder(parts, b)
      expect(parts).toHaveLength(1)
      // Cloned (different identity) so deep watchers see the change
      expect(parts[0]).not.toBe(partA)
      expect((parts[0] as typeof partA).toolCalls).toEqual([a, b])
    })

    it('skips when tool call id already present', () => {
      const a = makeToolCall('a')
      const partA = { type: 'tool-call' as const, toolCalls: [a] }
      const parts: ContentPart[] = [partA]
      appendToolCallPlaceholder(parts, makeToolCall('a'))
      expect(parts[0]).toBe(partA)
    })

    it('skips when tool call id already exists before data-steps', () => {
      const a = makeToolCall('a')
      const partA = { type: 'tool-call' as const, toolCalls: [a] }
      const parts: ContentPart[] = [
        partA,
        { type: 'data-steps', turnIndex: 0 },
      ]
      appendToolCallPlaceholder(parts, makeToolCall('a'))
      expect(parts).toEqual([
        partA,
        { type: 'data-steps', turnIndex: 0 },
      ])
    })
  })

  describe('pushDataStepsIfMissing', () => {
    it('adds placeholder for new turn', () => {
      const parts: ContentPart[] = []
      expect(pushDataStepsIfMissing(parts, 0)).toBe(true)
      expect(parts).toEqual([{ type: 'data-steps', turnIndex: 0 }])
    })

    it('returns false and leaves array unchanged when turn already has placeholder', () => {
      const parts: ContentPart[] = [{ type: 'data-steps', turnIndex: 0 }]
      expect(pushDataStepsIfMissing(parts, 0)).toBe(false)
      expect(parts).toHaveLength(1)
    })

    it('pops trailing waiting before pushing', () => {
      const parts: ContentPart[] = [
        { type: 'tool-call', toolCalls: [makeToolCall('t')] },
        { type: 'waiting' },
      ]
      pushDataStepsIfMissing(parts, 1)
      expect(parts.map(p => p.type)).toEqual(['tool-call', 'data-steps'])
    })
  })

  describe('pushWaiting', () => {
    it('appends a waiting part without popping prior content', () => {
      const parts: ContentPart[] = [{ type: 'text', content: 'hi' }]
      pushWaiting(parts)
      expect(parts.map(p => p.type)).toEqual(['text', 'waiting'])
    })
  })

  describe('integration: typical streaming sequence', () => {
    it('text → tool-call → continuation waiting → text', () => {
      const parts: ContentPart[] = []
      appendOrMergeText(parts, 'Looking up...')
      upsertToolCall(parts, makeToolCall('t1'))
      pushWaiting(parts)
      appendOrMergeText(parts, 'Found it.')
      expect(parts.map(p => p.type)).toEqual(['text', 'tool-call', 'text'])
      expect((parts[2] as { type: 'text'; content: string }).content).toBe('Found it.')
    })
  })
})
