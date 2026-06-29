import Database from 'better-sqlite3'
import {
  joinPaths,
  listDirectoryEntries,
  readTextFileAsync,
  relativePath,
  statPath,
} from '@onething/core/storage'
import type {
  IndexStatus,
  MemoryIndexFile,
  MemoryIndexFileStat,
  MemoryWorkspace,
} from './types.js'
import { getDb } from './database.js'
import type { MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  estimateTokens,
  sha,
} from './workspace.js'
import {
  chunkSoulMemoryText as coreChunkSoulMemoryText,
  createSoulMemoryDailyIndexFile as coreCreateSoulMemoryDailyIndexFile,
  createSoulMemoryRootMemoryIndexFile as coreCreateSoulMemoryRootMemoryIndexFile,
  isSoulMemoryIndexMarkdownFileName as coreIsSoulMemoryIndexMarkdownFileName,
  planSoulMemoryIndexFileWrite as corePlanSoulMemoryIndexFileWrite,
  planSoulMemoryIndexFreshness as corePlanSoulMemoryIndexFreshness,
  shouldSkipSoulMemoryIndexDirectoryName as coreShouldSkipSoulMemoryIndexDirectoryName,
  shouldSkipSoulMemoryIndexFileWrite as coreShouldSkipSoulMemoryIndexFileWrite,
} from '../plugins/index.js'

export type MemoryIndexEmbeddingFn<TSettings = unknown> = (
  settings: TSettings | undefined,
  values: string[],
) => Promise<{ vectors: number[][]; providerId?: string; model?: string }>

export interface MemoryIndexFileResult {
  indexed: boolean
  chunkCount: number
  embeddedChunks: number
  embeddingProvider?: string
  embeddingModel?: string
  skippedReason?: 'missing-file' | 'unchanged'
}

export function readMemoryIndexCounts(database: Database.Database): Pick<IndexStatus, 'indexedFiles' | 'indexedChunks'> {
  const countFiles = database.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number }
  const countChunks = database.prepare('SELECT COUNT(*) AS count FROM chunks').get() as { count: number }
  return {
    indexedFiles: countFiles.count,
    indexedChunks: countChunks.count,
  }
}

export async function listMemoryIndexFiles(workspace: MemoryWorkspace): Promise<MemoryIndexFile[]> {
  const files: MemoryIndexFile[] = []
  const rootMemoryStat = await statPath(workspace.memoryPath)
  if (rootMemoryStat?.isFile()) {
    files.push(coreCreateSoulMemoryRootMemoryIndexFile(workspace.memoryPath) as MemoryIndexFile)
  }

  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof listDirectoryEntries>>
    try {
      entries = await listDirectoryEntries(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const absolutePath = joinPaths(dir, entry.name)
      if (entry.isDirectory) {
        if (coreShouldSkipSoulMemoryIndexDirectoryName(entry.name)) continue
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile || !coreIsSoulMemoryIndexMarkdownFileName(entry.name)) continue
      const dailyRelativePath = relativePath(workspace.root, absolutePath)
      files.push(coreCreateSoulMemoryDailyIndexFile({
        absolutePath,
        relativePath: dailyRelativePath,
        fileName: entry.name,
      }) as MemoryIndexFile)
    }
  }

  await walk(workspace.memoryDir)
  return files
}

export async function inspectMemoryIndexFreshness(options: {
  database: Database.Database
  files: MemoryIndexFile[]
}): Promise<{
  files: MemoryIndexFileStat[]
  changedFiles: MemoryIndexFileStat[]
  deletedPaths: string[]
}> {
  const liveFiles = (await Promise.all(options.files.map(async file => {
    const stat = await statPath(file.absolutePath)
    if (!stat?.isFile()) return null
    return {
      ...file,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    }
  }))).filter((file): file is MemoryIndexFileStat => Boolean(file))

  const storedRows = options.database.prepare('SELECT path, mtime_ms, size FROM files').all() as Array<{
    path: string
    mtime_ms: number
    size: number
  }>
  return corePlanSoulMemoryIndexFreshness(liveFiles, storedRows)
}

export function deleteMemoryIndexPaths(database: Database.Database, paths: readonly string[]): void {
  if (paths.length === 0) return

  const deleteFile = database.prepare('DELETE FROM files WHERE path = ?')
  const deleteChunk = database.prepare('DELETE FROM chunks WHERE path = ?')
  const deleteFts = database.prepare('DELETE FROM chunks_fts WHERE path = ?')
  const tx = database.transaction(() => {
    for (const deletedPath of paths) {
      deleteFts.run(deletedPath)
      deleteChunk.run(deletedPath)
      deleteFile.run(deletedPath)
    }
  })
  tx()
}

export function clearMemoryIndex(database: Database.Database): void {
  database.exec('DELETE FROM files; DELETE FROM chunks; DELETE FROM chunks_fts;')
}

export async function indexMemoryFile<TSettings = unknown>(options: {
  settings?: TSettings
  workspace: MemoryWorkspace
  database?: Database.Database
  file: MemoryIndexFile
  knownStat?: Pick<MemoryIndexFileStat, 'mtimeMs' | 'size'>
  embedTexts?: MemoryIndexEmbeddingFn<TSettings>
  setLastError?: (message: string) => void
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
}): Promise<MemoryIndexFileResult> {
  const database = options.database || getDb(options.workspace)
  const stat = options.knownStat || await statPath(options.file.absolutePath)
  if (!stat) {
    return {
      indexed: false,
      chunkCount: 0,
      embeddedChunks: 0,
      skippedReason: 'missing-file',
    }
  }

  const content = await readTextFileAsync(options.file.absolutePath)
  const contentHash = sha(content)
  const existing = database.prepare('SELECT hash, mtime_ms, size FROM files WHERE path = ?').get(options.file.relativePath) as
    | { hash: string; mtime_ms: number; size: number }
    | undefined
  if (coreShouldSkipSoulMemoryIndexFileWrite(existing, contentHash, stat)) {
    return {
      indexed: false,
      chunkCount: 0,
      embeddedChunks: 0,
      skippedReason: 'unchanged',
    }
  }

  const startedAt = Date.now()
  const chunks = coreChunkSoulMemoryText(
    content,
    options.workspace.settings.search.chunkTokens,
    options.workspace.settings.search.chunkOverlap,
    estimateTokens,
  )
  options.logDiagnostic?.({
    subsystem: 'index',
    operation: 'index-file',
    stage: 'chunk',
    status: 'started',
    request: {
      path: options.file.relativePath,
      kind: options.file.kind,
      size: stat.size,
      chunkCount: chunks.length,
      embeddingsEnabled: options.workspace.settings.embeddings?.enabled === true,
    },
  })

  let embeddings: number[][] = []
  let embeddingProvider: string | undefined
  let embeddingModel: string | undefined

  if (options.workspace.settings.embeddings?.enabled === true && chunks.length > 0 && options.embedTexts) {
    try {
      for (let i = 0; i < chunks.length; i += 32) {
        const batch = chunks.slice(i, i + 32)
        const result = await options.embedTexts(options.settings, batch.map(chunk => chunk.content))
        embeddings.push(...result.vectors)
        embeddingProvider = result.providerId
        embeddingModel = result.model
      }
    } catch (error: any) {
      embeddings = []
      options.setLastError?.(`Embedding unavailable; using FTS only: ${error?.message || String(error)}`)
      options.logDiagnostic?.({
        subsystem: 'embedding',
        operation: 'index-file',
        stage: 'embed-chunks',
        status: 'fallback',
        durationMs: Date.now() - startedAt,
        request: { path: options.file.relativePath, chunkCount: chunks.length },
        error,
        summary: 'Embedding unavailable during indexing; FTS index will still be used.',
      })
    }
  }

  const oldChunkIds = (database.prepare('SELECT id FROM chunks WHERE path = ?').all(options.file.relativePath) as Array<{ id: string }>)
    .map(row => row.id)
  const writePlan = corePlanSoulMemoryIndexFileWrite({
    file: options.file,
    stat,
    contentHash,
    chunks,
    embeddings,
    embeddingProvider,
    embeddingModel,
    oldChunkIds,
    hash: sha,
  })
  writeMemoryIndexFilePlan(database, writePlan)

  options.logDiagnostic?.({
    subsystem: 'index',
    operation: 'index-file',
    stage: 'write',
    status: 'ok',
    durationMs: Date.now() - startedAt,
    response: {
      path: options.file.relativePath,
      chunkCount: chunks.length,
      embeddedChunks: embeddings.length,
      embeddingProvider: embeddingProvider || '',
      embeddingModel: embeddingModel || '',
    },
  })

  return {
    indexed: true,
    chunkCount: chunks.length,
    embeddedChunks: embeddings.length,
    embeddingProvider,
    embeddingModel,
  }
}

function writeMemoryIndexFilePlan(
  database: Database.Database,
  writePlan: ReturnType<typeof corePlanSoulMemoryIndexFileWrite>,
): void {
  const deleteChunk = database.prepare('DELETE FROM chunks WHERE id = ?')
  const deleteFts = database.prepare('DELETE FROM chunks_fts WHERE id = ?')
  const insertChunk = database.prepare(`
    INSERT INTO chunks (
      id, path, kind, date, chunk_index, start_line, end_line, content, hash,
      token_count, embedding_json, embedding_provider, embedding_model, mtime_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertFts = database.prepare('INSERT INTO chunks_fts (id, path, content) VALUES (?, ?, ?)')
  const upsertFile = database.prepare(`
    INSERT INTO files (path, kind, absolute_path, mtime_ms, size, hash, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      kind = excluded.kind,
      absolute_path = excluded.absolute_path,
      mtime_ms = excluded.mtime_ms,
      size = excluded.size,
      hash = excluded.hash,
      indexed_at = excluded.indexed_at
  `)

  const tx = database.transaction(() => {
    for (const oldId of writePlan.oldChunkIds) {
      deleteFts.run(oldId)
      deleteChunk.run(oldId)
    }
    for (const chunk of writePlan.chunks) {
      insertChunk.run(
        chunk.id,
        chunk.path,
        chunk.kind,
        chunk.date,
        chunk.chunkIndex,
        chunk.startLine,
        chunk.endLine,
        chunk.content,
        chunk.hash,
        chunk.tokenCount,
        chunk.embeddingJson,
        chunk.embeddingProvider,
        chunk.embeddingModel,
        chunk.mtimeMs,
      )
    }
    for (const row of writePlan.ftsRows) {
      insertFts.run(row.id, row.path, row.content)
    }
    upsertFile.run(
      writePlan.file.path,
      writePlan.file.kind,
      writePlan.file.absolutePath,
      writePlan.file.mtimeMs,
      writePlan.file.size,
      writePlan.file.hash,
      writePlan.file.indexedAt,
    )
  })
  tx()
}
