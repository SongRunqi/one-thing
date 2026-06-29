import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OnethingTokenStore,
  type OnethingTokenCryptoAdapter,
} from '../index.js'
import type { OnethingOAuthToken } from '../types.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function createTokenFilePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-token-store-'))
  dirs.push(dir)
  return path.join(dir, 'oauth-tokens.json')
}

function createToken(overrides: Partial<OnethingOAuthToken> = {}): OnethingOAuthToken {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 2_000,
    tokenType: 'Bearer',
    scope: 'read',
    ...overrides,
  }
}

describe('onething runtime token store', () => {
  it('saves, reads, expires, and deletes plaintext tokens without host dependencies', async () => {
    const tokenFilePath = await createTokenFilePath()
    const store = new OnethingTokenStore({
      tokenFilePath,
      now: () => 1_000,
    })

    const token = createToken()
    await store.saveToken('codex', token)

    await expect(store.getToken('codex')).resolves.toEqual(token)
    expect(store.isTokenExpired(token)).toBe(false)
    expect(store.isTokenExpired(createToken({ expiresAt: 999 }))).toBe(true)

    const raw = JSON.parse(await fs.readFile(tokenFilePath, 'utf-8'))
    expect(raw.codex).toContain('"accessToken"')

    await store.deleteToken('codex')
    await expect(store.getToken('codex')).resolves.toBeNull()
  })

  it('uses an injected crypto adapter instead of importing Electron', async () => {
    const tokenFilePath = await createTokenFilePath()
    const cryptoAdapter: OnethingTokenCryptoAdapter = {
      isEncryptionAvailable: () => true,
      encryptString: text => Buffer.from(`encrypted:${text}`),
      decryptString: buffer => {
        const text = buffer.toString('utf-8')
        if (!text.startsWith('encrypted:')) {
          throw new Error('Unexpected encrypted token payload')
        }
        return text.slice('encrypted:'.length)
      },
    }
    const store = new OnethingTokenStore({
      tokenFilePath,
      cryptoAdapter,
    })

    const token = createToken({ accessToken: 'encrypted-access-token' })
    await store.saveToken('codex', token)

    const raw = JSON.parse(await fs.readFile(tokenFilePath, 'utf-8'))
    expect(raw.codex).not.toContain('accessToken')
    await expect(store.getToken('codex')).resolves.toEqual(token)
  })

  it('reads legacy plaintext tokens and restores the default token type', async () => {
    const tokenFilePath = await createTokenFilePath()
    await fs.writeFile(tokenFilePath, JSON.stringify({
      codex: JSON.stringify({
        accessToken: 'legacy-access-token',
        expiresAt: 3_000,
      }),
    }))

    const store = new OnethingTokenStore({ tokenFilePath })

    await expect(store.getToken('codex')).resolves.toMatchObject({
      accessToken: 'legacy-access-token',
      expiresAt: 3_000,
      tokenType: 'Bearer',
    })
  })

  it('returns null and warns when an encrypted token cannot be decoded', async () => {
    const tokenFilePath = await createTokenFilePath()
    await fs.writeFile(tokenFilePath, JSON.stringify({
      codex: Buffer.from('not-json').toString('base64'),
    }))
    const warn = vi.fn()
    const store = new OnethingTokenStore({
      tokenFilePath,
      cryptoAdapter: {
        isEncryptionAvailable: () => true,
        encryptString: text => Buffer.from(text),
        decryptString: () => 'not-json',
      },
      logger: { warn },
    })

    await expect(store.getToken('codex')).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})
