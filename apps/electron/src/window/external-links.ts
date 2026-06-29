import { shell, type WebContents } from 'electron'

export interface ElectronExternalLinkShellLike {
  openExternal(url: string): Promise<void> | void
}

export interface ElectronExternalLinkOptions {
  webContents: WebContents
  isAppUrl(url: string): boolean
  shell?: ElectronExternalLinkShellLike
}

export function setupElectronExternalLinkHandling(options: ElectronExternalLinkOptions): void {
  const electronShell = options.shell ?? shell

  options.webContents.on('will-navigate', (event, url) => {
    if (!options.isAppUrl(url)) {
      event.preventDefault()
      void electronShell.openExternal(url)
    }
  })

  options.webContents.setWindowOpenHandler(({ url }) => {
    void electronShell.openExternal(url)
    return { action: 'deny' }
  })
}
