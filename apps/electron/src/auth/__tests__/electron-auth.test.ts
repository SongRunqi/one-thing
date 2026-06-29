import { describe, expect, it, vi } from 'vitest'
import {
  resolveElectronNetFetch,
  resolveElectronSafeStorage,
} from '../electron-auth.js'

describe('electron auth adapters', () => {
  it('resolves Electron net.fetch and binds it to electron.net', async () => {
    let receiver: unknown
    const fetchImpl = vi.fn(function (this: unknown) {
      receiver = this
      return Promise.resolve(new Response('ok'))
    }) as unknown as typeof fetch
    const net = { fetch: fetchImpl }

    const resolved = resolveElectronNetFetch({ net })

    expect(resolved).toBeTypeOf('function')
    await resolved?.('https://example.com')
    expect(receiver).toBe(net)
  })

  it('ignores Electron modules without a usable net.fetch', () => {
    expect(resolveElectronNetFetch(null)).toBeUndefined()
    expect(resolveElectronNetFetch({})).toBeUndefined()
    expect(resolveElectronNetFetch({ net: { fetch: 'nope' } })).toBeUndefined()
  })

  it('resolves Electron safeStorage when the full crypto adapter is available', () => {
    const safeStorage = {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((text: string) => Buffer.from(text)),
      decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf-8')),
    }

    expect(resolveElectronSafeStorage({ safeStorage })).toBe(safeStorage)
  })

  it('ignores incomplete Electron safeStorage adapters', () => {
    expect(resolveElectronSafeStorage(null)).toBeUndefined()
    expect(resolveElectronSafeStorage({})).toBeUndefined()
    expect(resolveElectronSafeStorage({
      safeStorage: {
        isEncryptionAvailable: vi.fn(() => true),
        encryptString: vi.fn((text: string) => Buffer.from(text)),
      },
    })).toBeUndefined()
  })
})
