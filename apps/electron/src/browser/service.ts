/**
 * BrowserViewService — source of truth for the embedded browser. One
 * WebContentsView per web-tab, overlaid on the renderer's placeholder div; the
 * renderer store is a mirror fed by a single coalesced BROWSER_TABS_CHANGED
 * batch. Lives in the electron-host layer (NOT the assembly layer like the
 * terminal service) because its surface is all electron (WebContentsView /
 * session / debugger) and P0 has no cross-host consumer — see
 * docs/design/browser-v2/p0-implementation.md §1.
 *
 * Geometry (bounds/visible/fullscreen) is written against today's single-Tabs
 * workbench; TODO(browser-geometry): revisit after terminal P1 split-tree.
 */
import { WebContentsView, net, shell, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
	BrowserTabInfo,
	BrowserTabsChangedEvent,
	BrowserViewBounds,
} from '@shared/ipc.js'
import { getBrowserPartitionSession } from './session.js'
import { ensureWidevineReady } from './widevine.js'
import {
	createTabStateCoalescer,
	roundBoundsToDip,
	type DipRect,
	type TabStateCoalescer,
} from './tab-state.js'

const NEW_TAB_URL = 'about:blank'
const COALESCE_MS = 30

export interface BrowserBroadcaster {
	sendTabsChanged(event: BrowserTabsChangedEvent): void
}

/** Host provides the main window so views can be attached to its contentView. */
export type BrowserWindowProvider = () => BrowserWindow | null | undefined

interface TabRecord {
	id: string
	view: WebContentsView
	info: BrowserTabInfo
}

export class BrowserViewService {
	private readonly tabs = new Map<string, TabRecord>()
	private order: string[] = []
	private activeTabId: string | null = null
	private bounds: DipRect = { x: 0, y: 0, width: 0, height: 0 }
	private visible = true
	/** HTML5 fullscreen (a page video, etc.) — the active view fills the whole window. */
	private fullscreen = false
	private readonly onWindowResize = () => {
		if (this.fullscreen) this.applyActiveBounds()
	}
	private readonly coalescer: TabStateCoalescer
	private flushTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private readonly windowProvider: BrowserWindowProvider,
		private readonly getBroadcaster: () => BrowserBroadcaster | null,
	) {
		this.coalescer = createTabStateCoalescer((event) => {
			this.getBroadcaster()?.sendTabsChanged(event)
		})
		// castlabs Widevine must be readied before the browser loads DRM content;
		// kick it off the moment the browser subsystem first wakes (memoized;
		// no-op on non-castlabs Electron). Part of the embedded-Google-login recipe.
		void ensureWidevineReady()
	}

	createTab(url?: string, background = false): BrowserTabInfo {
		const id = randomUUID()
		const view = new WebContentsView({
			webPreferences: { session: getBrowserPartitionSession() },
		})
		const info: BrowserTabInfo = {
			id,
			url: url ?? '',
			title: '',
			loading: false,
			canGoBack: false,
			canGoForward: false,
		}
		const record: TabRecord = { id, view, info }
		this.tabs.set(id, record)
		this.order.push(id)
		this.wireWebContents(record)

		const win = this.windowProvider()
		win?.contentView.addChildView(view)
		view.setVisible(false)

		if (!background || this.activeTabId === null) {
			this.setActiveTab(id)
		}
		this.coalescer.mark(id, info)
		this.coalescer.setOrder(this.order)
		this.scheduleFlush()

		// STRIPPED: the CDP identity override + persistent debugger were my own
		// addition and an untested variable in Google's "not secure" block (Google
		// flags debugger/automation). Cleanest embedded state = clean Chrome UA
		// string (session.setUserAgent) + proxy, NO CDP attached. Testing whether
		// a naked embedded browser passes Google where the "clever" one failed.
		if (url) void record.view.webContents.loadURL(url).catch(() => undefined)
		return info
	}

	closeTab(tabId: string): void {
		const record = this.tabs.get(tabId)
		if (!record) return
		this.detachAndDestroy(record)
		this.tabs.delete(tabId)
		this.order = this.order.filter((id) => id !== tabId)

		if (this.activeTabId === tabId) {
			this.activeTabId = null
			const next = this.order[this.order.length - 1] ?? null
			if (next) this.setActiveTab(next)
			else this.coalescer.setActive(null)
		}
		this.coalescer.remove(tabId)
		this.coalescer.setOrder(this.order)
		this.scheduleFlush()
	}

	selectTab(tabId: string): void {
		if (!this.tabs.has(tabId)) return
		this.setActiveTab(tabId)
		this.scheduleFlush()
	}

	navigate(tabId: string, url: string): void {
		const record = this.tabs.get(tabId)
		if (!record) return
		void record.view.webContents.loadURL(url).catch(() => undefined)
	}

	goBack(tabId: string): void {
		const wc = this.tabs.get(tabId)?.view.webContents
		if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
	}

	goForward(tabId: string): void {
		const wc = this.tabs.get(tabId)?.view.webContents
		if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
	}

	reload(tabId: string): void {
		this.tabs.get(tabId)?.view.webContents.reload()
	}

	stop(tabId: string): void {
		this.tabs.get(tabId)?.view.webContents.stop()
	}

	setBounds(bounds: BrowserViewBounds): void {
		this.bounds = roundBoundsToDip(bounds)
		this.applyActiveBounds()
	}

	setVisible(visible: boolean): void {
		this.visible = visible
		this.applyActiveVisibility()
	}

	hydrate(): { tabs: BrowserTabInfo[]; activeTabId: string | null } {
		return {
			tabs: this.order.map((id) => ({ ...this.tabs.get(id)!.info })),
			activeTabId: this.activeTabId,
		}
	}

	killAll(): void {
		if (this.fullscreen) this.setFullscreen(false)
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		for (const record of this.tabs.values()) this.detachAndDestroy(record)
		this.tabs.clear()
		this.order = []
		this.activeTabId = null
	}

	// ── internals ──────────────────────────────────────────────

	private setActiveTab(tabId: string): void {
		if (this.activeTabId === tabId) return
		const prev = this.activeTabId ? this.tabs.get(this.activeTabId) : null
		prev?.view.setVisible(false)
		this.activeTabId = tabId
		this.applyActiveBounds()
		this.applyActiveVisibility()
		this.coalescer.setActive(tabId)
	}

	private applyActiveBounds(): void {
		if (!this.activeTabId) return
		const view = this.tabs.get(this.activeTabId)?.view
		if (!view) return
		if (this.fullscreen) {
			const win = this.windowProvider()
			if (win) {
				const [width, height] = win.getContentSize()
				view.setBounds({ x: 0, y: 0, width, height })
				return
			}
		}
		view.setBounds(this.bounds)
	}

	private setFullscreen(next: boolean): void {
		if (this.fullscreen === next) return
		this.fullscreen = next
		const win = this.windowProvider()
		if (next) win?.on('resize', this.onWindowResize)
		else win?.off('resize', this.onWindowResize)
		this.applyActiveBounds()
	}

	private applyActiveVisibility(): void {
		for (const [id, record] of this.tabs) {
			record.view.setVisible(this.visible && id === this.activeTabId)
		}
	}

	private detachAndDestroy(record: TabRecord): void {
		const win = this.windowProvider()
		try {
			win?.contentView.removeChildView(record.view)
		} catch {
			// window already gone
		}
		if (!record.view.webContents.isDestroyed()) {
			record.view.webContents.close()
		}
	}

	private wireWebContents(record: TabRecord): void {
		const wc = record.view.webContents

		// New-window requests (target=_blank, window.open, ctrl-click) open an
		// in-app tab — NOT the system browser. Opening externally makes the
		// embedded browser feel broken (a search-result click escapes the app).
		// Full opener/postMessage preservation for OAuth popups is P1a's
		// createWindow override; here we lose opener but keep the URL in-app,
		// and non-http schemes (mailto:, etc.) still hand off to the OS.
		wc.setWindowOpenHandler(({ url, disposition }) => {
			if (/^https?:\/\//i.test(url)) {
				// cmd/middle-click opens in the background; target=_blank foregrounds.
				this.createTab(url, disposition === 'background-tab')
			} else if (url && url !== 'about:blank') {
				void shell.openExternal(url)
			}
			return { action: 'deny' }
		})

		const refresh = (patch: Partial<BrowserTabInfo>) => {
			Object.assign(record.info, patch)
			this.syncNavFlags(record)
			this.coalescer.mark(record.id, { ...record.info })
			this.scheduleFlush()
		}

		wc.on('page-title-updated', (_e, title) => refresh({ title }))
		wc.on('page-favicon-updated', (_e, favicons) => {
			const iconUrl = favicons[0]
			if (!iconUrl) {
				refresh({ favicon: undefined })
				return
			}
			if (iconUrl.startsWith('data:')) {
				refresh({ favicon: iconUrl })
				return
			}
			// Fetch through the BROWSER partition (not the app renderer, whose
			// defaultSession may carry a proxy → ERR_NO_SUPPORTED_PROXIES, and
			// which shouldn't reach out to arbitrary page resources anyway).
			void fetchFaviconDataUrl(iconUrl).then((dataUrl) => {
				if (this.tabs.has(record.id)) refresh({ favicon: dataUrl })
			})
		})
		wc.on('did-start-loading', () => refresh({ loading: true, crashed: false }))
		wc.on('did-stop-loading', () => refresh({ loading: false }))
		wc.on('did-navigate', (_e, url) => refresh({ url }))
		wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
			if (isMainFrame) refresh({ url })
		})
		wc.on('render-process-gone', () => refresh({ crashed: true, loading: false }))

		// HTML5 fullscreen (YouTube etc.): the native view fills the window
		// instead of staying pinned to the panel rect. Only the active tab can
		// trigger this via user gesture.
		wc.on('enter-html-full-screen', () => this.setFullscreen(true))
		wc.on('leave-html-full-screen', () => this.setFullscreen(false))
	}

	private syncNavFlags(record: TabRecord): void {
		const history = record.view.webContents.navigationHistory
		record.info.canGoBack = history.canGoBack()
		record.info.canGoForward = history.canGoForward()
		if (!record.info.url) record.info.url = record.view.webContents.getURL()
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null
			this.coalescer.flush()
		}, COALESCE_MS)
		this.flushTimer.unref?.()
	}
}

const FAVICON_MAX_BYTES = 256 * 1024

/**
 * Fetch a favicon on the browser partition and return a data: URL so the app
 * renderer never issues the request itself. Failures resolve to undefined
 * (renderer shows the Globe fallback).
 */
function fetchFaviconDataUrl(url: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		let settled = false
		const done = (value: string | undefined) => {
			if (!settled) {
				settled = true
				resolve(value)
			}
		}
		try {
			const request = net.request({ url, session: getBrowserPartitionSession() })
			const chunks: Buffer[] = []
			let bytes = 0
			request.on('response', (response) => {
				const rawType = response.headers['content-type']
				const contentType = (Array.isArray(rawType) ? rawType[0] : rawType) || 'image/png'
				response.on('data', (chunk: Buffer) => {
					bytes += chunk.length
					if (bytes > FAVICON_MAX_BYTES) {
						request.abort()
						done(undefined)
						return
					}
					chunks.push(chunk)
				})
				response.on('end', () => {
					if (!chunks.length) return done(undefined)
					done(`data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`)
				})
				response.on('error', () => done(undefined))
			})
			request.on('error', () => done(undefined))
			request.end()
		} catch {
			done(undefined)
		}
	})
}

// ── host injection ports (consulted per call) ────────────────

let broadcaster: BrowserBroadcaster | null = null
let windowProvider: BrowserWindowProvider = () => null
let serviceInstance: BrowserViewService | null = null

export function configureBrowserBroadcaster(next: BrowserBroadcaster | null): void {
	broadcaster = next
}

export function configureBrowserWindowProvider(next: BrowserWindowProvider): void {
	windowProvider = next
}

export function getBrowserViewService(): BrowserViewService {
	serviceInstance ??= new BrowserViewService(
		() => windowProvider(),
		() => broadcaster,
	)
	return serviceInstance
}

/**
 * Shutdown reaping — wired into the desktop beforeQuit cleanup table (the real
 * quit path; backend.shutdown() is NOT run by the Electron host). No-op when no
 * browser tab was ever created.
 */
export function killAllBrowserTabs(): void {
	serviceInstance?.killAll()
}

export { NEW_TAB_URL }
