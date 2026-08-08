// @vitest-environment happy-dom
/**
 * 描述树 v2 的渲染分支 —— 协议里写的每个节点/控件都必须真的画得出来。
 *
 * "协议说支持"与"实现支持"分叉,是最难从界面上看出来的一类( R5 的
 * string-list 就是这样被抓住的)。这里逐节点钉住渲染分支的存在。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PluginPanelNode from '../PluginPanelNode.vue'

vi.mock('@/components/chat/message/MessageMarkdown.vue', () => ({
  default: { props: ['content'], template: '<div>{{ content }}</div>' },
}))

function mountNode(node: unknown) {
  return mount(PluginPanelNode, { props: { node: node as never } })
}

describe('PluginPanelNode v2 nodes', () => {
  it('table 渲染列头与单元格,空表显示 emptyText', () => {
    const wrapper = mountNode({
      type: 'table',
      columns: [{ key: 'file', label: '文件' }, { key: 'lines', label: '行数' }],
      rows: [{ key: 'r1', cells: { file: 'a.ts', lines: 12 } }],
    })
    expect(wrapper.findAll('th').map(th => th.text())).toEqual(['文件', '行数'])
    expect(wrapper.text()).toContain('a.ts')

    const empty = mountNode({ type: 'table', columns: [{ key: 'a', label: 'A' }], rows: [], emptyText: '空空' })
    expect(empty.text()).toContain('空空')
  })

  it('tabs 纯前端切换:点击不重发 action,只换 body', async () => {
    const wrapper = mountNode({
      type: 'tabs',
      items: [
        { id: 'one', label: '页一', body: { type: 'markdown', text: '第一项' } },
        { id: 'two', label: '页二', body: { type: 'badge', text: '第二项' } },
      ],
    })
    expect(wrapper.text()).toContain('第一项')
    expect(wrapper.text()).not.toContain('第二项')

    await wrapper.findAll('button').find(button => button.text() === '页二')!.trigger('click')
    expect(wrapper.text()).toContain('第二项')
    expect(wrapper.text()).not.toContain('第一项')
    // 切换是零往返的 —— 不往插件发任何东西。
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('progress 按 value 画宽度,indeterminate 走宿主动画类', () => {
    const valued = mountNode({ type: 'progress', value: 40, label: '执行中' })
    const fill = valued.find('.panel-progress-fill')
    expect(fill.attributes('style')).toContain('width: 40%')
    expect(valued.text()).toContain('执行中')

    const indeterminate = mountNode({ type: 'progress', indeterminate: true })
    expect(indeterminate.find('.panel-progress-fill.is-indeterminate').exists()).toBe(true)
  })

  it('badge 带 tone;spinner 带 label;divider 是 hr;code 保留文本', () => {
    expect(mountNode({ type: 'badge', text: 'ok', tone: 'success' }).find('.panel-badge.tone-success').exists()).toBe(true)
    expect(mountNode({ type: 'spinner', label: '加载中' }).text()).toContain('加载中')
    expect(mountNode({ type: 'divider' }).find('hr.panel-divider').exists()).toBe(true)
    expect(mountNode({ type: 'code', text: 'const a = 1' }).find('pre.panel-code').text()).toBe('const a = 1')
  })

  it('image 以 no-referrer 加载;link 有 actionId 时派发动作而不是跳转', async () => {
    const image = mountNode({ type: 'image', url: 'https://example.com/a.png', alt: 'a', maxWidth: 120 })
    expect(image.find('img').attributes('referrerpolicy')).toBe('no-referrer')
    expect(image.find('img').attributes('style')).toContain('max-width: 120px')

    const link = mountNode({ type: 'link', text: '内联', actionId: 'open', payload: { id: 7 } })
    await link.find('button.panel-link').trigger('click')
    expect(link.emitted('action')?.[0]).toEqual([{ actionId: 'open', payload: { id: 7 } }])
  })
})

describe('PluginPanelNode v2 form controls', () => {
  function formWith(field: Record<string, unknown>) {
    return { type: 'form', submitActionId: 'save', fields: [field] }
  }

  it('checkbox-group 提交 string[]', async () => {
    const wrapper = mountNode(formWith({ key: 'levels', label: '级别', control: 'checkbox-group', options: ['info', 'warn'], value: ['info'] }))
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0].element as HTMLInputElement).checked).toBe(true)

    await boxes[1].setValue(true)
    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
    expect(wrapper.emitted('action')?.[0]).toEqual([
      { actionId: 'save', payload: { levels: ['info', 'warn'] } },
    ])
  })

  it('radio 提交选中的字符串', async () => {
    const wrapper = mountNode(formWith({ key: 'mode', label: '模式', control: 'radio', options: ['a', 'b'], value: 'a' }))
    const radios = wrapper.findAll('input[type="radio"]')
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)

    await radios[1].setValue(true)
    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
    expect(wrapper.emitted('action')?.[0]).toEqual([
      { actionId: 'save', payload: { mode: 'b' } },
    ])
  })

  it('slider 提交 number,date/color 提交字符串', async () => {
    const wrapper = mountNode(formWith({ key: 'vol', label: '音量', control: 'slider', value: 30 }))
    await wrapper.find('input[type="range"]').setValue(80)
    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
    expect(wrapper.emitted('action')?.[0]).toEqual([
      { actionId: 'save', payload: { vol: 80 } },
    ])

    const dated = mountNode(formWith({ key: 'when', label: '日期', control: 'date', value: '2026-08-01' }))
    expect((dated.find('input[type="date"]').element as HTMLInputElement).value).toBe('2026-08-01')
  })
})
