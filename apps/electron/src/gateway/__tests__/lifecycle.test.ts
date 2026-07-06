import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isGatewayEnabledFromEnv: vi.fn(),
}))

vi.mock('@onething/gateway/config', () => ({
  isGatewayEnabledFromEnv: mocks.isGatewayEnabledFromEnv,
}))

class TestWechatChannel {
  readonly id: string
  readonly accountId: string

  constructor(private readonly options: { accountId?: string; onAuthEvent?: (event: unknown) => void } = {}) {
    this.accountId = options.accountId || 'default'
    this.id = `wechat:${this.accountId}`
  }

  async start(): Promise<void> {
    this.options.onAuthEvent?.({
      type: 'qr',
      qrcode: 'qr-token',
      qrUrl: `https://liteapp.weixin.qq.com/q/${this.accountId}`,
    })
  }

  async stop(): Promise<void> {}

  async send(): Promise<void> {}

  onMessage(): void {}
}

describe('electron gateway lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.isGatewayEnabledFromEnv.mockReset()
  })

  it('delegates gateway enablement to the gateway package', async () => {
    const { createElectronGatewayLifecycle } = await import('../lifecycle-controller.js')
    const env = { GATEWAY_CHANNELS: 'telegram,wechat' } as NodeJS.ProcessEnv
    const lifecycle = createElectronGatewayLifecycle({
      env,
      getConversationRuntime: vi.fn(),
    })
    mocks.isGatewayEnabledFromEnv.mockReturnValue(true)

    expect(lifecycle.isGatewayEnabled()).toBe(true)
    expect(mocks.isGatewayEnabledFromEnv).toHaveBeenCalledWith(env)
  })

  it('starts gateway with the injected onething conversation runtime', async () => {
    const { createElectronGatewayLifecycle } = await import('../lifecycle-controller.js')
    const runtime = { id: 'conversation-runtime' } as any
    const stop = vi.fn()
    const startGateway = vi.fn().mockResolvedValue({ gateway: { stop }, startPromise: Promise.resolve() })
    const logger = { log: vi.fn() }
    mocks.isGatewayEnabledFromEnv.mockReturnValue(true)
    const lifecycle = createElectronGatewayLifecycle({
      env: { ONETHING_GATEWAY: '1' } as NodeJS.ProcessEnv,
      logger,
      getConversationRuntime: () => runtime,
      importGateway: async () => ({ startGateway, WechatChannel: TestWechatChannel as any }) as any,
    })

    await lifecycle.initializeGateway()

    expect(startGateway).toHaveBeenCalledTimes(1)
    expect(startGateway).toHaveBeenCalledWith({
      runtime,
      env: { ONETHING_GATEWAY: '1' },
      channels: undefined,
      background: true,
    })

    await lifecycle.shutdownGateway()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('does not start when gateway is disabled', async () => {
    const { createElectronGatewayLifecycle } = await import('../lifecycle-controller.js')
    const startGateway = vi.fn()
    mocks.isGatewayEnabledFromEnv.mockReturnValue(false)
    const lifecycle = createElectronGatewayLifecycle({
      env: {} as NodeJS.ProcessEnv,
      getConversationRuntime: vi.fn(),
      importGateway: async () => ({ startGateway, WechatChannel: TestWechatChannel as any }) as any,
    })

    await lifecycle.initializeGateway()

    expect(startGateway).not.toHaveBeenCalled()
  })

  it('starts settings-enabled WeChat in the background and exposes the QR URL', async () => {
    const { createElectronGatewayLifecycle } = await import('../lifecycle-controller.js')
    const runtime = { id: 'conversation-runtime' } as any
    const stop = vi.fn()
    const startGateway = vi.fn(async (options: any) => ({
      gateway: { stop },
      startPromise: options.channels[0].start(),
    }))
    mocks.isGatewayEnabledFromEnv.mockReturnValue(false)

    const lifecycle = createElectronGatewayLifecycle({
      env: {} as NodeJS.ProcessEnv,
      logger: { log: vi.fn() },
      getSettings: () => ({ channels: { wechat: { enabled: true } } }),
      getConversationRuntime: () => runtime,
      importGateway: async () => ({ startGateway, WechatChannel: TestWechatChannel as any }) as any,
    })

    const status = await lifecycle.startGateway({ channel: 'wechat' })

    expect(startGateway).toHaveBeenCalledWith({
      runtime,
      env: {},
      channels: [expect.any(TestWechatChannel)],
      background: true,
    })
    expect(status.starting).toBe(true)
    expect(status.wechat.qrUrl).toBe('https://liteapp.weixin.qq.com/q/default')
    expect(status.wechat.loginStatus).toBe('waiting-for-scan')
  })

  it('adds a second WeChat account and starts a channel for each account id', async () => {
    const { createElectronGatewayLifecycle } = await import('../lifecycle-controller.js')
    const runtime = { id: 'conversation-runtime' } as any
    const stop = vi.fn()
    const startGateway = vi.fn(async (options: any) => ({
      gateway: { stop },
      startPromise: Promise.all((options.channels || []).map((channel: TestWechatChannel) => channel.start())),
    }))
    const clearWechatAuthState = vi.fn(async () => {})
    mocks.isGatewayEnabledFromEnv.mockReturnValue(false)

    const lifecycle = createElectronGatewayLifecycle({
      env: {} as NodeJS.ProcessEnv,
      logger: { log: vi.fn() },
      getSettings: () => ({
        channels: {
          wechat: {
            enabled: true,
            accounts: [{ id: 'default', enabled: true }],
          },
        },
      }),
      getConversationRuntime: () => runtime,
      importGateway: async () => ({
        startGateway,
        WechatChannel: TestWechatChannel as any,
        clearWechatAuthState,
      }) as any,
    })

    await lifecycle.startGateway({ channel: 'wechat' })
    const result = await lifecycle.addWechatAccount({})

    expect(result.account.id).toBe('account-1')
    expect(startGateway).toHaveBeenCalledTimes(2)
    const channels = startGateway.mock.calls.at(-1)?.[0].channels as TestWechatChannel[]
    expect(channels.map(channel => channel.id)).toEqual(['wechat:default', 'wechat:account-1'])
    expect(result.status.wechatAccounts?.map(account => account.id)).toEqual(['default', 'account-1'])

    const stopStatus = await lifecycle.stopWechatAccount({ accountId: 'account-1' })
    const restartedChannels = startGateway.mock.calls.at(-1)?.[0].channels as TestWechatChannel[]
    expect(restartedChannels.map(channel => channel.id)).toEqual(['wechat:default'])
    expect(stopStatus.wechatAccounts?.find(account => account.id === 'account-1')).toMatchObject({
      enabled: false,
      running: false,
    })

    await lifecycle.logoutWechat({ accountId: 'account-1' })
    expect(clearWechatAuthState).toHaveBeenCalledWith('account-1')
  })

  it('passes the command provider to the gateway package when configured', async () => {
    const { createElectronGatewayLifecycle } = await import('../lifecycle-controller.js')
    const runtime = { id: 'conversation-runtime' } as any
    const commandProvider = {
      listCommands: vi.fn(async () => []),
      executeCommand: vi.fn(),
    }
    const stop = vi.fn()
    const startGateway = vi.fn().mockResolvedValue({ gateway: { stop }, startPromise: Promise.resolve() })
    mocks.isGatewayEnabledFromEnv.mockReturnValue(true)

    const lifecycle = createElectronGatewayLifecycle({
      env: { ONETHING_GATEWAY: '1' } as NodeJS.ProcessEnv,
      getConversationRuntime: () => runtime,
      commandProvider,
      importGateway: async () => ({ startGateway, WechatChannel: TestWechatChannel as any }) as any,
      logger: { log: vi.fn() },
    })

    await lifecycle.initializeGateway()

    expect(startGateway).toHaveBeenCalledWith({
      runtime,
      env: { ONETHING_GATEWAY: '1' },
      channels: undefined,
      background: true,
      commandProvider,
    })

    await lifecycle.shutdownGateway()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('configures the lifecycle facade with an injected conversation runtime', async () => {
    const {
      configureGatewayLifecycle,
      initializeGateway,
      shutdownGateway,
    } = await import('../lifecycle.js')
    const runtime = { id: 'conversation-runtime' } as any
    const stop = vi.fn()
    const startGateway = vi.fn().mockResolvedValue({ gateway: { stop }, startPromise: Promise.resolve() })
    mocks.isGatewayEnabledFromEnv.mockReturnValue(true)

    configureGatewayLifecycle({
      env: { ONETHING_GATEWAY: '1' } as NodeJS.ProcessEnv,
      getConversationRuntime: () => runtime,
      importGateway: async () => ({ startGateway, WechatChannel: TestWechatChannel as any }) as any,
      logger: { log: vi.fn() },
    })

    await initializeGateway()
    expect(startGateway).toHaveBeenCalledWith({
      runtime,
      env: { ONETHING_GATEWAY: '1' },
      channels: undefined,
      background: true,
    })

    await shutdownGateway()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('fails clearly when the lifecycle facade is used before configuration', async () => {
    const { initializeGateway } = await import('../lifecycle.js')

    await expect(initializeGateway()).rejects.toThrow('Electron lifecycle not configured')
  })
})
