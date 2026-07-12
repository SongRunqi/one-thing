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

  it('omits the Develop menu when web preview is unavailable', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const { menu } = createMenu()

    setupElectronApplicationMenu({
      mainWindow: createWindow(),
      openSettingsWindow: vi.fn(),
      menu,
      platform: 'darwin',
      webPreview: {
        available: false,
        url: 'http://127.0.0.1:5174',
        isRunning: () => false,
        toggle: vi.fn(),
        open: vi.fn(),
      },
    })

    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    expect(template.find(item => item.label === 'Develop')).toBeUndefined()
  })

  it('renders a Develop menu that toggles and opens the web preview', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const { menu } = createMenu()
    const toggle = vi.fn()
    const open = vi.fn()

    setupElectronApplicationMenu({
      mainWindow: createWindow(),
      openSettingsWindow: vi.fn(),
      menu,
      platform: 'darwin',
      webPreview: {
        available: true,
        url: 'http://127.0.0.1:5174',
        isRunning: () => true,
        toggle,
        open,
      },
    })

    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    const develop = template.find(item => item.label === 'Develop')
    expect(develop).toBeDefined()

    const toggleItem = develop.submenu.find((item: any) => item.type === 'checkbox')
    expect(toggleItem.checked).toBe(true)
    toggleItem.click()
    expect(toggle).toHaveBeenCalledOnce()

    const openItem = develop.submenu.find((item: any) => item.label === '在浏览器打开 Web 预览')
    expect(openItem.enabled).toBe(true)
    openItem.click()
    expect(open).toHaveBeenCalledOnce()
  })
})
