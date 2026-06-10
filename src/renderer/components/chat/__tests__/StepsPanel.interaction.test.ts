// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import StepsPanel from '../StepsPanel.vue'
import { useChatStore } from '@/stores/chat'
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

function variableStep(id: string, value: string): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'variable',
    toolName: 'variable',
    status: 'completed',
    arguments: {
      action: 'set',
      name: 'workdir',
      value,
    },
    timestamp: 1,
  }

  return {
    id,
    type: 'tool-call',
    title: 'variable',
    status: 'completed',
    timestamp: 1,
    toolCallId: id,
    toolCall,
  }
}

function mountPanel(steps: Step[], pinia = createPinia()) {
  return mount(StepsPanel, {
    props: { steps },
    global: {
      plugins: [pinia],
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

  it('uses compact group copy and a failed badge', () => {
    const failed = fileStep('c', 'failed')
    failed.error = 'No match found'
    failed.toolCall!.status = 'failed'

    const wrapper = mountPanel([fileStep('a'), failed])

    expect(wrapper.find('.group-summary-text').text()).toBe('2 edits')
    expect(wrapper.find('.group-failure-badge').text()).toBe('1 failed')
  })

  it('uses a disclosure-only group header while rows keep status icons', async () => {
    const wrapper = mountPanel([fileStep('a'), fileStep('b')])

    expect(wrapper.find('.group-header .group-leading-chevron').exists()).toBe(true)
    expect(wrapper.find('.group-header .operation-status-icon').exists()).toBe(false)
    await wrapper.find('.group-header').trigger('click')
    expect(wrapper.findAll('.operation-row .operation-status-icon')).toHaveLength(2)
  })

  it('does not render inline approval controls for awaiting-confirmation rows', () => {
    const awaiting = fileStep('needs-approval', 'awaiting-confirmation')
    awaiting.toolCall!.requiresConfirmation = true

    const wrapper = mountPanel([awaiting])

    expect(wrapper.find('.row-review-btn').exists()).toBe(false)
    expect(wrapper.find('.operation-row').text()).toContain('Edit needs-approval.ts')
    expect(wrapper.find('.operation-row .node-meta').exists()).toBe(false)
  })

  it('renders variable target metadata in the row meta slot', () => {
    const wrapper = mountPanel([variableStep('set-workdir', '/Users/me/project')])

    expect(wrapper.find('.operation-row').text()).toContain('Set workdir')
    expect(wrapper.find('.operation-row .node-meta').text()).toBe('= /Users/me/project')
  })

  it('opens the inspector tab registered for the tool', async () => {
    const pinia = createPinia()
    const store = useChatStore(pinia)
    const openInspector = vi.spyOn(store, 'openInspectorToTab')
    const wrapper = mountPanel([fileStep('a')], pinia)

    await wrapper.find('.operation-inspector-btn').trigger('click')

    expect(openInspector).toHaveBeenCalledWith('diff', 'a')
  })
})
