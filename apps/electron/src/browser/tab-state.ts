/**
 * Electron-free pure logic for the embedded browser: bounds rounding + the
 * tab-state coalescer. Kept dependency-free so it unit-tests without an
 * Electron runtime (BrowserViewService itself can't be mock-tested — its
 * surface is all WebContentsView/session — so the coalescing + geometry math
 * that would otherwise hide bugs lives here). See
 * docs/design/browser-v2/p0-implementation.md §1.
 */
import type { BrowserTabInfo, BrowserTabsChangedEvent, BrowserViewBounds } from '@shared/ipc.js'

/** A Rectangle-shaped result (matches Electron's { x, y, width, height }). */
export interface DipRect {
	x: number
	y: number
	width: number
	height: number
}

/**
 * WebContentsView.setBounds takes integer DIP (CSS px) — NOT device pixels, no
 * DPR multiply. Round to integers so fractional placeholder rects don't leave
 * a seam against the surrounding chrome.
 */
export function roundBoundsToDip(bounds: BrowserViewBounds): DipRect {
	return {
		x: Math.round(bounds.x),
		y: Math.round(bounds.y),
		width: Math.max(0, Math.round(bounds.width)),
		height: Math.max(0, Math.round(bounds.height)),
	}
}

/** Changed fields of `next` vs `prev` (id always included). Empty-but-for-id → no change. */
export function computeTabPatch(
	prev: BrowserTabInfo | undefined,
	next: BrowserTabInfo,
): Partial<BrowserTabInfo> & { id: string } {
	const patch: Partial<BrowserTabInfo> & { id: string } = { id: next.id }
	if (!prev) return { ...next }
	const keys: Array<keyof BrowserTabInfo> = [
		'url',
		'title',
		'favicon',
		'loading',
		'canGoBack',
		'canGoForward',
		'crashed',
	]
	for (const key of keys) {
		if (prev[key] !== next[key]) {
			 
			;(patch as any)[key] = next[key]
		}
	}
	return patch
}

type EmitFn = (event: BrowserTabsChangedEvent) => void

/**
 * Accumulates per-tab field patches, tab removals, active-tab and order changes
 * across a debounce window, then emits ONE BrowserTabsChangedEvent on flush().
 * A single navigation fires ~10 fine-grained webContents events; without this
 * the renderer would take ten IPC hops + ten store writes per navigation and
 * jitter under multi-tab load (terminal's "IPC flood" lesson). The debounce
 * timer is driven by the service; this stays pure/testable.
 */
export function createTabStateCoalescer(emit: EmitFn) {
	let patches = new Map<string, Partial<BrowserTabInfo> & { id: string }>()
	let removed = new Set<string>()
	let activeTabId: string | null | undefined
	let order: string[] | undefined
	let dirty = false

	function mark(id: string, patch: Partial<BrowserTabInfo>): void {
		const existing = patches.get(id) ?? { id }
		patches.set(id, { ...existing, ...patch, id })
		removed.delete(id)
		dirty = true
	}

	function remove(id: string): void {
		patches.delete(id)
		removed.add(id)
		dirty = true
	}

	function setActive(id: string | null): void {
		activeTabId = id
		dirty = true
	}

	function setOrder(ids: string[]): void {
		order = [...ids]
		dirty = true
	}

	function flush(): void {
		if (!dirty) return
		const event: BrowserTabsChangedEvent = {
			patch: [...patches.values()],
		}
		if (removed.size > 0) event.removed = [...removed]
		if (activeTabId !== undefined) event.activeTabId = activeTabId
		if (order !== undefined) event.order = order
		patches = new Map()
		removed = new Set()
		activeTabId = undefined
		order = undefined
		dirty = false
		emit(event)
	}

	function isDirty(): boolean {
		return dirty
	}

	return { mark, remove, setActive, setOrder, flush, isDirty }
}

export type TabStateCoalescer = ReturnType<typeof createTabStateCoalescer>
