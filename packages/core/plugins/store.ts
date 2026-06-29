import path from 'path'
import {
  ensureDir,
  readJsonFile,
  writeJsonFile,
} from '../storage/index.js'

export interface PluginStoreOptions {
  dataDir: string
}

export class CorePluginStore {
  private data: Record<string, unknown> = {}
  private readonly filePath: string
  private loaded = false

  constructor(private readonly pluginId: string, options: PluginStoreOptions) {
    ensureDir(options.dataDir)
    this.filePath = path.join(options.dataDir, `${pluginId}.json`)
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      this.data = readJsonFile<Record<string, unknown>>(this.filePath, {})
    } catch (error) {
      console.error(`[PluginStore:${this.pluginId}] Failed to load store:`, error)
      this.data = {}
    }
  }

  private save(): void {
    try {
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
    this.ensureLoaded()
    this.data[key] = value
    this.save()
  }

  delete(key: string): void {
    this.ensureLoaded()
    delete this.data[key]
    this.save()
  }

  keys(): string[] {
    this.ensureLoaded()
    return Object.keys(this.data)
  }
}
