import { describe, expect, it, vi } from 'vitest'
import type { BrowserTabInfo, BrowserTabsChangedEvent } from '@shared/ipc.js'
import { computeTabPatch, createTabStateCoalescer, roundBoundsToDip } from '../tab-state.js'

function tab(overrides: Partial<BrowserTabInfo> & { id: string }): BrowserTabInfo {
	return {
		id: overrides.id,
		url: overrides.url ?? '',
		title: overrides.title ?? '',
		favicon: overrides.favicon,
		loading: overrides.loading ?? false,
		canGoBack: overrides.canGoBack ?? false,
		canGoForward: overrides.canGoForward ?? false,
		crashed: overrides.crashed,
	}
}

describe('roundBoundsToDip', () => {
	it('rounds to integer DIP and clamps negative size to zero', () => {
		expect(roundBoundsToDip({ x: 10.4, y: 20.6, width: 300.5, height: 199.4 })).toEqual({
			x: 10,
			y: 21,
			width: 301,
			height: 199,
		})
		expect(roundBoundsToDip({ x: 0, y: 0, width: -5, height: -1 })).toEqual({
			x: 0,
			y: 0,
			width: 0,
			height: 0,
		})
	})
})

describe('computeTabPatch', () => {
	it('returns the full tab when there is no prior state', () => {
		const next = tab({ id: 't1', url: 'https://a.com', title: 'A' })
		expect(computeTabPatch(undefined, next)).toEqual(next)
	})

	it('returns only changed fields (plus id) against a prior state', () => {
		const prev = tab({ id: 't1', url: 'https://a.com', title: 'A', loading: true })
		const next = tab({ id: 't1', url: 'https://a.com', title: 'A · updated', loading: false })
		expect(computeTabPatch(prev, next)).toEqual({ id: 't1', title: 'A · updated', loading: false })
	})
})

describe('createTabStateCoalescer', () => {
	it('coalesces many marks into one batch on flush', () => {
		const emit = vi.fn<(e: BrowserTabsChangedEvent) => void>()
		const c = createTabStateCoalescer(emit)
		c.mark('t1', { loading: true })
		c.mark('t1', { title: 'Hello' })
		c.mark('t1', { loading: false })
		expect(emit).not.toHaveBeenCalled()
		c.flush()
		expect(emit).toHaveBeenCalledTimes(1)
		expect(emit.mock.calls[0][0]).toEqual({
			patch: [{ id: 't1', loading: false, title: 'Hello' }],
		})
	})

	it('is a no-op flush when nothing is dirty', () => {
		const emit = vi.fn()
		const c = createTabStateCoalescer(emit)
		c.flush()
		expect(emit).not.toHaveBeenCalled()
		expect(c.isDirty()).toBe(false)
	})

	it('carries removed/activeTabId/order and resets after flush', () => {
		const emit = vi.fn<(e: BrowserTabsChangedEvent) => void>()
		const c = createTabStateCoalescer(emit)
		c.mark('t2', { url: 'https://b.com' })
		c.remove('t1')
		c.setActive('t2')
		c.setOrder(['t2'])
		c.flush()
		expect(emit.mock.calls[0][0]).toEqual({
			patch: [{ id: 't2', url: 'https://b.com' }],
			removed: ['t1'],
			activeTabId: 't2',
			order: ['t2'],
		})
		// Second flush with no new activity emits nothing.
		c.flush()
		expect(emit).toHaveBeenCalledTimes(1)
	})

	it('drops a pending patch when the tab is removed in the same window', () => {
		const emit = vi.fn<(e: BrowserTabsChangedEvent) => void>()
		const c = createTabStateCoalescer(emit)
		c.mark('t1', { title: 'gone soon' })
		c.remove('t1')
		c.flush()
		expect(emit.mock.calls[0][0]).toEqual({ patch: [], removed: ['t1'] })
	})
})
