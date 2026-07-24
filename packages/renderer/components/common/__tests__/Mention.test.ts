// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Mention from '../Mention.vue'

const options = [
  { label: 'Jeremy', value: 'Jeremy' },
  { label: 'Fuphoenixes', value: 'Fuphoenixes' },
  { label: 'Disabled', value: 'Disabled', disabled: true },
]

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Mention', () => {
  it('searches after a prefix and replaces the active token on select', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: {
        modelValue: '',
        options,
        placeholder: 'Mention someone',
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('@je')
    await nextTick()

    expect(wrapper.emitted('search')?.at(-1)).toEqual(['je', '@'])
    expect(wrapper.findAll('.app-mention-option')).toHaveLength(1)
    expect(wrapper.find('.app-mention-option').text()).toContain('Jeremy')

    await wrapper.find('.app-mention-option').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['@Jeremy '])
    expect(wrapper.emitted('select')?.at(-1)).toEqual([options[0], '@'])
  })

  it('supports custom option props, prefix arrays, and keyboard selection', async () => {
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: {
        modelValue: '',
        prefix: ['@', '#'],
        props: {
          label: 'name',
          value: 'id',
          disabled: 'unable',
        },
        options: [
          { name: 'Issue 12', id: '12' },
          { name: 'Issue 13', id: '13', unable: true },
        ],
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.setValue('ship #is')
    await nextTick()

    expect(wrapper.emitted('search')?.at(-1)).toEqual(['is', '#'])
    expect(wrapper.findAll('.app-mention-option')).toHaveLength(2)

    await wrapper.find('.app-mention').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['ship #12 '])
  })

  it('removes a completed mention as a whole on backspace', async () => {
    const value = 'Hello @Jeremy '
    const wrapper = mount(Mention, {
      attachTo: document.body,
      props: {
        modelValue: value,
        options,
        whole: true,
      },
    })

    const input = wrapper.find('input')
    const element = input.element as HTMLInputElement
    await input.trigger('focus')
    element.setSelectionRange(value.length, value.length)

    await wrapper.find('.app-mention').trigger('keydown', { key: 'Backspace' })

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Hello '])
    expect(wrapper.emitted('whole-remove')?.at(-1)).toEqual(['Jeremy', '@'])
  })

  it('renders textarea mode and custom label slot content', async () => {
    const wrapper = mount(Mention, {
      props: {
        modelValue: '',
        type: 'textarea',
        options,
      },
      slots: {
        label: '<span class="custom-label">{{ item.value }}</span>',
      },
    })

    await wrapper.find('textarea').trigger('focus')
    await wrapper.find('textarea').setValue('@fup')
    await nextTick()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('.custom-label').text()).toBe('Fuphoenixes')
  })
})
