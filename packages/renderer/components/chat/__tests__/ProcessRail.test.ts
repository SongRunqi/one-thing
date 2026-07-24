// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick, defineComponent, ref } from 'vue'
import ProcessRail from '../message/ProcessRail.vue'

// Stand-in for anything inside the rail that owns expansion state
// (StepsPanel / CollapseGroup / inline reasoning panel).
const StatefulChild = defineComponent({
  setup: () => ({ expanded: ref(false) }),
  template: `<div class="child" :class="{ 'is-expanded': expanded }" @click="expanded = !expanded">child</div>`,
})

function mountRail(streaming: boolean, solo = false) {
  return mount(ProcessRail, {
    props: { summary: '3 steps', streaming, solo },
    slots: { default: StatefulChild },
  })
}

const isOpen = (w: ReturnType<typeof mountRail>) =>
  w.find('.process-rail').classes().includes('is-open')

describe('ProcessRail expansion', () => {
  it('auto-opens while streaming and auto-collapses once settled', async () => {
    const w = mountRail(true)
    await nextTick()
    expect(isOpen(w)).toBe(true)

    await w.setProps({ streaming: false })
    await nextTick()
    expect(isOpen(w)).toBe(false)
  })

  it('keeps a manual toggle across the stream boundary', async () => {
    const w = mountRail(true)
    await nextTick()

    // user closes it mid-stream — must stay closed while still streaming
    await w.find('.process-rail-header').trigger('click')
    await nextTick()
    expect(isOpen(w)).toBe(false)

    // ...and must stay closed after the stream ends
    await w.setProps({ streaming: false })
    await nextTick()
    expect(isOpen(w)).toBe(false)
  })

  it('does not auto-collapse a rail the user explicitly opened mid-stream', async () => {
    const w = mountRail(true)
    await nextTick()
    await w.find('.process-rail-header').trigger('click') // close
    await w.find('.process-rail-header').trigger('click') // reopen explicitly
    await nextTick()
    expect(isOpen(w)).toBe(true)

    await w.setProps({ streaming: false })
    await nextTick()
    expect(isOpen(w)).toBe(true)
  })

  it('preserves inner expansion state when the rail auto-collapses and is reopened', async () => {
    const w = mountRail(true)
    await nextTick()

    // user expands a tool call inside the rail while it streams
    await w.find('.child').trigger('click')
    await nextTick()
    expect(w.find('.child').classes()).toContain('is-expanded')

    // stream ends -> rail auto-collapses (body hidden, not destroyed)
    await w.setProps({ streaming: false })
    await nextTick()
    expect(isOpen(w)).toBe(false)

    // reopening restores exactly what the user left open
    await w.find('.process-rail-header').trigger('click')
    await nextTick()
    expect(w.find('.child').classes()).toContain('is-expanded')
  })

  it('does not mount the body for a rail that never opened', async () => {
    const w = mountRail(false)
    await nextTick()
    expect(w.find('.process-rail-body').exists()).toBe(false)
    expect(w.find('.child').exists()).toBe(false)
  })

  it('always shows the body in solo mode', async () => {
    const w = mountRail(false, true)
    await nextTick()
    expect(w.find('.process-rail-header').exists()).toBe(false)
    expect(w.find('.child').isVisible()).toBe(true)
  })
})
