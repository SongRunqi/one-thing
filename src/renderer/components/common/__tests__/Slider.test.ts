// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import Slider from '../Slider.vue'

function mockRail(wrapper: ReturnType<typeof mount>, options: { width?: number; height?: number } = {}) {
  const width = options.width ?? 100
  const height = options.height ?? 100
  const rail = wrapper.find('.app-slider-rail').element as HTMLElement

  vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

async function releaseMouse(clientX: number, clientY = 0) {
  document.dispatchEvent(new MouseEvent('mouseup', {
    button: 0,
    clientX,
    clientY,
  }))
  await nextTick()
}

describe('Slider', () => {
  it('moves to a clicked track position and emits model, input, and change events', async () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 20,
        min: 0,
        max: 100,
        ariaLabel: 'Volume',
      },
    })
    mockRail(wrapper, { width: 100 })

    await wrapper.find('.app-slider-rail').trigger('mousedown', {
      button: 0,
      clientX: 75,
      clientY: 0,
    })
    await releaseMouse(75)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([75])
    expect(wrapper.emitted('input')?.[0]).toEqual([75])
    expect(wrapper.emitted('change')?.[0]).toEqual([75])

    const thumb = wrapper.find('[role="slider"]')
    expect(thumb.attributes('aria-label')).toBe('Volume')
    expect(thumb.attributes('aria-valuenow')).toBe('75')
  })

  it('supports range values and updates the nearest thumb', async () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: [20, 80],
        range: true,
        min: 0,
        max: 100,
        ariaLabel: 'Price',
        rangeStartLabel: 'Minimum price',
        rangeEndLabel: 'Maximum price',
      },
    })
    mockRail(wrapper, { width: 100 })

    await wrapper.find('.app-slider-rail').trigger('mousedown', {
      button: 0,
      clientX: 70,
      clientY: 0,
    })
    await releaseMouse(70)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[20, 70]])
    expect(wrapper.findAll('[role="slider"]')).toHaveLength(2)
    expect(wrapper.findAll('[role="slider"]')[0].attributes('aria-label')).toBe('Minimum price')
    expect(wrapper.findAll('[role="slider"]')[1].attributes('aria-label')).toBe('Maximum price')
  })

  it('handles keyboard controls with step, page, home, and end keys', async () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 10,
        min: 0,
        max: 100,
        step: 5,
      },
    })

    const thumb = wrapper.find('[role="slider"]')
    await thumb.trigger('keydown', { key: 'ArrowRight' })
    await thumb.trigger('keydown', { key: 'PageUp' })
    await thumb.trigger('keydown', { key: 'Home' })
    await thumb.trigger('keydown', { key: 'End' })

    expect(wrapper.emitted('update:modelValue')).toEqual([[15], [65], [0], [100]])
    expect(wrapper.emitted('change')).toEqual([[15], [65], [0], [100]])
  })

  it('snaps to marks when step is mark and renders mark labels', async () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 0,
        min: 0,
        max: 100,
        step: 'mark',
        marks: {
          0: 'Cold',
          30: { label: 'Warm', style: { color: 'rgb(10, 20, 30)' } },
          80: 'Hot',
        },
      },
    })
    mockRail(wrapper, { width: 100 })

    await wrapper.find('.app-slider-rail').trigger('mousedown', {
      button: 0,
      clientX: 52,
      clientY: 0,
    })
    await releaseMouse(52)

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([30])
    expect(wrapper.findAll('.app-slider-mark')).toHaveLength(3)
    expect(wrapper.text()).toContain('Cold')
    expect(wrapper.text()).toContain('Warm')
    expect(wrapper.text()).toContain('Hot')

    await wrapper.find('[role="slider"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([80])
  })

  it('supports show-input with controls and numeric commit', async () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 10,
        min: 0,
        max: 100,
        step: 5,
        showInput: true,
        debounce: 0,
      },
    })

    const input = wrapper.find('input')
    await input.setValue('27')
    await input.trigger('change')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([25])

    const buttons = wrapper.findAll('.app-slider-input-button')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([30])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([30])
  })

  it('supports vertical layout and tooltip formatting props', async () => {
    const wrapper = mount(Slider, {
      props: {
        modelValue: 25,
        vertical: true,
        height: '240px',
        placement: 'right',
        formatTooltip: (value: number) => `${value}%`,
      },
    })

    await wrapper.find('[role="slider"]').trigger('focus')

    expect(wrapper.classes()).toContain('is-vertical')
    expect(wrapper.attributes('style')).toContain('--app-slider-height: 240px')
    expect(wrapper.find('[role="slider"]').attributes('aria-orientation')).toBe('vertical')
    expect(wrapper.find('.app-slider-tooltip').classes()).toContain('app-slider-tooltip--right')
    expect(wrapper.find('.app-slider-tooltip').text()).toBe('25%')
  })
})
