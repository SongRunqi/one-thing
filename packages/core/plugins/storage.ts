/**
 * 插件数据目录(R4)。
 *
 * **作用域已拍板:全局(per-plugin),不做 per-agent** —— 一个插件一个目录
 * `<store>/plugin-data/<pluginId>/`。要按 agent 分,插件自己在目录内建子结构:
 * 数据主权归插件,宿主不替它发明数据模型。
 *
 * 这一层是宪法第 6 条数据侧的地基:**插件的全部落盘足迹 = 一个目录 +
 * plugin-settings 里的几个键**。足迹可枚举,卸载与孤儿归档才有得做。
 */
import fs from 'fs'
import path from 'path'
import {
  ensureDir,
  isDirectory,
  pathExists,
  readJsonFile,
  writeJsonFile,
} from '../storage/index.js'
import { describeNonSerializable } from './request-channel.js'

/** 归档落点。它自己不是插件目录,孤儿扫描必须跳过它。 */
export const PLUGIN_DATA_LEGACY_BACKUP_DIR = 'legacy-backup'
/** KV 并入目录后的文件名(旧的 `<root>/<id>.json` 惰性搬进来)。 */
export const PLUGIN_KV_FILE_NAME = 'kv.json'

/**
 * 文件名穿越防护。
 *
 * 插件给的 name 只允许是**单段文件名**:`../../.ssh/id_rsa` 与 `a/b` 都要拒。
 * 这是 in-process 时代唯一能做的沙箱 —— 插件本来就能直接 require('fs'),
 * 但 api 这条被中介的通道必须自己干净,否则 H 线把它换成 RPC 时,
 * 服务端会照单全收一个恶意路径。
 */
const FORBIDDEN_STORAGE_NAMES = new Set(['__proto__', 'constructor', 'prototype', '.', '..'])

export function assertSafePluginFileName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Plugin storage name must be a non-empty string')
  }
  const trimmed = name.trim()
  if (trimmed !== name) {
    throw new Error(`Plugin storage name "${name}" must not have surrounding whitespace`)
  }
  if (FORBIDDEN_STORAGE_NAMES.has(trimmed)) {
    throw new Error(`Plugin storage name "${trimmed}" is reserved`)
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Plugin storage name "${trimmed}" must be a single file name, not a path`)
  }
  if (trimmed.includes('\0')) {
    throw new Error('Plugin storage name must not contain a null byte')
  }
  if (path.isAbsolute(trimmed) || path.basename(trimmed) !== trimmed) {
    throw new Error(`Plugin storage name "${trimmed}" must be a single file name, not a path`)
  }
  return trimmed
}

export function getCorePluginDataDir(dataRoot: string, pluginId: string): string {
  return path.join(dataRoot, assertSafePluginFileName(pluginId))
}

/** KV 并入目录之前的老位置。 */
export function getCorePluginLegacyKvPath(dataRoot: string, pluginId: string): string {
  return path.join(dataRoot, `${assertSafePluginFileName(pluginId)}.json`)
}

export function getCorePluginKvPath(dataRoot: string, pluginId: string): string {
  return path.join(getCorePluginDataDir(dataRoot, pluginId), PLUGIN_KV_FILE_NAME)
}

/**
 * 惰性迁移:旧的 `<root>/<id>.json` 搬进 `<root>/<id>/kv.json`。
 *
 * 首次访问时做,不搞启动期全量迁移 —— 没人碰过的插件不该因为一次升级就被动过。
 * 目标已存在则保留目标(它更新),旧文件原地留着等孤儿扫描归档,不静默删。
 */
export function migrateLegacyPluginKv(dataRoot: string, pluginId: string): boolean {
  const legacyPath = getCorePluginLegacyKvPath(dataRoot, pluginId)
  if (!pathExists(legacyPath)) return false

  const kvPath = getCorePluginKvPath(dataRoot, pluginId)
  if (pathExists(kvPath)) return false

  try {
    ensureDir(getCorePluginDataDir(dataRoot, pluginId))
    fs.renameSync(legacyPath, kvPath)
    return true
  } catch (error) {
    console.error(`[PluginStorage] Failed to migrate legacy KV for "${pluginId}":`, error)
    return false
  }
}

export interface CorePluginStorage {
  /** 插件的数据目录;宿主保证它存在。 */
  dir(): string
  readJson<T = unknown>(name: string, fallback?: T): T | undefined
  writeJson(name: string, value: unknown): void
  exists(name: string): boolean
}

export interface CreateCorePluginStorageOptions {
  pluginId: string
  dataRoot: string
}

export function createCorePluginStorage(options: CreateCorePluginStorageOptions): CorePluginStorage {
  const { pluginId, dataRoot } = options
  const dir = (): string => {
    const target = getCorePluginDataDir(dataRoot, pluginId)
    ensureDir(target)
    return target
  }

  return {
    dir,
    readJson<T = unknown>(name: string, fallback?: T): T | undefined {
      const file = path.join(dir(), assertSafePluginFileName(name))
      if (!pathExists(file)) return fallback
      return readJsonFile<T>(file, fallback as T)
    },
    writeJson(name: string, value: unknown): void {
      const safeName = assertSafePluginFileName(name)
      // 过线皆可序列化(宪法第 2 条)—— 写盘也是一条"线":一个 Map 落进 JSON
      // 会静默变成 `{}`,那是最难查的一类数据丢失。
      const problem = describeNonSerializable(value, `storage value for "${safeName}"`)
      if (problem) {
        throw new Error(`Plugin storage value must be JSON-serializable: ${problem}`)
      }
      writeJsonFile(path.join(dir(), safeName), value)
    },
    exists(name: string): boolean {
      return pathExists(path.join(getCorePluginDataDir(dataRoot, pluginId), assertSafePluginFileName(name)))
    },
  }
}

// ── 足迹与归档 ────────────────────────────────

export interface CorePluginDataFootprint {
  pluginId: string
  /** 数据目录(可能尚不存在)。 */
  dataDir: string
  dataDirExists: boolean
  /** 目录内的文件名(单层;插件自建的子目录只报目录名)。 */
  entries: string[]
  /** 尚未迁移的旧 KV 文件。 */
  legacyKvPath: string
  legacyKvExists: boolean
}

export function getCorePluginDataFootprint(dataRoot: string, pluginId: string): CorePluginDataFootprint {
  const dataDir = getCorePluginDataDir(dataRoot, pluginId)
  const legacyKvPath = getCorePluginLegacyKvPath(dataRoot, pluginId)
  let entries: string[] = []
  const dataDirExists = isDirectory(dataDir)
  if (dataDirExists) {
    try {
      entries = fs.readdirSync(dataDir).sort()
    } catch {
      entries = []
    }
  }
  return {
    pluginId,
    dataDir,
    dataDirExists,
    entries,
    legacyKvPath,
    legacyKvExists: pathExists(legacyKvPath),
  }
}

function formatArchiveDate(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * 归档目标带日期;同日重复归档时加序号。
 *
 * 撞名时**不覆盖**:归档的全部意义就是"删之前留一份",覆盖掉上一次归档等于
 * 把它删了两次。
 */
function resolveArchiveTarget(dataRoot: string, pluginId: string, now: Date): string {
  const backupRoot = path.join(dataRoot, PLUGIN_DATA_LEGACY_BACKUP_DIR)
  const base = path.join(backupRoot, `${pluginId}-${formatArchiveDate(now)}`)
  if (!pathExists(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!pathExists(candidate)) return candidate
  }
  throw new Error(`Cannot find a free archive slot for "${pluginId}"`)
}

export interface ArchiveCorePluginDataResult {
  archived: boolean
  archivePath?: string
  error?: string
}

/**
 * 把一个插件的数据目录(以及尚未迁移的旧 KV 文件)整体挪进 legacy-backup。
 *
 * 失败**不抛**:卸载/孤儿归档都是多步流程,归档失败时原数据要留在原地
 * 让调用方能报出来,而不是把整条流程带崩、留下半拆状态。
 */
export function archiveCorePluginData(
  dataRoot: string,
  pluginId: string,
  options: { now?: Date } = {},
): ArchiveCorePluginDataResult {
  const footprint = getCorePluginDataFootprint(dataRoot, pluginId)
  if (!footprint.dataDirExists && !footprint.legacyKvExists) {
    return { archived: false }
  }

  try {
    const target = resolveArchiveTarget(dataRoot, pluginId, options.now ?? new Date())
    ensureDir(path.dirname(target))
    if (footprint.dataDirExists) {
      fs.renameSync(footprint.dataDir, target)
    } else {
      ensureDir(target)
    }
    if (footprint.legacyKvExists) {
      fs.renameSync(footprint.legacyKvPath, path.join(target, PLUGIN_KV_FILE_NAME))
    }
    return { archived: true, archivePath: target }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[PluginStorage] Failed to archive data for "${pluginId}":`, error)
    return { archived: false, error: message }
  }
}

export interface CorePluginDataOrphan {
  pluginId: string
  kind: 'directory' | 'legacy-kv'
}

/**
 * 无主数据:既不是内置插件也不是已安装的用户插件。
 *
 * 手删 `<store>/plugins/<id>/` 是真实存在的卸载路径(在 R4 之前是**唯一**的),
 * 宿主对它零感知,数据就永远躺在那儿。这条扫描把它收口。
 */
export function findCorePluginDataOrphans(dataRoot: string, knownPluginIds: Iterable<string>): CorePluginDataOrphan[] {
  if (!isDirectory(dataRoot)) return []
  const known = new Set(knownPluginIds)
  const orphans: CorePluginDataOrphan[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dataRoot, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (entry.name === PLUGIN_DATA_LEGACY_BACKUP_DIR) continue
    if (entry.name.startsWith('.')) continue

    if (entry.isDirectory()) {
      if (!known.has(entry.name)) orphans.push({ pluginId: entry.name, kind: 'directory' })
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const pluginId = entry.name.slice(0, -'.json'.length)
      if (!known.has(pluginId)) orphans.push({ pluginId, kind: 'legacy-kv' })
    }
  }

  return orphans.sort((a, b) => a.pluginId.localeCompare(b.pluginId))
}
