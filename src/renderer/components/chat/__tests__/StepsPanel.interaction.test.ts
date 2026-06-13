// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
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

function readStep(id: string): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'read',
    toolName: 'read',
    status: 'completed',
    arguments: { filePath: `/repo/src/${id}.ts` },
    timestamp: 1,
  }

  return {
    id,
    type: 'tool-call',
    title: `read: /repo/src/${id}.ts`,
    status: 'completed',
    result: 'const value = 1',
    timestamp: 1,
    toolCallId: id,
    toolCall,
  }
}

function commandStep(id: string, command: string): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'bash',
    toolName: 'bash',
    status: 'completed',
    arguments: { command },
    timestamp: 1,
  }

  return {
    id,
    type: 'command',
    title: `run ${command}`,
    status: 'completed',
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

function fartStep(id: string): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'fart',
    toolName: 'fart',
    status: 'completed',
    arguments: { action: 'fart' },
    timestamp: 1,
  }

  return {
    id,
    type: 'tool-call',
    title: 'fart',
    status: 'completed',
    timestamp: 1,
    toolCallId: id,
    toolCall,
  }
}

function webSearchStep(id: string): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'web_search',
    toolName: 'web_search',
    status: 'completed',
    arguments: { query: 'collapse panel' },
    timestamp: 1,
  }

  return {
    id,
    type: 'tool-call',
    title: 'web_search',
    status: 'completed',
    timestamp: 1,
    toolCallId: id,
    toolCall,
    partialResult: {
      content: [{ type: 'text', text: 'Search results text fallback' }],
      details: {
        phase: 'ready',
        query: 'collapse panel',
        provider: 'brave',
        resultCount: 1,
        pageCount: 1,
        fetchedPageCount: 1,
        searches: [{
          id: 's1',
          query: 'collapse panel',
          resultCount: 1,
          results: [{
            id: 's1-r1',
            searchId: 's1',
            query: 'collapse panel',
            rank: 1,
            title: 'Collapse Panel Result',
            url: 'https://example.com/collapse-panel',
            snippet: 'Search result rendered inside collapse content.',
            pageId: 'p1',
          }],
        }],
        pages: [{
          id: 'p1',
          resultId: 's1-r1',
          searchId: 's1',
          query: 'collapse panel',
          title: 'Collapse Panel Result',
          url: 'https://example.com/collapse-panel',
          snippet: 'Search result rendered inside collapse content.',
          status: 'ready',
          text: 'Fetched page body for collapse panel result.',
          wordCount: 7,
          fetchMs: 12,
        }],
      },
    },
  }
}

function mountPanel(steps: Step[], pinia = createPinia()) {
  return mount(StepsPanel, {
    props: { steps },
    global: {
      plugins: [pinia],
      stubs: {
        FartCallItem: { template: '<div class="fart-stub" />' },
        ToolActivityDetails: { template: '<div class="detail-stub" />' },
      },
    },
  })
}

function mountPanelWithDetails(steps: Step[], pinia = createPinia()) {
  return mount(StepsPanel, {
    props: { steps },
    global: {
      plugins: [pinia],
      stubs: {
        FartCallItem: { template: '<div class="fart-stub" />' },
      },
    },
  })
}

describe('StepsPanel interaction contract', () => {
  it('renders grouped and single tool calls through collapse panels', async () => {
    const grouped = mountPanel([fileStep('a'), fileStep('b')])

    expect(grouped.find('.tool-activity-timeline').classes()).toContain('collapse-group')
    expect(grouped.find('.workflow-group').classes()).toContain('collapse-panel')
    expect(grouped.find('.workflow-group').classes()).toContain('variant-plain')
    expect(grouped.find('.workflow-group').classes()).toContain('icon-inline-end')
    expect(grouped.find('.workflow-group > .collapse-panel-header > .collapse-panel-title .collapse-panel-icon').exists()).toBe(true)
    await grouped.find('.group-header').trigger('click')
    expect(grouped.find('.operation-block').classes()).toContain('collapse-panel')
    expect(grouped.find('.operation-block').classes()).toContain('variant-plain')
    expect(grouped.find('.operation-block').classes()).toContain('icon-inline-end')
    expect(grouped.find('.operation-block > .collapse-panel-header > .collapse-panel-title .collapse-panel-icon').exists()).toBe(true)

    const single = mountPanel([readStep('single')])
    expect(single.find('.operation-block').classes()).toContain('collapse-panel')
    expect(single.find('.operation-block').classes()).toContain('variant-plain')
    expect(single.find('.operation-block').classes()).toContain('icon-inline-end')
  })

  it('wraps special tool-call renderers in a collapse panel shell', () => {
    const wrapper = mountPanel([fartStep('fart')])

    expect(wrapper.find('.fart-panel').classes()).toContain('collapse-panel')
    expect(wrapper.find('.fart-stub').exists()).toBe(true)
  })

  it('renders web search results through the shared collapse content panel', async () => {
    const wrapper = mountPanelWithDetails([webSearchStep('web')])
    const operation = wrapper.find('.operation-block')

    expect(operation.classes()).toContain('collapse-panel')
    expect(operation.classes()).toContain('variant-plain')
    expect(operation.find('.node-action').text()).toBe('Searched')
    expect(operation.find('.node-target-name').text()).toBe('"collapse panel"')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(false)

    await operation.find('.node-target-name').trigger('click')

    const details = wrapper.find('.activity-inline-details')
    expect(details.exists()).toBe(true)
    expect(details.classes()).toContain('collapse-panel-content')
    expect(details.find('.web-search-result').exists()).toBe(true)
    expect(details.find('.web-search-summary').exists()).toBe(true)
    expect(details.find('.details-content-wrapper').exists()).toBe(false)
  })

  it('expands read details when clicking a file-link target name', async () => {
    const wrapper = mountPanel([readStep('a')])

    await wrapper.find('.node-target-name.file-link').trigger('click')

    expect(wrapper.emitted('open-file')).toBeUndefined()
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
    expect(wrapper.find('.activity-inline-details').classes()).toContain('collapse-panel-content')
    expect(wrapper.find('.details-content-wrapper').exists()).toBe(false)
  })

  it('toggles a nested operation from its own expand icon without collapsing the group', async () => {
    const wrapper = mountPanel([fileStep('a'), fileStep('b')])

    await wrapper.find('.workflow-group > .collapse-panel-header').trigger('click')
    expect(wrapper.find('.workflow-group').classes()).toContain('is-expanded')

    const operation = wrapper.find('.operation-block')
    const operationIcon = operation.find('.collapse-panel-icon')

    await operationIcon.trigger('click')

    expect(wrapper.find('.workflow-group').classes()).toContain('is-expanded')
    expect(operation.classes()).toContain('is-expanded')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)

    await operationIcon.trigger('click')

    expect(wrapper.find('.workflow-group').classes()).toContain('is-expanded')
    expect(operation.classes()).not.toContain('is-expanded')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(false)
  })

  it('keeps an activity expanded when its group grows from 1 to 2', async () => {
    const wrapper = mountPanel([fileStep('a')])

    await wrapper.find('.operation-row').trigger('click')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)

    await wrapper.setProps({ steps: [fileStep('a'), fileStep('b')] })

    expect(wrapper.find('.workflow-group').classes()).toContain('is-expanded')
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('shows failure summary in the grouped operation title row', () => {
    const failed = fileStep('c', 'failed')
    failed.error = 'No match found'
    failed.toolCall!.status = 'failed'

    const wrapper = mountPanel([fileStep('a'), failed])

    expect(wrapper.find('.operation-failure').exists()).toBe(false)
    expect(wrapper.find('.node-error-summary').exists()).toBe(true)
    expect(wrapper.find('.node-error-summary').text()).toContain('No match found')
  })

  it('uses compact failed edit group copy without diff stats', () => {
    const failed = fileStep('c', 'failed')
    failed.error = 'No match found'
    failed.toolCall!.status = 'failed'

    const wrapper = mountPanel([fileStep('a'), failed])

    expect(wrapper.find('.group-summary-text').text()).toBe('Edit 2 files')
    expect(wrapper.find('.group-status-badge.failed').text()).toBe('Failed')
    expect(wrapper.find('.group-stat.addition').exists()).toBe(false)
    expect(wrapper.find('.group-stat.deletion').exists()).toBe(false)
    expect(wrapper.find('.workflow-group > .collapse-panel-header .collapse-panel-icon').exists()).toBe(true)
  })

  it('uses completed edit group copy without OK or diff stats', () => {
    const wrapper = mountPanel([fileStep('a'), fileStep('b')])

    expect(wrapper.find('.group-summary-text').text()).toBe('Edited 2 files')
    expect(wrapper.find('.group-status-badge').exists()).toBe(false)
    expect(wrapper.find('.group-stat.addition').exists()).toBe(false)
    expect(wrapper.find('.group-stat.deletion').exists()).toBe(false)
    expect(wrapper.find('.workflow-group > .collapse-panel-header .collapse-panel-icon').exists()).toBe(true)
  })

  it('does not show OK for completed non-edit groups', () => {
    const wrapper = mountPanel([readStep('a'), readStep('b')])

    expect(wrapper.find('.group-summary-text').text()).toBe('Read 2 files')
    expect(wrapper.find('.group-status-badge').exists()).toBe(false)
  })

  it('uses a trailing disclosure group header while completed rows omit terminal status icons', async () => {
    const wrapper = mountPanel([fileStep('a'), fileStep('b')])

    expect(wrapper.find('.workflow-group > .collapse-panel-header .collapse-panel-icon').exists()).toBe(true)
    expect(wrapper.find('.group-header .group-chevron').exists()).toBe(false)
    expect(wrapper.find('.group-header .operation-status-icon').exists()).toBe(false)
    await wrapper.find('.group-header').trigger('click')
    expect(wrapper.findAll('.operation-row .operation-status-icon')).toHaveLength(0)
  })

  it('only shows row status icons for active or awaiting rows', () => {
    const running = fileStep('run', 'running')
    const awaiting = fileStep('needs-approval', 'awaiting-confirmation')
    awaiting.toolCall!.requiresConfirmation = true

    const wrapper = mountPanel([running, awaiting])

    expect(wrapper.find('.operation-row.status-executing .operation-status-icon').exists()).toBe(true)
    expect(wrapper.find('.operation-row.status-awaiting-confirmation .operation-status-icon').exists()).toBe(true)
  })

  it('does not render inline approval controls for awaiting-confirmation rows', () => {
    const awaiting = fileStep('needs-approval', 'awaiting-confirmation')
    awaiting.toolCall!.requiresConfirmation = true

    const wrapper = mountPanel([awaiting])

    expect(wrapper.find('.row-review-btn').exists()).toBe(false)
    expect(wrapper.find('.operation-row .node-target').attributes('aria-label')).toBe('Edit needs-approval.ts')
    expect(wrapper.find('.operation-row .node-meta').exists()).toBe(false)
  })

  it('renders command actions and command text as separate structured parts', () => {
    const wrapper = mountPanel([commandStep('luac-check', 'luac -p nlp_test.lua')])

    const row = wrapper.find('.operation-row')
    expect(row.find('.node-target').attributes('aria-label')).toBe('Ran luac -p nlp_test.lua')
    expect(row.find('.node-action').text()).toBe('Ran')
    expect(row.find('.node-target-name').text()).toBe('luac -p nlp_test.lua')
    expect(row.find('.node-target-name').classes()).toContain('node-target-chip')
    expect(row.find('.node-target-name').classes()).toContain('command-chip')
  })

  it('renders variable target metadata in the row meta slot', () => {
    const wrapper = mountPanel([variableStep('set-workdir', '/Users/me/project')])

    expect(wrapper.find('.operation-row .node-target').attributes('aria-label')).toBe('Set workdir')
    expect(wrapper.find('.operation-row .node-action').text()).toBe('Set')
    expect(wrapper.find('.operation-row .node-target-name').text()).toBe('workdir')
    expect(wrapper.find('.operation-row .node-meta').text()).toBe('= /Users/me/project')
  })

  it('does not render the inspector link action in operation rows', () => {
    const wrapper = mountPanel([fileStep('a')])

    expect(wrapper.find('.operation-inspector-btn').exists()).toBe(false)
  })
})
