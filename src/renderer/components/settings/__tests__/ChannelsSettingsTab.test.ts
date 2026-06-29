// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChannelsSettingsTab from '../ChannelsSettingsTab.vue'
import type { AppSettings, GatewayStatus } from '@/types'

const mocks = vi.hoisted(() => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,qr'),
}))

vi.mock('qrcode', () => ({
  toDataURL: mocks.toDataURL,
}))

function appSettings(enabled = false): AppSettings {
  return {
    theme: 'dark',
    general: {
      shortcuts: {},
      editor: {},
      dailyNotes: { enabled: true },
      todoPlan: { enabled: true },
    },
    chat: {},
    ai: {
      provider: 'openai',
      providers: {},
      customProviders: [],
    },
    tools: {
      enableToolCalls: true,
      tools: {},
    },
    network: {
      proxy: {
        enabled: false,
        url: '',
        bypassRules: '',
      },
    },
    channels: {
      wechat: { enabled },
    },
    mcp: { enabled: true, servers: [] },
    skills: { enableSkills: true, skills: {} },
  } as unknown as AppSettings
}

function gatewayStatus(patch: Partial<GatewayStatus['wechat']> = {}): GatewayStatus {
  return {
    running: false,
    starting: false,
    stopping: false,
    enabled: false,
    wechat: {
      enabled: false,
      running: false,
      loginStatus: 'idle',
      loggedIn: false,
      ...patch,
    },
  }
}

async function settle(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('ChannelsSettingsTab', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        gatewayGetStatus: vi.fn().mockResolvedValue({
          success: true,
          status: gatewayStatus(),
        }),
        gatewayStart: vi.fn().mockResolvedValue({
          success: true,
          status: gatewayStatus({
            enabled: true,
            running: true,
            loginStatus: 'waiting-for-scan',
            qrUrl: 'https://liteapp.weixin.qq.com/q/mock',
          }),
        }),
        gatewayStop: vi.fn().mockResolvedValue({ success: true, status: gatewayStatus() }),
        gatewayWechatLogout: vi.fn().mockResolvedValue({ success: true, status: gatewayStatus() }),
        writeClipboardText: vi.fn().mockReturnValue({ success: true }),
        openExternal: vi.fn().mockResolvedValue({ success: true }),
      },
    })
  })

  it('enables WeChat when starting the channel runtime', async () => {
    const wrapper = mount(ChannelsSettingsTab, {
      props: { settings: appSettings(false) },
    })
    await settle()

    await wrapper.find('.channel-action.primary').trigger('click')
    await settle()

    expect(wrapper.emitted('update:settings')?.[0]?.[0]).toMatchObject({
      channels: { wechat: { enabled: true } },
    })
    expect(window.electronAPI.gatewayStart).toHaveBeenCalledWith({ channel: 'wechat' })

    wrapper.unmount()
  })

  it('renders the scan URL as a QR code and uses Electron APIs for QR actions', async () => {
    vi.mocked(window.electronAPI.gatewayGetStatus).mockResolvedValue({
      success: true,
      status: gatewayStatus({
        enabled: true,
        running: true,
        loginStatus: 'waiting-for-scan',
        qrUrl: 'https://liteapp.weixin.qq.com/q/mock',
      }),
    })

    const wrapper = mount(ChannelsSettingsTab, {
      props: { settings: appSettings(true) },
    })
    await settle()

    expect(mocks.toDataURL).toHaveBeenCalledWith(
      'https://liteapp.weixin.qq.com/q/mock',
      expect.any(Object),
    )

    await wrapper.find('button[title="Copy login URL"]').trigger('click')
    await wrapper.find('button[title="Open login URL"]').trigger('click')

    expect(window.electronAPI.writeClipboardText).toHaveBeenCalledWith('https://liteapp.weixin.qq.com/q/mock')
    expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://liteapp.weixin.qq.com/q/mock')

    wrapper.unmount()
  })
})
