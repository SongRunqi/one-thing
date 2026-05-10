/**
 * Plugin Store — per-plugin persistent key-value storage.
 *
 * Each plugin gets a JSON file at ~/.onething/plugin-data/{plugin-id}.json.
 * Auto-saves on set/delete. Loads lazily on first access.
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

function getDataDir(): string {
  const configDir = app?.getPath?.('userData') || path.join(process.env.HOME || '~', '.onething')
  return path.join(configDir, 'plugin-data')
}

export class PluginStore {
  private data: Record<string, unknown> = {}
  private filePath: string
  private loaded = false

  constructor(private pluginId: string) {
    const dir = getDataDir()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.filePath = path.join(dir, `${pluginId}.json`)
  }

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        this.data = JSON.parse(raw)
      }
    } catch (err) {
      console.error(`[PluginStore:${this.pluginId}] Failed to load store:`, err)
      this.data = {}
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (err) {
      console.error(`[PluginStore:${this.pluginId}] Failed to save store:`, err)
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
