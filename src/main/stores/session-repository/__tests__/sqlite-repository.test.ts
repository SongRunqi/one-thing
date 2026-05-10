import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChatSession } from '../../../../shared/ipc.js'

function message(index: number) {
  return {
    id: `msg-${index}`,
    role: index % 2 === 0 ? 'assistant' as const : 'user' as const,
    content: `message ${index}`,
    timestamp: index,
  }
}

describe('sqlite session repository', () => {
  it('migrates a legacy JSON session and serves message pages from SQLite', async () => {
    const previousHome = process.env.HOME
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-sqlite-test-'))
    process.env.HOME = home

    try {
      const { ensureStoreDirs, getSessionPath } = await import('../../paths.js')
      const {
        getSqliteMessagesPage,
        importSessionIndexToSqlite,
        migrateSessionToSqliteNow,
        syncSqliteMessage,
      } = await import('../sqlite-repository.js')

      ensureStoreDirs()

      const session: ChatSession = {
        id: 's1',
        name: 'SQLite Test',
        messages: [message(1), message(2), message(3), message(4)],
        createdAt: 1,
        updatedAt: 4,
        totalInputTokens: 10,
        totalOutputTokens: 20,
        totalTokens: 30,
      }

      fs.writeFileSync(getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8')
      importSessionIndexToSqlite([{
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      }])

      expect(getSqliteMessagesPage({ sessionId: 's1', anchor: 'tail', limit: 2 })).toBeUndefined()
      expect(migrateSessionToSqliteNow('s1')).toBe(true)

      const page = getSqliteMessagesPage({ sessionId: 's1', anchor: 'tail', limit: 2 })
      expect(page?.success).toBe(true)
      expect(page?.messages?.map(item => item.id)).toEqual(['msg-3', 'msg-4'])
      expect(page?.hasMoreBefore).toBe(true)
      expect(page?.hasMoreAfter).toBe(false)

      syncSqliteMessage('s1', { ...session.messages[3], content: 'updated in sqlite' }, 4)
      const updated = getSqliteMessagesPage({ sessionId: 's1', anchor: 'tail', limit: 1 })
      expect(updated?.messages?.[0]?.content).toBe('updated in sqlite')
    } finally {
      process.env.HOME = previousHome
    }
  })
})
