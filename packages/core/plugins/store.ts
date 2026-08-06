import {
  ensureDir,
  readJsonFile,
  writeJsonFile,
} from '../storage/index.js'
import {
  getCorePluginDataDir,
  getCorePluginKvPath,
  migrateLegacyPluginKv,
} from './storage.js'

export interface PluginStoreOptions {
  /** plugin-data 的**根**目录;具体落点由 CorePluginStore 决定。 */
  dataDir: string
}

/**
 * 插件 KV。
 *
 * R4 起落在 `<root>/<pluginId>/kv.json` 而不是 `<root>/<pluginId>.json` ——
 * 这样"插件的全部落盘足迹"就是一个目录,卸载与归档只需要搬一次。
 * 旧文件在首次访问时惰性搬进来,api.store 的行为一点没变。
 */
export class CorePluginStore {
  private data: Record<string, unknown> = {}
  private readonly dataRoot: string
  private loaded = false

  private disposed = false

  constructor(private readonly pluginId: string, options: PluginStoreOptions) {
    this.dataRoot = options.dataDir
    ensureDir(this.dataRoot)
  }

  /**
   * 拆除闩。
   *
   * 没有它的话:一个被 abort 的异步回调事后调 store.set,save() 里的 ensureDir
   * 会把刚刚归档掉的数据目录**复活成一个鬼目录** —— 下一轮孤儿扫描又把它搬走,
   * 如此往复。
   */
  dispose(): void {
    this.disposed = true
  }

  private rejectIfDisposed(what: string): boolean {
    if (!this.disposed) return false
    console.error(
      `[PluginStore:${this.pluginId}] Ignoring store.${what} after dispose — the plugin resumed past its teardown.`,
    )
    return true
  }

  private get filePath(): string {
    return getCorePluginKvPath(this.dataRoot, this.pluginId)
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      // 惰性迁移:没人碰过的插件不该因为一次升级就被动过。
      migrateLegacyPluginKv(this.dataRoot, this.pluginId)
      this.data = readJsonFile<Record<string, unknown>>(this.filePath, {})
    } catch (error) {
      console.error(`[PluginStore:${this.pluginId}] Failed to load store:`, error)
      this.data = {}
    }
  }

  private save(): void {
    try {
      ensureDir(getCorePluginDataDir(this.dataRoot, this.pluginId))
      writeJsonFile(this.filePath, this.data)
    } catch (error) {
      console.error(`[PluginStore:${this.pluginId}] Failed to save store:`, error)
    }
  }

  get<T = unknown>(key: string): T | undefined {
    this.ensureLoaded()
    return this.data[key] as T | undefined
  }

  set<T = unknown>(key: string, value: T): void {
    if (this.rejectIfDisposed('set')) return
    this.ensureLoaded()
    this.data[key] = value
    this.save()
  }

  delete(key: string): void {
    if (this.rejectIfDisposed('delete')) return
    this.ensureLoaded()
    delete this.data[key]
    this.save()
  }

  keys(): string[] {
    this.ensureLoaded()
    return Object.keys(this.data)
  }
}
