// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AppSwitch from '../Switch.vue'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup() {
    return () => h('svg', { class: 'test-icon', viewBox: '0 0 16 16' })
  },
})

describe('Switch', () => {
  it('renders a controlled switch and emits v-model updates', async () => {
    const wrapper = mount(AppSwitch, {
      props: {
        modelValue: false,
        ariaLabel: 'Enable sync',
      },
    })

    const button = wrapper.find('button')
    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-checked')).toBe('false')
    expect(button.attributes('aria-label')).toBe('Enable sync')
    expect(wrapper.classes()).toContain('app-switch--default')

    await button.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(wrapper.emitted('change')).toEqual([[true]])

    await wrapper.setProps({ modelValue: true })
    expect(button.attributes('aria-checked')).toBe('true')
    expect(wrapper.classes()).toContain('is-checked')
  })

  it('supports extended values, size, width, color props, and hidden input names', async () => {
    const wrapper = mount(AppSwitch, {
      props: {
        modelValue: '0',
        activeValue: '100',
        inactiveValue: '0',
        size: 'large',
        width: '60',
        name: 'billing',
        activeColor: '#13ce66',
        inactiveColor: '#ff4949',
        borderColor: '#222',
      },
    })

    expect(wrapper.classes()).toContain('app-switch--large')
    expect(wrapper.attributes('style')).toContain('--app-switch-width: 60px')
    expect(wrapper.attributes('style')).toContain('--app-switch-on-color: #13ce66')
    expect(wrapper.attributes('style')).toContain('--app-switch-off-color: #ff4949')
    expect(wrapper.attributes('style')).toContain('--app-switch-border-color: #222')
    expect(wrapper.find('input[type="hidden"]').attributes('name')).toBe('billing')
    expect(wrapper.find('input[type="hidden"]').attributes('value')).toBe('0')

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['100']])
    expect(wrapper.emitted('change')).toEqual([['100']])
  })

  it('renders outside labels and inline prompts with text or icons', async () => {
    const wrapper = mount(AppSwitch, {
      props: {
        modelValue: true,
        activeText: 'Enabled',
        inactiveText: 'Disabled',
      },
    })

    expect(wrapper.find('.app-switch-label--active').text()).toBe('Enabled')
    expect(wrapper.find('.app-switch-label--inactive').text()).toBe('Disabled')

    await wrapper.setProps({ inlinePrompt: true })
    expect(wrapper.find('.app-switch-label--active').exists()).toBe(false)
    expect(wrapper.find('.app-switch-inline-text').text()).toBe('E')

    await wrapper.setProps({ modelValue: false })
    expect(wrapper.find('.app-switch-inline-text').text()).toBe('D')

    await wrapper.setProps({ activeIcon: TestIcon, modelValue: true })
    expect(wrapper.find('.test-icon').exists()).toBe(true)
    expect(wrapper.find('.app-switch-inline-text').exists()).toBe(false)
  })

  it('renders custom action icons and action slots', async () => {
    const wrapper = mount(AppSwitch, {
      props: {
        modelValue: true,
        activeActionIcon: TestIcon,
        inactiveActionIcon: TestIcon,
      },
    })

    expect(wrapper.find('.app-switch-action .test-icon').exists()).toBe(true)

    await wrapper.setProps({ modelValue: false })
    expect(wrapper.find('.app-switch-action .test-icon').exists()).toBe(true)

    const slotted = mount(AppSwitch, {
      props: {
        modelValue: true,
      },
      slots: {
        'active-action': '<span class="custom-active-action">T</span>',
        'inactive-action': '<span class="custom-inactive-action">F</span>',
      },
    })

    expect(slotted.find('.custom-active-action').text()).toBe('T')
  })

  it('prevents interaction while disabled or loading', async () => {
    const wrapper = mount(AppSwitch, {
      props: {
        modelValue: false,
        disabled: true,
      },
    })

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('aria-disabled')).toBe('true')

    await wrapper.setProps({ disabled: false, loading: true })
    expect(wrapper.find('.app-switch-spinner').exists()).toBe(true)

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('honors beforeChange guards and asynchronous approval', async () => {
    const blockChange = vi.fn(() => false)
    const wrapper = mount(AppSwitch, {
      props: {
        modelValue: false,
        beforeChange: blockChange,
      },
    })

    await wrapper.find('button').trigger('click')
    expect(blockChange).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    const approveChange = vi.fn(() => Promise.resolve(true))
    await wrapper.setProps({ beforeChange: approveChange })
    await wrapper.find('button').trigger('click')
    await nextTick()
    await nextTick()

    expect(approveChange).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])

    const rejectChange = vi.fn(() => Promise.reject(new Error('nope')))
    await wrapper.setProps({
      modelValue: true,
      beforeChange: rejectChange,
    })

    await wrapper.find('button').trigger('click')
    await nextTick()
    await nextTick()

    expect(rejectChange).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('exposes focus', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const wrapper = mount(AppSwitch, {
      attachTo: host,
      props: {
        modelValue: false,
      },
    })

    wrapper.vm.focus()
    await nextTick()

    expect(document.activeElement).toBe(wrapper.find('button').element)

    wrapper.unmount()
    host.remove()
  })
})

