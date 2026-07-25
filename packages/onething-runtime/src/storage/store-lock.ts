import fs from 'node:fs'
import path from 'node:path'

import { getOnethingStorePath } from './paths.js'

export type StoreLockOwner = 'desktop' | 'daemon' | 'server'

export interface LockMeta {
  pid: number
  owner: StoreLockOwner
  acquiredAt: number
  version: string
}

export class LockConflictError extends Error {
  constructor(public readonly holder: LockMeta) {
    super(`Store is locked by ${holder.owner} (pid ${holder.pid})`)
    this.name = 'LockConflictError'
  }
}

export interface StoreLockOptions {
  storePath?: string
  version?: string
  lockFileName?: string
}

export class StoreLock {
  private readonly lockPathValue: string
  private fd: number | null = null
  private owner: StoreLockOwner | null = null

  constructor(private readonly options: StoreLockOptions = {}) {
    const storePath = options.storePath || getOnethingStorePath()
    this.lockPathValue = path.join(storePath, 'run', options.lockFileName || 'backend.lock')
  }

  get lockPath(): string {
    return this.lockPathValue
  }

  async acquire(owner: StoreLockOwner): Promise<void> {
    await this.acquireOnce(owner, true)
  }

  release(): void {
    if (this.fd === null) return

    try {
      fs.closeSync(this.fd)
    } finally {
      this.fd = null
    }

    try {
      const meta = readLockMeta(this.lockPathValue)
      if (meta?.pid === process.pid && meta.owner === this.owner) {
        fs.unlinkSync(this.lockPathValue)
      }
    } catch {
      // Best effort during shutdown.
    } finally {
      this.owner = null
    }
  }

  private async acquireOnce(owner: StoreLockOwner, allowStaleCleanup: boolean): Promise<void> {
    fs.mkdirSync(path.dirname(this.lockPathValue), { recursive: true })

    try {
      this.fd = fs.openSync(this.lockPathValue, 'wx')
      this.owner = owner
      const meta: LockMeta = {
        pid: process.pid,
        owner,
        acquiredAt: Date.now(),
        version: this.options.version || process.env.npm_package_version || 'unknown',
      }
      fs.writeFileSync(this.fd, JSON.stringify(meta, null, 2))
      return
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== 'EEXIST') throw error
    }

    const meta = readLockMeta(this.lockPathValue)
    if (allowStaleCleanup && (!meta || !isProcessAlive(meta.pid))) {
      try {
        fs.unlinkSync(this.lockPathValue)
      } catch {
        // Another process may have raced us; retry will report the live holder.
      }
      return this.acquireOnce(owner, false)
    }

    throw new LockConflictError(meta || {
      pid: -1,
      owner: 'daemon',
      acquiredAt: 0,
      version: 'unknown',
    })
  }
}

export function readLockMeta(lockPath: string): LockMeta | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8').trim()
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<LockMeta>
    // Forward-compat: treat ANY non-empty owner string as valid meta. An
    // owner this build doesn't know (a newer host kind) must not be
    // misclassified as corrupt — that path deletes the lock file and steals
    // a live lock.
    if (typeof value.pid !== 'number' || typeof value.owner !== 'string' || value.owner.length === 0) {
      return null
    }
    return {
      pid: value.pid,
      owner: value.owner as StoreLockOwner,
      acquiredAt: typeof value.acquiredAt === 'number' ? value.acquiredAt : 0,
      version: typeof value.version === 'string' ? value.version : 'unknown',
    }
  } catch {
    return null
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EPERM'
  }
}

export function formatCliLockConflict(holder: LockMeta, storePath = getOnethingStorePath()): string {
  if (holder.owner === 'desktop') {
    return `Cannot start daemon: the onething desktop app is currently using ${storePath}. Close the app first, then retry.`
  }
  return `Cannot start daemon: another onething daemon is already running (pid ${holder.pid}).`
}

export function formatDesktopLockConflict(holder: LockMeta): string {
  if (holder.owner === 'daemon') {
    return `Cannot open onething: a background daemon is running (pid ${holder.pid}). Run "onething daemon stop", then reopen the app.`
  }
  return `Cannot open onething: another desktop instance is using the store (pid ${holder.pid}).`
}
