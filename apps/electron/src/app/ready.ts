import { app, dialog } from 'electron'

type MaybePromise<T> = T | Promise<T>

export interface ElectronReadyAppLike {
  readonly isPackaged: boolean
  on(event: 'ready', listener: () => MaybePromise<void>): void
  getPath(name: string): string
  quit(): void
}

export interface ElectronDialogLike {
  showErrorBox(title: string, content: string): void
}

export interface ElectronSandboxPathHost {
  getPath(name: string): string
}

export interface ElectronStorePathHost {
  isPackaged: boolean
  resourcesPath: string
}

export interface ElectronStorePathHostOptions {
  configureStorePathHost(host: ElectronStorePathHost): void
  app?: Pick<ElectronReadyAppLike, 'isPackaged'>
  resourcesPath?: string
}

export interface ElectronReadyOptions {
  configureSandboxHost(host: ElectronSandboxPathHost): void
  hydratePackagedEnvironment(): MaybePromise<void>
  acquireDesktopStoreLock(): Promise<void>
  formatDesktopStoreLockError(error: unknown): string
  onReady(): MaybePromise<void>
  app?: ElectronReadyAppLike
  dialog?: ElectronDialogLike
}

export function configureElectronStorePathHost(options: ElectronStorePathHostOptions): void {
  const electronApp = options.app ?? app
  options.configureStorePathHost({
    isPackaged: electronApp.isPackaged,
    resourcesPath: options.resourcesPath ?? process.resourcesPath,
  })
}

export function registerElectronReadyHandler(options: ElectronReadyOptions): void {
  const electronApp = options.app ?? app
  electronApp.on('ready', async () => {
    await runElectronReady(options)
  })
}

export async function runElectronReady(options: ElectronReadyOptions): Promise<boolean> {
  const electronApp = options.app ?? app
  const electronDialog = options.dialog ?? dialog

  options.configureSandboxHost({
    getPath: name => electronApp.getPath(name),
  })

  if (electronApp.isPackaged) {
    await options.hydratePackagedEnvironment()
  }

  try {
    await options.acquireDesktopStoreLock()
  } catch (error) {
    electronDialog.showErrorBox('Cannot open onething', options.formatDesktopStoreLockError(error))
    electronApp.quit()
    return false
  }

  await options.onReady()
  return true
}
