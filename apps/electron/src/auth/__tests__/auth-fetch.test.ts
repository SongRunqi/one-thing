import { describe, expect, it, vi } from 'vitest'
import { createElectronAuthFetch } from '../auth-fetch.js'
import { resolveElectronNetFetch } from '../electron-auth.js'

describe('electron auth fetch adapter', () => {
  it('uses a bound Electron net.fetch when it is available', async () => {
    let receiver: unknown
    const electronFetch = vi.fn(function (this: unknown) {
      receiver = this
      return Promise.resolve(new Response('electron'))
    }) as unknown as typeof fetch
    const net = { fetch: electronFetch }
    const resolvedElectronFetch = resolveElectronNetFetch({ net })
    const fallbackFetch = vi.fn(async () => new Response('fallback'))
    const authFetch = createElectronAuthFetch({
      fallbackFetch: fallbackFetch as typeof fetch,
      getElectronFetch: () => resolvedElectronFetch,
    })

    const response = await authFetch('https://example.test')

    await expect(response.text()).resolves.toBe('electron')
    expect(receiver).toBe(net)
    expect(fallbackFetch).not.toHaveBeenCalled()
  })

  it('falls back to app fetch when Electron net.fetch is unavailable', async () => {
    const fallbackFetch = vi.fn(async () => new Response('fallback'))
    const authFetch = createElectronAuthFetch({
      fallbackFetch: fallbackFetch as typeof fetch,
      getElectronFetch: () => undefined,
    })

    const response = await authFetch('https://example.test')

    await expect(response.text()).resolves.toBe('fallback')
    expect(fallbackFetch).toHaveBeenCalledOnce()
  })

  it('warns and falls back when Electron net.fetch rejects', async () => {
    const error = new Error('net failed')
    const electronFetch = vi.fn(async () => {
      throw error
    }) as unknown as typeof fetch
    const fallbackFetch = vi.fn(async () => new Response('fallback'))
    const logger = { warn: vi.fn() }
    const authFetch = createElectronAuthFetch({
      fallbackFetch: fallbackFetch as typeof fetch,
      getElectronFetch: () => electronFetch,
      logger,
    })

    const response = await authFetch('https://example.test')

    await expect(response.text()).resolves.toBe('fallback')
    expect(logger.warn).toHaveBeenCalledWith('[Auth] net.fetch failed; falling back to app fetch:', error)
    expect(fallbackFetch).toHaveBeenCalledOnce()
  })
})
