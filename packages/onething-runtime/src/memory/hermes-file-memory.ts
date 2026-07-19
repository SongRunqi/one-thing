import fs from 'node:fs'
import fsp from 'node:fs/promises'
import {
  withFileLockSync,
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

function readRawSync(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function writeTextFileAtomicSync(absolutePath: string, content: string): void {
  const tmpPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmpPath, content, 'utf-8')
  fs.renameSync(tmpPath, absolutePath)
}

// Hermes mutations are read-modify-write cycles on a shared markdown file.
// Chat turns, background capture/review jobs, and (in multi-user deployments)
// another process can all write the same file, so the whole cycle runs under
// a per-file in-process queue plus the cross-process advisory file lock.
const hermesWriteQueues = new Map<string, Promise<unknown>>()

function mutateHermesFile<TPlan extends { next: string; changed: boolean }>(
  absolutePath: string,
  mutate: (existing: string) => TPlan,
): Promise<TPlan> {
  const previous = hermesWriteQueues.get(absolutePath) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(() =>
    withFileLockSync(`${absolutePath}.lock`, () => {
      const plan = mutate(readRawSync(absolutePath))
      if (plan.changed) {
        writeTextFileAtomicSync(absolutePath, plan.next)
      }
      return plan
    }),
  )
  hermesWriteQueues.set(absolutePath, run)
  run.finally(() => {
    if (hermesWriteQueues.get(absolutePath) === run) {
      hermesWriteQueues.delete(absolutePath)
    }
  }).catch(() => {})
  return run
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
  const plan = await mutateHermesFile(file.absolutePath, existing =>
    corePlanHermesMemoryEntryAdd(existing, options.content))

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
  const plan = await mutateHermesFile(file.absolutePath, existing =>
    corePlanHermesMemoryTextReplace({
      existing,
      oldText: options.oldText,
      newText: options.newText,
      replaceAll: options.replaceAll,
    }))

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
  const plan = await mutateHermesFile(file.absolutePath, existing =>
    corePlanHermesMemoryTextRemove({
      existing,
      text: options.text,
      removeAll: options.removeAll,
    }))

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
