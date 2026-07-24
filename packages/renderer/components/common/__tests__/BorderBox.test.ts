// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BorderBox from '../BorderBox.vue'
import {
  borderRadiusOptions,
  borderShadowOptions,
  borderStyleOptions,
  createBorderBoxStyle,
} from '../border'

describe('BorderBox', () => {
  it('renders a configurable bordered surface', () => {
    const wrapper = mount(BorderBox, {
      props: {
        as: 'section',
        borderStyle: 'dashed',
        radius: 'lg',
        shadow: 'md',
        padding: 'lg',
        surface: 'panel',
      },
      slots: {
        default: '<span class="content">Content</span>',
      },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.find('.content').text()).toBe('Content')
    expect(wrapper.attributes('style')).toContain('--border-box-border-style: dashed')
    expect(wrapper.attributes('style')).toContain('--border-box-border-radius: var(--radius-lg)')
    expect(wrapper.attributes('style')).toContain('--border-box-shadow: var(--shadow-md)')
    expect(wrapper.attributes('style')).toContain('--border-box-padding: var(--space-4)')
    expect(wrapper.attributes('style')).toContain('--border-box-background: var(--ui-surface-panel-bg, var(--panel))')
  })

  it('exposes style, radius, and shadow option sets', () => {
    expect(borderStyleOptions.map(option => option.value)).toEqual(['solid', 'dashed', 'hidden'])
    expect(borderRadiusOptions.map(option => option.value)).toEqual(['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'])
    expect(borderShadowOptions.map(option => option.value)).toContain('floating')
  })

  it('normalizes core border values to theme tokens', () => {
    const style = createBorderBoxStyle({
      borderStyle: 'solid',
      radius: 'full',
      shadow: 'floating',
      width: 2,
      padding: 10,
      tone: 'accent',
    })

    expect(style['--border-box-border-style']).toBe('solid')
    expect(style['--border-box-border-radius']).toBe('var(--radius-full)')
    expect(style['--border-box-shadow']).toBe('var(--shadow-floating)')
    expect(style['--border-box-border-width']).toBe('2px')
    expect(style['--border-box-padding']).toBe('10px')
    expect(style['--border-box-border-color']).toContain('--ui-accent-primary-fg')
  })

  it('supports hidden borders as an explicit style option', () => {
    expect(createBorderBoxStyle({ borderStyle: 'hidden' })['--border-box-border-style']).toBe('hidden')
  })

  it('allows callers to supply exact border values for composed controls', () => {
    const style = createBorderBoxStyle({
      borderStyle: 'dashed',
      radiusValue: '7px',
      borderColor: 'var(--control-border)',
      hoverBorderColor: 'var(--control-hover-border)',
      background: 'var(--control-bg)',
      hoverBackground: 'var(--control-hover-bg)',
      shadowValue: 'var(--control-shadow)',
      hoverShadowValue: 'var(--control-hover-shadow)',
      focusRingColor: 'var(--control-focus-ring)',
    })

    expect(style['--border-box-border-style']).toBe('dashed')
    expect(style['--border-box-border-radius']).toBe('7px')
    expect(style['--border-box-border-color']).toBe('var(--control-border)')
    expect(style['--border-box-hover-border-color']).toBe('var(--control-hover-border)')
    expect(style['--border-box-background']).toBe('var(--control-bg)')
    expect(style['--border-box-hover-background']).toBe('var(--control-hover-bg)')
    expect(style['--border-box-shadow']).toBe('var(--control-shadow)')
    expect(style['--border-box-hover-shadow']).toBe('var(--control-hover-shadow)')
    expect(style['--border-box-focus-ring-color']).toBe('var(--control-focus-ring)')
  })
})
