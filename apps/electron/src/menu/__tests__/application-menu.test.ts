import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { name: 'onething' },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
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

  // ⌘W 的仲裁仍然先交给渲染层(它自己的浏览器面板可能持有焦点);渲染层走完
  // 那一步之后才关窗 —— 会话已经没有"关闭"这回事了(U2,D5)。
  it('routes Cmd+W on the main window to the renderer first', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    mainWindow.close = vi.fn()
    const { menu } = createMenu()

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow: vi.fn(),
      menu,
      windows: { getFocusedWindow: () => mainWindow },
      platform: 'darwin',
    })

    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    const fileMenu = template.find(item => item.label === 'File')
    const closeItem = fileMenu.submenu.find((item: any) => item.label === 'Close')

    expect(closeItem.accelerator).toBe('CmdOrCtrl+W')
    closeItem.click()

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('menu:close-chat')
    expect(mainWindow.close).not.toHaveBeenCalled()
  })

  it('closes auxiliary windows directly on Cmd+W', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    const settingsWindow = { ...createWindow(), close: vi.fn() }
    const { menu } = createMenu()

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow: vi.fn(),
      menu,
      windows: { getFocusedWindow: () => settingsWindow as any },
      platform: 'darwin',
    })

    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    const fileMenu = template.find(item => item.label === 'File')
    fileMenu.submenu.find((item: any) => item.label === 'Close').click()

    expect(settingsWindow.close).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith('menu:close-chat')
  })

  // ⌘T/⌘W routing — three claimants: auxiliary window > embedded page (has
  // focus) > the renderer's tab tree.
  function fileMenuOf(menu: any) {
    const template = (menu.buildFromTemplate as any).mock.calls[0][0] as any[]
    return template.find(item => item.label === 'File')
  }

  function createBrowser(hasFocus: boolean) {
    return { hasFocus: () => hasFocus, createTab: vi.fn(), closeActiveTab: vi.fn() }
  }

  it('gives Cmd+W to the embedded browser while the page has focus', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    const { menu } = createMenu()
    const browser = createBrowser(true)

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow: vi.fn(),
      menu,
      windows: { getFocusedWindow: () => mainWindow },
      platform: 'darwin',
      browser,
    })

    fileMenuOf(menu).submenu.find((item: any) => item.label === 'Close').click()

    expect(browser.closeActiveTab).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith('menu:close-chat')
  })

  it('falls back to the renderer on Cmd+W when the embedded page has no focus', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    const { menu } = createMenu()
    const browser = createBrowser(false)

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow: vi.fn(),
      menu,
      windows: { getFocusedWindow: () => mainWindow },
      platform: 'darwin',
      browser,
    })

    fileMenuOf(menu).submenu.find((item: any) => item.label === 'Close').click()

    expect(browser.closeActiveTab).not.toHaveBeenCalled()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('menu:close-chat')
  })

  it('Cmd+T opens a browser tab directly when the page has focus, else asks the renderer', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')

    const focusedWindow = createWindow()
    const { menu: focusedMenu } = createMenu()
    const focusedBrowser = createBrowser(true)
    setupElectronApplicationMenu({
      mainWindow: focusedWindow,
      openSettingsWindow: vi.fn(),
      menu: focusedMenu,
      windows: { getFocusedWindow: () => focusedWindow },
      platform: 'darwin',
      browser: focusedBrowser,
    })
    const newTabItem = fileMenuOf(focusedMenu).submenu.find(
      (item: any) => item.label === 'New Browser Tab',
    )
    expect(newTabItem.accelerator).toBe('CmdOrCtrl+T')
    newTabItem.click()
    expect(focusedBrowser.createTab).toHaveBeenCalledOnce()
    expect(focusedWindow.webContents.send).not.toHaveBeenCalledWith('menu:new-browser-tab')

    const blurredWindow = createWindow()
    const { menu: blurredMenu } = createMenu()
    const blurredBrowser = createBrowser(false)
    setupElectronApplicationMenu({
      mainWindow: blurredWindow,
      openSettingsWindow: vi.fn(),
      menu: blurredMenu,
      windows: { getFocusedWindow: () => blurredWindow },
      platform: 'darwin',
      browser: blurredBrowser,
    })
    fileMenuOf(blurredMenu)
      .submenu.find((item: any) => item.label === 'New Browser Tab')
      .click()
    expect(blurredBrowser.createTab).not.toHaveBeenCalled()
    expect(blurredWindow.webContents.send).toHaveBeenCalledWith('menu:new-browser-tab')
  })

  it('leaves Cmd+T alone while an auxiliary window is focused', async () => {
    const { setupElectronApplicationMenu } = await import('../application-menu.js')
    const mainWindow = createWindow()
    const settingsWindow = { ...createWindow(), close: vi.fn() }
    const { menu } = createMenu()
    const browser = createBrowser(true)

    setupElectronApplicationMenu({
      mainWindow,
      openSettingsWindow: vi.fn(),
      menu,
      windows: { getFocusedWindow: () => settingsWindow as any },
      platform: 'darwin',
      browser,
    })

    fileMenuOf(menu).submenu.find((item: any) => item.label === 'New Browser Tab').click()

    expect(browser.createTab).not.toHaveBeenCalled()
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith('menu:new-browser-tab')
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
