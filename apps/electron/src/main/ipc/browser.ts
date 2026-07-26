/**
 * Browser IPC handlers: embedded WebContentsView browser for the workbench.
 * Tab-state pushes go the other way via IPCBridge on BROWSER_TABS_CHANGED
 * (single coalesced batch). See docs/design/browser-v2/p0-implementation.md.
 */
import { IPC_CHANNELS } from "@shared/ipc.js";
import {
	configureBrowserBroadcaster,
	getBrowserViewService,
} from "@onething/electron-host/browser/service";
import { registerElectronBrowserIpcHandlers } from "@onething/electron-host/ipc/browser";
import { getIPCBridge } from "../bridges/ipc-bridge-lifecycle.js";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function registerBrowserHandlers(): void {
	configureBrowserBroadcaster({
		sendTabsChanged: (event) => {
			getIPCBridge()?.sendToRenderer(IPC_CHANNELS.BROWSER_TABS_CHANGED, event);
		},
	});

	const service = getBrowserViewService;
	const ok = { success: true } as const;

	registerElectronBrowserIpcHandlers({
		channels: {
			hydrate: IPC_CHANNELS.BROWSER_HYDRATE,
			createTab: IPC_CHANNELS.BROWSER_CREATE_TAB,
			closeTab: IPC_CHANNELS.BROWSER_CLOSE_TAB,
			selectTab: IPC_CHANNELS.BROWSER_SELECT_TAB,
			navigate: IPC_CHANNELS.BROWSER_NAVIGATE,
			goBack: IPC_CHANNELS.BROWSER_GO_BACK,
			goForward: IPC_CHANNELS.BROWSER_GO_FORWARD,
			reload: IPC_CHANNELS.BROWSER_RELOAD,
			stop: IPC_CHANNELS.BROWSER_STOP,
			setBounds: IPC_CHANNELS.BROWSER_SET_BOUNDS,
			setVisible: IPC_CHANNELS.BROWSER_SET_VISIBLE,
		},
		hydrate: () => {
			try {
				const snapshot = service().hydrate();
				return { success: true, ...snapshot };
			} catch (error) {
				return { success: false, tabs: [], activeTabId: null, error: errorMessage(error) };
			}
		},
		createTab: (request) => {
			try {
				return { success: true, tab: service().createTab(request.url, request.background) };
			} catch (error) {
				return { success: false, error: errorMessage(error) };
			}
		},
		closeTab: (request) => {
			service().closeTab(request.tabId);
			return ok;
		},
		selectTab: (request) => {
			service().selectTab(request.tabId);
			return ok;
		},
		navigate: (request) => {
			service().navigate(request.tabId, request.url);
			return ok;
		},
		goBack: (request) => {
			service().goBack(request.tabId);
			return ok;
		},
		goForward: (request) => {
			service().goForward(request.tabId);
			return ok;
		},
		reload: (request) => {
			service().reload(request.tabId);
			return ok;
		},
		stop: (request) => {
			service().stop(request.tabId);
			return ok;
		},
		setBounds: (request) => {
			service().setBounds(request.bounds);
			return ok;
		},
		setVisible: (request) => {
			service().setVisible(request.visible);
			return ok;
		},
	});
}
