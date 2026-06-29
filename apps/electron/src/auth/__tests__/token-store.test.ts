import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((text: string) => Buffer.from(`encrypted:${text}`, 'utf-8')),
    decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf-8').replace(/^encrypted:/, '')),
  },
}))

vi.mock('../electron-auth.js', () => ({
  getElectronSafeStorage: () => mocks.safeStorage,
}))

describe('electron token store', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
    vi.clearAllMocks()
  })

  it('stores OAuth tokens through Electron safeStorage when available', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'onething-token-store-'))
    tempDirs.push(dir)
    const tokenFile = path.join(dir, 'tokens.json')
    const { TokenStore } = await import('../token-store.js')
    const store = new TokenStore(tokenFile)
    const token = {
      accessToken: 'secret-access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    }

    await store.saveToken('codex', token)
    const raw = await readFile(tokenFile, 'utf-8')

    expect(raw).not.toContain('secret-access-token')
    expect(mocks.safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(token))
    await expect(store.getToken('codex')).resolves.toEqual(token)
    expect(mocks.safeStorage.decryptString).toHaveBeenCalled()
  })
})
