// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToolStepDetails from '../ToolStepDetails.vue'
import { buildToolStepView } from '@/stores/helpers/tool-step-view'
import type { Step, ToolCall } from '@/types'

function makeStep(toolCall: Partial<ToolCall>, step: Partial<Step> = {}): Step {
  const call: ToolCall = {
    id: 'tc1',
    toolId: 'edit',
    toolName: 'edit',
    status: 'completed',
    arguments: {},
    timestamp: 1,
    ...toolCall,
  }
  return {
    id: 'tc1',
    type: 'tool-call',
    title: call.toolName || 'tool',
    status: 'completed',
    timestamp: 1,
    toolCallId: call.id,
    toolCall: call,
    ...step,
  }
}

function mountDetails(step: Step) {
  return mount(ToolStepDetails, {
    props: { view: buildToolStepView(step), wrap: true },
  })
}

describe('ToolStepDetails inline content', () => {
  it('renders failed edit oldText as code quotes instead of raw JSON arguments', () => {
    const wrapper = mountDetails(makeStep(
      {
        status: 'failed',
        arguments: {
          path: '/repo/src/App.vue',
          edits: [
            { oldText: '<OldToolCard />', newText: '<StepsPanel />' },
            { oldText: 'const legacy = true', newText: '' },
          ],
        },
      },
      { status: 'failed', error: 'No matching text found for oldText.' },
    ))

    const snippets = wrapper.findAll('.failed-edit-snippet')
    expect(snippets).toHaveLength(2)
    expect(snippets[0].text()).toBe('<OldToolCard />')
    expect(snippets[1].text()).toBe('const legacy = true')
    expect(wrapper.text()).not.toContain('oldText')
    expect(wrapper.find('.args-toggle').exists()).toBe(false)
  })

  it('never renders an inline arguments or command section (raw args belong to the Inspector)', () => {
    const wrapper = mountDetails(makeStep(
      {
        toolId: 'bash',
        toolName: 'bash',
        arguments: { command: 'bun run lint:ci' },
      },
      { result: JSON.stringify({ output: 'ok' }) },
    ))

    expect(wrapper.find('.args-toggle').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('arguments.json')
  })

  it('omits the error parameters box and shows details only when they add information', () => {
    const wrapper = mountDetails(makeStep(
      {
        toolId: 'bash',
        toolName: 'bash',
        status: 'failed',
        arguments: { command: 'bun run lint:ci' },
      },
      { status: 'failed', error: 'ESLint found 2 problems in StepsPanel.vue.' },
    ))

    expect(wrapper.find('.error-params').exists()).toBe(false)
    // Single-line error identical to the row summary adds nothing — no Details disclosure.
    expect(wrapper.find('.error-details').exists()).toBe(false)
  })
})
