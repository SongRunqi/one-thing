import fs from 'node:fs'
import fsp from 'node:fs/promises'
import {
  writeTextFileAtomic,
} from '@onething/core/storage'
import {
  CORE_HERMES_LONG_TERM_MEMORY_FILENAME,
  CORE_HERMES_MEMORY_DELIMITER,
  CORE_HERMES_USER_MEMORY_FILENAME,
  buildHermesMemoryPromptFragment as coreBuildHermesMemoryPromptFragment,
  planHermesMemoryEntryAdd as corePlanHermesMemoryEntryAdd,
  planHermesMemoryTextRemove as corePlanHermesMemoryTextRemove,
  planHermesMemoryTextReplace as corePlanHermesMemoryTextReplace,
  splitHermesMemoryEntries as coreSplitHermesMemoryEntries,
  type CoreHermesMemoryTarget,
} from '../plugins/index.js'

export interface HermesMemoryWorkspaceLike {
  userPath: string
  memoryPath: string
}

export type HermesMemoryTarget = CoreHermesMemoryTarget

export const HERMES_MEMORY_DELIMITER = CORE_HERMES_MEMORY_DELIMITER
export const HERMES_USER_MEMORY_FILENAME = CORE_HERMES_USER_MEMORY_FILENAME
export const HERMES_LONG_TERM_MEMORY_FILENAME = CORE_HERMES_LONG_TERM_MEMORY_FILENAME

export interface HermesMemoryFile {
  target: HermesMemoryTarget
  absolutePath: string
  relativePath: string
  label: string
}

export interface HermesMemoryMutationResult {
  target: HermesMemoryTarget
  absolutePath: string
  relativePath: string
  changed: boolean
  matches: number
  beforeChars: number
  afterChars: number
}

export interface HermesMemoryStatus {
  files: Array<{
    target: HermesMemoryTarget
    absolutePath: string
    relativePath: string
    exists: boolean
    chars: number
    entries: number
  }>
}

export function getHermesMemoryFile(
  workspace: HermesMemoryWorkspaceLike,
  target: HermesMemoryTarget,
): HermesMemoryFile {
  if (target === 'user') {
    return {
      target,
      absolutePath: workspace.userPath,
      relativePath: HERMES_USER_MEMORY_FILENAME,
      label: 'USER.md',
    }
  }
  return {
    target,
    absolutePath: workspace.memoryPath,
    relativePath: HERMES_LONG_TERM_MEMORY_FILENAME,
    label: 'MEMORY.md',
  }
}

export function splitHermesMemoryEntries(content: string): string[] {
  return coreSplitHermesMemoryEntries(content)
}

async function readRaw(filePath: string): Promise<string> {
  return fsp.readFile(filePath, 'utf-8').catch(() => '')
}

export async function readHermesMemoryFile(
  workspace: HermesMemoryWorkspaceLike,
  target: HermesMemoryTarget,
): Promise<{ file: HermesMemoryFile; content: string; entries: string[] }> {
  const file = getHermesMemoryFile(workspace, target)
  const content = await readRaw(file.absolutePath)
  return {
    file,
    content,
    entries: splitHermesMemoryEntries(content),
  }
}

export async function addHermesMemoryEntry(options: {
  workspace: HermesMemoryWorkspaceLike
  target: HermesMemoryTarget
  content: string
}): Promise<HermesMemoryMutationResult> {
  const file = getHermesMemoryFile(options.workspace, options.target)
  const existing = await readRaw(file.absolutePath)
  const plan = corePlanHermesMemoryEntryAdd(existing, options.content)
  await writeTextFileAtomic(file.absolutePath, plan.next)

  return {
    target: file.target,
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    changed: plan.changed,
    matches: plan.matches,
    beforeChars: plan.beforeChars,
    afterChars: plan.afterChars,
  }
}

export async function replaceHermesMemoryText(options: {
  workspace: HermesMemoryWorkspaceLike
  target: HermesMemoryTarget
  oldText: string
  newText: string
  replaceAll?: boolean
}): Promise<HermesMemoryMutationResult> {
  const file = getHermesMemoryFile(options.workspace, options.target)
  const existing = await readRaw(file.absolutePath)
  const plan = corePlanHermesMemoryTextReplace({
    existing,
    oldText: options.oldText,
    newText: options.newText,
    replaceAll: options.replaceAll,
  })
  if (plan.changed) {
    await writeTextFileAtomic(file.absolutePath, plan.next)
  }

  return {
    target: file.target,
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    changed: plan.changed,
    matches: plan.matches,
    beforeChars: plan.beforeChars,
    afterChars: plan.afterChars,
  }
}

export async function removeHermesMemoryText(options: {
  workspace: HermesMemoryWorkspaceLike
  target: HermesMemoryTarget
  text: string
  removeAll?: boolean
}): Promise<HermesMemoryMutationResult> {
  const file = getHermesMemoryFile(options.workspace, options.target)
  const existing = await readRaw(file.absolutePath)
  const plan = corePlanHermesMemoryTextRemove({
    existing,
    text: options.text,
    removeAll: options.removeAll,
  })
  if (plan.changed) {
    await writeTextFileAtomic(file.absolutePath, plan.next)
  }

  return {
    target: file.target,
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    changed: plan.changed,
    matches: plan.matches,
    beforeChars: plan.beforeChars,
    afterChars: plan.afterChars,
  }
}

export async function getHermesMemoryStatus(
  workspace: HermesMemoryWorkspaceLike,
): Promise<HermesMemoryStatus> {
  const files = await Promise.all((['user', 'memory'] as const).map(async target => {
    const file = getHermesMemoryFile(workspace, target)
    const content = await readRaw(file.absolutePath)
    return {
      target,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      exists: fs.existsSync(file.absolutePath),
      chars: content.length,
      entries: splitHermesMemoryEntries(content).length,
    }
  }))
  return { files }
}

export async function buildHermesMemoryPromptFragment(
  workspace: HermesMemoryWorkspaceLike,
  maxChars: number,
): Promise<string | null> {
  const memory = await readHermesMemoryFile(workspace, 'memory')
  // User-notes workspaces alias both targets to the same MEMORY.md; injecting
  // it once is enough.
  const user = workspace.userPath === workspace.memoryPath
    ? { ...(await readHermesMemoryFile(workspace, 'user')), content: '' }
    : await readHermesMemoryFile(workspace, 'user')
  return coreBuildHermesMemoryPromptFragment({ user, memory, maxChars })
}
