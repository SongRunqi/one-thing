// @vitest-environment happy-dom
/**
 * R5 验收(渲染侧):描述树的呈现、动作回程、主动刷新、软隔离错误态、
 * 以及方案 A 的 web 降级。
 *
 * 这里刻意**不 mock PluginPanelNode** —— 要验的正是"UI 用宿主原语把一棵纯数据
 * 的树画出来",把渲染器换成占位组件等于把命题本身挖掉。
 */
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PluginPanelHost from '../PluginPanelHost.vue'

const platformState = vi.hoisted(() => ({
  environment: 'electron' as string,
  pluginRequest: vi.fn(),
  notificationHandlers: [] as Array<(payload: any) => void>,
}))

vi.mock('@/platform', () => ({
  platformApi: {
    get environment() { return platformState.environment },
    pluginRequest: (...args: any[]) => platformState.pluginRequest(...args),
    onPluginNotification: (handler: (payload: any) => void) => {
      platformState.notificationHandlers.push(handler)
      return () => {
        platformState.notificationHandlers = platformState.notificationHandlers.filter(item => item !== handler)
      }
    },
  },
}))

const toastState = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))
vi.mock('@/composables/useToast', () => ({
  toast: { error: (...args: any[]) => toastState.error(...args), info: (...args: any[]) => toastState.info(...args) },
}))

// MessageMarkdown 拖着整条 shiki 高亮链,对本命题毫无贡献。
vi.mock('@/components/chat/message/MessageMarkdown.vue', () => ({
  default: { props: ['content'], template: '<div class="md">{{ content }}</div>' },
}))

const panel = {
  pluginId: 'log-monitor',
  pluginName: 'Log monitor',
  panelId: 'logs',
  label: 'Agent logs',
  loaded: true,
}

function tree(text: string) {
  return {
    version: 1,
    body: {
      type: 'stack',
      children: [
        { type: 'markdown', text },
        { type: 'button', label: 'Clean up', actionId: 'cleanup' },
      ],
    },
  }
}

beforeEach(() => {
  platformState.environment = 'electron'
  platformState.pluginRequest.mockReset()
  platformState.notificationHandlers = []
  toastState.error.mockReset()
  toastState.info.mockReset()
})

describe('PluginPanelHost', () => {
  it('renders the description tree with host primitives', async () => {
    platformState.pluginRequest.mockResolvedValue({ success: true, result: tree('buffer: 3 entries') })

    const wrapper = mount(PluginPanelHost, { props: { panel } })
    await flushPromises()

    expect(platformState.pluginRequest).toHaveBeenCalledWith({
      pluginId: 'log-monitor',
      action: 'panel:render:logs',
    })
    expect(wrapper.text()).toContain('buffer: 3 entries')
    expect(wrapper.text()).toContain('Clean up')
  })

  it('sends a button press back as actionId + payload and re-pulls on refresh', async () => {
    platformState.pluginRequest
      .mockResolvedValueOnce({ success: true, result: tree('before') })
      .mockResolvedValueOnce({ success: true, result: { refresh: true, notice: 'Cleaned up.' } })
      .mockResolvedValueOnce({ success: true, result: tree('after') })

    const wrapper = mount(PluginPanelHost, { props: { panel } })
    await flushPromises()

    await wrapper.findAll('button').find(button => button.text() === 'Clean up')!.trigger('click')
    await flushPromises()

    expect(platformState.pluginRequest.mock.calls[1][0]).toEqual({
      pluginId: 'log-monitor',
      action: 'panel:action:logs',
      payload: { actionId: 'cleanup', payload: undefined },
    })
    expect(toastState.info).toHaveBeenCalledWith('Cleaned up.')
    expect(wrapper.text()).toContain('after')
  })

  it('re-pulls when the plugin pushes a panel-refresh notification', async () => {
    platformState.pluginRequest
      .mockResolvedValueOnce({ success: true, result: tree('first') })
      .mockResolvedValueOnce({ success: true, result: tree('second') })

    const wrapper = mount(PluginPanelHost, { props: { panel } })
    await flushPromises()
    expect(wrapper.text()).toContain('first')

    // 走的是既有的 plugin:notification 轨,不是新开的一条。
    platformState.notificationHandlers.forEach(handler =>
      handler({ pluginId: 'log-monitor', panelId: 'logs', kind: 'panel-refresh' }))
    await flushPromises()

    expect(wrapper.text()).toContain('second')
  })

  it('ignores a refresh addressed at another plugin', async () => {
    platformState.pluginRequest.mockResolvedValue({ success: true, result: tree('first') })

    mount(PluginPanelHost, { props: { panel } })
    await flushPromises()
    expect(platformState.pluginRequest).toHaveBeenCalledTimes(1)

    platformState.notificationHandlers.forEach(handler =>
      handler({ pluginId: 'notes', panelId: 'inbox', kind: 'panel-refresh' }))
    await flushPromises()

    expect(platformState.pluginRequest).toHaveBeenCalledTimes(1)
  })

  it('shows an error state (not a blank panel) when render fails, and retries', async () => {
    platformState.pluginRequest
      .mockResolvedValueOnce({ success: false, error: 'Panel "logs" produced an invalid tree' })
      .mockResolvedValueOnce({ success: true, result: tree('recovered') })

    const wrapper = mount(PluginPanelHost, { props: { panel } })
    await flushPromises()
    expect(wrapper.text()).toContain('produced an invalid tree')

    await wrapper.findAll('button').find(button => button.text() === 'Retry')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('recovered')
  })

  it('keeps the entry but explains itself when the plugin failed to load', async () => {
    const wrapper = mount(PluginPanelHost, { props: { panel: { ...panel, loaded: false } } })
    await flushPromises()

    expect(platformState.pluginRequest).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('is not running')
  })

  it('says desktop-only on the web instead of rendering a fake panel (plan A)', async () => {
    platformState.environment = 'web'

    const wrapper = mount(PluginPanelHost, { props: { panel } })
    await flushPromises()

    expect(platformState.pluginRequest).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Available on desktop only')
  })
})
