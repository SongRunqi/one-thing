import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createOnethingSearchProviders,
  type OnethingSearchProvidersAdapters,
} from '../providers.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-search-providers-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function adapters(overrides: Partial<OnethingSearchProvidersAdapters> = {}): OnethingSearchProvidersAdapters {
  return {
    getSessionsList: () => [],
    getSessionRaw: () => undefined,
    getSession: () => undefined,
    getCurrentSessionId: () => undefined,
    getSettings: () => ({
      general: {
        dailyNotes: { enabled: false },
      },
    }),
    getVariablesStore: () => ({
      getUserNoteDir: () => undefined,
      getWorkNoteDir: () => undefined,
    }),
    async *listFiles() {},
    listPrompts: () => [],
    ...overrides,
  }
}

describe('onething search providers', () => {
  /**
   * 接入目录(五件套之二:搜索根)。用真实临时目录 + 真实 listFiles,
   * 证据落在「搜得到 / 搜不到」这个用户可见的层面上,而不是内部数组。
   */
  describe('connected directories as search roots', () => {
    it('接入目录里的文件能被搜到', async () => {
      await fs.writeFile(path.join(tmpDir, 'deploy-notes.md'), '# notes')

      const providers = createOnethingSearchProviders(adapters({
        getConnectedDirectories: () => [tmpDir],
        async *listFiles(options) {
          for (const name of await fs.readdir(options.cwd)) yield name
        },
      }))

      const results = await providers.executeSearch('deploy', 'files', 10)
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({
        type: 'file',
        title: 'deploy-notes.md',
        filePath: path.join(tmpDir, 'deploy-notes.md'),
      })
    })

    it('空列表(以及缺席适配器)时搜不出接入目录的东西 —— 行为与今天一致', async () => {
      await fs.writeFile(path.join(tmpDir, 'deploy-notes.md'), '# notes')

      for (const getConnectedDirectories of [() => [], undefined]) {
        const providers = createOnethingSearchProviders(adapters({
          getConnectedDirectories,
          async *listFiles(options) {
            for (const name of await fs.readdir(options.cwd)) yield name
          },
        }))

        await expect(providers.executeSearch('deploy', 'files', 10)).resolves.toEqual([])
      }
    })
  })

  it('searches prompts through injected adapters', async () => {
    const providers = createOnethingSearchProviders(adapters({
      listPrompts: () => [
        {
          id: 'weak',
          title: 'Code Notes',
          body: 'deploy checklist',
          updatedAt: 1,
        },
        {
          id: 'strong',
          title: 'Deploy Helper',
          body: 'release steps',
          updatedAt: 2,
        },
      ],
    }))

    const results = await providers.executeSearch('deploy', 'prompts', 10)

    expect(results[0]).toMatchObject({
      id: 'prompt:strong',
      title: 'Deploy Helper',
      actionId: 'insert-prompt:strong',
    })
    expect(results.some(result => result.id === 'prompt:weak')).toBe(true)
  })

  it('searches files from injected session and variable roots', async () => {
    const providers = createOnethingSearchProviders(adapters({
      getCurrentSessionId: () => 'session-1',
      getSession: () => ({ workingDirectory: path.join(tmpDir, 'work') }),
      getVariablesStore: () => ({
        getUserNoteDir: () => path.join(tmpDir, 'notes'),
        getWorkNoteDir: () => undefined,
      }),
      listFiles: async function* ({ cwd }) {
        if (cwd.endsWith('work')) yield 'src/deploy-plan.md'
        if (cwd.endsWith('notes')) yield 'journal.md'
      },
    }))

    const results = await providers.executeSearch('deploy', 'files', 10)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'file',
      title: 'deploy-plan.md',
      filePath: path.join(tmpDir, 'work', 'src/deploy-plan.md'),
    })
  })

  it('creates daily notes using runtime daily-note orchestration', async () => {
    const dailyDir = path.join(tmpDir, 'daily')
    const providers = createOnethingSearchProviders(adapters({
      getSettings: () => ({
        general: {
          dailyNotes: {
            enabled: true,
            directoryMode: 'custom',
            customDirectory: dailyDir,
            useObsidianConfig: false,
            format: 'YYYY-MM-DD',
          },
        },
      }),
      getVariablesStore: () => ({
        getUserNoteDir: () => dailyDir,
        getWorkNoteDir: () => undefined,
      }),
    }))
    const filePath = path.join(dailyDir, 'manual.md')

    await expect(providers.createDailyNote(filePath)).resolves.toBe(filePath)
    await expect(fs.readFile(filePath, 'utf-8')).resolves.toMatch(/^# \d{4}-\d{2}-\d{2}/)
  })
})
