import Database from 'better-sqlite3'
import type {
  MemoryChunk,
  MemoryWorkspace,
  SearchHit,
} from './types.js'
import { getDb } from './database.js'
import { cosine, ftsQuery } from './workspace.js'
import type { MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  buildSoulMemoryMarkdownSearchHits as coreBuildSoulMemoryMarkdownSearchHits,
  rowToSoulMemoryChunk as coreRowToSoulMemoryChunk,
  type CoreSoulMemoryIndexedChunkRow,
} from '../plugins/index.js'

export type MarkdownMemorySearchEmbeddingFn<TSettings = unknown> = (
  settings: TSettings | undefined,
  values: string[],
) => Promise<{ vectors: number[][] }>

export function rowToMemoryChunk(row: unknown): MemoryChunk {
  return coreRowToSoulMemoryChunk(row as CoreSoulMemoryIndexedChunkRow) as MemoryChunk
}

export async function searchMarkdownMemoryChunks<TSettings = unknown>(options: {
  settings?: TSettings
  workspace: MemoryWorkspace
  database?: Database.Database
  query: string
  limit: number
  minScore?: number
  embedTexts?: MarkdownMemorySearchEmbeddingFn<TSettings>
  setLastError?: (message: string) => void
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
  runId?: string
  startedAt?: number
}): Promise<SearchHit[]> {
  const database = options.database || getDb(options.workspace)
  const candidates = new Map<string, {
    chunk: MemoryChunk
    keywordScore?: number
    vectorScore?: number
  }>()

  try {
    const rows = database.prepare(`
      SELECT c.*, bm25(chunks_fts) AS rank
      FROM chunks_fts
      JOIN chunks c ON c.id = chunks_fts.id
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery(options.query), options.limit * 8) as Array<unknown>
    rows.forEach((row, index) => {
      const chunk = rowToMemoryChunk(row)
      candidates.set(chunk.id, {
        chunk,
        keywordScore: 1 / (index + 1),
      })
    })
  } catch {
    const pattern = `%${options.query.replace(/[%_]/g, '')}%`
    const rows = database.prepare(`
      SELECT * FROM chunks WHERE content LIKE ? ORDER BY mtime_ms DESC LIMIT ?
    `).all(pattern, options.limit * 8) as Array<unknown>
    rows.forEach((row, index) => {
      const chunk = rowToMemoryChunk(row)
      candidates.set(chunk.id, {
        chunk,
        keywordScore: 1 / (index + 1),
      })
    })
  }

  if (options.workspace.settings.embeddings?.enabled === true && options.embedTexts) {
    try {
      const queryEmbedding = (await options.embedTexts(options.settings, [options.query])).vectors[0]
      const rows = database.prepare(`
        SELECT * FROM chunks WHERE embedding_json IS NOT NULL
      `).all() as Array<unknown>
      const vectorScores = rows
        .map(row => {
          const chunk = rowToMemoryChunk(row)
          return { chunk, vectorScore: (cosine(queryEmbedding, chunk.embedding) + 1) / 2 }
        })
        .filter(item => item.vectorScore > 0)
        .sort((left, right) => right.vectorScore - left.vectorScore)
        .slice(0, options.limit * 8)
      for (const item of vectorScores) {
        const existing = candidates.get(item.chunk.id)
        candidates.set(item.chunk.id, {
          chunk: item.chunk,
          keywordScore: existing?.keywordScore,
          vectorScore: item.vectorScore,
        })
      }
    } catch (error: any) {
      options.setLastError?.(`Vector search unavailable; using FTS only: ${error?.message || String(error)}`)
      options.logDiagnostic?.({
        subsystem: 'search',
        operation: 'memory-search',
        stage: 'markdown-vector',
        status: 'fallback',
        durationMs: options.startedAt ? Date.now() - options.startedAt : undefined,
        runId: options.runId,
        error,
        summary: 'Markdown vector search failed; keeping FTS results.',
      })
    }
  }

  return coreBuildSoulMemoryMarkdownSearchHits<SearchHit>({
    candidates: Array.from(candidates.values()),
    temporalDecayHalfLifeDays: options.workspace.settings.search.temporalDecayHalfLifeDays,
    minScore: options.minScore,
  })
}
