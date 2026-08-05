// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import Checkbox from '../Checkbox.vue'

describe('Checkbox', () => {
  it('renders a controlled checkbox and emits v-model updates', async () => {
    const wrapper = mount(Checkbox, {
      props: { modelValue: false, label: 'Include drafts' },
    })

    const input = wrapper.find('input[type="checkbox"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).toContain('Include drafts')
    expect(wrapper.classes()).toContain('app-checkbox--default')
    expect(wrapper.classes()).not.toContain('is-checked')

    await input.setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(wrapper.emitted('change')).toEqual([[true]])

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.classes()).toContain('is-checked')
  })

  it('supports a custom value pair', async () => {
    const wrapper = mount(Checkbox, {
      props: { modelValue: 'off', trueValue: 'on', falseValue: 'off' },
    })

    await wrapper.find('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([['on']])

    await wrapper.setProps({ modelValue: 'on' })
    expect(wrapper.classes()).toContain('is-checked')

    await wrapper.find('input').setValue(false)
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['off'])
  })

  it('drives the DOM-only indeterminate property and drops it once checked', async () => {
    const wrapper = mount(Checkbox, {
      props: { modelValue: false, indeterminate: true, label: 'All tools' },
    })
    await nextTick()

    const input = wrapper.find('input').element as HTMLInputElement
    expect(input.indeterminate).toBe(true)
    expect(wrapper.classes()).toContain('is-indeterminate')

    await wrapper.setProps({ indeterminate: false, modelValue: true })
    await nextTick()
    expect(input.indeterminate).toBe(false)
    expect(wrapper.classes()).not.toContain('is-indeterminate')
    expect(wrapper.classes()).toContain('is-checked')
  })

  it('does not emit while disabled', async () => {
    const wrapper = mount(Checkbox, {
      props: { modelValue: false, disabled: true, label: 'Locked' },
    })

    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.classes()).toContain('is-disabled')

    // A disabled input swallows the click; the change handler never runs.
    await input.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps the keyboard contract with the UA: a real, focusable input', async () => {
    // Space-to-toggle is browser behaviour, and it only survives if the input
    // stays a focus stop. `display:none` / `visibility:hidden` / `tabindex=-1`
    // would each silently take it away, so those are what this guards.
    const wrapper = mount(Checkbox, {
      props: { modelValue: false, label: 'Keyboard' },
      attachTo: document.body,
    })

    const input = wrapper.find('input').element as HTMLInputElement
    expect(input.getAttribute('tabindex')).toBeNull()
    expect(input.hidden).toBe(false)

    wrapper.vm.focus()
    await nextTick()
    expect(document.activeElement).toBe(input)

    // The UA turns Space into a click on the input; that click is what the
    // component listens to (via `change`), so it cannot drift from the label.
    await wrapper.find('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])

    wrapper.unmount()
  })

  it('wires the description up as aria-describedby', () => {
    const wrapper = mount(Checkbox, {
      props: { modelValue: true, label: 'Sync', description: 'Runs every 5 minutes' },
    })

    const describedBy = wrapper.find('input').attributes('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(wrapper.find(`#${describedBy}`).text()).toBe('Runs every 5 minutes')
  })
})
