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
      getAiNoteDir: () => undefined,
      getUserNoteDir: () => undefined,
      getWorkNoteDir: () => undefined,
    }),
    async *listFiles() {},
    listPrompts: () => [],
    ...overrides,
  }
}

describe('onething search providers', () => {
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
        getAiNoteDir: () => undefined,
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
        getAiNoteDir: () => undefined,
        getUserNoteDir: () => dailyDir,
        getWorkNoteDir: () => undefined,
      }),
    }))
    const filePath = path.join(dailyDir, 'manual.md')

    await expect(providers.createDailyNote(filePath)).resolves.toBe(filePath)
    await expect(fs.readFile(filePath, 'utf-8')).resolves.toMatch(/^# \d{4}-\d{2}-\d{2}/)
  })
})
