import fs from 'node:fs'
import path from 'node:path'

/**
 * 跨进程同步文件互斥锁:短持有、可竞争、退避重试。
 *
 * 用于让多个协作进程(如 Electron 主进程与 headless server)对同一个共享文件做
 * 原子的读-改-写(典型:sessions/index.json),避免 last-writer-wins 丢更新。
 *
 * 设计取舍:
 * - 同步实现,持锁只覆盖一次同步 RMW 的几毫秒,避免把 async 传染到全部调用方。
 * - 竞争时用 Atomics.wait 退避(阻塞事件循环,但有界且罕见)。
 * - 进程内可重入(计数),防止嵌套 RMW 与自己的锁死锁。
 * - holder 进程已死则偷锁,防崩溃残留永久卡死。
 * - 超时默认「降级放行」而非抛错:锁是尽力而为的串行化器,永不阻断功能;
 *   极端竞争下退回到无锁行为(与今天一致),严格不劣化。
 */

export interface FileLockOptions {
  /** 竞争时的总等待预算(毫秒),超时后按 onTimeout 处理。默认 2000。 */
  timeoutMs?: number
  /** 每次重试的退避间隔(毫秒)。默认 10。 */
  retryMs?: number
  /** 超时行为:'proceed' 记录告警后无锁执行(默认);'throw' 抛错。 */
  onTimeout?: 'proceed' | 'throw'
  /** 可选标识,写进锁文件便于诊断。 */
  owner?: string
  logger?: { warn?(...args: unknown[]): void }
}

interface LockMeta {
  pid: number
  acquiredAt: number
  owner?: string
}

// 进程内重入深度:lockPath -> depth
const heldDepth = new Map<string, number>()

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function sleepSync(ms: number): void {
  // 阻塞当前线程 ms 毫秒且不空转 CPU(nobody notifies -> 必然按超时返回)。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function readLockMeta(lockPath: string): LockMeta | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf8').trim()
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<LockMeta>
    if (typeof value.pid !== 'number') return null
    return {
      pid: value.pid,
      acquiredAt: typeof value.acquiredAt === 'number' ? value.acquiredAt : 0,
      owner: typeof value.owner === 'string' ? value.owner : undefined,
    }
  } catch {
    return null
  }
}

/** 尝试拿锁;成功返回 true,超时返回 false(不抛)。 */
function acquire(lockPath: string, timeoutMs: number, retryMs: number, owner?: string): boolean {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const fd = fs.openSync(lockPath, 'wx')
      try {
        fs.writeFileSync(
          fd,
          JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), owner } satisfies LockMeta),
        )
      } finally {
        fs.closeSync(fd)
      }
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }

    // 已被占用:holder 死了(或锁文件损坏无法读)则偷锁重试。
    const meta = readLockMeta(lockPath)
    if (!meta || !isProcessAlive(meta.pid)) {
      try {
        fs.unlinkSync(lockPath)
      } catch {
        // 被别的进程抢先清理,直接重试。
      }
      continue
    }

    if (Date.now() >= deadline) return false
    sleepSync(retryMs)
  }
}

function releaseFile(lockPath: string): void {
  try {
    const meta = readLockMeta(lockPath)
    // 只删自己持有的锁,避免误删偷锁后别人重建的锁。
    if (!meta || meta.pid === process.pid) {
      fs.unlinkSync(lockPath)
    }
  } catch {
    // 尽力而为。
  }
}

/**
 * 在跨进程文件锁保护下同步执行 fn,并返回其结果。
 * 同进程重入安全;超时按 onTimeout 处理(默认降级为无锁执行)。
 */
export function withFileLockSync<T>(lockPath: string, fn: () => T, options: FileLockOptions = {}): T {
  const depth = heldDepth.get(lockPath) ?? 0
  if (depth > 0) {
    // 本进程已持锁,重入:仅计数,不再碰锁文件。
    heldDepth.set(lockPath, depth + 1)
    try {
      return fn()
    } finally {
      const next = (heldDepth.get(lockPath) ?? 1) - 1
      if (next <= 0) heldDepth.delete(lockPath)
      else heldDepth.set(lockPath, next)
    }
  }

  const timeoutMs = options.timeoutMs ?? 2000
  const retryMs = options.retryMs ?? 10
  const acquired = acquire(lockPath, timeoutMs, retryMs, options.owner)

  if (!acquired) {
    if (options.onTimeout === 'throw') {
      throw new Error(`withFileLockSync: timed out acquiring ${lockPath}`)
    }
    options.logger?.warn?.(
      `[file-mutex] timed out acquiring ${lockPath}; proceeding without lock (best-effort)`,
    )
    return fn()
  }

  heldDepth.set(lockPath, 1)
  try {
    return fn()
  } finally {
    const next = (heldDepth.get(lockPath) ?? 1) - 1
    if (next <= 0) {
      heldDepth.delete(lockPath)
      releaseFile(lockPath)
    } else {
      heldDepth.set(lockPath, next)
    }
  }
}
