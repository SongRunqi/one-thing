import { describe, expect, it } from 'vitest'
import type { Step, ToolCall } from '@/types'
import {
  buildDetailedToolStepView,
  buildToolActivityView,
  buildToolActivityViews,
  formatToolDuration,
} from '../helpers/tool-activity-view'

describe('formatToolDuration', () => {
  it('renders every duration as seconds with one decimal', () => {
    expect(formatToolDuration(0)).toBe('0.0s')
    expect(formatToolDuration(49)).toBe('0.0s')
    expect(formatToolDuration(843.267)).toBe('0.8s')
    expect(formatToolDuration(999)).toBe('1.0s')
    expect(formatToolDuration(1_234)).toBe('1.2s')
    expect(formatToolDuration(59_949)).toBe('59.9s')
  })

  it('switches to m + zero-padded seconds past one minute', () => {
    expect(formatToolDuration(60_000)).toBe('1m00.0s')
    expect(formatToolDuration(125_340)).toBe('2m05.3s')
    expect(formatToolDuration(754_900)).toBe('12m34.9s')
  })
})

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

describe('tool activity view', () => {
  it('builds lightweight streaming write rows with full streaming stats', () => {
    const content = Array.from({ length: 220 }, (_, index) => `line ${index + 1}`).join('\n')
    const streamingStep = step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: JSON.stringify({
          path: '/Users/me/project/src/large.ts',
          content,
        }),
      }),
    })

    const activity = buildToolActivityView(streamingStep)

    expect(activity.status).toBe('streaming-input')
    expect(activity.toolLabel).toBe('Write')
    expect(activity.target).toBe('large.ts')
    expect(activity.filePath).toBe('/Users/me/project/src/large.ts')
    expect(activity.additions).toBe(220)
    expect(activity.stats).toBe('+220 -0')
    expect(activity.hasDetails).toBe(true)
    expect(activity.defaultExpanded).toBe(false)
  })

  it('does not show character-count stats for completed tool output', () => {
    for (const toolName of ['bash', 'grep', 'read']) {
      const activity = buildToolActivityView(step({
        status: 'completed',
        result: 'x'.repeat(41_000),
        toolCall: tc({
          toolId: toolName,
          toolName,
          status: 'completed',
        }),
      }))

      expect(activity.stats).toBe('')
    }
  })

  it('formats read targets with filename and line metadata', () => {
    const activity = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        toolId: 'read',
        toolName: 'read',
        status: 'completed',
        arguments: {
          filePath: '/Users/me/project/src/foo.ts',
          offset: 10,
          limit: 20,
        },
      }),
    }))

    expect(activity.target).toBe('foo.ts:10-29')
    expect(activity.targetMeta).toBe('')
    expect(activity.filePath).toBe('/Users/me/project/src/foo.ts')
  })

  it('formats read ranges without a path as line metadata instead of a bare suffix', () => {
    const activity = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        toolId: 'read',
        toolName: 'read',
        status: 'completed',
        arguments: {
          offset: 206,
          limit: 10,
        },
      }),
    }))

    expect(activity.target).toBe('Lines 206-215')
    expect(activity.targetMeta).toBe('')
  })

  it('keeps diff stats for editing tools', () => {
    const activity = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        status: 'completed',
        changes: {
          diff: '@@ -1 +1 @@\n-old\n+new',
          filePath: '/Users/me/project/src/app.ts',
          additions: 3,
          deletions: 1,
        },
      }),
    }))

    expect(activity.stats).toBe('+3 -1')
  })

  it('shows live duration while active and keeps the frozen duration after', () => {
    const executing = buildToolActivityView(step({
      status: 'running',
      toolCall: tc({
        status: 'executing',
        startTime: 1_000,
      }),
    }), 2_500)
    const streaming = buildToolActivityView(step({
      status: 'running',
      toolCall: tc({
        status: 'input-streaming',
        startTime: 1_000,
      }),
    }), 1_500)
    const completed = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        status: 'completed',
        startTime: 1_000,
        endTime: 2_500,
      }),
    }), 3_000)
    const failed = buildToolActivityView(step({
      status: 'failed',
      toolCall: tc({
        status: 'failed',
        startTime: 1_000,
        endTime: 2_500,
      }),
    }), 3_000)
    const cancelled = buildToolActivityView(step({
      status: 'cancelled',
      toolCall: tc({
        status: 'cancelled',
        startTime: 1_000,
        endTime: 2_500,
      }),
    }), 3_000)

    expect(executing.duration).toBe('1.5s')
    expect(streaming.duration).toBe('0.5s')
    expect(completed.duration).toBe('1.5s')
    expect(failed.duration).toBe('1.5s')
    expect(cancelled.duration).toBe('1.5s')
  })

  it('prefers the authoritative durationMs and formats with one decimal', () => {
    const completed = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        status: 'completed',
        startTime: 1_000,
        endTime: 2_000,
        durationMs: 843.267,
      }),
    }), 3_000)

    expect(completed.duration).toBe('0.8s')
  })

  it('exposes numeric additions/deletions for group aggregation', () => {
    const activity = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        toolName: 'edit',
        status: 'completed',
        changes: {
          filePath: '/a.ts',
          diff: 'x',
          additions: 3,
          deletions: 1,
        },
      }),
    }))

    expect(activity.additions).toBe(3)
    expect(activity.deletions).toBe(1)
    expect(activity.stats).toBe('+3 -1')
  })

  it('opens a permission row and keeps failed rows collapsed', () => {
    const awaiting = buildToolActivityView(step({
      status: 'awaiting-confirmation',
      toolCall: tc({
        status: 'pending',
        requiresConfirmation: true,
      }),
    }))
    const failed = buildToolActivityView(step({
      status: 'failed',
      error: 'Nope',
      toolCall: tc({ status: 'failed' }),
    }))

    // The approval prompt only offers the file name and a +N -N tally, so the
    // row itself has to carry the change the reader is being asked to allow.
    expect(awaiting.isAwaitingConfirmation).toBe(true)
    expect(awaiting.defaultExpanded).toBe(true)
    // A failure is fully told by its row summary.
    expect(failed.status).toBe('failed')
    expect(failed.defaultExpanded).toBe(false)
  })

  it('surfaces failed edit target while keeping the failure reason compact', () => {
    const failedEdit = buildToolActivityView(step({
      status: 'failed',
      error: 'Failed to edit /Users/me/project/src/app.ts: oldString not found in content',
      toolCall: tc({
        toolId: 'edit',
        toolName: 'edit',
        status: 'failed',
        arguments: {
          path: '/Users/me/project/src/app.ts',
          edits: [{ oldText: 'old', newText: 'new' }],
        },
      }),
    }))

    expect(failedEdit.target).toBe('app.ts')
    expect(failedEdit.errorSummary).toBe('oldString not found in content')
    expect(failedEdit.errorSummary).not.toContain('/Users/me/project/src/app.ts')
  })

  it('labels permission rejection distinctly from execution failure', () => {
    const rejected = buildToolActivityView(step({
      status: 'failed',
      error: 'The user rejected permission for this tool.',
      rejected: true,
      toolCall: tc({
        toolId: 'bash',
        toolName: 'bash',
        status: 'failed',
        rejected: true,
      }),
    }))

    expect(rejected.status).toBe('rejected')
    expect(rejected.toolLabel).toBe('Bash')
    expect(rejected.errorSummary).toBe('')
    expect(rejected.defaultExpanded).toBe(false)
  })

  it('uses action-specific labels for variable tools', () => {
    const setWorkdir = buildToolActivityView(step({
      status: 'completed',
      toolCall: tc({
        toolId: 'variable',
        toolName: 'variable',
        status: 'completed',
        arguments: {
          action: 'set',
          name: 'workdir',
          value: '/Users/me/project/start-electron',
        },
      }),
    }))
    const listVariables = buildToolActivityView(step({
      status: 'running',
      toolCall: tc({
        toolId: 'variable',
        toolName: 'variable',
        status: 'executing',
        arguments: { action: 'list' },
      }),
    }))
    const appendRoot = buildToolActivityView(step({
      status: 'awaiting-confirmation',
      toolCall: tc({
        toolId: 'variable',
        toolName: 'variable',
        status: 'pending',
        requiresConfirmation: true,
        arguments: {
          action: 'append',
          name: 'workdir',
          value: '/Users/me/other-project',
        },
      }),
    }))

    expect(setWorkdir.toolLabel).toBe('Variable')
    expect(setWorkdir.target).toBe('workdir')
    expect(setWorkdir.targetMeta).toBe('= /Users/me/project/start-electron')
    expect(listVariables.toolLabel).toBe('Variable')
    expect(listVariables.target).toBe('variables')
    expect(listVariables.targetMeta).toBe('')
    expect(appendRoot.toolLabel).toBe('Variable')
    expect(appendRoot.target).toBe('workdir root')
    expect(appendRoot.targetMeta).toBe('+ /Users/me/other-project')
  })

  it('groups steps in order and hydrates details only when requested', () => {
    const steps = [
      step({ id: 'a', toolCallId: 'a', toolCall: tc({ id: 'a', status: 'completed' }) }),
      step({ id: 'b', toolCallId: 'b', toolCall: tc({ id: 'b', status: 'input-streaming', streamingArgs: '{"path":"src/b.ts","content":"hello"}' }) }),
    ]

    const activities = buildToolActivityViews(steps)
    const detailed = buildDetailedToolStepView(activities[1])

    expect(activities.map(activity => activity.id)).toEqual(['a', 'b'])
    expect(activities[1].target).toBe('b.ts')
    expect(detailed.streamingContent?.content).toBe('hello')
  })
})
