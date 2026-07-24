// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import InputOtp from '../InputOtp.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('InputOtp', () => {
  it('fills multiple fields from one input and emits finish when complete', async () => {
    const wrapper = mount(InputOtp, {
      attachTo: document.body,
      props: {
        modelValue: '',
        length: 4,
      },
    })

    const inputs = wrapper.findAll('.app-input-otp-field')
    await inputs[0].setValue('1234')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['1234'])
    expect(wrapper.emitted('finish')?.at(-1)).toEqual(['1234'])
    expect(document.activeElement).toBe(inputs[3].element)
  })

  it('honors validators and input display variants', async () => {
    const wrapper = mount(InputOtp, {
      props: {
        modelValue: '',
        length: 3,
        type: 'filled',
        size: 'small',
        mask: true,
        validator: (value: string) => /^\d$/.test(value),
      },
    })

    expect(wrapper.classes()).toContain('app-input-otp--filled')
    expect(wrapper.classes()).toContain('app-input-otp--small')
    expect(wrapper.find('input').attributes('type')).toBe('password')

    await wrapper.find('input').setValue('a')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.find('input').setValue('7')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['7'])
  })

  it('supports separators and arrow-key focus movement', async () => {
    const wrapper = mount(InputOtp, {
      attachTo: document.body,
      props: {
        modelValue: '12',
        length: 4,
        separator: '/',
      },
    })

    const inputs = wrapper.findAll('.app-input-otp-field')
    expect(wrapper.findAll('.app-input-otp-separator')).toHaveLength(3)
    expect(wrapper.findAll('.app-input-otp-separator').map(item => item.text()).join('')).toBe('///')

    await inputs[0].trigger('focus')
    await inputs[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()

    expect(document.activeElement).toBe(inputs[1].element)
  })

  it('clears fields with backspace and exposes focus and blur helpers', async () => {
    const wrapper = mount(InputOtp, {
      attachTo: document.body,
      props: {
        modelValue: '12',
        length: 4,
      },
    })
    const instance = wrapper.vm as unknown as {
      focus: (index?: number) => void
      blur: () => void
    }
    const inputs = wrapper.findAll('.app-input-otp-field')

    instance.focus(2)
    await nextTick()
    expect(document.activeElement).toBe(inputs[2].element)

    await inputs[1].trigger('keydown', { key: 'Backspace' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['1'])

    instance.blur()
    await nextTick()
    expect(document.activeElement).not.toBe(inputs[2].element)
  })
})
