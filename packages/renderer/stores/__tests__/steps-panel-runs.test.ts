import { describe, expect, it } from 'vitest'
import { buildStepActivityRuns, shouldFlowStepActivityTitle } from '../helpers/steps-panel-runs'
import type { ToolStepView } from '../helpers/tool-step-view'
import type { ToolRenderStatus } from '../helpers/tool-status'

function view(id: string, toolName: string, status: ToolRenderStatus = 'completed'): ToolStepView {
  return {
    id,
    toolName,
    displayName: toolName,
    status,
    diff: null,
    streamingContent: null,
  } as ToolStepView
}

describe('buildStepActivityRuns', () => {
  it('preserves non-adjacent tool categories in call order', () => {
    const runs = buildStepActivityRuns([
      view('bash-1', 'bash'),
      view('edit-1', 'edit'),
      view('read-1', 'read'),
      view('edit-2', 'edit'),
    ])

    expect(runs.map(run => run.kind)).toEqual(['utility', 'edited', 'utility', 'edited'])
    expect(runs.map(run => run.views.map(item => item.id))).toEqual([
      ['bash-1'],
      ['edit-1'],
      ['read-1'],
      ['edit-2'],
    ])
  })

  it('merges adjacent utility and edited runs only', () => {
    const runs = buildStepActivityRuns([
      view('read-1', 'read'),
      view('grep-1', 'grep'),
      view('bash-1', 'bash'),
      view('edit-1', 'edit'),
      view('write-1', 'write'),
    ])

    expect(runs.map(run => run.kind)).toEqual(['utility', 'edited'])
    expect(runs[0].views.map(item => item.id)).toEqual(['read-1', 'grep-1', 'bash-1'])
    expect(runs[1].views.map(item => item.id)).toEqual(['edit-1', 'write-1'])
  })
})

describe('shouldFlowStepActivityTitle', () => {
  it('flows only command activity while running', () => {
    expect(shouldFlowStepActivityTitle(view('bash-1', 'bash', 'executing'))).toBe(true)
    expect(shouldFlowStepActivityTitle(view('read-1', 'read', 'executing'))).toBe(false)
    expect(shouldFlowStepActivityTitle(view('write-1', 'write', 'streaming-input'))).toBe(false)
  })

  it('does not flow completed commands', () => {
    expect(shouldFlowStepActivityTitle(view('bash-1', 'bash', 'completed'))).toBe(false)
  })
})
