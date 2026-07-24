// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Select from '../Select.vue'

const options = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'DeepSeek', value: 'deepseek', disabled: true },
]

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('Select', () => {
  it('renders a single value and emits updates when an option is selected', async () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: 'openai',
        options,
      },
    })

    expect(wrapper.find('.app-select-single-value').text()).toBe('OpenAI')

    await wrapper.find('.app-select-control').trigger('click')
    const optionButtons = wrapper.findAll('.app-select-option')

    await optionButtons[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['anthropic'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['anthropic'])
    expect(wrapper.emitted('visible-change')?.at(-1)).toEqual([false])
  })

  it('supports disabled options and clearable values', async () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: 'openai',
        options,
        clearable: true,
        valueOnClear: null,
      },
    })

    await wrapper.find('.app-select-control').trigger('click')
    await wrapper.findAll('.app-select-option')[2].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.find('.app-select-clear').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null])
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('supports multiple selection, limits, tag removal, and collapsed tags', async () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: ['openai', 'anthropic'],
        options,
        multiple: true,
        multipleLimit: 2,
        collapseTags: true,
        maxCollapseTags: 1,
      },
    })

    expect(wrapper.findAll('.app-select-tag')).toHaveLength(2)
    expect(wrapper.find('.app-select-tag-count').text()).toBe('+1')

    await wrapper.find('.app-select-control').trigger('click')
    await wrapper.findAll('.app-select-option')[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['anthropic']])
    expect(wrapper.emitted('remove-tag')?.[0]).toEqual(['openai'])
  })

  it('filters locally and can create an option from the query', async () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: undefined,
        options,
        filterable: true,
        allowCreate: true,
      },
    })

    await wrapper.find('.app-select-control').trigger('click')
    await wrapper.find('input').setValue('Kimi')

    const renderedOptions = wrapper.findAll('.app-select-option')
    expect(renderedOptions).toHaveLength(1)
    expect(renderedOptions[0].text()).toContain('Kimi')

    await renderedOptions[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Kimi'])
  })

  it('supports remote search debounce', async () => {
    vi.useFakeTimers()
    const remoteMethod = vi.fn()
    const wrapper = mount(Select, {
      props: {
        modelValue: undefined,
        options,
        filterable: true,
        remote: true,
        debounce: 25,
        remoteMethod,
      },
    })

    await wrapper.find('.app-select-control').trigger('click')
    await wrapper.find('input').setValue('claude')

    expect(remoteMethod).not.toHaveBeenCalled()

    vi.advanceTimersByTime(25)

    expect(remoteMethod).toHaveBeenCalledWith('claude')
  })

  it('supports grouped options and custom property names', async () => {
    const wrapper = mount(Select, {
      props: {
        modelValue: 'gpt-5',
        props: {
          label: 'name',
          value: 'id',
          options: 'children',
        },
        options: [
          {
            name: 'Frontier',
            children: [
              { name: 'GPT-5', id: 'gpt-5' },
              { name: 'Claude Opus', id: 'claude-opus' },
            ],
          },
        ],
      },
      slots: {
        option: '<span class="custom-option">{{ label }}</span>',
      },
    })

    expect(wrapper.find('.app-select-single-value').text()).toBe('GPT-5')

    await wrapper.find('.app-select-control').trigger('click')

    expect(wrapper.find('.app-select-group-label').text()).toBe('Frontier')
    expect(wrapper.find('.custom-option').text()).toBe('GPT-5')
  })

  it('exposes focus, blur, and selectedLabel helpers', () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: {
        modelValue: 'anthropic',
        options,
      },
    })

    const instance = wrapper.vm as unknown as {
      focus: () => void
      blur: () => void
      selectedLabel: () => string
    }

    instance.focus()
    expect(document.activeElement).toBe(wrapper.find('.app-select-control').element)

    expect(instance.selectedLabel()).toBe('Anthropic')

    instance.blur()
    expect(document.activeElement).not.toBe(wrapper.find('.app-select-control').element)
  })
})
