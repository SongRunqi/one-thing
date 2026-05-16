import { safeStorage } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import type { OAuthToken } from '../../shared/ipc.js'

export class TokenStore {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly tokenFilePath = path.join(os.homedir(), '.onething', 'oauth-tokens.json')) {}

  async getToken(providerId: string): Promise<OAuthToken | null> {
    const tokens = await this.readAll()
    const serialized = tokens[providerId]
    if (!serialized) return null
    return this.deserializeToken(providerId, serialized)
  }

  async saveToken(providerId: string, token: OAuthToken): Promise<void> {
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

  isTokenExpired(token: OAuthToken): boolean {
    return Date.now() >= token.expiresAt
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
      console.warn('[Auth] Failed to read OAuth token file; treating it as empty:', error)
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

  private serializeToken(token: OAuthToken): string {
    const tokenJson = JSON.stringify(token)
    if (!safeStorage.isEncryptionAvailable()) {
      return tokenJson
    }
    return safeStorage.encryptString(tokenJson).toString('base64')
  }

  private deserializeToken(providerId: string, serialized: string): OAuthToken | null {
    const parseToken = (text: string): OAuthToken | null => {
      const parsed = JSON.parse(text) as OAuthToken
      if (!parsed?.accessToken || typeof parsed.expiresAt !== 'number') return null
      return {
        ...parsed,
        tokenType: parsed.tokenType || 'Bearer',
      }
    }

    try {
      if (serialized.trim().startsWith('{')) {
        return parseToken(serialized)
      }

      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(serialized, 'base64'))
        return parseToken(decrypted)
      }

      return parseToken(serialized)
    } catch (error) {
      console.warn(`[Auth] Failed to decrypt OAuth token for ${providerId}:`, error)
      return null
    }
  }
}

export const tokenStore = new TokenStore()
