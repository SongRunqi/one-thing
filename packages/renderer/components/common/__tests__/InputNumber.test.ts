// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import InputNumber from '../InputNumber.vue'

describe('InputNumber', () => {
  it('renders a controlled spinbutton and emits updates from controls', async () => {
    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 1,
        min: 1,
        max: 3,
        ariaLabel: 'Retries',
      },
    })

    const input = wrapper.find('input')
    expect(input.attributes('role')).toBe('spinbutton')
    expect(input.attributes('aria-label')).toBe('Retries')
    expect(input.attributes('aria-valuemin')).toBe('1')
    expect(input.attributes('aria-valuemax')).toBe('3')
    expect(input.attributes('aria-valuenow')).toBe('1')

    const buttons = wrapper.findAll('.app-input-number-control')
    expect(buttons[0].attributes('disabled')).toBeDefined()

    await buttons[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[2]])
    expect(wrapper.emitted('input')).toEqual([[2]])
    expect(wrapper.emitted('change')).toEqual([[2, 1]])
  })

  it('commits typed values with precision and clamps to range', async () => {
    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 1.25,
        min: 0,
        max: 10,
        step: 0.1,
        precision: 2,
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('2.346')
    await input.trigger('change')

    expect(wrapper.emitted('input')?.[0]).toEqual([2.346])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2.35])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([2.35, 1.25])

    await input.setValue('12')
    await input.trigger('change')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10])
  })

  it('supports strict stepping and keyboard controls', async () => {
    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 2,
        min: 0,
        max: 10,
        step: 2,
        stepStrictly: true,
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('5')
    await input.trigger('change')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([6])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([6, 2])

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([4])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([4, 6])
  })

  it('supports discrete control values and suffix text for migrated steppers', async () => {
    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 88,
        values: [40, 60, 88, 100],
        suffix: 'ch',
      },
    })

    expect(wrapper.find('.app-input-number-suffix').text()).toBe('ch')

    const buttons = wrapper.findAll('.app-input-number-control')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([100])

    await wrapper.setProps({ modelValue: 100 })
    await buttons[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([88])
  })

  it('resolves empty input through valueOnClear', async () => {
    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 5,
        min: 2,
        max: 8,
        valueOnClear: 'min',
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('')
    await input.trigger('change')

    expect(wrapper.emitted('input')?.at(-1)).toEqual([null])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([2, 5])
  })

  it('supports formatter, parser, affixes, and right-side controls', async () => {
    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 10000,
        controlsPosition: 'right',
        formatter: value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        parser: value => value.replace(/\$\s?|(,*)/g, ''),
      },
      slots: {
        prefix: '<span class="currency-prefix">USD</span>',
        suffix: '<span class="currency-suffix">net</span>',
      },
    })

    expect(wrapper.classes()).toContain('is-controls-right')
    expect(wrapper.find('input').attributes('type')).toBe('text')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('$ 10,000')
    expect(wrapper.find('.currency-prefix').text()).toBe('USD')
    expect(wrapper.find('.currency-suffix').text()).toBe('net')

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('$ 12,345')
    await input.trigger('change')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([12345])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([12345, 10000])
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('$ 12,345')
  })

  it('honors disabled, readonly, focus/blur events, and scientific notation guard', async () => {
    const disabled = mount(InputNumber, {
      props: {
        modelValue: 1,
        disabled: true,
      },
    })

    await disabled.find('.app-input-number-increase').trigger('click')
    expect(disabled.emitted('update:modelValue')).toBeUndefined()
    expect(disabled.find('input').attributes('disabled')).toBeDefined()

    const wrapper = mount(InputNumber, {
      props: {
        modelValue: 1,
        readonly: true,
        disabledScientific: true,
      },
      attachTo: document.body,
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.trigger('blur')

    expect(wrapper.emitted('focus')).toHaveLength(1)
    expect(wrapper.emitted('blur')).toHaveLength(1)

    const event = new KeyboardEvent('keydown', {
      key: 'e',
      cancelable: true,
    })
    input.element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    await input.setValue('4')
    await input.trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    wrapper.vm.focus()
    await nextTick()
    expect(document.activeElement).toBe(input.element)

    wrapper.vm.blur()
    await nextTick()
    expect(document.activeElement).not.toBe(input.element)

    wrapper.unmount()
    disabled.unmount()
  })
})
