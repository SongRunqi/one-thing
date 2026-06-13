// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import Link from '../Link.vue'
import { normalizeLinkUnderline } from '../link'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup() {
    return () => h('svg', { class: 'test-icon', viewBox: '0 0 16 16' })
  },
})

describe('Link', () => {
  it('renders a themed text link with safe external attributes', () => {
    const wrapper = mount(Link, {
      props: {
        href: 'https://example.com',
        target: '_blank',
      },
      slots: {
        default: 'Open docs',
      },
    })

    const link = wrapper.find('a')
    expect(link.classes()).toContain('app-link')
    expect(link.classes()).toContain('app-link--underline-hover')
    expect(link.attributes('href')).toBe('https://example.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toBe('Open docs')
  })

  it('emits clicks only when enabled', async () => {
    const handleClick = vi.fn()
    const wrapper = mount(Link, {
      props: {
        href: '/settings',
        onClick: handleClick,
      },
      slots: {
        default: 'Settings',
      },
    })

    await wrapper.find('a').trigger('click')
    expect(handleClick).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ disabled: true })
    const link = wrapper.find('a')
    await link.trigger('click')

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(link.classes()).toContain('is-disabled')
    expect(link.attributes('href')).toBeUndefined()
    expect(link.attributes('aria-disabled')).toBe('true')
    expect(link.attributes('tabindex')).toBe('-1')
    expect(link.attributes('role')).toBe('link')
  })

  it('normalizes underline modes from booleans and strings', async () => {
    expect(normalizeLinkUnderline(undefined)).toBe('hover')
    expect(normalizeLinkUnderline(true)).toBe('always')
    expect(normalizeLinkUnderline(false)).toBe('none')
    expect(normalizeLinkUnderline('hover')).toBe('hover')

    const wrapper = mount(Link, {
      props: {
        underline: true,
      },
      slots: {
        default: 'Always underlined',
      },
    })

    expect(wrapper.find('a').classes()).toContain('app-link--underline-always')

    await wrapper.setProps({ underline: false })
    expect(wrapper.find('a').classes()).toContain('app-link--underline-none')

    await wrapper.setProps({ underline: 'hover' })
    expect(wrapper.find('a').classes()).toContain('app-link--underline-hover')
  })

  it('supports prop icons and slotted trailing icons', () => {
    const propIcon = mount(Link, {
      props: {
        icon: TestIcon,
      },
      slots: {
        default: 'With icon',
      },
    })

    expect(propIcon.find('.test-icon').exists()).toBe(true)
    expect(propIcon.find('a').classes()).toContain('has-icon')
    expect(propIcon.find('a').classes()).toContain('is-icon-start')
    expect(propIcon.findAll('.app-link-icon')).toHaveLength(1)

    const slottedIcon = mount(Link, {
      props: {
        iconPosition: 'end',
      },
      slots: {
        default: 'Open',
        icon: '<svg class="slot-icon" />',
      },
    })

    expect(slottedIcon.find('.slot-icon').exists()).toBe(true)
    expect(slottedIcon.find('a').classes()).toContain('is-icon-end')
    expect(slottedIcon.findAll('.app-link-icon')).toHaveLength(1)
  })
})
