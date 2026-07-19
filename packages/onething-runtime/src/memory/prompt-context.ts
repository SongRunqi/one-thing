import { relativePath } from '@onething/core/storage'
import type {
  CoreSoulMemoryPromptFragment,
} from '../plugins/index.js'
import {
  buildSoulMemoryPromptFragments as coreBuildSoulMemoryPromptFragments,
} from '../plugins/index.js'
import type { MemoryWorkspace } from './types.js'
import { buildHermesMemoryPromptFragment } from './hermes-file-memory.js'
import {
  readLimited,
  SOUL_MEMORY_RULES_PROMPT,
} from './workspace.js'

export interface BuildSoulMemoryPromptContextOptions {
  workspace: MemoryWorkspace
  sessionId?: string
  userTurnCount?: number
}

export async function buildSoulMemoryPromptContext(
  options: BuildSoulMemoryPromptContextOptions,
): Promise<CoreSoulMemoryPromptFragment[]> {
  const { workspace } = options
  if (!workspace.settings.enabled) return []

  const maxChars = workspace.settings.bootstrapMaxChars
  const hermesFileMemory = await buildHermesMemoryPromptFragment(workspace, maxChars)

  // Daily notes are written by capture but not injected; tell the model where
  // today's note lives so it can fetch it on demand with memory_get.
  const todayRelativePath = relativePath(workspace.root, workspace.todayPath)
  const memoryFilesNote = [
    '',
    `Memory root: ${workspace.root}`,
    `Today's daily note: ${todayRelativePath} (not injected; read it with the memory_get tool when earlier activity from today matters).`,
  ].join('\n')

  return coreBuildSoulMemoryPromptFragments({
    rulesPrompt: `${SOUL_MEMORY_RULES_PROMPT}${memoryFilesNote}`,
    soulPath: workspace.soulPath,
    soulContent: readLimited(workspace.soulPath, maxChars),
    hermesFileMemory,
  })
}
