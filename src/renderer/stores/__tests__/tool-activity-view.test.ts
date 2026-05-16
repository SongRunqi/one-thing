import { describe, expect, it } from 'vitest'
import type { Step, ToolCall } from '@/types'
import {
  buildDetailedToolStepView,
  buildToolActivityView,
  buildToolActivityViews,
} from '../helpers/tool-activity-view'

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
  it('builds lightweight streaming write rows without detailed previews', () => {
    const streamingStep = step({
      toolCall: tc({
        status: 'input-streaming',
        streamingArgs: JSON.stringify({
          file_path: '/Users/me/project/src/large.ts',
          content: 'x'.repeat(6_000),
        }),
      }),
    })

    const activity = buildToolActivityView(streamingStep)

    expect(activity.status).toBe('streaming-input')
    expect(activity.verb).toBe('Writing')
    expect(activity.target).toBe('large.ts')
    expect(activity.filePath).toBe('/Users/me/project/src/large.ts')
    expect(activity.stats).toBe('')
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

  it('auto-expands permission and failed states', () => {
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

    expect(awaiting.isAwaitingConfirmation).toBe(true)
    expect(awaiting.defaultExpanded).toBe(true)
    expect(failed.status).toBe('failed')
    expect(failed.defaultExpanded).toBe(true)
  })

  it('labels permission rejection distinctly from execution failure', () => {
    const rejected = buildToolActivityView(step({
      status: 'failed',
      error: 'User rejected this operation',
      rejected: true,
      toolCall: tc({
        toolId: 'bash',
        toolName: 'bash',
        status: 'failed',
        rejected: true,
      }),
    }))

    expect(rejected.status).toBe('rejected')
    expect(rejected.verb).toBe('Rejected')
    expect(rejected.defaultExpanded).toBe(true)
  })

  it('groups steps in order and hydrates details only when requested', () => {
    const steps = [
      step({ id: 'a', toolCallId: 'a', toolCall: tc({ id: 'a', status: 'completed' }) }),
      step({ id: 'b', toolCallId: 'b', toolCall: tc({ id: 'b', status: 'input-streaming', streamingArgs: '{"file_path":"src/b.ts","content":"hello"}' }) }),
    ]

    const activities = buildToolActivityViews(steps)
    const detailed = buildDetailedToolStepView(activities[1])

    expect(activities.map(activity => activity.id)).toEqual(['a', 'b'])
    expect(activities[1].target).toBe('b.ts')
    expect(detailed.streamingContent?.content).toBe('hello')
  })
})
