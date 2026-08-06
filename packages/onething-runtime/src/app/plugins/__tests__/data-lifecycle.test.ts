/**
 * R4 验收:插件数据目录与卸载生命周期。
 *
 * 拍板:数据作用域是**全局 per-plugin** —— `<store>/plugin-data/<pluginId>/`,
 * 一个插件一个目录。要按 agent 分,插件自己在目录里建子结构。
 *
 * 这一期的北极星是宪法第 6 条的数据侧:**插件的全部落盘足迹可枚举**,
 * 因此卸载与孤儿归档都不再需要手工脚本。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CorePluginManager,
  CorePluginStore,
  PLUGIN_DATA_LEGACY_BACKUP_DIR,
  PLUGIN_KV_FILE_NAME,
  archiveCorePluginData,
  assertSafePluginFileName,
  createCorePluginAPI,
  createCorePluginStorage,
  disposeCorePluginState,
  findCorePluginDataOrphans,
  getCorePluginDataFootprint,
  migrateLegacyPluginKv,
  type CorePluginDefinition,
  type CorePluginManagerHost,
  type CorePluginStateLike,
} from '@onething/core/plugins'

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'onething-plugin-data-'))
}

function silentLogger() {
  return { log: () => {}, error: () => {} }
}

describe('R4 storage surface — the api is a mediated channel, not raw fs', () => {
  it('creates the plugin directory on demand and round-trips JSON', () => {
    const root = tempRoot()
    try {
      const storage = createCorePluginStorage({ pluginId: 'notes', dataRoot: root })
      expect(storage.dir()).toBe(path.join(root, 'notes'))
      expect(fs.existsSync(storage.dir())).toBe(true)

      expect(storage.exists('index.json')).toBe(false)
      storage.writeJson('index.json', { entries: ['a'] })
      expect(storage.exists('index.json')).toBe(true)
      expect(storage.readJson('index.json')).toEqual({ entries: ['a'] })
      expect(storage.readJson('missing.json', { fallback: true })).toEqual({ fallback: true })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects every shape of path traversal', () => {
    const root = tempRoot()
    try {
      const storage = createCorePluginStorage({ pluginId: 'notes', dataRoot: root })
      for (const name of ['../escape.json', 'a/b.json', 'a\\b.json', '/etc/passwd', '..', '.', '__proto__', '']) {
        expect(() => storage.writeJson(name, {}), name).toThrow()
        expect(() => storage.readJson(name), name).toThrow()
        expect(() => storage.exists(name), name).toThrow()
      }
      // 目录之外一个文件也不该出现。
      expect(fs.readdirSync(root)).toEqual(['notes'])
      expect(fs.readdirSync(path.join(root, 'notes'))).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses non-serializable values (a Map would silently become {})', () => {
    const root = tempRoot()
    try {
      const storage = createCorePluginStorage({ pluginId: 'notes', dataRoot: root })
      expect(() => storage.writeJson('bad.json', { cache: new Map() })).toThrow(/JSON-serializable/)
      expect(() => storage.writeJson('bad.json', { cb: () => {} })).toThrow(/JSON-serializable/)
      expect(storage.exists('bad.json')).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('validates plugin ids and file names with the same rule', () => {
    expect(assertSafePluginFileName('kv.json')).toBe('kv.json')
    expect(() => assertSafePluginFileName('../x')).toThrow()
    expect(() => assertSafePluginFileName(' padded')).toThrow()
  })
})

describe('R4 api.storage wiring — latch and breaker ledger', () => {
  function buildApi(root: string, pluginId = 'notes') {
    const failures: Array<{ scope: string; error: unknown }> = []
    const result = createCorePluginAPI<
      {
        storage: {
          dir(): string
          readJson<T = unknown>(name: string, fallback?: T): T | undefined
          writeJson(name: string, value: unknown): void
          exists(name: string): boolean
        }
      },
      { name: string },
      () => void,
      { name: string },
      object,
      () => string,
      () => void,
      () => void,
      () => [],
      object,
      object
    >({
      pluginId,
      store: {},
      storage: createCorePluginStorage({ pluginId, dataRoot: root }),
      scheduler: {},
      logger: silentLogger(),
      onPluginFailure: ({ scope, error }) => failures.push({ scope, error }),
      host: {
        registerTool: () => {},
        subscribeEvent: () => () => {},
        steer: () => {},
        followUp: () => {},
        notify: () => {},
        registerPromptContextProvider: () => () => {},
        registerBeforeContextCompactHook: () => () => {},
        registerAfterAssistantResponseHook: () => () => {},
        registerSkillRoot: () => () => {},
      },
    })
    return { ...result, failures }
  }

  it('books a traversal attempt into the breaker ledger and still throws at the plugin', () => {
    const root = tempRoot()
    try {
      const { api, failures } = buildApi(root)
      expect(() => api.storage.writeJson('../escape.json', {})).toThrow()
      // 记账是为了熔断;继续抛是为了让插件当场知道自己写错了 —— 静默吞掉
      // 只会让它以为写成功了。
      expect(failures).toHaveLength(1)
      expect(failures[0].scope).toBe('storage')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('no-ops every storage entry point after dispose', () => {
    const root = tempRoot()
    try {
      const { api, state } = buildApi(root)
      api.storage.writeJson('before.json', { ok: true })
      expect(api.storage.exists('before.json')).toBe(true)

      disposeCorePluginState(state)

      api.storage.writeJson('after.json', { ok: true })
      expect(api.storage.dir()).toBe('')
      expect(api.storage.exists('before.json')).toBe(false)
      // 拆除之后的写入没有落盘 —— 否则就是一个没人能回收的孤儿文件。
      expect(fs.existsSync(path.join(root, 'notes', 'after.json'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'notes', 'before.json'))).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('R4 KV migration — one plugin, one directory', () => {
  it('moves the legacy <id>.json into <id>/kv.json lazily, without changing api.store behaviour', () => {
    const root = tempRoot()
    try {
      fs.mkdirSync(root, { recursive: true })
      fs.writeFileSync(path.join(root, 'notes.json'), JSON.stringify({ seen: 3 }), 'utf-8')

      const store = new CorePluginStore('notes', { dataDir: root })
      // 读一次就迁移完了 —— 没人碰过的插件不该因为一次升级就被动过。
      expect(store.get('seen')).toBe(3)
      expect(fs.existsSync(path.join(root, 'notes.json'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'notes', PLUGIN_KV_FILE_NAME))).toBe(true)

      store.set('seen', 4)
      expect(new CorePluginStore('notes', { dataDir: root }).get('seen')).toBe(4)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the newer kv.json when both exist and leaves the legacy file for the orphan sweep', () => {
    const root = tempRoot()
    try {
      fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
      fs.writeFileSync(path.join(root, 'notes.json'), JSON.stringify({ from: 'legacy' }), 'utf-8')
      fs.writeFileSync(path.join(root, 'notes', PLUGIN_KV_FILE_NAME), JSON.stringify({ from: 'new' }), 'utf-8')

      expect(migrateLegacyPluginKv(root, 'notes')).toBe(false)
      expect(new CorePluginStore('notes', { dataDir: root }).get('from')).toBe('new')
      // 不静默删旧文件:它进足迹,由归档处理。
      expect(fs.existsSync(path.join(root, 'notes.json'))).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('R4 footprint and archiving', () => {
  it('enumerates the whole on-disk footprint of a plugin', () => {
    const root = tempRoot()
    try {
      const storage = createCorePluginStorage({ pluginId: 'notes', dataRoot: root })
      storage.writeJson('a.json', { x: 1 })
      storage.writeJson('b.json', { x: 2 })
      fs.writeFileSync(path.join(root, 'notes.json'), '{}', 'utf-8')

      expect(getCorePluginDataFootprint(root, 'notes')).toMatchObject({
        pluginId: 'notes',
        dataDirExists: true,
        entries: ['a.json', 'b.json'],
        legacyKvExists: true,
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('archives the directory and the stray legacy file together', () => {
    const root = tempRoot()
    try {
      const storage = createCorePluginStorage({ pluginId: 'notes', dataRoot: root })
      storage.writeJson('a.json', { x: 1 })
      fs.writeFileSync(path.join(root, 'notes.json'), JSON.stringify({ legacy: true }), 'utf-8')

      const result = archiveCorePluginData(root, 'notes', { now: new Date('2026-08-07T00:00:00') })
      expect(result.archived).toBe(true)
      expect(result.archivePath).toBe(path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR, 'notes-2026-08-07'))
      expect(fs.existsSync(path.join(root, 'notes'))).toBe(false)
      expect(fs.existsSync(path.join(root, 'notes.json'))).toBe(false)
      expect(fs.readdirSync(result.archivePath!).sort()).toEqual(['a.json', PLUGIN_KV_FILE_NAME])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('never overwrites a previous archive from the same day', () => {
    const root = tempRoot()
    try {
      const now = new Date('2026-08-07T00:00:00')
      const write = (value: string): void => {
        createCorePluginStorage({ pluginId: 'notes', dataRoot: root }).writeJson('a.json', { value })
      }
      write('first')
      const first = archiveCorePluginData(root, 'notes', { now })
      write('second')
      const second = archiveCorePluginData(root, 'notes', { now })

      expect(second.archivePath).not.toBe(first.archivePath)
      // 归档的全部意义是"删之前留一份";覆盖上一份等于把它删了两次。
      expect(JSON.parse(fs.readFileSync(path.join(first.archivePath!, 'a.json'), 'utf-8'))).toEqual({ value: 'first' })
      expect(JSON.parse(fs.readFileSync(path.join(second.archivePath!, 'a.json'), 'utf-8'))).toEqual({ value: 'second' })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports an archive failure instead of throwing, leaving the data in place', () => {
    const root = tempRoot()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      createCorePluginStorage({ pluginId: 'notes', dataRoot: root }).writeJson('a.json', { x: 1 })
      // 归档落点被一个**文件**占住:rename 必失败。
      fs.mkdirSync(path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR), { recursive: true })
      const target = path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR, 'notes-2026-08-07')
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(path.join(target, 'occupied'), 'x', 'utf-8')
      // 同日第二个槽位也占住,逼它走到 rename 失败而不是换槽。
      fs.writeFileSync(path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR, 'notes-2026-08-07-2'), 'x', 'utf-8')

      const result = archiveCorePluginData(root, 'notes', { now: new Date('2026-08-07T00:00:00') })
      if (!result.archived) {
        expect(result.error).toBeTruthy()
        // 原数据必须还在 —— 归档失败绝不能变成"数据没了"。
        expect(fs.existsSync(path.join(root, 'notes', 'a.json'))).toBe(true)
      } else {
        // 平台允许 rename 到第三个槽位时也可以接受,但数据必须完整搬走。
        expect(fs.existsSync(path.join(result.archivePath!, 'a.json'))).toBe(true)
      }
    } finally {
      error.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('R4 orphan detection', () => {
  it('finds directories and legacy files with no installed owner, skipping the backup dir', () => {
    const root = tempRoot()
    try {
      fs.mkdirSync(path.join(root, 'installed'), { recursive: true })
      fs.mkdirSync(path.join(root, 'ghost'), { recursive: true })
      fs.mkdirSync(path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR, 'old-2026-01-01'), { recursive: true })
      fs.writeFileSync(path.join(root, 'ancient.json'), '{}', 'utf-8')
      fs.writeFileSync(path.join(root, 'installed.json'), '{}', 'utf-8')

      expect(findCorePluginDataOrphans(root, ['installed'])).toEqual([
        { pluginId: 'ancient', kind: 'legacy-kv' },
        { pluginId: 'ghost', kind: 'directory' },
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

// ── 卸载全链(真 CorePluginManager) ──────────────

interface TestAPI { registerCommand(name: string): void }
type TestEntry = (api: TestAPI) => void
type TestDefinition = CorePluginDefinition<TestEntry>
interface TestCommand { name: string }
interface TestState extends CorePluginStateLike<TestCommand> {
  disposed?: boolean
}

describe('R4 uninstall lifecycle', () => {
  function buildManager(root: string, pluginsDir: string) {
    const settings: Record<string, Record<string, unknown>> = {
      enabled: { notes: true },
      config: { notes: { label: 'mine' } },
      health: { notes: { status: 'degraded' } },
    }
    const definitions: TestDefinition[] = [{
      id: 'notes',
      source: 'user',
      manifest: { name: 'Notes', version: '1.0.0' },
      dirPath: path.join(pluginsDir, 'notes'),
      entryPath: path.join(pluginsDir, 'notes', 'plugin-entry.js'),
      enabled: true,
      entry: api => api.registerCommand('/notes'),
    }]

    const host: CorePluginManagerHost<TestDefinition, TestEntry, TestAPI, TestState, TestCommand, { ready: true }> = {
      ensurePluginDirs() {},
      scanPlugins: () => definitions.filter(def => fs.existsSync(def.dirPath)),
      loadPluginEntry: async definition => definition.entry ?? null,
      createPluginAPI() {
        const state: TestState = { commands: new Map() }
        return {
          state,
          api: { registerCommand: name => void state.commands.set(name, { name }) },
        }
      },
      disposePlugin(state) {
        state.disposed = true
        state.commands.clear()
      },
      setPluginEnabled() {},
      archivePluginData: pluginId => archiveCorePluginData(root, pluginId),
      removePluginSource: definition => {
        fs.rmSync(definition.dirPath, { recursive: true, force: true })
        return { removed: true }
      },
      clearPluginSettings: pluginId => {
        for (const bucket of Object.values(settings)) delete bucket[pluginId]
      },
      archiveOrphanPluginData: knownIds => {
        const archived: string[] = []
        for (const orphan of findCorePluginDataOrphans(root, knownIds)) {
          if (archiveCorePluginData(root, orphan.pluginId).archived) archived.push(orphan.pluginId)
        }
        return archived
      },
    }
    const manager = new CorePluginManager<TestAPI, TestEntry, TestCommand, TestState, TestDefinition, { ready: true }>(
      host,
      silentLogger(),
    )
    return { manager, settings }
  }

  it('runs the whole chain: dispose → archive data → remove source → clear settings keys', async () => {
    const root = tempRoot()
    const pluginsDir = tempRoot()
    try {
      fs.mkdirSync(path.join(pluginsDir, 'notes'), { recursive: true })
      fs.writeFileSync(path.join(pluginsDir, 'notes', 'plugin-entry.js'), 'export default () => {}', 'utf-8')
      createCorePluginStorage({ pluginId: 'notes', dataRoot: root }).writeJson('a.json', { precious: true })

      const { manager, settings } = buildManager(root, pluginsDir)
      await manager.initialize({ ready: true })
      expect(manager.getPlugins()[0]).toMatchObject({ loaded: true })

      const result = await manager.uninstallPlugin('notes')
      expect(result.success).toBe(true)

      // 1) 数据在归档里,不是被删了。
      expect(fs.existsSync(path.join(root, 'notes'))).toBe(false)
      const archived = fs.readdirSync(path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR))
      expect(archived).toHaveLength(1)
      expect(JSON.parse(fs.readFileSync(
        path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR, archived[0], 'a.json'),
        'utf-8',
      ))).toEqual({ precious: true })
      // 2) 源目录没了。
      expect(fs.existsSync(path.join(pluginsDir, 'notes'))).toBe(false)
      // 3) plugin-settings 三键清干净。
      expect(settings.enabled.notes).toBeUndefined()
      expect(settings.config.notes).toBeUndefined()
      expect(settings.health.notes).toBeUndefined()
      // 4) 列表里没有它了。
      expect(manager.getPlugins()).toHaveLength(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(pluginsDir, { recursive: true, force: true })
    }
  })

  it('refuses to uninstall a built-in plugin', async () => {
    const root = tempRoot()
    const pluginsDir = tempRoot()
    try {
      const { manager } = buildManager(root, pluginsDir)
      ;(manager as unknown as { host: { scanPlugins(): TestDefinition[] } }).host.scanPlugins = () => [{
        id: 'log-monitor',
        source: 'builtin',
        manifest: { name: 'Log monitor', version: '1.0.0' },
        dirPath: 'builtin://log-monitor',
        entryPath: 'builtin://log-monitor/plugin-entry.js',
        enabled: true,
        entry: () => {},
      }]
      await manager.initialize({ ready: true })

      await expect(manager.uninstallPlugin('log-monitor')).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining('built-in'),
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(pluginsDir, { recursive: true, force: true })
    }
  })

  it('does not delete the source directory when archiving failed', async () => {
    const root = tempRoot()
    const pluginsDir = tempRoot()
    try {
      fs.mkdirSync(path.join(pluginsDir, 'notes'), { recursive: true })
      fs.writeFileSync(path.join(pluginsDir, 'notes', 'plugin-entry.js'), 'export default () => {}', 'utf-8')
      createCorePluginStorage({ pluginId: 'notes', dataRoot: root }).writeJson('a.json', { precious: true })

      const { manager, settings } = buildManager(root, pluginsDir)
      ;(manager as unknown as { host: { archivePluginData(): unknown } }).host.archivePluginData = () => ({
        archived: false,
        error: 'disk full',
      })
      await manager.initialize({ ready: true })

      await expect(manager.uninstallPlugin('notes')).resolves.toMatchObject({ success: false, error: 'disk full' })
      // "代码没了数据还在"是最糟的中间态 —— 归档失败就整条流程停下。
      expect(fs.existsSync(path.join(pluginsDir, 'notes'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'notes', 'a.json'))).toBe(true)
      expect(settings.enabled.notes).toBeDefined()
      expect(manager.getPlugins()[0].error).toContain('disk full')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(pluginsDir, { recursive: true, force: true })
    }
  })

  it('archives orphaned data on refresh — the hand-deleted-folder path', async () => {
    const root = tempRoot()
    const pluginsDir = tempRoot()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      fs.mkdirSync(path.join(pluginsDir, 'notes'), { recursive: true })
      fs.writeFileSync(path.join(pluginsDir, 'notes', 'plugin-entry.js'), 'export default () => {}', 'utf-8')
      createCorePluginStorage({ pluginId: 'notes', dataRoot: root }).writeJson('a.json', { keep: true })
      createCorePluginStorage({ pluginId: 'ghost', dataRoot: root }).writeJson('a.json', { orphan: true })

      const { manager } = buildManager(root, pluginsDir)
      await manager.initialize({ ready: true })

      // 装着的插件不动;无主的被搬进归档。
      expect(fs.existsSync(path.join(root, 'notes', 'a.json'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'ghost'))).toBe(false)
      const archived = fs.readdirSync(path.join(root, PLUGIN_DATA_LEGACY_BACKUP_DIR))
      expect(archived.some(name => name.startsWith('ghost-'))).toBe(true)
    } finally {
      warn.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(pluginsDir, { recursive: true, force: true })
    }
  })
})
