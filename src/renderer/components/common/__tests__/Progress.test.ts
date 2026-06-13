// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Progress from '../Progress.vue'
import { normalizeProgressPercentage, resolveProgressColor } from '../progress'

describe('Progress', () => {
  it('renders a line progressbar with clamped percentage text', () => {
    const wrapper = mount(Progress, {
      props: {
        percentage: 140,
      },
    })

    const root = wrapper.find('[role="progressbar"]')
    expect(root.classes()).toContain('app-progress--line')
    expect(root.attributes('aria-valuenow')).toBe('100')
    expect(root.attributes('style')).toContain('--app-progress-bar-width: 100%')
    expect(wrapper.find('.app-progress-text--outside').text()).toBe('100%')
  })

  it('supports inside text and custom formatters', () => {
    const wrapper = mount(Progress, {
      props: {
        percentage: 100,
        textInside: true,
        strokeWidth: 22,
        format: (percentage: number) => percentage === 100 ? 'Done' : `${percentage}%`,
      },
    })

    expect(wrapper.classes()).toContain('is-text-inside')
    expect(wrapper.find('.app-progress-text--inside').text()).toBe('Done')
    expect(wrapper.attributes('style')).toContain('--app-progress-stroke-width: 22px')
  })

  it('resolves status, string, function, and color-stop colors', () => {
    expect(resolveProgressColor(undefined, 20, 'warning')).toBe('var(--ui-status-warning-fg, var(--color-warning))')
    expect(resolveProgressColor('var(--ui-accent-primary-fg, var(--accent))', 20)).toBe('var(--ui-accent-primary-fg, var(--accent))')
    expect(resolveProgressColor(() => 'var(--ui-status-success-fg, var(--color-success))', 70)).toBe('var(--ui-status-success-fg, var(--color-success))')
    expect(resolveProgressColor([
      { color: 'var(--ui-status-danger-fg, var(--color-danger))', percentage: 20 },
      { color: 'var(--ui-status-warning-fg, var(--color-warning))', percentage: 60 },
      { color: 'var(--ui-status-success-fg, var(--color-success))', percentage: 100 },
    ], 40)).toBe('var(--ui-status-warning-fg, var(--color-warning))')
  })

  it('renders circle and dashboard progress with slot content', () => {
    const circle = mount(Progress, {
      props: {
        type: 'circle',
        percentage: 64,
        width: 96,
      },
      slots: {
        default: ({ percentage }: { percentage: number }) => `Score ${percentage}`,
      },
    })

    expect(circle.find('svg').attributes('width')).toBe('96')
    expect(circle.find('.app-progress-text--radial').text()).toBe('Score 64')
    expect(circle.find('.app-progress-radial-bar').attributes('stroke-dashoffset')).toBeTruthy()

    const dashboard = mount(Progress, {
      props: {
        type: 'dashboard',
        percentage: 25,
      },
    })

    expect(dashboard.classes()).toContain('app-progress--dashboard')
    expect(dashboard.find('.app-progress-radial-track').attributes('stroke-dasharray')).toContain(' ')
  })

  it('supports indeterminate, striped, and hidden text modes', () => {
    const wrapper = mount(Progress, {
      props: {
        percentage: 45,
        indeterminate: true,
        striped: true,
        stripedFlow: true,
        showText: false,
        duration: 5,
      },
    })

    expect(wrapper.classes()).toContain('is-indeterminate')
    expect(wrapper.classes()).toContain('is-striped')
    expect(wrapper.classes()).toContain('is-striped-flow')
    expect(wrapper.classes()).toContain('is-without-text')
    expect(wrapper.attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.attributes('aria-valuetext')).toBe('45%')
    expect(wrapper.attributes('style')).toContain('--app-progress-duration: 5s')
    expect(wrapper.find('.app-progress-text').exists()).toBe(false)
  })

  it('normalizes invalid percentages', () => {
    expect(normalizeProgressPercentage(Number.NaN)).toBe(0)
    expect(normalizeProgressPercentage(-5)).toBe(0)
    expect(normalizeProgressPercentage(45)).toBe(45)
    expect(normalizeProgressPercentage(120)).toBe(100)
  })
})
