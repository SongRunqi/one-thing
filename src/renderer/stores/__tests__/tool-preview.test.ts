import { describe, it, expect } from 'vitest'
import { basename, formatToolCallPreview, shortenPath, shortenPathsInText } from '../helpers/tool-preview'
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

describe('basename', () => {
  it('returns only the final path segment', () => {
    expect(basename('/Users/me/project/src/index.ts')).toBe('index.ts')
    expect(basename('src/components/Foo.vue')).toBe('Foo.vue')
  })

  it('handles trailing slashes', () => {
    expect(basename('/Users/me/project/src/')).toBe('src')
  })
})

describe('formatToolCallPreview', () => {
  it('returns empty string for undefined', () => {
    expect(formatToolCallPreview(undefined)).toBe('')
  })

  describe('streaming input', () => {
    it('extracts path for write tool from streaming args', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'write',
        status: 'input-streaming',
        streamingArgs: '{"path":"/Users/me/project/src/foo.ts","content":"...',
      }))).toBe('foo.ts')
    })

    it('extracts filePath aliases from streaming args', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        status: 'input-streaming',
        streamingArgs: '{"filePath":"/Users/me/project/src/foo.ts","offset":10',
      }))).toBe('foo.ts')
    })

    it('does not use streamed edit content as a filename', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'edit',
        status: 'input-streaming',
        streamingArgs: '{"edits":[{"newText":"const FLUSH_INTERVAL_MS = 250"}]}',
      }))).toBe('')
    })

    it('falls back to streaming args tail when no path yet', () => {
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
    it('bash: shows command, truncated to 96 chars', () => {
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
      expect(result.length).toBe(96)
    })

    it('read: shows file path with optional range', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        arguments: { path: '/Users/me/project/src/foo.ts' },
      }))).toBe('foo.ts')
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        arguments: { path: '/Users/me/project/src/foo.ts', offset: 10, limit: 20 },
      }))).toBe('foo.ts:10-29')
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        arguments: { filePath: '/Users/me/project/src/foo.ts', offset: 10, limit: 20 },
      }))).toBe('foo.ts:10-29')
      expect(formatToolCallPreview(tc({
        toolName: 'read',
        arguments: { offset: 206, limit: 10 },
      }))).toBe('Lines 206-215')
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

    it('edit: shows only the target path and leaves diff stats to metadata', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'edit',
        arguments: { path: '/Users/me/project/src/foo.ts' },
        changes: { diff: '...', filePath: '/Users/me/project/src/foo.ts', additions: 3, deletions: 1 },
      }))).toBe('foo.ts')
    })

    it('write: shows only the target path and leaves content size out of the row target', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'write',
        arguments: { path: '/Users/me/project/src/foo.ts', content: 'hello world' },
      }))).toBe('foo.ts')
    })

    it('default: falls back to first arg or path/pattern', () => {
      expect(formatToolCallPreview(tc({
        toolName: 'unknown',
        arguments: { path: 'a.ts' },
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

describe('shortenPathsInText', () => {
  it('shortens Unix absolute paths in text', () => {
    const text = "grep -n 'function Refer\\b' /Users/yitiansong/data/work/lenovo-scripts/nlp_test.lua | head -n 10"
    const result = shortenPathsInText(text)
    expect(result).toBe("grep -n 'function Refer\\b' .../lenovo-scripts/nlp_test.lua | head -n 10")
  })

  it('shortens Windows absolute paths in text', () => {
    const text = "grep -n 'function Refer\\b' C:\\Users\\yitiansong\\data\\work\\lenovo-scripts\\nlp_test.lua"
    const result = shortenPathsInText(text)
    expect(result).toBe("grep -n 'function Refer\\b' .../lenovo-scripts/nlp_test.lua")
  })

  it('returns empty string for empty input', () => {
    expect(shortenPathsInText('')).toBe('')
  })
})
