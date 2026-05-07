#!/usr/bin/env node
/**
 * Project directories migration script.
 *
 * One-shot: moves project_dirs out of variables.json into the new
 * project-dirs module's storage, and seeds entries from existing
 * sessions' workingDirectory values.
 *
 *   Before: ~/.onething/variables.json containing project_dirs[]
 *   After:  ~/.onething/project-dirs/index.json + data/<id>.json
 *
 * Usage:
 *   node scripts/migrate-project-dirs.mjs
 *
 * Idempotent — re-runs detect existing project-dirs storage and skip.
 *
 * The runtime app NEVER calls this. Run it manually after upgrading.
 */

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ── Paths (mirror src/main/stores/paths.ts) ──────────

const STORE_ROOT = join(homedir(), '.onething')
const VARIABLES_PATH = join(STORE_ROOT, 'variables.json')
const SETTINGS_PATH = join(STORE_ROOT, 'settings.json')
const SESSIONS_DIR = join(STORE_ROOT, 'sessions')
const SESSIONS_INDEX_PATH = join(SESSIONS_DIR, 'index.json')
const PROJECT_DIRS_DIR = join(STORE_ROOT, 'project-dirs')
const PROJECT_DIRS_INDEX_PATH = join(PROJECT_DIRS_DIR, 'index.json')
const PROJECT_DIRS_DATA_DIR = join(PROJECT_DIRS_DIR, 'data')

// ── Helpers ──────────────────────────────────────────

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (e) {
    console.warn(`  (could not parse ${path}: ${e.message})`)
    return fallback
  }
}

function writeJson(path, data) {
  const dir = path.replace(/\/[^/]+$/, '')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

function projectIdFromPath(path) {
  const canonical = path.replace(/\/+$/, '')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

// ── Migration ────────────────────────────────────────

function loadSessions() {
  if (!existsSync(SESSIONS_INDEX_PATH)) return []
  const index = readJson(SESSIONS_INDEX_PATH, [])
  if (!Array.isArray(index)) return []

  const sessions = []
  for (const meta of index) {
    if (!meta?.id) continue
    const sessionPath = join(SESSIONS_DIR, `${meta.id}.json`)
    const session = readJson(sessionPath, null)
    if (!session) continue
    sessions.push({
      name: session.name || '',
      workingDirectory: session.workingDirectory || '',
      updatedAt: session.updatedAt || 0,
    })
  }
  return sessions
}

function buildProjectsFromLegacy() {
  const byPath = new Map()
  const now = Date.now()

  // 1. Pull existing entries from variables.json (if any).
  const variables = readJson(VARIABLES_PATH, null)
  if (variables && Array.isArray(variables.project_dirs)) {
    for (const entry of variables.project_dirs) {
      if (!entry?.path) continue
      byPath.set(entry.path, {
        path: entry.path,
        description: entry.description || '',
        addedAt: entry.addedAt ?? now,
        lastUsedAt: entry.lastUsedAt ?? now,
      })
    }
    console.log(`  found ${variables.project_dirs.length} entries in variables.json`)
  }

  // 2. Sweep sessions, prefer the most recent description for each path.
  const sessions = loadSessions().sort((a, b) => b.updatedAt - a.updatedAt)
  let sessionAdds = 0
  for (const s of sessions) {
    if (!s.workingDirectory) continue
    if (byPath.has(s.workingDirectory)) continue
    byPath.set(s.workingDirectory, {
      path: s.workingDirectory,
      description: s.name || '(no name)',
      addedAt: s.updatedAt || now,
      lastUsedAt: s.updatedAt || now,
    })
    sessionAdds++
  }
  if (sessionAdds > 0) {
    console.log(`  seeded ${sessionAdds} more entries from sessions`)
  }

  return [...byPath.values()]
}

function alreadyMigrated() {
  if (!existsSync(PROJECT_DIRS_DIR)) return false
  if (!existsSync(PROJECT_DIRS_INDEX_PATH)) return false
  // Defensive: if data dir is empty AND legacy storage still has
  // project_dirs, assume an interrupted/partial migration and re-run.
  try {
    const dataFiles = readdirSync(PROJECT_DIRS_DATA_DIR).filter((f) => f.endsWith('.json'))
    if (dataFiles.length > 0) return true
  } catch {
    // No data dir yet
  }
  return false
}

function writeProjects(projects) {
  if (!existsSync(PROJECT_DIRS_DATA_DIR)) {
    mkdirSync(PROJECT_DIRS_DATA_DIR, { recursive: true })
  }

  const index = { projects: [] }
  for (const p of projects) {
    const id = projectIdFromPath(p.path)
    const record = {
      id,
      path: p.path,
      description: p.description,
      addedAt: p.addedAt,
      lastUsedAt: p.lastUsedAt,
    }
    writeJson(join(PROJECT_DIRS_DATA_DIR, `${id}.json`), record)
    index.projects.push({ id, path: p.path, lastUsedAt: p.lastUsedAt })
  }
  writeJson(PROJECT_DIRS_INDEX_PATH, index)
}

function strippedVariablesJson(variables) {
  if (!variables || typeof variables !== 'object') return null
  const next = {
    ai_note_dir: variables.ai_note_dir
      ?? variables.aiNoteDir
      ?? readJson(SETTINGS_PATH, {})?.general?.aiNoteDir
      ?? '~/.onething/notes',
    user_note_dir: variables.user_note_dir
      ?? variables.userNoteDir
      ?? readJson(SETTINGS_PATH, {})?.general?.userNoteDir
      ?? '',
  }
  return next
}

function main() {
  console.log(`Store root: ${STORE_ROOT}`)

  if (alreadyMigrated()) {
    console.log('✓ project-dirs storage already exists, nothing to do.')
    return
  }

  console.log('Loading legacy data...')
  const projects = buildProjectsFromLegacy()
  console.log(`Migrating ${projects.length} project(s) → ${PROJECT_DIRS_DIR}`)

  writeProjects(projects)
  console.log('✓ wrote project-dirs/index.json + per-project data files')

  // Strip project_dirs / version from variables.json so the new code
  // path reads a clean shape.
  const variables = readJson(VARIABLES_PATH, null)
  if (variables) {
    const next = strippedVariablesJson(variables)
    writeJson(VARIABLES_PATH, next)
    console.log('✓ rewrote variables.json without project_dirs/version')
  } else {
    console.log('  (no variables.json to update — leaving as-is)')
  }

  console.log('\nMigration complete.')
}

main()
