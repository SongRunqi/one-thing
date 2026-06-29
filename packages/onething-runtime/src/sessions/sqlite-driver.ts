import { createRequire } from 'node:module'

type BetterSqliteModule = typeof import('better-sqlite3')
export type SessionDatabaseConnection = import('better-sqlite3').Database

const require = createRequire(import.meta.url)

function loadBetterSqlite(): BetterSqliteModule {
  return require('better-sqlite3') as BetterSqliteModule
}

export function createSessionDatabaseConnection(databasePath: string): SessionDatabaseConnection {
  const Database = loadBetterSqlite()
  return new Database(databasePath)
}
