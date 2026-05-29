import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Regression guard for the incremental structural message ops in
 * `sqlite-repository.ts` (deleteSqliteMessage / deleteSqliteMessageAndAfter /
 * upsertSqliteMessageAndTruncate). Those replaced the O(n) full-session rewrite.
 *
 * The invariant they must preserve is: `seq` stays contiguous 1..N (== position),
 * which pagination depends on (getSqliteMessagesPage / hasMoreAfter), AND the
 * renumber must never transiently violate UNIQUE(session_id, seq).
 *
 * This test uses Node's built-in `node:sqlite` (no native rebuild needed) and
 * mirrors the EXACT schema + SQL statements used by the repository helpers, so
 * if that SQL changes it must change here too. (The real helpers run on
 * better-sqlite3, whose binding is Electron-built and not loadable under plain
 * vitest; the full integration path is covered under `bun run test`.)
 */

const SID = 's'

function seed(n: number): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    UNIQUE (session_id, seq)
  )`)
  const ins = db.prepare('INSERT INTO messages (id, session_id, seq, content) VALUES (?, ?, ?, ?)')
  for (let i = 1; i <= n; i++) ins.run(`m${i}`, SID, i, `c${i}`)
  return db
}

function read(db: DatabaseSync): Array<{ id: string; seq: number; content: string }> {
  return db
    .prepare('SELECT id, seq, content FROM messages WHERE session_id = ? ORDER BY seq ASC')
    .all(SID) as Array<{ id: string; seq: number; content: string }>
}

function seqLookup(db: DatabaseSync, id: string): number {
  return (db.prepare('SELECT seq FROM messages WHERE session_id = ? AND id = ?').get(SID, id) as { seq: number }).seq
}

// Mirrors deleteSqliteMessage(): delete one row + negate two-step renumber.
function deleteMessage(db: DatabaseSync, id: string): void {
  const seq = seqLookup(db, id)
  db.prepare('DELETE FROM messages WHERE session_id = ? AND id = ?').run(SID, id)
  db.prepare('UPDATE messages SET seq = -(seq - 1) WHERE session_id = ? AND seq > ?').run(SID, seq)
  db.prepare('UPDATE messages SET seq = -seq WHERE session_id = ? AND seq < 0').run(SID)
}

// Mirrors deleteSqliteMessageAndAfter(): delete the row and everything after.
function deleteMessageAndAfter(db: DatabaseSync, id: string): void {
  const seq = seqLookup(db, id)
  db.prepare('DELETE FROM messages WHERE session_id = ? AND seq >= ?').run(SID, seq)
}

// Mirrors upsertSqliteMessageAndTruncate(): upsert at seq + delete strictly after.
function upsertAndTruncate(db: DatabaseSync, id: string, seq: number, content: string): void {
  db.prepare(`INSERT INTO messages (id, session_id, seq, content) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, content = excluded.content`).run(id, SID, seq, content)
  db.prepare('DELETE FROM messages WHERE session_id = ? AND seq > ?').run(SID, seq)
}

function expectContiguous(rows: Array<{ seq: number }>): void {
  expect(rows.map(r => r.seq)).toEqual(rows.map((_, i) => i + 1))
}

describe('sqlite message structural ops keep seq contiguous', () => {
  let db: DatabaseSync
  beforeEach(() => { db = seed(5) })

  it('deleteMessage removes a middle row and renumbers without UNIQUE violation', () => {
    deleteMessage(db, 'm2')
    const rows = read(db)
    expect(rows.map(r => r.id)).toEqual(['m1', 'm3', 'm4', 'm5'])
    expectContiguous(rows)
  })

  it('deleteMessage handles the first row', () => {
    deleteMessage(db, 'm1')
    const rows = read(db)
    expect(rows.map(r => r.id)).toEqual(['m2', 'm3', 'm4', 'm5'])
    expectContiguous(rows)
  })

  it('deleteMessage handles the last row (no renumber needed)', () => {
    deleteMessage(db, 'm5')
    const rows = read(db)
    expect(rows.map(r => r.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expectContiguous(rows)
  })

  it('deleteMessageAndAfter tail-truncates and stays contiguous', () => {
    deleteMessageAndAfter(db, 'm3')
    const rows = read(db)
    expect(rows.map(r => r.id)).toEqual(['m1', 'm2'])
    expectContiguous(rows)
  })

  it('upsertAndTruncate edits the kept message and drops everything after', () => {
    upsertAndTruncate(db, 'm2', 2, 'EDITED')
    const rows = read(db)
    expect(rows.map(r => r.id)).toEqual(['m1', 'm2'])
    expect(rows.find(r => r.id === 'm2')?.content).toBe('EDITED')
    expectContiguous(rows)
  })
})
