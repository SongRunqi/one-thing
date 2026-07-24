// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import BorderBox from '../BorderBox.vue'
import Button from '../Button.vue'
import ButtonGroup from '../ButtonGroup.vue'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup() {
    return () => h('svg', { class: 'test-icon', viewBox: '0 0 16 16' })
  },
})

describe('Button', () => {
  it('renders semantic type, size, and style modifier classes', () => {
    const wrapper = mount(Button, {
      props: {
        type: 'primary',
        size: 'large',
        plain: true,
        round: true,
        dashed: true,
      },
      slots: {
        default: 'Save',
      },
    })

    const button = wrapper.find('button')
    expect(wrapper.findComponent(BorderBox).exists()).toBe(true)
    expect(button.classes()).toContain('border-box')
    expect(button.classes()).toContain('app-button--primary')
    expect(button.classes()).toContain('app-button--large')
    expect(button.classes()).toContain('is-plain')
    expect(button.classes()).toContain('is-round')
    expect(button.classes()).toContain('is-dashed')
    expect(button.text()).toBe('Save')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('style')).toContain('--border-box-border-style: dashed')
    expect(button.attributes('style')).toContain('--border-box-border-radius: 999px')
    expect(button.attributes('style')).toContain('--border-box-border-color: var(--app-button-border)')
  })

  it('emits click events only when interactive', async () => {
    const handleClick = vi.fn()
    const wrapper = mount(Button, {
      props: {
        onClick: handleClick,
      },
      slots: {
        default: 'Run',
      },
    })

    await wrapper.find('button').trigger('click')
    expect(handleClick).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ disabled: true })
    await wrapper.find('button').trigger('click')
    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('aria-disabled')).toBe('true')
  })

  it('supports icon-only and loading button states', async () => {
    const wrapper = mount(Button, {
      props: {
        icon: TestIcon,
        circle: true,
      },
    })

    expect(wrapper.find('.test-icon').exists()).toBe(true)
    expect(wrapper.find('button').classes()).toContain('is-circle')
    expect(wrapper.find('button').classes()).toContain('is-icon-only')

    await wrapper.setProps({ loading: true, loadingText: 'Saving' })

    expect(wrapper.find('.test-icon').exists()).toBe(false)
    expect(wrapper.find('.app-button-spinner').exists()).toBe(true)
    expect(wrapper.find('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toBe('Saving')
  })

  it('applies custom button colors through CSS variables', () => {
    const wrapper = mount(Button, {
      props: {
        color: 'rgb(124, 58, 237)',
        textColor: 'var(--color-neutral-basic-white)',
      },
      slots: {
        default: 'Custom',
      },
    })

    expect(wrapper.find('button').classes()).toContain('has-custom-color')
    expect(wrapper.attributes('style')).toContain('--app-button-custom-color: rgb(124, 58, 237)')
    expect(wrapper.attributes('style')).toContain('--app-button-custom-fg: var(--color-neutral-basic-white)')
    expect(wrapper.attributes('style')).toContain('--border-box-border-color: var(--app-button-border)')
  })

  it('supports unstyled migration mode while still using the border box root', () => {
    const wrapper = mount(Button, {
      props: {
        unstyled: true,
      },
      attrs: {
        class: 'legacy-icon-button',
      },
      slots: {
        default: 'Legacy',
      },
    })

    const button = wrapper.find('button')
    expect(wrapper.findComponent(BorderBox).exists()).toBe(true)
    expect(button.classes()).toContain('app-button')
    expect(button.classes()).toContain('is-unstyled')
    expect(button.classes()).toContain('legacy-icon-button')
    expect(button.attributes('style')).toContain('--border-box-border-width: 0px')
    expect(button.text()).toBe('Legacy')
  })
})

describe('ButtonGroup', () => {
  it('provides shared defaults to child buttons', () => {
    const wrapper = mount(ButtonGroup, {
      props: {
        type: 'danger',
        size: 'small',
        plain: true,
        dashed: true,
        disabled: true,
      },
      slots: {
        default: [
          h(Button, null, { default: () => 'Cancel' }),
          h(Button, { type: 'primary' }, { default: () => 'Confirm' }),
        ],
      },
    })

    const buttons = wrapper.findAll('button')
    expect(wrapper.find('.button-group').classes()).toContain('is-attached')
    expect(buttons[0].classes()).toContain('app-button--danger')
    expect(buttons[0].classes()).toContain('app-button--small')
    expect(buttons[0].classes()).toContain('is-plain')
    expect(buttons[0].classes()).toContain('is-dashed')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].classes()).toContain('app-button--primary')
  })
})
