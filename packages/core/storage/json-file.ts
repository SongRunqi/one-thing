import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

export interface CoreDirEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
}

export interface CoreFileStat {
  isFile(): boolean
  isDirectory(): boolean
  size: number
  mtimeMs: number
}

export interface CoreFileWatcher {
  close(): void
  on(event: 'error', listener: (error: Error) => void): this
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function ensureDirAsync(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true })
}

export function dirnamePath(filePath: string): string {
  return path.dirname(filePath)
}

export function basenamePath(filePath: string): string {
  return path.basename(filePath)
}

export function extnamePath(filePath: string): string {
  return path.extname(filePath)
}

export function joinPaths(...segments: string[]): string {
  return path.join(...segments)
}

export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath)
}

export function relativePath(from: string, to: string): string {
  return path.relative(from, to)
}

export function resolvePath(...segments: string[]): string {
  return path.resolve(...segments)
}

export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

export function pathExistsInDir(baseDir: string, relativePath: string): boolean {
  return pathExists(path.join(baseDir, relativePath))
}

export function isDirectory(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

export function isFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function relativePathPosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}

export interface ListFilesUnderRootsOptions {
  ignoreUnreadable?: boolean
}

export function listFilesUnderRoots(
  baseDir: string,
  roots: Iterable<string>,
  options: ListFilesUnderRootsOptions = {},
): string[] {
  const ignoreUnreadable = options.ignoreUnreadable ?? true
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        files.push(relativePathPosix(baseDir, fullPath))
      }
    }
  }

  for (const root of roots) {
    const rootDir = path.join(baseDir, root)
    if (!pathExists(rootDir)) continue
    try {
      walk(rootDir)
    } catch (error) {
      if (!ignoreUnreadable) throw error
    }
  }

  return files.sort()
}

export function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8').trim()
      if (!content) {
        return defaultValue
      }
      return JSON.parse(content) as T
    }
  } catch {
    console.warn(`Failed to parse ${path.basename(filePath)}, using defaults`)
  }
  return defaultValue
}

export function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

export async function readTextFileAsync(filePath: string): Promise<string> {
  return fsp.readFile(filePath, 'utf-8')
}

export async function readBinaryFile(filePath: string): Promise<Buffer> {
  return fsp.readFile(filePath)
}

export async function readTextFileIfExists(filePath: string, fallback = ''): Promise<string> {
  try {
    return await readTextFileAsync(filePath)
  } catch {
    return fallback
  }
}

export async function statPath(filePath: string): Promise<CoreFileStat | null> {
  try {
    return await fsp.stat(filePath)
  } catch {
    return null
  }
}

export async function listDirectoryEntries(dir: string): Promise<CoreDirEntry[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  return entries.map(entry => ({
    name: entry.name,
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }))
}

export function watchDirectoryRecursive(
  dir: string,
  onChange: (eventType: string, filename: string | Buffer | null) => void,
): CoreFileWatcher {
  return fs.watch(dir, { recursive: true }, onChange)
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    const dir = path.dirname(filePath)
    ensureDir(dir)
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error)
    throw error
  }
}

export function writeTextFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  ensureDir(dir)
  fs.writeFileSync(filePath, content, 'utf-8')
}

export async function writeTextFileAsync(filePath: string, content: string): Promise<void> {
  await fsp.writeFile(filePath, content, 'utf-8')
}

export async function appendTextFile(filePath: string, content: string): Promise<void> {
  await ensureDirAsync(path.dirname(filePath))
  await fsp.appendFile(filePath, content, 'utf-8')
}

export function writeTextFileInDir(baseDir: string, relativePath: string, content: string): void {
  writeTextFile(path.join(baseDir, relativePath), content)
}

export async function writeJsonFileAsync<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath)
  await fsp.mkdir(dir, { recursive: true })
  const tmpPath = filePath + '.tmp'
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await fsp.rename(tmpPath, filePath)
}

export async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fsp.mkdir(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  await fsp.writeFile(tmpPath, content, 'utf-8')
  await fsp.rename(tmpPath, filePath)
}

export async function writeTextFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fsp.access(filePath, fs.constants.F_OK)
  } catch {
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, content, 'utf-8')
  }
}

export function readTextFileLimited(
  filePath: string,
  maxChars: number,
  truncate: (content: string, maxChars: number) => string = (content, limit) => content.slice(0, limit),
): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return truncate(content, maxChars)
  } catch {
    return ''
  }
}

export function deleteJsonFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  } catch (error) {
    console.error(`Error deleting ${filePath}:`, error)
  }
  return false
}
