import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  BaseInstructions,
  PromptContextFragment,
  PromptContextMarker,
  PromptContextRole,
  PromptContextState,
  TurnContextSnapshot,
  SkillDefinition,
  AppSettings,
  TodoPlanAutonomyMode,
} from '../../../shared/ipc.js'
import { getMacOSAutomationDocsPath, getToolUsageDocsPath } from '../../stores/paths.js'
import { getAgent } from '../../agents/index.js'
import { getPromptManager, PromptManager } from './prompt-manager.js'
import type {
  PromptActiveProject,
  PromptKnownProjects,
  PromptSegment,
  TemplateSkill,
} from './types.js'
import { collectPluginPromptContext } from './plugin-context.js'
import { readTodoPlanSnapshot } from '../../todo-plan/store.js'

const PROMPT_CONTEXT_VERSION = 1
const AGENTS_MAX_BYTES = 32 * 1024
const TODO_PLAN_CONTEXT_MAX_CHARS = 6000

export interface BuildPromptContextOptions {
  previousState?: PromptContextState
  sessionId?: string
  agentId?: string
  providerId?: string
  providerConfig?: Record<string, unknown>
  settings?: AppSettings
  hasTools: boolean
  skills: SkillDefinition[]
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  contextVariables?: string
  activeProject?: PromptActiveProject
  knownProjects?: PromptKnownProjects
  toolNames?: string[]
  mcpToolNames?: string[]
}

export interface PromptContextBuildResult {
  baseInstructions: BaseInstructions
  state: PromptContextState
  emittedFragments: PromptContextFragment[]
  activeFragments: PromptContextFragment[]
}

export type PromptRequestMessage =
  | {
      role: 'system' | 'developer' | 'user'
      content: unknown
      sourceSegments?: PromptSegment[]
    }
  | {
      role: 'assistant'
      content: unknown
      reasoningContent?: string
      codexEncryptedReasoning?: string[]
      toolCalls?: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }>
    }
  | {
      role: 'tool'
      content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }>
    }

export interface BuildRequestMessagesResult {
  messages: PromptRequestMessage[]
  systemPrompt: string
  systemPromptSegments: PromptSegment[]
}

function transformSkills(skills: SkillDefinition[]): TemplateSkill[] {
  return skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    source: skill.source,
    directoryPath: skill.directoryPath,
    path: skill.path,
    files: skill.files,
    instructions: skill.instructions,
  }))
}

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hashValue(value: unknown): string | undefined {
  const encoded = stableJson(value)
  return encoded === undefined ? undefined : sha(encoded)
}

function markerFor(source: string): PromptContextMarker {
  const name = source.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
  return {
    name,
    start: `<${name}>`,
    end: `</${name}>`,
  }
}

function renderMarked(marker: PromptContextMarker, content: string): string {
  return `${marker.start}\n${content.trim()}\n${marker.end}`
}

function fragment(role: PromptContextRole, source: string, content: string): PromptContextFragment | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  const marker = markerFor(source)
  const rendered = renderMarked(marker, trimmed)
  return {
    role,
    source,
    marker,
    content: trimmed,
    rendered,
    hash: sha(`${role}\n${source}\n${rendered}`),
  }
}

function removalFragment(previous: PromptContextFragment): PromptContextFragment {
  const source = `${previous.source}:removed`
  const marker = markerFor(source)
  const content = `The previous ${previous.source} context is no longer active.`
  const rendered = renderMarked(marker, content)
  return {
    role: previous.role,
    source,
    marker,
    content,
    rendered,
    hash: sha(`${previous.role}\n${source}\n${rendered}`),
    reason: 'removed',
  }
}

function renderPartial(partialName: string, variables: Record<string, unknown> = {}): string {
  return getPromptManager().renderPartial(partialName, variables)
}

function partialPath(source: string): string | undefined {
  const manager = getPromptManager()
  if (!manager.isInitialized()) return undefined
  const candidate = path.join(manager.getTemplatesPath(), `${source}.hbs`)
  return fs.existsSync(candidate) ? candidate : undefined
}

function segmentForBase(baseInstructions: BaseInstructions): PromptSegment {
  return {
    source: baseInstructions.source,
    content: baseInstructions.content,
    absolutePath: partialPath(baseInstructions.source),
    role: 'base',
    hash: baseInstructions.hash,
  }
}

function segmentForFragment(item: PromptContextFragment, emittedThisTurn = false): PromptSegment {
  return {
    source: item.source,
    content: item.rendered,
    absolutePath: partialPath(item.source),
    role: item.role,
    marker: item.marker,
    hash: item.hash,
    reason: item.reason,
    emittedThisTurn,
  }
}

function displayPath(workingDirectory: string | undefined, homeDir: string): string | undefined {
  if (!workingDirectory) return undefined
  return workingDirectory.startsWith(homeDir)
    ? workingDirectory.replace(homeDir, '~')
    : workingDirectory
}

function displayRoots(roots: string[] | undefined, homeDir: string): Array<{ path: string; displayPath: string }> {
  return (roots ?? []).map(root => ({
    path: root,
    displayPath: displayPath(root, homeDir) ?? root,
  }))
}

function getTodoPlanAutonomyMode(settings?: AppSettings): TodoPlanAutonomyMode {
  return settings?.general?.todoPlan?.autonomy ?? 'active'
}

function shouldInjectTodoPlanContext(options: BuildPromptContextOptions): boolean {
  if (!options.hasTools) return false
  if (options.settings?.general?.todoPlan?.enabled === false) return false
  const mode = getTodoPlanAutonomyMode(options.settings)
  if (mode === 'off') return false
  return (options.toolNames ?? []).includes('todo_plan')
}

function truncateTodoPlanContent(content: string): string {
  if (content.length <= TODO_PLAN_CONTEXT_MAX_CHARS) return content
  return `${content.slice(0, TODO_PLAN_CONTEXT_MAX_CHARS).trimEnd()}\n\n<!-- Todo content truncated for prompt budget -->`
}

function formatUserTodoNoteIndex(userNotes: Array<{ id: string, title: string, totalTasks: number, content: string }>): string {
  if (userNotes.length === 0) return '- No user notes yet.'
  return userNotes
    .map(note => `- ${note.title} (id: ${note.id}, tasks: ${note.totalTasks}, characters: ${note.content.length})`)
    .join('\n')
}

async function buildTodoPlanContextFragment(options: BuildPromptContextOptions): Promise<PromptContextFragment | null> {
  if (!shouldInjectTodoPlanContext(options)) return null

  const mode = getTodoPlanAutonomyMode(options.settings)
  try {
    const snapshot = await readTodoPlanSnapshot({
      sessionId: options.sessionId,
      workingDirectory: options.workingDirectory,
    })
    return fragment('developer', 'context/todo-plan-autonomy', [
      '# Todo / Notes Autonomy',
      `Mode: ${mode}`,
      '',
      'Use the `todo_plan` tool as the assistant-owned work tracker for this workspace.',
      '',
      'Active-mode policy:',
      '- For multi-step coding, debugging, research, implementation, planning, or follow-up work, keep `workspace-ai-todo` current without waiting for the user to ask.',
      '- When a task becomes concrete, write it under `## Now`; when a step is completed, mark it checked or remove it if it no longer carries useful state.',
      '- When new blockers, regressions, or follow-up work appear, add them instead of relying on memory.',
      '- Before a final response for substantial work, update completed items and move unresolved follow-ups to `## Later`.',
      '- Avoid todo updates for casual conversation, simple one-shot answers, or purely explanatory replies.',
      '',
      'User todo capture policy:',
      '- User notes are for the user\'s own tasks, reminders, commitments, errands, meeting notes, and personal/project notes.',
      '- When the user clearly asks you to remember, track, add, or update something for them, use `user-note` instead of `workspace-ai-todo`.',
      '- When the user states a concrete future task or commitment that should be preserved, proactively add it to an appropriate `user-note`.',
      '- If the intent or target note is ambiguous, ask before writing. If the intent is clear but the target note is unclear, use the note index below, list notes if needed, and update the most relevant note or create a concise new note.',
      '- Never delete or rename `user-note` documents unless the user explicitly asks for that destructive or organizational action.',
      '',
      'Available user notes index:',
      formatUserTodoNoteIndex(snapshot.userNotes),
      '',
      'Current `workspace-ai-todo` markdown snapshot:',
      '```markdown',
      truncateTodoPlanContent(snapshot.workspaceAiTodo.content),
      '```',
    ].join('\n'))
  } catch (error) {
    console.warn('[TodoPlan] Failed to build prompt context:', error)
    return fragment('developer', 'context/todo-plan-autonomy', [
      '# Todo / Notes Autonomy',
      `Mode: ${mode}`,
      '',
      'Use the `todo_plan` tool proactively for substantial multi-step workspace work, but the current todo snapshot could not be loaded for this turn.',
    ].join('\n'))
  }
}

function findProjectRoot(startDir: string): string {
  let current = path.resolve(startDir)
  try {
    const stats = fs.statSync(current)
    if (stats.isFile()) current = path.dirname(current)
  } catch {
    return current
  }

  let cursor = current
  while (true) {
    if (fs.existsSync(path.join(cursor, '.git'))) return cursor
    const parent = path.dirname(cursor)
    if (parent === cursor) return current
    cursor = parent
  }
}

function directoriesFromRoot(root: string, target: string): string[] {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  if (relative.startsWith('..')) return [resolvedTarget]
  const parts = relative ? relative.split(path.sep).filter(Boolean) : []
  const dirs = [resolvedRoot]
  let cursor = resolvedRoot
  for (const part of parts) {
    cursor = path.join(cursor, part)
    dirs.push(cursor)
  }
  return dirs
}

export function loadAgentsMdInstructions(workingDirectory?: string): string | undefined {
  if (!workingDirectory) return undefined
  const target = path.resolve(workingDirectory)
  if (!fs.existsSync(target)) return undefined

  const root = findProjectRoot(target)
  const dirs = root === target ? [target] : directoriesFromRoot(root, target)
  let remaining = AGENTS_MAX_BYTES
  const parts: string[] = []

  for (const dir of dirs) {
    if (remaining <= 0) break
    const candidates = ['AGENTS.override.md', 'AGENTS.md'].map(name => path.join(dir, name))
    const selected = candidates.find(candidate => fs.existsSync(candidate))
    if (!selected) continue

    const data = fs.readFileSync(selected)
    const slice = data.subarray(0, remaining)
    remaining -= slice.byteLength
    const text = slice.toString('utf8').trim()
    if (!text) continue

    parts.push(`# ${path.basename(selected)} instructions for ${dir}\n\n<INSTRUCTIONS>\n${text}\n</INSTRUCTIONS>`)
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined
}

async function buildActiveFragments(options: BuildPromptContextOptions): Promise<PromptContextFragment[]> {
  const homeDir = os.homedir()
  const osType = PromptManager.detectOSType()
  const macosAutomationDocsPath = osType === 'macos' ? getMacOSAutomationDocsPath() : undefined
  const toolUsageDocsPath = options.hasTools ? getToolUsageDocsPath() : undefined
  const variables = {
    hasTools: options.hasTools,
    workingDirectory: options.workingDirectory,
    workingDirectoryRoots: options.workingDirectoryRoots,
    workingDirectoryRootDisplays: displayRoots(options.workingDirectoryRoots, homeDir),
    displayPath: displayPath(options.workingDirectory, homeDir),
    baseDirectory: homeDir,
    osType,
    activeProject: options.activeProject ?? { hasActive: false },
    knownProjects: options.knownProjects ?? { hasAny: false, entries: [] },
    skills: transformSkills(options.skills),
    macosAutomationDocsPath,
    toolUsageDocsPath,
  }

  const fragments: Array<PromptContextFragment | null> = []
  const agent = getAgent(options.agentId)
  if (agent.systemPrompt.trim()) {
    fragments.push(fragment('developer', `agents/${agent.id}/system-prompt`, [
      `# Agent: ${agent.name}`,
      agent.systemPrompt.trim(),
    ].join('\n\n')))
  }
  fragments.push(fragment('user', 'partials/context/working-directory', renderPartial('context/working-directory', variables)))
  fragments.push(fragment('user', 'partials/context/active-project', renderPartial('context/active-project', variables)))
  fragments.push(fragment('user', 'partials/context/known-projects', renderPartial('context/known-projects', variables)))
  if (options.contextVariables?.trim()) {
    fragments.push(fragment('user', 'context/context-variables', `# Context Variables\n${options.contextVariables.trim()}`))
  }
  fragments.push(fragment('user', `partials/os/${osType}`, renderPartial(`os/${osType}`, variables)))

  if (options.hasTools) {
    fragments.push(fragment('developer', 'partials/guidance/workdir-protocol', renderPartial('guidance/workdir-protocol', variables)))
    fragments.push(fragment('developer', 'partials/guidance/tool-usage', renderPartial('guidance/tool-usage', variables)))
    fragments.push(fragment('developer', 'partials/security/permissions', renderPartial('security/permissions', variables)))
  }

  if (options.skills.length > 0) {
    fragments.push(fragment('developer', 'partials/context/skills', renderPartial('context/skills', variables)))
  }

  const toolNames = [...(options.toolNames ?? [])].sort()
  const mcpToolNames = [...(options.mcpToolNames ?? [])].sort()
  if (options.hasTools && (toolNames.length > 0 || mcpToolNames.length > 0)) {
    fragments.push(fragment(
      'developer',
      'context/tool-catalog',
      [
        '## Enabled Tool Names',
        toolNames.length > 0 ? `Built-in tools: ${toolNames.join(', ')}` : '',
        mcpToolNames.length > 0 ? `MCP tools: ${mcpToolNames.join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    ))
  }

  fragments.push(await buildTodoPlanContextFragment(options))

  const agentsMd = loadAgentsMdInstructions(options.workingDirectory)
  if (agentsMd) {
    fragments.push(fragment('user', 'context/agents-md', agentsMd))
  }

  const pluginFragments = await collectPluginPromptContext({
    sessionId: options.sessionId,
    providerId: options.providerId,
    providerConfig: options.providerConfig,
    settings: options.settings,
    hasTools: options.hasTools,
    skills: options.skills,
    workingDirectory: options.workingDirectory,
    workingDirectoryRoots: options.workingDirectoryRoots,
    contextVariables: options.contextVariables,
    activeProject: options.activeProject,
    knownProjects: options.knownProjects,
    toolNames: options.toolNames,
    mcpToolNames: options.mcpToolNames,
  })
  for (const item of pluginFragments) {
    fragments.push(fragment(
      item.role,
      item.source || 'plugins/context',
      item.content,
    ))
  }

  return fragments.filter((item): item is PromptContextFragment => item !== null)
}

function buildSnapshot(options: BuildPromptContextOptions, activeFragments: PromptContextFragment[]): TurnContextSnapshot {
  return {
    createdAt: Date.now(),
    agentId: options.agentId,
    hasTools: options.hasTools,
    osType: PromptManager.detectOSType(),
    workingDirectory: options.workingDirectory,
    workingDirectoryRoots: options.workingDirectoryRoots,
    contextVariablesHash: options.contextVariables ? sha(options.contextVariables) : undefined,
    activeProjectHash: hashValue(options.activeProject),
    knownProjectsHash: hashValue(options.knownProjects),
    skillsHash: hashValue(transformSkills(options.skills)),
    toolNamesHash: hashValue([...(options.toolNames ?? [])].sort()),
    mcpToolNamesHash: hashValue([...(options.mcpToolNames ?? [])].sort()),
    agentsMdHash: activeFragments.find(item => item.source === 'context/agents-md')?.hash,
    fragmentHashes: Object.fromEntries(activeFragments.map(item => [item.source, item.hash])),
  }
}

export async function buildPromptContext(options: BuildPromptContextOptions): Promise<PromptContextBuildResult> {
  const baseContent = renderPartial('base/base')
  const baseInstructions: BaseInstructions = {
    source: 'partials/base/base',
    content: baseContent,
    hash: sha(baseContent),
  }

  const activeFragments = await buildActiveFragments(options)
  const snapshot = buildSnapshot(options, activeFragments)
  const previousHashes = options.previousState?.referenceSnapshot?.fragmentHashes
  const previousItems = (options.previousState?.items ?? [])
    .filter(item => item.reason !== 'removed' && !item.source.endsWith(':removed'))
  const previousBySource = new Map(previousItems.map(item => [item.source, item]))

  const emittedFragments: PromptContextFragment[] = []
  if (!previousHashes) {
    emittedFragments.push(...activeFragments.map(item => ({ ...item, reason: 'initial' as const })))
  } else {
    for (const item of activeFragments) {
      if (previousHashes[item.source] !== item.hash) {
        emittedFragments.push({ ...item, reason: 'changed' as const })
      }
    }
    for (const source of Object.keys(previousHashes)) {
      if (!(source in snapshot.fragmentHashes)) {
        const previous = previousBySource.get(source)
        if (previous) emittedFragments.push(removalFragment(previous))
      }
    }
  }

  const stateItems = previousHashes
    ? reconcilePromptContextItems(previousItems, emittedFragments)
    : emittedFragments

  const state: PromptContextState = {
    version: PROMPT_CONTEXT_VERSION,
    baseInstructions,
    referenceSnapshot: snapshot,
    items: stateItems,
    updatedAt: Date.now(),
  }

  return { baseInstructions, state, emittedFragments, activeFragments }
}

function reconcilePromptContextItems(
  previousItems: PromptContextFragment[],
  emittedFragments: PromptContextFragment[],
): PromptContextFragment[] {
  const bySource = new Map(previousItems.map(item => [item.source, item]))
  for (const item of emittedFragments) {
    if (item.reason === 'removed') {
      bySource.delete(item.source.replace(/:removed$/u, ''))
      bySource.set(item.source, item)
      continue
    }
    bySource.set(item.source, item)
  }
  return Array.from(bySource.values())
}

export function buildRequestMessages(options: {
  providerId: string
  promptContext: PromptContextState
  emittedFragments?: PromptContextFragment[]
  historyMessages: Array<PromptRequestMessage>
}): BuildRequestMessagesResult {
  const fallbackBase = options.promptContext.baseInstructions ? undefined : renderPartial('base/base')
  const baseInstructions = options.promptContext.baseInstructions ?? {
    source: 'partials/base/base',
    content: fallbackBase ?? '',
    hash: sha(fallbackBase ?? ''),
  }
  const baseSegment = segmentForBase(baseInstructions)
  const emittedKeys = new Set((options.emittedFragments ?? []).map(item => `${item.source}:${item.hash}`))
  const contextItems = options.promptContext.items.map(item => ({
    item,
    emittedThisTurn: emittedKeys.has(`${item.source}:${item.hash}`),
  }))
  const developerItems = contextItems.filter(entry => entry.item.role === 'developer')
  const userItems = contextItems.filter(entry => entry.item.role === 'user')
  const developerText = developerItems.map(entry => entry.item.rendered).join('\n\n')
  const systemPrompt = [baseInstructions.content, developerText].filter(Boolean).join('\n\n')

  if (options.providerId === 'codex') {
    const messages: PromptRequestMessage[] = [
      {
        role: 'system',
        content: baseInstructions.content,
        sourceSegments: [baseSegment],
      },
      ...developerItems.map(item => ({
        role: 'developer' as const,
        content: item.item.rendered,
        sourceSegments: [segmentForFragment(item.item, item.emittedThisTurn)],
      })),
      ...userItems.map(item => ({
        role: 'user' as const,
        content: item.item.rendered,
        sourceSegments: [segmentForFragment(item.item, item.emittedThisTurn)],
      })),
      ...options.historyMessages,
    ]
    return { messages, systemPrompt, systemPromptSegments: [baseSegment] }
  }

  const systemSegments = [
    baseSegment,
    ...developerItems.map(entry => segmentForFragment(entry.item, entry.emittedThisTurn)),
  ]
  const messages: PromptRequestMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
      sourceSegments: systemSegments,
    },
    ...userItems.map(item => ({
      role: 'user' as const,
      content: item.item.rendered,
      sourceSegments: [segmentForFragment(item.item, item.emittedThisTurn)],
    })),
    ...options.historyMessages,
  ]

  return {
    messages,
    systemPrompt,
    systemPromptSegments: systemSegments,
  }
}
