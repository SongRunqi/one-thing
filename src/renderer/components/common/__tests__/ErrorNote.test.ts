// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import ErrorNote from '../ErrorNote.vue'

describe('ErrorNote', () => {
  it('renders an inline danger note with no legend by default', () => {
    const wrapper = mount(ErrorNote, {
      props: { message: 'terminated' },
    })

    expect(wrapper.classes()).toContain('error-note')
    expect(wrapper.classes()).toContain('is-inline')
    expect(wrapper.classes()).toContain('tone-danger')
    expect(wrapper.classes()).toContain('size-md')
    expect(wrapper.find('.error-note-body').text()).toBe('terminated')
    // The legend belongs to `block` — an inline note is a bare rule of text.
    expect(wrapper.find('.error-note-legend').exists()).toBe(false)
    expect(wrapper.find('.error-note-raw').exists()).toBe(false)
    expect(wrapper.find('.error-note-actions').exists()).toBe(false)
  })

  it('renders a legend and raw details in block variant', () => {
    const wrapper = mount(ErrorNote, {
      props: {
        variant: 'block',
        label: '生成失败',
        message: '请求中断',
        details: 'TypeError: terminated',
      },
    })

    expect(wrapper.classes()).toContain('is-block')
    expect(wrapper.find('.error-note-legend .tag').text()).toBe('ERROR')
    expect(wrapper.find('.error-note-legend .zh').text()).toBe('生成失败')
    expect(wrapper.find('.error-note-body').text()).toBe('请求中断')
    expect(wrapper.find('.error-note-raw').text()).toBe('TypeError: terminated')
  })

  it('switches tag and tone for warnings', () => {
    const wrapper = mount(ErrorNote, {
      props: { variant: 'block', tone: 'warning', message: '配额将尽' },
    })

    expect(wrapper.classes()).toContain('tone-warning')
    expect(wrapper.find('.error-note-legend .tag').text()).toBe('WARN')
    expect(wrapper.find('.error-note-legend .zh').text()).toBe('警告')
  })

  it('lets an explicit empty label suppress the block legend', () => {
    const wrapper = mount(ErrorNote, {
      props: { variant: 'block', label: '', message: 'x' },
    })

    expect(wrapper.find('.error-note-legend').exists()).toBe(false)
  })

  it('prefers the default slot over the message prop', () => {
    const wrapper = mount(ErrorNote, {
      props: { message: 'ignored' },
      slots: { default: () => h('code', 'ENOTFOUND') },
    })

    expect(wrapper.find('.error-note-body code').text()).toBe('ENOTFOUND')
    expect(wrapper.text()).not.toContain('ignored')
  })

  it('renders the actions slot only when provided', () => {
    const wrapper = mount(ErrorNote, {
      props: { variant: 'block', message: 'failed' },
      slots: { actions: () => h('button', '重试') },
    })

    expect(wrapper.find('.error-note-actions button').text()).toBe('重试')
  })

  it('omits the body when neither message nor default slot is given', () => {
    const wrapper = mount(ErrorNote, {
      props: { variant: 'block', details: 'stack trace' },
    })

    expect(wrapper.find('.error-note-body').exists()).toBe(false)
    expect(wrapper.find('.error-note-raw').exists()).toBe(true)
  })
})
