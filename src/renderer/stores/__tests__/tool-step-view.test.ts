import { describe, expect, it } from 'vitest'
import { buildToolStepView, parseDiffWithLineNumbers } from '../helpers/tool-step-view'
import type { Step, ToolCall } from '@/types'

function tc(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc1',
    toolId: 'write',
    toolName: 'write',
    arguments: {},
    status: 'pending',
    timestamp: 0,
    ...overrides,
  }
}

function step(overrides: Partial<Step> = {}): Step {
  return {
    id: 's1',
    type: 'tool-call',
    title: 'write',
    status: 'running',
    timestamp: 0,
    toolCallId: 'tc1',
    toolCall: tc(),
    ...overrides,
  }
}

describe('buildToolStepView', () => {
  it('keeps write streaming details expanded by default', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: '{"file_path":"/Users/me/project/src/a.ts","content":"hello\\nworld"}',
      }),
    }))

    expect(view.status).toBe('streaming-input')
    expect(view.preview).toBe('a.ts')
    expect(view.filePath).toBe('/Users/me/project/src/a.ts')
    expect(view.fileName).toBe('a.ts')
    expect(view.streamingContent?.content).toBe('hello\nworld')
    expect(view.hasDetails).toBe(true)
    expect(view.defaultExpanded).toBe(true)
  })

  it('uses diff as the authoritative write detail once available', () => {
    const view = buildToolStepView(step({
      status: 'awaiting-confirmation',
      toolCall: tc({
        status: 'pending',
        requiresConfirmation: true,
        streamingArgs: '{"file_path":"src/a.ts","content":"stale"}',
        changes: {
          diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
          filePath: '/Users/me/project/src/a.ts',
          additions: 1,
          deletions: 1,
        },
      }),
    }))

    expect(view.status).toBe('awaiting-confirmation')
    expect(view.streamingContent).toBeNull()
    expect(view.diff?.filePath).toBe('/Users/me/project/src/a.ts')
    expect(view.filePath).toBe('/Users/me/project/src/a.ts')
    expect(view.fileName).toBe('a.ts')
    expect(view.isAwaitingConfirmation).toBe(true)
    expect(view.defaultExpanded).toBe(true)
  })

  it('marks ordinary bash args as details but leaves them collapsed by default', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'bash',
        toolName: 'bash',
        status: 'executing',
        arguments: { command: 'git status' },
      }),
    }))

    expect(view.toolName).toBe('bash')
    expect(view.argsJson).toBe('git status')
    expect(view.hasDetails).toBe(true)
    expect(view.defaultExpanded).toBe(false)
  })

  it('caches streaming write parsing for the same tool input length and status', () => {
    const streamingStep = step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: '{"file_path":"src/a.ts","content":"cached"}',
      }),
    })

    const first = buildToolStepView(streamingStep)
    const second = buildToolStepView(streamingStep)

    expect(second.streamingContent).toBe(first.streamingContent)
  })

  it('truncates large streaming write previews but keeps total additions', () => {
    const content = Array.from({ length: 220 }, (_, index) => `line ${index + 1}`).join('\n')
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: JSON.stringify({ file_path: 'src/large.ts', content }),
      }),
    }))

    expect(view.streamingContent?.additions).toBe(220)
    expect(view.streamingContent?.isTruncated).toBe(true)
    expect(view.streamingContent?.omittedLines).toBe(60)
    expect(view.streamingDiffLines.some(line => line.content.includes('lines omitted'))).toBe(true)
    expect(view.streamingDiffLines.length).toBeLessThan(220)
  })
})

describe('parseDiffWithLineNumbers', () => {
  it('parses additions and deletions with line numbers', () => {
    const lines = parseDiffWithLineNumbers('--- a\n+++ b\n@@ -1,2 +1,2 @@\n-old\n same\n+new\n')
    expect(lines.map(line => line.class)).toEqual(['diff-hunk', 'diff-del', '', 'diff-add'])
    expect(lines[1].oldNum).toBe(1)
    expect(lines[3].newNum).toBe(2)
  })
})
