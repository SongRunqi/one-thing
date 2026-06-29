import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registeredHandlers: new Map<string, () => void>(),
  globalShortcut: {
    register: vi.fn((accelerator: string, handler: () => void) => {
      mocks.registeredHandlers.set(accelerator, handler)
      return true
    }),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  toggleTodoPlanWindow: vi.fn(),
}))

vi.mock('electron', () => ({
  globalShortcut: mocks.globalShortcut,
}))

vi.mock('@onething/electron-host/window', () => ({
  toggleTodoPlanWindow: mocks.toggleTodoPlanWindow,
}))

async function createController(options: {
  shortcuts?: any
  platform?: NodeJS.Platform
  registerResult?: boolean
  logger?: Pick<Console, 'warn'>
} = {}) {
  const { createElectronGlobalShortcutController } = await import('../global-shortcuts.js')
  const handlers = {
    toggleTodoPlanWindow: vi.fn(),
  }
  mocks.globalShortcut.register.mockReturnValue(options.registerResult ?? true)

  return {
    handlers,
    controller: createElectronGlobalShortcutController({
      getShortcuts: () => options.shortcuts ?? {
        toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
      },
      getPlatform: () => options.platform ?? 'linux',
      handlers,
      logger: options.logger,
    }),
  }
}

describe('electron global shortcuts', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.registeredHandlers.clear()
    mocks.globalShortcut.register.mockReset()
    mocks.globalShortcut.unregister.mockReset()
    mocks.globalShortcut.unregisterAll.mockReset()
    mocks.globalShortcut.register.mockImplementation((accelerator: string, handler: () => void) => {
      mocks.registeredHandlers.set(accelerator, handler)
      return true
    })
    mocks.toggleTodoPlanWindow.mockClear()
  })

  it('converts keyboard shortcuts to Electron accelerators', async () => {
    const { controller } = await createController()

    expect(controller.shortcutToAccelerator({
      key: 'ArrowUp',
      ctrlKey: true,
      altKey: true,
      metaKey: true,
    })).toBe('Control+Alt+Super+Up')

    const mac = await createController({ platform: 'darwin' })
    expect(mac.controller.shortcutToAccelerator({ key: ' ', metaKey: true })).toBe('Command+Space')
    expect(mac.controller.shortcutToAccelerator({ key: 't', sequence: ['t'] })).toBeNull()
  })

  it('registers the todo-plan shortcut and invokes its handler', async () => {
    const { controller, handlers } = await createController()

    controller.registerGlobalWindowShortcuts()
    mocks.globalShortcut.register.mock.calls[0]?.[1]?.()

    expect(mocks.globalShortcut.register).toHaveBeenCalledWith('Shift+Super+T', expect.any(Function))
    expect(handlers.toggleTodoPlanWindow).toHaveBeenCalledTimes(1)
  })

  it('unregisters old accelerators before registering again', async () => {
    const { controller } = await createController()

    controller.registerGlobalWindowShortcuts()
    controller.registerGlobalWindowShortcuts()

    expect(mocks.globalShortcut.unregister).toHaveBeenCalledWith('Shift+Super+T')
    expect(mocks.globalShortcut.register).toHaveBeenCalledTimes(2)
  })

  it('warns when Electron rejects a global shortcut', async () => {
    const logger = { warn: vi.fn() }
    const { controller } = await createController({ registerResult: false, logger })

    controller.registerGlobalWindowShortcuts()

    expect(logger.warn).toHaveBeenCalledWith('[Shortcuts] Failed to register global shortcut "Todo Window" (Shift+Super+T)')
  })

  it('unregisters all shortcuts on shutdown', async () => {
    const { controller } = await createController()

    controller.registerGlobalWindowShortcuts()
    controller.unregisterGlobalWindowShortcuts()

    expect(mocks.globalShortcut.unregisterAll).toHaveBeenCalledTimes(1)
  })

  it('wires onething shortcut settings to the todo-plan window host action', async () => {
    const {
      configureGlobalWindowShortcuts,
      registerGlobalWindowShortcuts,
    } = await import('../global-shortcuts.js')

    configureGlobalWindowShortcuts({
      getShortcuts: () => ({
        toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
      }),
    })

    registerGlobalWindowShortcuts()
    expect(mocks.registeredHandlers.size).toBe(1)
    mocks.registeredHandlers.values().next().value?.()

    expect(mocks.toggleTodoPlanWindow).toHaveBeenCalledWith({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })
  })

  it('does not touch Electron globalShortcut while only configuring startup settings', async () => {
    const { configureGlobalWindowShortcuts } = await import('../global-shortcuts.js')

    configureGlobalWindowShortcuts({
      getShortcuts: () => ({
        toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
      }),
    })

    expect(mocks.globalShortcut.unregisterAll).not.toHaveBeenCalled()
    expect(mocks.globalShortcut.unregister).not.toHaveBeenCalled()
    expect(mocks.globalShortcut.register).not.toHaveBeenCalled()
  })
})
