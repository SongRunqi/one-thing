import {
  appendTextFile,
  statPath,
} from '@onething/core/storage'
import type { MemoryWorkspace } from './types.js'
import type { MemoryDiagnosticsLogInput } from './diagnostics-logger.js'
import {
  isIndexableMarkdownPath,
  previewLine,
  sha,
} from './workspace.js'
import {
  buildSoulMemoryAppendPayload as coreBuildSoulMemoryAppendPayload,
  resolveSoulMemoryAppendTarget as coreResolveSoulMemoryAppendTarget,
  type CoreSoulMemoryResolvedPath,
} from '../plugins/index.js'

export async function appendMemoryNote(options: {
  workspace: MemoryWorkspace
  content: string
  target?: 'daily' | 'memory'
  filePath?: string
  heading?: string
  logDiagnostic?: (input: MemoryDiagnosticsLogInput) => void
  onIndexableWrite?: (target: CoreSoulMemoryResolvedPath) => void | Promise<void>
}): Promise<CoreSoulMemoryResolvedPath> {
  if (!options.workspace.settings.enabled) {
    throw new Error('Soul-memory is disabled in settings')
  }

  const target = coreResolveSoulMemoryAppendTarget({
    root: options.workspace.root,
    memoryPath: options.workspace.memoryPath,
    todayPath: options.workspace.todayPath,
    target: options.target,
    filePath: options.filePath,
  })
  const exists = Boolean(await statPath(target.absolutePath))
  const payload = coreBuildSoulMemoryAppendPayload({
    relativePath: target.relativePath,
    content: options.content,
    heading: options.heading,
    exists,
  })

  await appendTextFile(target.absolutePath, payload.text)
  options.logDiagnostic?.({
    subsystem: 'daily',
    operation: 'append-note',
    stage: 'write',
    status: 'ok',
    response: {
      relativePath: target.relativePath,
      heading: payload.heading,
      chars: payload.content.length,
      contentHash: sha(payload.content).slice(0, 16),
      contentPreview: previewLine(payload.content, 180),
    },
  })

  if (isIndexableMarkdownPath(target.relativePath)) {
    await options.onIndexableWrite?.(target)
  }

  return target
}
