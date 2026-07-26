import { ipcMain } from 'electron'
import type {
	BrowserAddProfileRequest,
	BrowserCreateTabRequest,
	BrowserCreateTabResponse,
	BrowserHydrateResponse,
	BrowserNavigateRequest,
	BrowserPickResponse,
	BrowserProfileIdRequest,
	BrowserProfilesResponse,
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
	pickElement: string
	pickCancel: string
	listProfiles: string
	addProfile: string
	removeProfile: string
	switchProfile: string
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
	pickElement(request: BrowserTabIdRequest): BrowserPickResponse | Promise<BrowserPickResponse>
	pickCancel(request: BrowserTabIdRequest): BrowserSimpleResponse | Promise<BrowserSimpleResponse>
	listProfiles(): BrowserProfilesResponse | Promise<BrowserProfilesResponse>
	addProfile(request: BrowserAddProfileRequest): BrowserProfilesResponse | Promise<BrowserProfilesResponse>
	removeProfile(request: BrowserProfileIdRequest): BrowserProfilesResponse | Promise<BrowserProfilesResponse>
	switchProfile(request: BrowserProfileIdRequest): BrowserProfilesResponse | Promise<BrowserProfilesResponse>
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
	host.handle(channels.pickElement, (_event, request: BrowserTabIdRequest) =>
		options.pickElement(request),
	)
	host.handle(channels.pickCancel, (_event, request: BrowserTabIdRequest) =>
		options.pickCancel(request),
	)
	host.handle(channels.listProfiles, () => options.listProfiles())
	host.handle(channels.addProfile, (_event, request: BrowserAddProfileRequest) =>
		options.addProfile(request),
	)
	host.handle(channels.removeProfile, (_event, request: BrowserProfileIdRequest) =>
		options.removeProfile(request),
	)
	host.handle(channels.switchProfile, (_event, request: BrowserProfileIdRequest) =>
		options.switchProfile(request),
	)
}
