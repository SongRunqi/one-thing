// @vitest-environment happy-dom
/**
 * 描述树里的表单 —— 协议声明的控件必须真的有渲染。
 *
 * R5 评审抓到的口子:`string-list` 写在协议与类型里,渲染侧却没有分支,于是它落到
 * 普通 Input,提交时把数组静默变成一个字符串。"协议说支持"与"实现支持"分叉,
 * 是最难从界面上看出来的一类。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PluginPanelNode from '../PluginPanelNode.vue'

vi.mock('@/components/chat/message/MessageMarkdown.vue', () => ({
  default: { props: ['content'], template: '<div>{{ content }}</div>' },
}))

function formNode(fields: unknown[]) {
  return { type: 'form', submitActionId: 'save', fields }
}

describe('PluginPanelNode form', () => {
  it('keeps a string-list a list — raw text while typing, array on submit', async () => {
    const wrapper = mount(PluginPanelNode, {
      props: {
        node: formNode([
          { key: 'tags', label: 'Tags', control: 'string-list', value: ['a', 'b'] },
        ]) as never,
      },
    })

    const input = wrapper.find('input')
    // 初值以文本呈现,编辑期不做有损往返(每敲一键 split+join 会吃掉逗号)。
    expect((input.element as HTMLInputElement).value).toBe('a, b')

    await input.setValue('one, two , three')
    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')

    // 关键:即使用户没有 blur 就直接点保存,提交的也必须是数组。
    expect(wrapper.emitted('action')?.[0]).toEqual([
      { actionId: 'save', payload: { tags: ['one', 'two', 'three'] } },
    ])
  })

  it('carries switch and number fields through with their own types', async () => {
    const wrapper = mount(PluginPanelNode, {
      props: {
        node: formNode([
          { key: 'enabled', label: 'Enabled', control: 'switch', value: true },
          { key: 'retention', label: 'Retention', control: 'number', value: 7 },
        ]) as never,
      },
    })

    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
    expect(wrapper.emitted('action')?.[0]).toEqual([
      { actionId: 'save', payload: { enabled: true, retention: 7 } },
    ])
  })
})
