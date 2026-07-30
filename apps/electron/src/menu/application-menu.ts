import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron'

export interface ElectronApplicationMenuAppLike {
  readonly name: string
}

export interface ElectronApplicationMenuLike {
  buildFromTemplate(template: MenuItemConstructorOptions[]): unknown
  setApplicationMenu(menu: unknown): void
}

/** 测试用的 Web 预览开关(仅开发态注入);缺省或 available=false 时不渲染 Develop 菜单。 */
export interface ElectronApplicationMenuWebPreview {
  available: boolean
  url: string
  isRunning(): boolean
  toggle(): void
  open(): void
}

/** Injectable window lookup so the Close item can tell the main window apart in tests. */
export interface ElectronApplicationMenuWindowsLike {
  getFocusedWindow(): BrowserWindow | null
}

/**
 * The embedded browser, for ⌘T / ⌘W routing. An accelerator is the ONLY way to
 * catch those keys while a page has focus — a WebContentsView swallows keydown
 * long before the app renderer sees it — so the menu, not the renderer, is
 * where "which tab strip does this key mean" has to be decided.
 */
export interface ElectronApplicationMenuBrowserLike {
  /** True when the embedded page itself owns keyboard focus. */
  hasFocus(): boolean
  createTab(): void
  closeActiveTab(): void
}

export interface ElectronApplicationMenuOptions {
  mainWindow: BrowserWindow
  openSettingsWindow(parentWindow: BrowserWindow): void
  app?: ElectronApplicationMenuAppLike
  menu?: ElectronApplicationMenuLike
  windows?: ElectronApplicationMenuWindowsLike
  platform?: NodeJS.Platform
  webPreview?: ElectronApplicationMenuWebPreview
  browser?: ElectronApplicationMenuBrowserLike
}

export function setupElectronApplicationMenu(options: ElectronApplicationMenuOptions): void {
  const electronApp = options.app ?? app
  const electronMenu = options.menu ?? Menu
  const electronWindows = options.windows ?? BrowserWindow
  const isMac = (options.platform ?? process.platform) === 'darwin'

  // Cmd+W closes the focused *tab*, not the window — the window only goes away
  // once its last tab is gone, which the renderer decides (it owns the tab
  // tree) and requests back over IPC. Auxiliary windows (settings, search,
  // image preview) have no tabs, so they keep the plain close behavior.
  //
  // Three claimants, in order: an auxiliary window > the embedded browser page
  // (it has focus, so the key was aimed at it) > the renderer's tab tree. The
  // renderer arbitrates the last step further — its own browser panel may hold
  // focus (omnibox / start page) without the page itself being focused.
  const closeTabItem: MenuItemConstructorOptions = {
    label: 'Close Tab',
    accelerator: 'CmdOrCtrl+W',
    click: () => {
      const focused = electronWindows.getFocusedWindow()
      if (focused && focused !== options.mainWindow) {
        focused.close()
        return
      }
      if (options.browser?.hasFocus()) {
        options.browser.closeActiveTab()
        return
      }
      options.mainWindow.webContents.send('menu:close-chat')
    },
  }

  // ⌘T is unclaimed elsewhere in the app (⌘N is New Chat, ⌘⇧T is the todo
  // window), so it goes to the only surface with a tab strip of its own: the
  // embedded browser. Outside it the renderer no-ops rather than inventing a
  // second "new chat" — a menu key that does something different depending on
  // where you are is worse than one that politely does nothing.
  const newBrowserTabItem: MenuItemConstructorOptions = {
    label: 'New Browser Tab',
    accelerator: 'CmdOrCtrl+T',
    click: () => {
      const focused = electronWindows.getFocusedWindow()
      if (focused && focused !== options.mainWindow) return
      if (options.browser?.hasFocus()) {
        options.browser.createTab()
        return
      }
      options.mainWindow.webContents.send('menu:new-browser-tab')
    },
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: electronApp.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: () => {
            options.openSettingsWindow(options.mainWindow)
          },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          click: () => {
            options.mainWindow.webContents.send('menu:new-chat')
          },
        },
        newBrowserTabItem,
        { type: 'separator' },
        isMac ? closeTabItem : { role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          closeTabItem,
        ]),
      ],
    },
    ...(options.webPreview?.available ? [{
      label: 'Develop',
      submenu: [
        {
          label: `Web 预览服务 (${options.webPreview.url})`,
          type: 'checkbox' as const,
          checked: options.webPreview.isRunning(),
          click: () => options.webPreview?.toggle(),
        },
        {
          label: '在浏览器打开 Web 预览',
          enabled: options.webPreview.isRunning(),
          click: () => options.webPreview?.open(),
        },
      ],
    }] : []),
  ]

  const applicationMenu = electronMenu.buildFromTemplate(template)
  electronMenu.setApplicationMenu(applicationMenu)
}
