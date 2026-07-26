/**
 * Browser (embedded WebContentsView) Module
 * Wire contracts for the Workbench embedded browser — a main-process
 * WebContentsView per web-tab, overlaid on a renderer placeholder div.
 * The renderer holds a mirror only; BrowserViewService in
 * apps/electron/src/browser/ is the source of truth. See
 * docs/design/browser-v2.md + docs/design/browser-v2/p0-implementation.md.
 *
 * NOTE: this is the real embedded web browser. It is unrelated to the
 * WorkbenchTab 'browser' type's legacy <iframe>, which stays only as the
 * apps/web (no-WebContentsView host) fallback.
 */

/** Placeholder-div rect the WebContentsView must track, in renderer CSS px (DIP). */
export interface BrowserViewBounds {
	x: number
	y: number
	width: number
	height: number
}

export interface BrowserCreateTabRequest {
	/** Initial URL; omitted → new-tab start page. */
	url?: string
	/** Create in the background without stealing foreground (AI new_tab default). */
	background?: boolean
}

/** One web-tab's mirrored state. Source of truth lives in BrowserViewService. */
export interface BrowserTabInfo {
	id: string
	url: string
	title: string
	favicon?: string
	loading: boolean
	canGoBack: boolean
	canGoForward: boolean
	/** Set when the render process crashed; the view shows a crash page until reload. */
	crashed?: boolean
}

export interface BrowserSimpleResponse {
	success: boolean
	error?: string
}

export interface BrowserCreateTabResponse {
	success: boolean
	tab?: BrowserTabInfo
	error?: string
}

export interface BrowserTabIdRequest {
	tabId: string
}

export interface BrowserNavigateRequest {
	tabId: string
	url: string
}

/** Placeholder geometry sync (renderer→main), throttled on the renderer via rAF. */
export interface BrowserSetBoundsRequest {
	bounds: BrowserViewBounds
}

/**
 * Show/hide the active WebContentsView. Native views sit above all DOM, so the
 * renderer hides the view during collapse animations and when a modal overlay
 * intersects the workbench region (overlay-presence signal). Full geometry sync
 * is TODO(browser-geometry): finalize against terminal's final workbench layout.
 */
export interface BrowserSetVisibleRequest {
	visible: boolean
}

/**
 * Full-state snapshot pulled once on store mount (pull-then-subscribe), before
 * consuming the incremental patch stream — avoids the "panel restored but
 * mirror empty" drift.
 */
export interface BrowserHydrateResponse {
	success: boolean
	tabs: BrowserTabInfo[]
	activeTabId: string | null
	error?: string
}

/**
 * Push payload on IPC_CHANNELS.BROWSER_TABS_CHANGED — a single coalesced batch
 * (~30ms window in the service) instead of ten fine-grained events per
 * navigation. `patch` carries only changed fields per tabId; `removed` lists
 * closed tabs; `activeTabId`/`order` reflect the current tab list when they
 * change. The renderer store applies it in one pass.
 */
export interface BrowserTabsChangedEvent {
	patch: Array<Partial<BrowserTabInfo> & { id: string }>
	removed?: string[]
	activeTabId?: string | null
	/** Full tab-id order, present only when tabs were added/removed/reordered. */
	order?: string[]
}

/**
 * A web element captured in pick mode — becomes a structured composer attachment
 * (element screenshot + text excerpt + source URL/title). See docs/design/browser-v2.md §P2.
 */
export interface PickedWebElement {
	/** The picked element's screenshot as a PNG data URL ('' if capture failed). */
	image: string
	/** Source page URL. */
	sourceUrl: string
	/** Source page title (falls back to hostname). */
	sourceTitle: string
	/** Text excerpt of the element (≤2k chars). */
	excerpt: string
	/** True when the element was larger than the viewport — screenshot is the visible part. */
	clipped: boolean
}

/**
 * Response of BROWSER_PICK_ELEMENT. `element` is null when the user cancelled
 * (Escape / re-toggle / navigation) — a normal outcome, not an error.
 */
export interface BrowserPickResponse {
	success: boolean
	element?: PickedWebElement | null
	error?: string
}

/** A browser profile — an isolated persistent partition (Chrome-style login). */
export interface BrowserProfile {
	id: string
	name: string
}

export interface BrowserProfilesResponse {
	success: boolean
	profiles: BrowserProfile[]
	activeProfileId: string
	error?: string
}

export interface BrowserAddProfileRequest {
	name: string
}

export interface BrowserProfileIdRequest {
	profileId: string
}
