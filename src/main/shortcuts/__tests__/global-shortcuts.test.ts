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
  getSettings: vi.fn(() => ({
    general: {
      shortcuts: {
        toggleTodoPlanWindow: { key: 't', metaKey: true, shiftKey: true },
      },
    },
  })),
}))

vi.mock('electron', () => ({
  globalShortcut: mocks.globalShortcut,
  BrowserWindow: class {},
}))

vi.mock('../../stores/settings.js', () => ({
  getSettings: mocks.getSettings,
}))

vi.mock('../../window.js', () => ({
  toggleTodoPlanWindow: mocks.toggleTodoPlanWindow,
}))

describe('global window shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.registeredHandlers.clear()
  })

  it('toggles the todo window without activating the current app', async () => {
    const { registerGlobalWindowShortcuts } = await import('../global-shortcuts.js')

    registerGlobalWindowShortcuts()
    expect(mocks.registeredHandlers.size).toBe(1)
    mocks.registeredHandlers.values().next().value?.()

    expect(mocks.toggleTodoPlanWindow).toHaveBeenCalledWith({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })
  })
})
