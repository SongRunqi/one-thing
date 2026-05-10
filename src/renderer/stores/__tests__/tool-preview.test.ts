import { describe, it, expect } from 'vitest'
import { formatToolCallPreview, shortenPath } from '../helpers/tool-preview'
import type { ToolCall } from '@/types'

function tc(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 't',
    toolId: 'bash',
    toolName: 'bash',
    arguments: {},
    status: 'completed',
    timestamp: 0,
    ...overrides,
  }
}

describe('shortenPath', () => {
  it('returns short paths unchanged', () => {
    expect(shortenPath('src/index.ts')).toBe('src/index.ts')
  })

  it('shortens long paths to last two segments', () => {
    const path = 'aaaaa/bbbbb/ccccc/ddddd/eeeee/fffff/last-dir/file.ts'
    const result = shortenPath(path, 30)
    expect(result.startsWith('.../')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it('falls back to filename only when even two segments overflow', () => {
    const path = 'very-long-dir-name/another-very-long-name/file.ts'
    expect(shortenPath(path, 20)).toBe('.../file.ts')
  })

  it('returns empty string for empty input', () => {
    expect(shortenPath('')).toBe('')
  })
})

describe('formatToolCallPreview', () => {
  it('returns empty string for undefined', () => {
    expect(formatToolCallPreview(undefined)).toBe('')
  })

  describe('streaming input', () => {
    it('extracts file_path for write tool from streaming args', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'write',
        status: 'input-streaming',
        streamingArgs: '{"file_path":"src/foo.ts","content":"...',
      }))).toBe('src/foo.ts')
    })

    it('does not use streamed edit content as a filename', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'edit',
        status: 'input-streaming',
        streamingArgs: '{"new_string":"const FLUSH_INTERVAL_MS = 250"}',
      }))).toBe('')
    })

    it('falls back to streaming args tail when no file_path yet', () => {
      const longArgs = 'x'.repeat(200)
      const result = formatToolCallPreview(tc({
        toolName: 'bash',
        status: 'input-streaming',
        streamingArgs: longArgs,
      }))
      expect(result.startsWith('...')).toBe(true)
      expect(result.length).toBeLessThanOrEqual(83) // '...' + 80 chars
    })

    it('returns short streaming args verbatim', () => {
      expect(formatToolCallPreview(tc({
        status: 'input-streaming',
        streamingArgs: '{"command":"ls"}',
      }))).toBe('{"command":"ls"}')
    })

    it('returns empty string when streamingArgs missing', () => {
      expect(formatToolCallPreview(tc({ status: 'input-streaming' }))).toBe('')
    })
  })

  describe('per-tool summaries', () => {
    it('bash: shows command, truncated to 55 chars', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'bash',
        arguments: { command: 'ls -la' },
      }))).toBe('ls -la')

      const long = 'echo ' + 'a'.repeat(100)
      const result = formatToolCallPreview(tc({
        toolName: 'bash',
        arguments: { command: long },
      }))
      expect(result.endsWith('...')).toBe(true)
      expect(result.length).toBe(55)
    })

    it('read: shows file path with optional range', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        arguments: { file_path: 'src/foo.ts' },
      }))).toBe('src/foo.ts')
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        arguments: { file_path: 'src/foo.ts', offset: 10, limit: 20 },
      }))).toBe('src/foo.ts:10-29')
    })

    it('grep: shows quoted pattern with optional glob', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'grep',
        arguments: { pattern: 'TODO' },
      }))).toBe('"TODO"')
      expect(formatToolCallPreview(tc({
        toolName: 'grep',
        arguments: { pattern: 'TODO', glob: '*.ts' },
      }))).toBe('"TODO" in *.ts')
    })

    it('edit: shows path with diff stats when present', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'edit',
        arguments: { file_path: 'src/foo.ts' },
        changes: { diff: '...', filePath: 'src/foo.ts', additions: 3, deletions: 1 },
      }))).toBe('src/foo.ts (+3 -1)')
    })

    it('write: shows path with content size', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'write',
        arguments: { file_path: 'src/foo.ts', content: 'hello world' },
      }))).toBe('src/foo.ts (11 chars)')
    })

    it('default: falls back to first arg or path/pattern', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'unknown',
        arguments: { file_path: 'a.ts' },
      }))).toBe('a.ts')
      expect(formatToolCallPreview(tc({
        toolName: 'unknown',
        arguments: { pattern: 'p' },
      }))).toBe('"p"')
      expect(formatToolCallPreview(tc({
        toolName: 'unknown',
        arguments: { foo: 'bar' },
      }))).toBe('bar')
    })

    it('returns empty string when args is empty', () => {
      expect(formatToolCallPreview(tc({ toolName: 'unknown', arguments: {} }))).toBe('')
    })
  })
})
