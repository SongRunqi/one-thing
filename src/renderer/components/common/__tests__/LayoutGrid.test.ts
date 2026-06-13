// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import Layout from '../Layout.vue'
import LayoutGrid from '../LayoutGrid.vue'
import LayoutItem from '../LayoutItem.vue'
import LayoutGridItem from '../LayoutGridItem.vue'
import { createLayoutGridItemStyle, createLayoutGridStyle } from '../layout'

describe('LayoutGrid', () => {
  it('exposes Layout and LayoutItem aliases for the default flex API', () => {
    const wrapper = mount(Layout, {
      slots: {
        default: () => h(LayoutItem, { span: 12 }, () => 'Half'),
      },
    })

    expect(wrapper.find('.layout-grid').classes()).toContain('type-flex')
    expect(wrapper.find('.layout-grid-item').attributes('style')).toContain('--layout-grid-item-flex: 0 0 50%')
  })

  it('defaults to flex layout without requiring type="flex"', () => {
    const wrapper = mount(LayoutGrid, {
      props: {
        as: 'section',
        gap: 'md',
        columnGap: 20,
        alignItems: 'center',
        justifyContent: 'between',
      },
      slots: {
        default: '<div class="cell">Cell</div>',
      },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.classes()).toContain('type-flex')
    expect(wrapper.classes()).not.toContain('type-grid')
    expect(wrapper.find('.cell').text()).toBe('Cell')
    expect(wrapper.attributes('style')).toContain('--layout-grid-gap: 12px')
    expect(wrapper.attributes('style')).toContain('--layout-grid-column-gap: 20px')
    expect(wrapper.attributes('style')).toContain('--layout-grid-align-items: center')
    expect(wrapper.attributes('style')).toContain('--layout-grid-justify-content: space-between')
  })

  it('keeps grid mode available when requested', () => {
    const wrapper = mount(LayoutGrid, {
      props: {
        type: 'grid',
        columns: 6,
        justifyItems: 'end',
      },
    })

    expect(wrapper.classes()).toContain('type-grid')
    expect(wrapper.attributes('style')).toContain('--layout-grid-columns: repeat(6, minmax(0, 1fr))')
    expect(wrapper.attributes('style')).toContain('--layout-grid-justify-items: end')
  })

  it('creates responsive variables for columns, gaps, flow, and content alignment', () => {
    const style = createLayoutGridStyle({
      columns: {
        base: 4,
        md: 30,
        xl: 'repeat(3, minmax(0, 1fr))',
      },
      gap: {
        base: 'xs',
        sm: 'lg',
      },
      rowGap: {
        lg: 28,
      },
      direction: {
        base: 'row',
        md: 'column',
      },
      wrap: {
        base: true,
        lg: 'wrap-reverse',
      },
      autoFlow: {
        base: 'row',
        lg: 'row dense',
      },
      justifyContent: {
        base: 'between',
        md: 'center',
      },
    })

    expect(style['--layout-grid-columns']).toBe('repeat(4, minmax(0, 1fr))')
    expect(style['--layout-grid-columns-md']).toBe('repeat(24, minmax(0, 1fr))')
    expect(style['--layout-grid-columns-xl']).toBe('repeat(3, minmax(0, 1fr))')
    expect(style['--layout-grid-gap']).toBe('4px')
    expect(style['--layout-grid-gap-sm']).toBe('16px')
    expect(style['--layout-grid-row-gap-lg']).toBe('28px')
    expect(style['--layout-grid-direction-md']).toBe('column')
    expect(style['--layout-grid-wrap']).toBe('wrap')
    expect(style['--layout-grid-wrap-lg']).toBe('wrap-reverse')
    expect(style['--layout-grid-auto-flow-lg']).toBe('row dense')
    expect(style['--layout-grid-justify-content']).toBe('space-between')
  })
})

describe('LayoutGridItem', () => {
  it('uses 24-column flex units for span and offset', () => {
    const wrapper = mount(LayoutGridItem, {
      props: {
        as: 'article',
        span: 6,
        offset: 2,
        alignSelf: 'center',
        justifySelf: 'end',
      },
      slots: {
        default: 'Item',
      },
    })

    expect(wrapper.element.tagName).toBe('ARTICLE')
    expect(wrapper.text()).toBe('Item')
    expect(wrapper.attributes('style')).toContain('--layout-grid-item-flex: 0 0 25%')
    expect(wrapper.attributes('style')).toContain('--layout-grid-item-max-width: 25%')
    expect(wrapper.attributes('style')).toContain('--layout-grid-item-offset: 8.333333%')
    expect(wrapper.attributes('style')).toContain('--layout-grid-item-column: 3 / span 6')
    expect(wrapper.attributes('style')).toContain('--layout-grid-item-align-self: center')
    expect(wrapper.attributes('style')).toContain('--layout-grid-item-justify-self: end')
  })

  it('clamps column units to the 0-24 range', () => {
    expect(createLayoutGridItemStyle({ span: 30 })['--layout-grid-item-flex']).toBe('0 0 100%')
    expect(createLayoutGridItemStyle({ span: 30 })['--layout-grid-item-column']).toBe('auto / span 24')
    expect(createLayoutGridItemStyle({ span: -4 })['--layout-grid-item-display']).toBe('none')
    expect(createLayoutGridItemStyle({ span: 0 })['--layout-grid-item-flex']).toBe('0 0 0')
    expect(createLayoutGridItemStyle({ offset: 99 })['--layout-grid-item-offset']).toBe('100%')
  })

  it('combines inherited spans with responsive offsets and ordering', () => {
    const style = createLayoutGridItemStyle({
      span: {
        base: 24,
        md: 8,
      },
      offset: {
        lg: 2,
      },
      order: {
        base: 1,
        xl: -1,
      },
      alignSelf: {
        md: 'start',
      },
    })

    expect(style['--layout-grid-item-flex']).toBe('0 0 100%')
    expect(style['--layout-grid-item-flex-md']).toBe('0 0 33.333333%')
    expect(style['--layout-grid-item-column']).toBe('auto / span 24')
    expect(style['--layout-grid-item-column-md']).toBe('auto / span 8')
    expect(style['--layout-grid-item-column-lg']).toBe('3 / span 8')
    expect(style['--layout-grid-item-offset-lg']).toBe('8.333333%')
    expect(style['--layout-grid-item-order']).toBe(1)
    expect(style['--layout-grid-item-order-xl']).toBe(-1)
    expect(style['--layout-grid-item-align-self-md']).toBe('start')
  })

  it('supports full-width and explicit column starts', () => {
    expect(createLayoutGridItemStyle({ span: 'full' })['--layout-grid-item-flex']).toBe('0 0 100%')
    expect(createLayoutGridItemStyle({ span: 'full' })['--layout-grid-item-column']).toBe('auto / span 24')
    expect(createLayoutGridItemStyle({ start: 4, span: 3 })['--layout-grid-item-column']).toBe('4 / span 3')
  })
})
