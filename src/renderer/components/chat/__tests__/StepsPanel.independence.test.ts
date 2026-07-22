// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import StepsPanel from '../StepsPanel.vue'
import type { Step, ToolCall } from '@/types'

function step(id: string, status: Step['status'] = 'completed', turnIndex = 1): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'read',
    toolName: 'read',
    status: status === 'running' ? 'executing' : status === 'completed' ? 'completed' : 'pending',
    arguments: { filePath: `/repo/src/${id}.ts` },
    timestamp: 1,
  }
  return {
    id,
    type: 'tool-call',
    title: `read: /repo/src/${id}.ts`,
    status,
    result: 'const value = 1',
    timestamp: 1,
    turnIndex,
    toolCallId: id,
    toolCall,
  }
}

function mountPanel(steps: Step[]) {
  return mount(StepsPanel, {
    props: { steps },
    global: {
      plugins: [createPinia()],
      stubs: {
        FartCallItem: { template: '<div class="fart-stub" />' },
        ToolActivityDetails: { template: '<div class="detail-stub" />' },
      },
    },
  })
}

const expandedFlags = (w: ReturnType<typeof mountPanel>) =>
  w.findAll('.operation-block').map(b => b.classes().includes('is-expanded'))

async function clickBlock(w: ReturnType<typeof mountPanel>, index: number) {
  await w.findAll('.operation-block > .collapse-panel-header')[index].trigger('click')
  await nextTick()
}

describe('StepsPanel: tool call expansion is independent (no accordion)', () => {
  it('expanding one tool call in the same turn does not collapse its siblings', async () => {
    const w = mountPanel([step('a'), step('b'), step('c')])
    await nextTick()
    // same turn => grouped; open the group first
    await w.find('.group-header').trigger('click')
    await nextTick()

    await clickBlock(w, 0)
    expect(expandedFlags(w)).toEqual([true, false, false])

    await clickBlock(w, 1)
    expect(expandedFlags(w)).toEqual([true, true, false])

    await clickBlock(w, 2)
    expect(expandedFlags(w)).toEqual([true, true, true])

    // collapsing one leaves the others alone
    await clickBlock(w, 1)
    expect(expandedFlags(w)).toEqual([true, false, true])
  })

  it('expanding one tool call across different turns does not collapse the others', async () => {
    const w = mountPanel([step('a', 'completed', 1), step('b', 'completed', 2), step('c', 'completed', 3)])
    await nextTick()

    await clickBlock(w, 0)
    await clickBlock(w, 2)
    expect(expandedFlags(w)).toEqual([true, false, true])
  })

  it('a tool call arriving mid-stream does not collapse an already-expanded sibling', async () => {
    const w = mountPanel([step('a', 'completed', 1)])
    await nextTick()
    await clickBlock(w, 0)
    expect(expandedFlags(w)).toEqual([true])

    // new tool call streams in, in a new turn
    await w.setProps({ steps: [step('a', 'completed', 1), step('b', 'running', 2)] })
    await nextTick()
    expect(expandedFlags(w)[0]).toBe(true)

    // ...and in the same turn (single -> grouped transition)
    await w.setProps({ steps: [step('a', 'completed', 1), step('b', 'running', 1)] })
    await nextTick()
    expect(expandedFlags(w)[0]).toBe(true)
  })

  it('an expanded activity keeps its group open when the group forms around it', async () => {
    const w = mountPanel([step('a', 'completed', 1)])
    await nextTick()
    await clickBlock(w, 0)
    expect(expandedFlags(w)).toEqual([true])

    // second call in the same turn turns the single row into a group
    await w.setProps({ steps: [step('a', 'completed', 1), step('b', 'completed', 1)] })
    await nextTick()

    expect(w.find('.workflow-group').classes()).toContain('is-expanded')
    expect(expandedFlags(w)[0]).toBe(true)
  })
})
