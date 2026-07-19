import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildToolStepView,
  buildSyntheticToolCall,
  clearStreamingContentCache,
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
  it('keeps write streaming details available but folded', () => {
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
    // Nothing is being asked of the reader yet, so the row stays quiet.
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
    expect(view.streamingPreviewLines).toEqual([])
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
    // An edit waiting on approval is the one row that opens itself: the reader
    // is being asked to decide, so the change has to be in front of them.
    expect(view.defaultExpanded).toBe(true)
  })

  it('keeps bash rows expandable so the full command is always reachable', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'bash',
        toolName: 'bash',
        status: 'executing',
        arguments: { command: 'git status' },
      }),
    }))

    expect(view.toolName).toBe('bash')
    // The single-line title truncates long commands; the expanded details
    // must always be available as the place to read the whole command.
    expect(view.hasDetails).toBe(true)
    expect(view.defaultExpanded).toBe(true)
  })

  it('hides read arguments because the row target already carries the file range', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'read',
        toolName: 'read',
        status: 'completed',
        arguments: {
          filePath: '/Users/me/project/src/app.ts',
          offset: 768,
          limit: 40,
        },
      }),
    }))

    expect(view.toolName).toBe('read')
    expect(view.argsJson).toBeNull()
    expect(view.hasDetails).toBe(false)
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
    expect(view.defaultExpanded).toBe(false)
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

  it('renders all rows for large streaming write previews without the 160 row cap', () => {
    const content = Array.from({ length: 220 }, (_, index) => `line ${index + 1}`).join('\n')
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: JSON.stringify({ path: 'src/large.ts', content }),
      }),
    }))

    expect(view.streamingContent?.additions).toBe(220)
    expect(view.streamingContent?.isTruncated).toBe(false)
    expect(view.streamingContent?.omittedLines).toBe(0)
    expect(view.streamingPreviewLines.some(line => line.text.includes('lines omitted'))).toBe(false)
    expect(view.streamingPreviewLines).toHaveLength(220)
  })

  it('keeps streaming write rendered rows aligned with additions for trailing newlines', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: JSON.stringify({ path: 'src/newline.ts', content: 'line 1\nline 2\n' }),
      }),
    }))

    expect(view.streamingContent?.additions).toBe(2)
    expect(view.streamingPreviewLines).toEqual([
      { kind: 'content', text: 'line 1' },
      { kind: 'content', text: 'line 2' },
    ])
  })

  it('previews a streaming write as plain content, never as diff additions', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: JSON.stringify({ path: 'src/new.ts', content: 'alpha\nbeta\n' }),
      }),
    }))

    // A write has never read the old file, so nothing here may claim to be an
    // addition relative to it.
    expect(view.streamingPreviewLines.every(line => line.kind === 'content')).toBe(true)
    expect(view.streamingPreviewLines.every(line => !line.text.startsWith('+'))).toBe(true)
  })

  it('previews a streaming edit as its find/replace pair, without file line numbers', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'edit',
        toolName: 'edit',
        status: 'input-streaming',
        streamingArgs: JSON.stringify({
          path: 'src/app.ts',
          edits: [{
            oldText: 'const a = 1\nconst b = 2\n',
            newText: 'const a = 1\nconst b = 3\n',
          }],
        }),
      }),
    }))

    expect(view.streamingPreviewLines).toEqual([
      { kind: 'label', text: 'Find' },
      { kind: 'old', text: 'const a = 1' },
      { kind: 'old', text: 'const b = 2' },
      { kind: 'label', text: 'Replace with' },
      { kind: 'new', text: 'const a = 1' },
      { kind: 'new', text: 'const b = 3' },
    ])
    // Line numbers would be fabricated: the offsets are within the replacement,
    // not positions in the file, which nothing has read yet.
    expect(view.streamingPreviewLines.every(line => !('oldNum' in line))).toBe(true)
  })

  it('keeps deletion-only streaming edits visible', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'edit',
        toolName: 'edit',
        status: 'input-streaming',
        streamingArgs: JSON.stringify({
          path: 'src/app.ts',
          edits: [{ oldText: 'remove me\n', newText: '' }],
        }),
      }),
    }))

    expect(view.streamingContent?.content).toBe('')
    expect(view.streamingContent?.deletions).toBe(1)
    expect(view.streamingPreviewLines).toEqual([
      { kind: 'label', text: 'Find' },
      { kind: 'old', text: 'remove me' },
      { kind: 'label', text: 'Replace with' },
    ])
  })

  it('numbers the labels when a streaming edit has several replacements', () => {
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'edit',
        toolName: 'edit',
        status: 'input-streaming',
        streamingArgs: JSON.stringify({
          path: 'src/app.ts',
          edits: [
            { oldText: 'old one\n', newText: 'new one\n' },
            { oldText: 'old two\n', newText: 'new two\n' },
          ],
        }),
      }),
    }))

    expect(view.streamingPreviewLines.filter(line => line.kind === 'label').map(line => line.text)).toEqual([
      'Find 1',
      'Replace with 1',
      'Find 2',
      'Replace with 2',
    ])
  })

  it('renders every row of a large streaming edit without a cap', () => {
    const oldText = Array.from({ length: 180 }, (_, index) => `old ${index + 1}`).join('\n')
    const newText = Array.from({ length: 180 }, (_, index) => `new ${index + 1}`).join('\n')
    const view = buildToolStepView(step({
      toolCall: tc({
        toolId: 'edit',
        toolName: 'edit',
        status: 'input-streaming',
        streamingArgs: JSON.stringify({
          path: 'src/app.ts',
          edits: [{ oldText, newText }],
        }),
      }),
    }))

    expect(view.streamingContent?.additions).toBe(180)
    expect(view.streamingContent?.deletions).toBe(180)
    // 180 old + 180 new + the two labels.
    expect(view.streamingPreviewLines).toHaveLength(362)
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

