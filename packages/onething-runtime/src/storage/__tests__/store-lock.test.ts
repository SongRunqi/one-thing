import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  LockConflictError,
  StoreLock,
  formatCliLockConflict,
  readLockMeta,
} from '../store-lock.js'

const tempDirs: string[] = []

function makeStore(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-store-lock-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('onething store lock runtime', () => {
  it('acquires and releases a lock with metadata', async () => {
    const storePath = makeStore()
    const lock = new StoreLock({ storePath, version: 'test' })

    await lock.acquire('daemon')

    const meta = readLockMeta(lock.lockPath)
    expect(meta).toMatchObject({ pid: process.pid, owner: 'daemon', version: 'test' })

    lock.release()
    expect(fs.existsSync(lock.lockPath)).toBe(false)
  })

  it('reports a live lock conflict', async () => {
    const storePath = makeStore()
    const first = new StoreLock({ storePath })
    const second = new StoreLock({ storePath })
    await first.acquire('desktop')

    await expect(second.acquire('daemon')).rejects.toBeInstanceOf(LockConflictError)

    try {
      await second.acquire('daemon')
    } catch (error) {
      expect(formatCliLockConflict((error as LockConflictError).holder, storePath))
        .toContain('desktop app is currently using')
    } finally {
      first.release()
    }
  })

  it('cleans up a stale pid lock once', async () => {
    const storePath = makeStore()
    const lock = new StoreLock({ storePath })
    fs.mkdirSync(path.dirname(lock.lockPath), { recursive: true })
    fs.writeFileSync(lock.lockPath, JSON.stringify({
      pid: 99999999,
      owner: 'daemon',
      acquiredAt: Date.now(),
      version: 'old',
    }))

    await lock.acquire('desktop')

    expect(readLockMeta(lock.lockPath)).toMatchObject({ pid: process.pid, owner: 'desktop' })
    lock.release()
  })
})
