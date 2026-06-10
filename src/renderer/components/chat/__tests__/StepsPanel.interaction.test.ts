// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StepsPanel from '../StepsPanel.vue'
import type { Step, ToolCall } from '@/types'

function fileStep(id: string, status: Step['status'] = 'completed'): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'edit',
    toolName: 'edit',
    status: status === 'running' ? 'executing' : status === 'awaiting-confirmation' ? 'pending' : status,
    arguments: { path: `/repo/src/${id}.ts` },
    timestamp: 1,
    changes: {
      filePath: `/repo/src/${id}.ts`,
      diff: '@@ -1 +1 @@\n-a\n+b\n',
      additions: 1,
      deletions: 1,
    },
  }

  return {
    id,
    type: 'tool-call',
    title: `edit: /repo/src/${id}.ts`,
    status,
    timestamp: 1,
    toolCallId: id,
    toolCall,
  }
}

function mountPanel(steps: Step[]) {
  return mount(StepsPanel, {
    props: { steps },
    global: {
      stubs: {
        FartCallItem: { template: '<div />' },
        ToolActivityDetails: { template: '<div class="detail-stub" />' },
      },
    },
  })
}

describe('StepsPanel interaction contract', () => {
  it('emits open-file when clicking a file-link target name', async () => {
    const wrapper = mountPanel([fileStep('a')])

    await wrapper.find('.node-target-name.file-link').trigger('click')

    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/repo/src/a.ts'])
    expect(wrapper.find('.activity-inline-details').exists()).toBe(false)
  })

  it('keeps an activity expanded when its group grows from 1 to 2', async () => {
    const wrapper = mountPanel([fileStep('a')])

    await wrapper.find('.operation-row').trigger('click')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)

    await wrapper.setProps({ steps: [fileStep('a'), fileStep('b')] })

    expect(wrapper.find('.workflow-group').classes()).toContain('expanded')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('always shows failure summary inside a grouped operation', () => {
    const failed = fileStep('c', 'failed')
    failed.error = 'No match found'
    failed.toolCall!.status = 'failed'

    const wrapper = mountPanel([fileStep('a'), failed])

    expect(wrapper.find('.operation-failure').exists()).toBe(true)
    expect(wrapper.find('.operation-failure').text()).toContain('No match found')
  })
})
