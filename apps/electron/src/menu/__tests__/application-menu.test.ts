import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { name: 'onething' },
  Menu: {
    buildFromTemplate: vi.fn(template => ({ template })),
    setApplicationMenu: vi.fn(),
  },
}))

describe('electron application menu', () => {
  function createWindow() {
    return {
      webContents: {
        send: vi.fn(),
      },
    } as any
  }

  function createMenu() {
    const builtMenu = { id: 'menu' }
    return {
      builtMenu,
      menu: {
        buildFromTemplate: vi.fn(() => builtMenu),
        setApplicationMenu: vi.fn(),
      },
    }
  }

  it('builds the macOS app menu and opens settings from the Settings item', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    const openSettingsWindow = vi.fn()
    const { builtMenu, menu } = createMenu()

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow,
      app: { name: 'OneThing Test' },
      menu,
      platform: 'darwin',
    })

    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    const appMenu = template[0]
    const settingsItem = appMenu.submenu.find((item: any) => item.label === 'Settings...')
    settingsItem.click()

    expect(appMenu.label).toBe('OneThing Test')
    expect(openSettingsWindow).toHaveBeenCalledWith(mainWindow)
    expect(menu.setApplicationMenu).toHaveBeenCalledWith(builtMenu)
  })

  it('sends the new-chat menu command through the main window', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    const { menu } = createMenu()

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow: vi.fn(),
      menu,
      platform: 'linux',
    })

    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    const fileMenu = template.find(item => item.label === 'File')
    const newChatItem = fileMenu.submenu.find((item: any) => item.label === 'New Chat')
    newChatItem.click()

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('menu:new-chat')
    expect(template[0].label).toBe('File')
    expect(fileMenu.submenu.at(-1)).toEqual({ role: 'quit' })
  })
})
