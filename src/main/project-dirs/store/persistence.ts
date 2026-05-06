/**
 * Synchronous JSON I/O for project-dirs storage.
 *
 *   ~/.onething/project-dirs/
 *   ├── index.json
 *   └── data/
 *       └── <id>.json
 *
 * Mutations are infrequent (user/AI-driven, seconds apart at most), so
 * we write directly without throttling. Reads at boot pull the index
 * once; per-project reads happen on-demand for `get`.
 */

import { homedir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { PROJECT_INDEX_SCHEMA, PROJECT_SCHEMA, type Project, type ProjectIndex } from '../types.js'

const ROOT_DIR = path.join(homedir(), '.onething', 'project-dirs')
const INDEX_PATH = path.join(ROOT_DIR, 'index.json')
const DATA_DIR = path.join(ROOT_DIR, 'data')

/** Test hook — production code never overrides. */
let rootDirOverride: string | null = null
export function setRootDirForTests(dir: string | null): void {
  rootDirOverride = dir
}
function rootDir(): string { return rootDirOverride ?? ROOT_DIR }
function indexPath(): string { return path.join(rootDir(), 'index.json') }
function dataDir(): string { return path.join(rootDir(), 'data') }
function projectFilePath(id: string): string { return path.join(dataDir(), `${id}.json`) }

function ensureDirs(): void {
  fs.mkdirSync(rootDir(), { recursive: true })
  fs.mkdirSync(dataDir(), { recursive: true })
}

// ── Index file ─────────────────────────────────────

export function loadIndex(): ProjectIndex {
  try {
    if (!fs.existsSync(indexPath())) return { projects: [] }
    const raw = JSON.parse(fs.readFileSync(indexPath(), 'utf-8'))
    const result = PROJECT_INDEX_SCHEMA.safeParse(raw)
    if (!result.success) {
      console.warn('[project-dirs] index.json failed schema validation, treating as empty', result.error.flatten())
      return { projects: [] }
    }
    return result.data
  } catch (err) {
    console.warn('[project-dirs] failed to read index.json:', err)
    return { projects: [] }
  }
}

export function saveIndex(index: ProjectIndex): void {
  ensureDirs()
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2), 'utf-8')
}

// ── Per-project files ───────────────────────────────

export function loadProject(id: string): Project | null {
  const file = projectFilePath(id)
  try {
    if (!fs.existsSync(file)) return null
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const result = PROJECT_SCHEMA.safeParse(raw)
    if (!result.success) {
      console.warn(`[project-dirs] data/${id}.json failed schema validation, ignoring`, result.error.flatten())
      return null
    }
    return result.data
  } catch (err) {
    console.warn(`[project-dirs] failed to read data/${id}.json:`, err)
    return null
  }
}

export function saveProject(project: Project): void {
  ensureDirs()
  fs.writeFileSync(projectFilePath(project.id), JSON.stringify(project, null, 2), 'utf-8')
}

export function deleteProject(id: string): void {
  const file = projectFilePath(id)
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch (err) {
    console.warn(`[project-dirs] failed to delete data/${id}.json:`, err)
  }
}
