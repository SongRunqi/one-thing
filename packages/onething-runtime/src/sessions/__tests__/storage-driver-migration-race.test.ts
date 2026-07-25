import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHybridSessionStorageDriver, type SessionStorageDriver } from '../storage-driver.js'

interface TestMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface TestSession {
  id: string
  name: string
  updatedAt: number
  messages: TestMessage[]
}

function session(id: string, messageIds: string[]): TestSession {
  return {
    id,
    name: id,
    updatedAt: 1700000000000,
    messages: messageIds.map((mid, i) => ({
      id: mid,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: mid,
      timestamp: 1700000000000 + i,
    })),
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 15))

// 满载并行跑套件时 15ms 不够迁移走完 读legacy→写jsonl→删legacy,
// 固定睡眠会假失败;轮询到条件成立为止(上限 5s)。
async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('legacy→jsonl migration vs in-flight write (1.3)', () => {
  let dir: string
  const legacyPath = (id: string) => path.join(dir, `${id}.json`)
  const logPath = (id: string) => path.join(dir, id, 'messages.jsonl')

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-migrace-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('does not lose a message written while migration reads the legacy file', async () => {
    // 磁盘起始:legacy 文件仅含 m1。
    fs.writeFileSync(legacyPath('s1'), JSON.stringify(session('s1', ['m1'])))

    // 用 gate 拦住第一次 legacy 写入,制造"在途写"。
    let releaseWrite: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      releaseWrite = resolve
    })
    let gatedOnce = false

    const driver: SessionStorageDriver<TestSession> = createHybridSessionStorageDriver<TestSession>({
      getSessionsDir: () => dir,
      getLegacySessionPath: legacyPath,
      newSessionFormat: () => 'jsonl',
      migrationDelayMs: 0,
      readJsonFile: (filePath, fallback) => {
        try {
          return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        } catch {
          return fallback
        }
      },
      writeJsonFileAsync: async (filePath, data) => {
        if (filePath === legacyPath('s1') && !gatedOnce) {
          gatedOnce = true
          await gate // 在真正写盘前挂起,模拟慢盘在途写
        }
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, JSON.stringify(data), 'utf-8')
      },
      deleteJsonFile: filePath => fs.rmSync(filePath, { force: true }),
    })

    // 在途写:把 m2 追加进来(format 仍是 legacy,因为 jsonl 尚不存在)。写入被 gate 挂起。
    const inFlight = driver.write('s1', session('s1', ['m1', 'm2']), { kind: 'structural' })

    // 触发迁移(delay 0)。修复后 migrateToJsonlNow 会先排空在途写。
    driver.load('s1')
    await tick() // 让迁移定时器触发并停在排空 await 上

    // 放行在途写:它把 m1+m2 写入 legacy 文件,随后迁移读到最新内容。
    releaseWrite()
    await inFlight
    await waitFor(() => fs.existsSync(logPath('s1'))) // 让迁移完成提交

    expect(fs.existsSync(logPath('s1'))).toBe(true)
    const loaded = driver.load('s1')
    // 关键回归:m2 不能丢。修复前迁移会读到旧 legacy(仅 m1)并把在途写重建的新数据遗弃。
    expect(loaded?.messages.map(m => m.id)).toEqual(['m1', 'm2'])
  })
})
