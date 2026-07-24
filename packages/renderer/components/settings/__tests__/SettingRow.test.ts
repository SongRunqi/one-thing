// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import Button from '../../common/Button.vue'
import SettingRow from '../SettingRow.vue'

describe('SettingRow', () => {
  it('keeps title and control in one header row with long description below', () => {
    const wrapper = mount(SettingRow, {
      props: {
        label: 'Enable a setting with a concise title',
        description:
          'This is a deliberately long setting description that should live below the title/control row instead of forcing the control to share a tall copy column.',
      },
      slots: {
        default: () => h(Button, { unstyled: true, class: 'row-action' }, () => 'Toggle'),
      },
    })

    const head = wrapper.find('.setting-row-head')
    const description = wrapper.find('.setting-row-description')
    const controls = wrapper.findAll('.setting-row-control')

    expect(head.exists()).toBe(true)
    expect(head.find('.setting-row-title').text()).toBe('Enable a setting with a concise title')
    expect(head.find('.setting-row-control .row-action').exists()).toBe(true)
    expect(description.exists()).toBe(true)
    expect(description.element.parentElement).toBe(wrapper.element)
    expect(controls).toHaveLength(1)
  })

  it('places stack controls below the copy block instead of inside the header', () => {
    const wrapper = mount(SettingRow, {
      props: {
        layout: 'stack',
        label: 'Prompt template',
        description: 'A longer explanation for the larger editor control.',
      },
      slots: {
        default: '<textarea class="stack-editor" />',
      },
    })

    expect(wrapper.find('.setting-row-stack').exists()).toBe(true)
    expect(wrapper.find('.setting-row-head > .setting-row-control').exists()).toBe(false)
    expect(wrapper.find('.setting-row-control .stack-editor').exists()).toBe(true)
    expect(wrapper.find('.setting-row-description').element.parentElement).toBe(wrapper.element)
  })
})
