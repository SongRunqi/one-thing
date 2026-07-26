import { ipcMain } from 'electron'
import type {
	BrowserCreateTabRequest,
	BrowserCreateTabResponse,
	BrowserHydrateResponse,
	BrowserNavigateRequest,
	BrowserSetBoundsRequest,
	BrowserSetVisibleRequest,
	BrowserSimpleResponse,
	BrowserTabIdRequest,
} from '@shared/ipc.js'

export interface ElectronBrowserIpcMainLike {
	handle<TArgs extends unknown[]>(
		channel: string,
		listener: (event: unknown, ...args: TArgs) => unknown,
	): void
}

export interface ElectronBrowserIpcChannels {
	hydrate: string
	createTab: string
	closeTab: string
	selectTab: string
	navigate: string
	goBack: string
	goForward: string
	reload: string
	stop: string
	setBounds: string
	setVisible: string
}

export interface RegisterElectronBrowserIpcHandlersOptions {
	channels: ElectronBrowserIpcChannels
	hydrate(): BrowserHydrateResponse | Promise<BrowserHydrateResponse>
	createTab(request: BrowserCreateTabRequest): BrowserCreateTabResponse | Promise<BrowserCreateTabResponse>
	closeTab(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	selectTab(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	navigate(request: BrowserNavigateRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	goBack(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	goForward(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	reload(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	stop(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	setBounds(request: BrowserSetBoundsRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	setVisible(request: BrowserSetVisibleRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	ipcMain?: ElectronBrowserIpcMainLike
}

export function registerElectronBrowserIpcHandlers(
	options: RegisterElectronBrowserIpcHandlersOptions,
): void {
	const host = options.ipcMain ?? ipcMain
	const { channels } = options

	host.handle(channels.hydrate, () => options.hydrate())
	host.handle(channels.createTab, (_event, request: BrowserCreateTabRequest) =>
		options.createTab(request ?? {}),
	)
	host.handle(channels.closeTab, (_event, request: BrowserTabIdRequest) => options.closeTab(request))
	host.handle(channels.selectTab, (_event, request: BrowserTabIdRequest) =>
		options.selectTab(request),
	)
	host.handle(channels.navigate, (_event, request: BrowserNavigateRequest) =>
		options.navigate(request),
	)
	host.handle(channels.goBack, (_event, request: BrowserTabIdRequest) => options.goBack(request))
	host.handle(channels.goForward, (_event, request: BrowserTabIdRequest) =>
		options.goForward(request),
	)
	host.handle(channels.reload, (_event, request: BrowserTabIdRequest) => options.reload(request))
	host.handle(channels.stop, (_event, request: BrowserTabIdRequest) => options.stop(request))
	host.handle(channels.setBounds, (_event, request: BrowserSetBoundsRequest) =>
		options.setBounds(request),
	)
	host.handle(channels.setVisible, (_event, request: BrowserSetVisibleRequest) =>
		options.setVisible(request),
	)
}
