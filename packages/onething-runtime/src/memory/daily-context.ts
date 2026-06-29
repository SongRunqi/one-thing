import {
  joinPaths,
  listDirectoryEntries,
  relativePath,
} from '@onething/core/storage'
import type { MemoryWorkspace } from './types.js'
import {
  dateStringDaysAgo,
  readLimited,
} from './workspace.js'
import {
  buildSoulMemoryRecentDailyContextFragmentWithAdapters as coreBuildSoulMemoryRecentDailyContextFragmentWithAdapters,
} from '../plugins/index.js'

export async function buildRecentDailyContextFragment(options: {
  workspace: MemoryWorkspace
  sessionId?: string
  userTurnCount?: number
}): Promise<string | null> {
  return coreBuildSoulMemoryRecentDailyContextFragmentWithAdapters({
    root: options.workspace.root,
    memoryDir: options.workspace.memoryDir,
    sessionId: options.sessionId,
    settings: options.workspace.settings.dailyContext,
    adapters: {
      userTurnCount: () => options.userTurnCount,
      dateForDaysAgo: dateStringDaysAgo,
      async listEntries() {
        const entries = await listDirectoryEntries(options.workspace.memoryDir)
        return entries.map(entry => ({ name: entry.name, isFile: entry.isFile }))
      },
      joinPath: joinPaths,
      relativePath,
      readContent: readLimited,
    },
  })
}
