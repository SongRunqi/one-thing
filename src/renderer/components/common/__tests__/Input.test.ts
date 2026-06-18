// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import Input from '../Input.vue'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup() {
    return () => h('svg', { class: 'test-icon', viewBox: '0 0 16 16' })
  },
})

describe('Input', () => {
  it('renders a controlled value and emits parsed input and change events', async () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: '1234',
        formatter: value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        parser: value => value.replace(/\$\s?|(,*)/g, ''),
      },
    })

    const input = wrapper.find('input')
    expect(input.element.value).toBe('$ 1,234')

    await input.setValue('$ 12,345')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['12345'])
    expect(wrapper.emitted('input')?.[0]).toEqual(['12345'])

    await input.trigger('change')
    expect(wrapper.emitted('change')?.[0]).toEqual(['12345'])
  })

  it('supports clearable, password visibility, affix icons, and group slots', async () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: 'secret',
        type: 'password',
        showPassword: true,
        clearable: true,
        prefixIcon: TestIcon,
        suffixIcon: TestIcon,
      },
      slots: {
        prepend: 'https://',
        append: '.com',
      },
    })

    expect(wrapper.classes()).toContain('is-group')
    expect(wrapper.find('.app-input-group--prepend').text()).toBe('https://')
    expect(wrapper.find('.app-input-group--append').text()).toBe('.com')
    expect(wrapper.findAll('.test-icon')).toHaveLength(2)
    expect(wrapper.find('input').attributes('type')).toBe('password')

    await wrapper.find('.app-input-action').trigger('click')
    expect(wrapper.find('input').attributes('type')).toBe('text')

    await wrapper.find('.app-input-clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('input')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('change')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('supports textarea mode, autosize, word limits, and textarea clear', async () => {
    const wrapper = mount(Input, {
      props: {
        modelValue: 'hello',
        type: 'textarea',
        rows: 3,
        autosize: { minRows: 2, maxRows: 4 },
        clearable: true,
        showWordLimit: true,
        maxlength: 10,
      },
    })

    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('rows')).toBe('3')
    expect(wrapper.find('.app-input-count--textarea').text()).toBe('5 / 10')

    await textarea.setValue('hello!')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hello!'])

    await wrapper.find('.app-input-clear--textarea').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('pauses v-model updates during composition and exposes native helpers', async () => {
    const wrapper = mount(Input, {
      attachTo: document.body,
      props: {
        modelValue: '',
      },
    })
    const input = wrapper.find('input')
    const instance = wrapper.vm as unknown as {
      blur: () => void
      focus: () => void
      input: HTMLInputElement | null
      isComposing: boolean
      ref: HTMLInputElement | HTMLTextAreaElement | null
      select: () => void
    }

    instance.focus()
    expect(document.activeElement).toBe(input.element)
    expect(instance.input).toBe(input.element)
    expect(instance.ref).toBe(input.element)

    await input.trigger('compositionstart')
    input.element.value = '你'
    await input.trigger('input')

    expect(instance.isComposing).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await input.trigger('compositionend')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['你'])

    instance.select()
    await nextTick()
    expect(input.element.selectionStart).toBe(0)

    instance.blur()
    expect(document.activeElement).not.toBe(input.element)
  })
})
