// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SessionHeader from '../SessionHeader.vue'

// 这一条只看那颗按钮,所以把会话/agent 两个 store 与模型选择器全按住:
// AgentSelector 一挂载就去拉 agent 列表,单测里那是一条打不通的 fetch。
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({ sessions: [{ id: 'session-1', name: 'Project chat' }] }),
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({ agents: [] }),
}))

vi.mock('../AgentSelector.vue', () => ({
  default: { name: 'AgentSelector', props: ['sessionId'], template: '<div class="mock-agent-selector" />' },
}))

/**
 * 分栏的关闭入口。
 *
 * TabBar 退役(U2)时,「关掉这一格」是搭在页签的 ✕ 上被一起带走的 —— 之后
 * `workspaceStore.closeLeaf` 一个调用方都没有,分了栏就再也收不回去。这条用例钉住
 * 那颗按钮:`canClose`(= 屏幕上还有别的格子)时必须在,独栏时必须不在。
 */
function mountHeader(props: Record<string, unknown> = {}) {
  return mount(SessionHeader, {
    props: {
      sessionId: 'session-1',
      sessionName: 'Project chat',
      cachedSessionIds: null,
      isBranchSession: false,
      showSidebarToggle: false,
      showSplitButton: true,
      canClose: false,
      // Boolean prop 的缺省转换会把它变成 false(= 未聚焦的分栏只剩标题),
      // 那样整排动作按钮都不画 —— 这组用例看的是聚焦那一格。
      panelFocused: true,
      ...props,
    },
  })
}

describe('SessionHeader 的关闭分栏入口', () => {
  it('独栏没有关闭按钮 —— 没有可关的东西', () => {
    expect(mountHeader().find('[aria-label="Close panel"]').exists()).toBe(false)
  })

  it('分栏之后画出关闭按钮,点它派 close', async () => {
    const wrapper = mountHeader({ canClose: true })
    const button = wrapper.find('[aria-label="Close panel"]')
    expect(button.exists()).toBe(true)

    await button.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('窄到 slim 档时关闭分栏跟着折进 ⋯ 菜单,而不是消失', async () => {
    const wrapper = mountHeader({ canClose: true })
    // slim 档由 ResizeObserver 喂宽度,单测里直接把那份内部宽度压到阈值以下。
    ;(wrapper.vm as unknown as { headerWidth: number }).headerWidth = 320
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[aria-label="Close panel"]').exists()).toBe(false)
    await wrapper.find('[aria-label="More actions"]').trigger('click')
    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    expect((menu.props('items') as Array<{ id: string }>).map(item => item.id)).toContain('close')

    menu.vm.$emit('select', 'close')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
