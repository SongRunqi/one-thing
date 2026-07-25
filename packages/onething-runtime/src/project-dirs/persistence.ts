import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOnethingStorePath } from '../storage/paths.js'
import {
  parseProject,
  parseProjectIndex,
  type Project,
  type ProjectIndex,
} from './types.js'

let rootDirOverride: string | null = null

export function setRootDirForTests(dir: string | null): void {
  rootDirOverride = dir
}

function rootDir(): string {
  // Lazy + env-aware: headless hosts scope the store via ONETHING_STORE_PATH
  // (a hardcoded ~/.onething here once let an isolated server write into the
  // user's real store). Desktop behavior is unchanged — env unset resolves to
  // ~/.onething.
  return rootDirOverride ?? path.join(getOnethingStorePath(), 'project-dirs')
}

function indexPath(): string {
  return path.join(rootDir(), 'index.json')
}

function dataDir(): string {
  return path.join(rootDir(), 'data')
}

function projectFilePath(id: string): string {
  return path.join(dataDir(), `${id}.json`)
}

function ensureDirs(): void {
  fs.mkdirSync(rootDir(), { recursive: true })
  fs.mkdirSync(dataDir(), { recursive: true })
}

export function loadIndex(): ProjectIndex {
  try {
    if (!fs.existsSync(indexPath())) return { projects: [] }
    const parsed = parseProjectIndex(JSON.parse(fs.readFileSync(indexPath(), 'utf-8')))
    if (!parsed) {
      console.warn('[project-dirs] index.json failed schema validation, treating as empty')
      return { projects: [] }
    }
    return parsed
  } catch (err) {
    console.warn('[project-dirs] failed to read index.json:', err)
    return { projects: [] }
  }
}

export function saveIndex(index: ProjectIndex): void {
  ensureDirs()
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2), 'utf-8')
}

export function loadProject(id: string): Project | null {
  const file = projectFilePath(id)
  try {
    if (!fs.existsSync(file)) return null
    const project = parseProject(JSON.parse(fs.readFileSync(file, 'utf-8')))
    if (!project) {
      console.warn(`[project-dirs] data/${id}.json failed schema validation, ignoring`)
      return null
    }
    return project
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
