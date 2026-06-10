import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildToolStepView,
  buildSyntheticToolCall,
  clearStreamingContentCache,
  parseDiffWithLineNumbers,
  stepFromToolCall,
} from '../helpers/tool-step-view'
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

beforeEach(() => {
  clearStreamingContentCache()
})

describe('buildToolStepView', () => {
  it('keeps write streaming details available but collapsed by default', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: '{"path":"/Users/me/project/src/a.ts","content":"hello\\nworld"}',
      }),
    }))

    expect(view.status).toBe('streaming-input')
    expect(view.preview).toBe('a.ts')
    expect(view.filePath).toBe('/Users/me/project/src/a.ts')
    expect(view.fileName).toBe('a.ts')
    expect(view.streamingContent?.content).toBe('hello\nworld')
    expect(view.hasDetails).toBe(true)
    expect(view.defaultExpanded).toBe(false)
  })

  it('can build a lightweight row without parsing heavy details', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: '{"path":"/Users/me/project/src/a.ts","content":"hello\\nworld"}',
      }),
    }), { includeDetails: false })

    expect(view.status).toBe('streaming-input')
    expect(view.preview).toBe('a.ts')
    expect(view.filePath).toBe('/Users/me/project/src/a.ts')
    expect(view.streamingContent).toBeNull()
    expect(view.streamingDiffLines).toEqual([])
    expect(view.argsJson).toBeNull()
    expect(view.resultText).toBeNull()
    expect(view.hasDetails).toBe(true)
    expect(view.defaultExpanded).toBe(false)
  })

  it('uses diff as the authoritative write detail once available', () => {
    const view = buildToolStepView(step({
      status: 'awaiting-confirmation',
      toolCall: tc({
        status: 'pending',
        requiresConfirmation: true,
        streamingArgs: '{"path":"src/a.ts","content":"stale"}',
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

  it('exposes running bash partial output as live output for details UI', () => {
    const view = buildToolStepView(step({
      result: 'fallback output\n',
      partialResult: {
        content: [{ type: 'text', text: 'line 1\nline 2\n' }],
        details: { elapsedMs: 10 },
      },
      partialResultIsPartial: true,
      toolCall: tc({
        toolId: 'bash',
        toolName: 'bash',
        status: 'executing',
        arguments: { command: 'printf "line 1\\nline 2\\n"' },
      }),
    }))

    expect(view.liveOutput).toBe('line 1\nline 2\n')
    expect(view.hasDetails).toBe(true)
  })

  it('renders permission rejection as rejected instead of failed error preview', () => {
    const view = buildToolStepView(step({
      status: 'failed',
      error: 'The user rejected permission for this tool.',
      rejected: true,
      toolCall: tc({
        toolId: 'bash',
        toolName: 'bash',
        status: 'failed',
        rejected: true,
        error: 'The user rejected permission for this tool.',
      }),
    }))

    expect(view.status).toBe('rejected')
    expect(view.errorPreview).toBe('Rejected')
    expect(view.defaultExpanded).toBe(true)
  })

  it('caches streaming write parsing for the same tool input length and status', () => {
    const streamingStep = step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: '{"path":"src/a.ts","content":"cached"}',
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
        streamingArgs: JSON.stringify({ path: 'src/large.ts', content }),
      }),
    }))

    expect(view.streamingContent?.additions).toBe(220)
    expect(view.streamingContent?.isTruncated).toBe(true)
    expect(view.streamingContent?.omittedLines).toBe(60)
    expect(view.streamingDiffLines.some(line => line.content.includes('lines omitted'))).toBe(true)
    expect(view.streamingDiffLines.length).toBeLessThan(220)
  })

  it('extracts filePath from step.result payload if args.path is missing', () => {
    const view = buildToolStepView(step({
      result: JSON.stringify({ path: '/Users/me/project/src/resolved.ts', content: 'hello' }),
      toolCall: tc({
        toolName: 'read',
        arguments: {},
      }),
    }))

    expect(view.filePath).toBe('/Users/me/project/src/resolved.ts')
    expect(view.fileName).toBe('resolved.ts')
  })
})

describe('stepFromToolCall', () => {
  it('wraps a streaming tool call as a renderable step', () => {
    const toolCall: ToolCall = {
      id: 'tc1',
      toolId: 'edit',
      toolName: 'edit',
      arguments: {},
      status: 'input-streaming',
      streamingArgs: '{"path": "/a.ts"',
      timestamp: 1,
    }

    const wrappedStep = stepFromToolCall(toolCall)

    expect(wrappedStep.id).toBe('tc1')
    expect(wrappedStep.toolCall).toBe(toolCall)
    expect(wrappedStep.status).toBe('running')
  })

  it('maps terminal tool call statuses to step statuses', () => {
    const done = stepFromToolCall({
      id: 'a',
      toolId: 'bash',
      toolName: 'bash',
      arguments: {},
      status: 'completed',
      timestamp: 1,
    })
    const failed = stepFromToolCall({
      id: 'b',
      toolId: 'bash',
      toolName: 'bash',
      arguments: {},
      status: 'failed',
      timestamp: 1,
    })

    expect(done.status).toBe('completed')
    expect(failed.status).toBe('failed')
  })
})

describe('buildSyntheticToolCall', () => {
  it('parses read with line ranges', () => {
    const call = buildSyntheticToolCall(step({
      title: 'read:src/main.ts:768-807',
      toolCall: undefined,
    }))
    expect(call.toolName).toBe('read')
    expect(call.arguments.path).toBe('src/main.ts')
    expect(call.arguments.offset).toBe(768)
    expect(call.arguments.limit).toBe(40)
  })

  it('parses Tool prefix', () => {
    const call = buildSyntheticToolCall(step({
      title: 'Tool: edit',
      toolCall: undefined,
    }))
    expect(call.toolName).toBe('edit')
  })

  it('parses Read human title', () => {
    const call = buildSyntheticToolCall(step({
      title: 'Read IVARouter.lua',
      toolCall: undefined,
    }))
    expect(call.toolName).toBe('read')
    expect(call.arguments.path).toBe('IVARouter.lua')
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
