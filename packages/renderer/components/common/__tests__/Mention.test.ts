// @vitest-environment happy-dom
import { DOMWrapper, enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Mention from '../Mention.vue'

const options = [
  { label: 'Jeremy', value: 'Jeremy' },
  { label: 'Fuphoenixes', value: 'Fuphoenixes' },
  { label: 'Disabled', value: 'Disabled', disabled: true },
]

/**
 * P5: the panel runs on `useFloatingLayer` and is teleported to `document.body`,
 * so it is no longer inside the wrapper's subtree — `wrapper.find` cannot see
 * it. Query the document instead, which is also what a user's pointer does.
 */
function optionNodes() {
  return Array.from(document.querySelectorAll('.app-mention-option'))
    .map(element => new DOMWrapper(element))
}

// Wiping `document.body` is not the same as unmounting: a wrapper left alive
// still has the kernel's window-level Escape/pointer listeners bound, and the
// next test's key press re-renders it into DOM that no longer exists.
enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Mention', () => {
  it('searches after a prefix and replaces the active token on select', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: {
        modelValue: '',
        options,
        placeholder: 'Mention someone',
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('@je')
    await nextTick()

    expect(wrapper.emitted('search')?.at(-1)).toEqual(['je', '@'])
    expect(optionNodes()).toHaveLength(1)
    expect(optionNodes()[0].text()).toContain('Jeremy')

    await optionNodes()[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['@Jeremy '])
    expect(wrapper.emitted('select')?.at(-1)).toEqual([options[0], '@'])
  })

  it('supports custom option props, prefix arrays, and keyboard selection', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: {
        modelValue: '',
        prefix: ['@', '#'],
        props: {
          label: 'name',
          value: 'id',
          disabled: 'unable',
        },
        options: [
          { name: 'Issue 12', id: '12' },
          { name: 'Issue 13', id: '13', unable: true },
        ],
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('ship #is')
    await nextTick()

    expect(wrapper.emitted('search')?.at(-1)).toEqual(['is', '#'])
    expect(optionNodes()).toHaveLength(2)

    await wrapper.find('.app-mention').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['ship #12 '])
  })

  it('removes a completed mention as a whole on backspace', async () => {
    const value = 'Hello @Jeremy '
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: {
        modelValue: value,
        options,
        whole: true,
      },
    })

    const input = wrapper.find('input')
    const element = input.element as HTMLInputElement
    await input.trigger('focus')
    element.setSelectionRange(value.length, value.length)

    await wrapper.find('.app-mention').trigger('keydown', { key: 'Backspace' })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Hello '])
    expect(wrapper.emitted('whole-remove')?.at(-1)).toEqual(['Jeremy', '@'])
  })

  it('renders textarea mode and custom label slot content', async () => {
    const wrapper = mount(Mention, {
      props: {
        modelValue: '',
        type: 'textarea',
        options,
      },
      slots: {
        label: '<span class="custom-label">{{ item.value }}</span>',
      },
    })

    await wrapper.find('textarea').trigger('focus')
    await wrapper.find('textarea').setValue('@fup')
    await nextTick()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(document.querySelector('.custom-label')?.textContent).toBe('Fuphoenixes')
  })

  it('teleports the panel to body and lets the caller pick the z stop', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: { modelValue: '', options, zLayer: 'modal' as const },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('@je')
    await nextTick()

    const panel = document.querySelector<HTMLElement>('.app-mention-dropdown')
    expect(panel).not.toBeNull()
    // Outside the component's own subtree — that is what buys viewport
    // flipping instead of being clipped by whatever scrolls above it.
    expect(wrapper.element.contains(panel!)).toBe(false)
    expect(panel!.style.position).toBe('fixed')
    expect(panel!.style.zIndex).toBe('calc(var(--z-modal) + 20)')
  })

  it('stays dismissed after Escape until the query actually changes', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: { modelValue: '', options },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('@je')
    await nextTick()
    expect(optionNodes()).toHaveLength(1)

    // The kernel answers Escape on a window capture listener.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    // …and the key coming back up re-runs the trigger scan over UNCHANGED text.
    // Without the dismissal latch that put the list straight back on screen.
    await input.trigger('keyup')
    await nextTick()
    expect(optionNodes()).toHaveLength(0)

    // One more character is a new question, so the list is allowed back.
    await input.setValue('@jer')
    await nextTick()
    expect(optionNodes()).toHaveLength(1)
  })

  it('closes the list after a pick instead of re-reading the caret mid-insertion', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: { modelValue: '', options },
    })
    // A real parent binds the value back, which is what used to re-open the
    // list: the text was already '@Jeremy ' while the caret was still at 3.
    wrapper.vm.$.vnode.props!['onUpdate:modelValue'] = (v: string) => wrapper.setProps({ modelValue: v })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('@je')
    await nextTick()

    await optionNodes()[0].trigger('click')
    await nextTick()
    await nextTick()

    expect(optionNodes()).toHaveLength(0)
  })

  it('keeps the panel in the caller DOM when teleported is off', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: { modelValue: '', options, teleported: false },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('@je')
    await nextTick()

    expect(wrapper.find('.app-mention-dropdown').exists()).toBe(true)
  })
})
