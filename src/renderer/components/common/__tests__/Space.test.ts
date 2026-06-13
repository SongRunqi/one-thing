// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import Space from '../Space.vue'
import {
  createSpaceItemStyle,
  createSpaceStyle,
  resolveSpaceGaps,
} from '../space'

const TestDivider = defineComponent({
  name: 'TestDivider',
  setup() {
    return () => h('span', { class: 'divider' }, '|')
  },
})

describe('Space', () => {
  it('renders spacing without wrapping plain children', () => {
    const wrapper = mount(Space, {
      props: {
        as: 'section',
        size: 'large',
        wrap: true,
        align: 'flex-start',
      },
      slots: {
        default: [
          h('button', { class: 'first' }, 'First'),
          h('button', { class: 'second' }, 'Second'),
        ],
      },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.classes()).toContain('app-space--horizontal')
    expect(wrapper.classes()).toContain('is-wrap')
    expect(wrapper.findAll('.app-space__item')).toHaveLength(0)
    expect(wrapper.element.children).toHaveLength(2)
    expect(wrapper.element.children[0]).toBe(wrapper.find('.first').element)
    expect(wrapper.find('.first').text()).toBe('First')
    expect(wrapper.attributes('style')).toContain('--app-space-row-gap: 16px')
    expect(wrapper.attributes('style')).toContain('--app-space-column-gap: 16px')
    expect(wrapper.attributes('style')).toContain('--app-space-align-items: flex-start')
  })

  it('supports vertical direction with custom tuple sizes', () => {
    const wrapper = mount(Space, {
      props: {
        direction: 'vertical',
        size: [24, '2rem'],
        alignment: 'stretch',
      },
      slots: {
        default: [
          h('div', 'Alpha'),
          h('div', 'Beta'),
        ],
      },
    })

    expect(wrapper.classes()).toContain('app-space--vertical')
    expect(wrapper.classes()).not.toContain('is-wrap')
    expect(wrapper.classes()).not.toContain('has-item-wrapper')
    expect(wrapper.findAll('.app-space__item')).toHaveLength(0)
    expect(wrapper.attributes('style')).toContain('--app-space-column-gap: 24px')
    expect(wrapper.attributes('style')).toContain('--app-space-row-gap: 2rem')
    expect(wrapper.attributes('style')).toContain('--app-space-align-items: stretch')
  })

  it('renders string, number, slot, and vnode spacers between items', () => {
    const stringSpacer = mount(Space, {
      props: {
        spacer: '/',
      },
      slots: {
        default: [
          h('span', 'A'),
          h('span', 'B'),
          h('span', 'C'),
        ],
      },
    })

    expect(stringSpacer.findAll('.app-space__separator')).toHaveLength(2)
    expect(stringSpacer.findAll('.app-space__item')).toHaveLength(3)
    expect(stringSpacer.findAll('.app-space__separator').map(node => node.text())).toEqual(['/', '/'])

    const numberSpacer = mount(Space, {
      props: {
        spacer: 1,
      },
      slots: {
        default: [
          h('span', 'A'),
          h('span', 'B'),
        ],
      },
    })

    expect(numberSpacer.find('.app-space__separator').text()).toBe('1')

    const slotSpacer = mount(Space, {
      slots: {
        default: [
          h('span', 'A'),
          h('span', 'B'),
        ],
        spacer: ({ index }: { index: number }) => h('em', { class: 'slot-spacer' }, index + 1),
      },
    })

    expect(slotSpacer.find('.slot-spacer').text()).toBe('1')

    const vnodeSpacer = mount(Space, {
      props: {
        spacer: h(TestDivider),
      },
      slots: {
        default: [
          h('span', 'A'),
          h('span', 'B'),
          h('span', 'C'),
        ],
      },
    })

    expect(vnodeSpacer.findAll('.divider')).toHaveLength(2)
  })

  it('applies fill differently for horizontal and vertical layouts', () => {
    const horizontal = mount(Space, {
      props: {
        fill: true,
        fillRatio: 50,
      },
      slots: {
        default: [
          h('div', 'A'),
          h('div', 'B'),
        ],
      },
    })

    expect(horizontal.classes()).toContain('is-fill')
    expect(horizontal.classes()).toContain('is-wrap')
    expect(horizontal.find('.app-space__item').attributes('style')).toContain('flex-grow: 1')
    expect(horizontal.find('.app-space__item').attributes('style')).toContain('min-width: 50%')

    const verticalStyle = createSpaceItemStyle({
      direction: 'vertical',
      fill: true,
      fillRatio: 75,
    })

    expect(verticalStyle.width).toBe('75%')
    expect(verticalStyle.maxWidth).toBe('100%')
    expect(verticalStyle.flexGrow).toBeUndefined()
  })

  it('normalizes built-in and custom size values', () => {
    expect(resolveSpaceGaps('small')).toEqual({ rowGap: '8px', columnGap: '8px' })
    expect(resolveSpaceGaps('default')).toEqual({ rowGap: '12px', columnGap: '12px' })
    expect(resolveSpaceGaps('large')).toEqual({ rowGap: '16px', columnGap: '16px' })
    expect(resolveSpaceGaps('20')).toEqual({ rowGap: '20px', columnGap: '20px' })
    expect(resolveSpaceGaps(['1rem', 18])).toEqual({ rowGap: '18px', columnGap: '1rem' })

    expect(createSpaceStyle({})['--app-space-row-gap']).toBe('8px')
    expect(createSpaceStyle({})['--app-space-column-gap']).toBe('8px')

    const style = createSpaceStyle({
      size: 'calc(1rem + 2px)',
      alignment: 'baseline',
      fillRatio: Number.NaN,
    })

    expect(style['--app-space-row-gap']).toBe('calc(1rem + 2px)')
    expect(style['--app-space-column-gap']).toBe('calc(1rem + 2px)')
    expect(style['--app-space-align-items']).toBe('baseline')
    expect(style['--app-space-fill-ratio']).toBe('100%')
  })
})
