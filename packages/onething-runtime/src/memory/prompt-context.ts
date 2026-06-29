import type {
  CoreSoulMemoryPromptFragment,
} from '../plugins/index.js'
import {
  buildSoulMemoryPromptFragments as coreBuildSoulMemoryPromptFragments,
} from '../plugins/index.js'
import type { MemoryWorkspace } from './types.js'
import { buildGraphProfileSummary } from './canonical.js'
import { buildRecentDailyContextFragment } from './daily-context.js'
import { buildHermesMemoryPromptFragment } from './hermes-file-memory.js'
import {
  readLimited,
  SOUL_MEMORY_RULES_PROMPT,
} from './workspace.js'

export type SoulMemoryActiveRecallProvider = () => Promise<string | null> | string | null

export interface BuildSoulMemoryPromptContextOptions {
  workspace: MemoryWorkspace
  sessionId?: string
  userTurnCount?: number
  activeMemory?: string | null | SoulMemoryActiveRecallProvider
}

export async function buildSoulMemoryPromptContext(
  options: BuildSoulMemoryPromptContextOptions,
): Promise<CoreSoulMemoryPromptFragment[]> {
  const { workspace } = options
  if (!workspace.settings.enabled) return []

  const maxChars = workspace.settings.bootstrapMaxChars
  const hermesFileMemory = await buildHermesMemoryPromptFragment(workspace, maxChars)
  const graphProfile = buildGraphProfileSummary(workspace)
  const dailyContext = await buildRecentDailyContextFragment({
    workspace,
    sessionId: options.sessionId,
    userTurnCount: options.userTurnCount,
  })
  const activeMemory = typeof options.activeMemory === 'function'
    ? await options.activeMemory()
    : options.activeMemory

  return coreBuildSoulMemoryPromptFragments({
    rulesPrompt: SOUL_MEMORY_RULES_PROMPT,
    soulPath: workspace.soulPath,
    soulContent: readLimited(workspace.soulPath, maxChars),
    hermesFileMemory,
    graphProfile,
    dailyContext,
    activeMemory,
  })
}
