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
  it('renders failed edits as the plain error text — no intent diff, no disclosure', () => {
    const error = 'Could not find edits[1] in /repo/src/App.vue. Re-read the current file and include a larger unique block.'
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
      { status: 'failed', error },
    ))

    // The failed attempt's old/new text is never replayed in the pane.
    expect(wrapper.find('.intent-diff').exists()).toBe(false)
    expect(wrapper.find('.failed-edit-summary').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('<OldToolCard />')
    // The error itself is shown plainly, not behind the Details disclosure.
    expect(wrapper.find('.error-details').exists()).toBe(false)
    expect(wrapper.find('.error-section .error-text').text()).toContain('Could not find edits[1]')
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

  it('shows a multi-line error in full, with no disclosure to open', () => {
    const error = [
      'Could not find edits[1] in /repo/src/App.vue.',
      'The file changed after it was read.',
      'Re-read the current file and include a larger unique block.',
    ].join('\n')
    const wrapper = mountDetails(makeStep(
      {
        status: 'failed',
        arguments: { path: '/repo/src/App.vue', edits: [{ oldText: 'a', newText: 'b' }] },
      },
      { status: 'failed', error },
    ))

    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.find('.error-details').exists()).toBe(false)
    // Every line is in the DOM — nothing is behind a click.
    const text = wrapper.find('.error-section .error-text').text()
    expect(text).toContain('Could not find edits[1]')
    expect(text).toContain('The file changed after it was read.')
    expect(text).toContain('include a larger unique block')
  })

  it('says nothing about a successful call — no OK badge, no repeated +N/−N', () => {
    const wrapper = mountDetails(makeStep(
      {
        status: 'completed',
        arguments: { path: '/repo/src/App.vue' },
      },
      {
        status: 'completed',
        diff: { additions: 12, deletions: 3, diff: '@@ -1 +1 @@\n-a\n+b\n' },
      } as Partial<Step>,
    ))

    expect(wrapper.find('.fig-status').exists()).toBe(false)
    expect(wrapper.find('.fig-tag-right').exists()).toBe(false)
    expect(wrapper.find('.fig-tag').text()).toBe('EDIT')
    expect(wrapper.text()).not.toContain('+12')
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
