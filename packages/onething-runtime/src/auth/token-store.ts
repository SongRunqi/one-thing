import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { OnethingOAuthToken } from './types.js'

export interface OnethingTokenCryptoAdapter {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer | Uint8Array | string
  decryptString(buffer: Buffer): string
}

export interface OnethingTokenStoreOptions {
  tokenFilePath?: string
  cryptoAdapter?: OnethingTokenCryptoAdapter | (() => OnethingTokenCryptoAdapter | undefined)
  now?: () => number
  logger?: Pick<Console, 'warn'>
}

export function getDefaultOnethingTokenFilePath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.onething', 'oauth-tokens.json')
}

export class OnethingTokenStore<TToken extends OnethingOAuthToken = OnethingOAuthToken> {
  private readonly tokenFilePath: string
  private readonly cryptoAdapter?: OnethingTokenCryptoAdapter | (() => OnethingTokenCryptoAdapter | undefined)
  private readonly now: () => number
  private readonly logger: Pick<Console, 'warn'>
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(options: OnethingTokenStoreOptions = {}) {
    this.tokenFilePath = options.tokenFilePath ?? getDefaultOnethingTokenFilePath()
    this.cryptoAdapter = options.cryptoAdapter
    this.now = options.now ?? (() => Date.now())
    this.logger = options.logger ?? console
  }

  async getToken(providerId: string): Promise<TToken | null> {
    const tokens = await this.readAll()
    const serialized = tokens[providerId]
    if (typeof serialized !== 'string' || !serialized) return null
    return this.deserializeToken(providerId, serialized)
  }

  async saveToken(providerId: string, token: TToken): Promise<void> {
    return this.enqueueWrite(async () => {
      const tokens = await this.readAll()
      tokens[providerId] = this.serializeToken(token)
      await this.writeAll(tokens)
    })
  }

  async deleteToken(providerId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const tokens = await this.readAll()
      delete tokens[providerId]
      await this.writeAll(tokens)
    })
  }

  isTokenExpired(token: TToken): boolean {
    return this.now() >= token.expiresAt
  }

  private async enqueueWrite(task: () => Promise<void>): Promise<void> {
    const run = this.writeQueue.then(task, task)
    this.writeQueue = run.catch(() => undefined)
    return run
  }

  private async readAll(): Promise<Record<string, string>> {
    if (!existsSync(this.tokenFilePath)) return {}
    try {
      const content = await readFile(this.tokenFilePath, 'utf-8')
      const parsed = JSON.parse(content)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      this.logger.warn('[Auth] Failed to read OAuth token file; treating it as empty:', error)
      return {}
    }
  }

  private async writeAll(tokens: Record<string, string>): Promise<void> {
    const dir = path.dirname(this.tokenFilePath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(this.tokenFilePath, JSON.stringify(tokens, null, 2))
  }

  private serializeToken(token: TToken): string {
    const tokenJson = JSON.stringify(token)
    const cryptoAdapter = this.getCryptoAdapter()
    if (!cryptoAdapter?.isEncryptionAvailable()) {
      return tokenJson
    }

    const encrypted = cryptoAdapter.encryptString(tokenJson)
    return typeof encrypted === 'string'
      ? encrypted
      : Buffer.from(encrypted).toString('base64')
  }

  private deserializeToken(providerId: string, serialized: string): TToken | null {
    try {
      if (serialized.trim().startsWith('{')) {
        return this.parseToken(serialized)
      }

      const cryptoAdapter = this.getCryptoAdapter()
      if (cryptoAdapter?.isEncryptionAvailable()) {
        const decrypted = cryptoAdapter.decryptString(Buffer.from(serialized, 'base64'))
        return this.parseToken(decrypted)
      }

      return this.parseToken(serialized)
    } catch (error) {
      this.logger.warn(`[Auth] Failed to decrypt OAuth token for ${providerId}:`, error)
      return null
    }
  }

  private parseToken(text: string): TToken | null {
    const parsed = JSON.parse(text) as Partial<TToken> | null
    if (!parsed?.accessToken || typeof parsed.expiresAt !== 'number') return null
    return {
      ...parsed,
      tokenType: parsed.tokenType || 'Bearer',
    } as TToken
  }

  private getCryptoAdapter(): OnethingTokenCryptoAdapter | undefined {
    return typeof this.cryptoAdapter === 'function'
      ? this.cryptoAdapter()
      : this.cryptoAdapter
  }
}
