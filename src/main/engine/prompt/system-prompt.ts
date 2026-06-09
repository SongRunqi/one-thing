/**
 * System Prompt
 *
 * The whole system prompt lives here: read the top-level `buildSystemPrompt`
 * to see every section, its order, and the condition under which it appears.
 * Scroll down to edit the text of any section.
 *
 *   - static sections  → a string constant
 *   - dynamic sections → a function that returns a template string
 *
 * No segment/source/hash tracking, no manifest, no registry — just a directory
 * (the array in buildSystemPrompt) plus the text below it.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SkillDefinition, AppSettings } from '../../../shared/ipc.js'
import { getMacOSAutomationDocsPath } from '../../stores/paths.js'
import { getAgent } from '../../agents/index.js'
import { getToolPromptGuidelines, getToolPromptSnippet } from '../../tools/registry.js'
import { collectPluginPromptContext } from './plugin-context.js'
import type { PromptActiveProject, PromptKnownProjects } from './types.js'

const AGENTS_MAX_BYTES = 32 * 1024

export interface BuildPromptContextOptions {
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
  speakMode?: boolean
  voiceConversation?: boolean
}

export type PromptRequestMessage =
  | { role: 'system' | 'developer' | 'user'; content: unknown }
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

export interface BuildPromptOptions extends BuildPromptContextOptions {
  providerId: string
  historyMessages: PromptRequestMessage[]
}

export interface BuildPromptResult {
  messages: PromptRequestMessage[]
  systemPrompt: string
}

// ────────────────────────────────────────────────────────────────────────────
// Directory: every section, in order, with its appearance condition.
// `system` carries the core identity; everything else is `developer`.
// ────────────────────────────────────────────────────────────────────────────

export async function buildSystemPrompt(
  ctx: BuildPromptContextOptions,
): Promise<{ system: string; developer: string[] }> {
  const agent = getAgent(ctx.agentId)
  const plugins = await collectPlugins(ctx)

  return {
    system: core(ctx),
    developer: compact([
      agent.systemPrompt.trim() && agentPrompt(agent.name, agent.systemPrompt),
      (ctx.speakMode ?? ctx.voiceConversation) && VOICE_SPEAK_MODE,
      ctx.workingDirectory && workdir(ctx),
      ctx.activeProject?.hasActive && activeProject(ctx.activeProject),
      ctx.knownProjects?.hasAny && knownProjects(ctx.knownProjects),
      ctx.contextVariables?.trim() && `# Context Variables\n${ctx.contextVariables.trim()}`,
      os_(),
      ctx.hasTools && permissions(ctx),
      skills(ctx.skills),
      ctx.hasTools && toolCatalog(ctx),
      loadAgentsMdInstructions(ctx.workingDirectory),
      ...plugins,
    ]),
  }
}

/** Assemble into provider request messages. */
export async function buildPrompt(options: BuildPromptOptions): Promise<BuildPromptResult> {
  const { system, developer } = await buildSystemPrompt(options)
  const systemPrompt = [system, ...developer].filter(Boolean).join('\n\n')

  // Codex keeps the core as a `system` message and each context section as its
  // own `developer` message; every other provider folds them into one system message.
  if (options.providerId === 'codex') {
    return {
      messages: [
        { role: 'system', content: system },
        ...developer.map(content => ({ role: 'developer' as const, content })),
        ...options.historyMessages,
      ],
      systemPrompt,
    }
  }
  return {
    messages: [{ role: 'system', content: systemPrompt }, ...options.historyMessages],
    systemPrompt,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Sections — static constants and dynamic render functions
// ────────────────────────────────────────────────────────────────────────────

function core(ctx: BuildPromptContextOptions): string {
  const promptCwd = ctx.workingDirectory?.replace(/\\/g, '/')
  const additionalRoots = (ctx.workingDirectoryRoots ?? [])
    .filter(root => root && root !== ctx.workingDirectory)
    .map(root => root.replace(/\\/g, '/'))

  const guidelines = [
    'Use write for new files or complete rewrites.',
    'Follow the Tool Workspace Rules when choosing file paths or command directories.',
    'Prefer specific file/search tools over bash when they fit the task.',
    'When changing code, run an appropriate check when practical, then summarize changed paths clearly.',
    'Be concise in your responses.',
    'Show file paths clearly when working with files.',
    ...getToolPromptGuidelines(ctx.toolNames ?? []),
  ]

  const parts = [
    'You are onething, an expert coding assistant created by songyitian. You help users by reading files, executing commands, editing code, and writing new files.',
    '',
    'Available tools:',
    ctx.hasTools ? availableTools(ctx.toolNames, ctx.mcpToolNames) : '(none)',
    '',
    'Guidelines:',
    ...guidelines.map(item => `- ${item}`),
  ]

  if (promptCwd) parts.push('', `Current work directory: ${promptCwd}`)
  if (additionalRoots.length > 0) {
    parts.push('', 'Additional work directories:', ...additionalRoots.map(root => `- ${root}`))
  }
  parts.push('', `Current date: ${formatDate()}`)

  return parts.join('\n')
}

function availableTools(toolNames: string[] | undefined, mcpToolNames: string[] | undefined): string {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const name of toolNames ?? []) {
    if (seen.has(name)) continue
    seen.add(name)
    lines.push(`- ${name}: ${getToolPromptSnippet(name) ?? 'Available built-in tool.'}`)
  }
  for (const name of mcpToolNames ?? []) {
    if (seen.has(name)) continue
    seen.add(name)
    lines.push(`- ${name}: Available MCP tool.`)
  }
  return lines.length > 0 ? lines.join('\n') : '(none)'
}

function agentPrompt(name: string, systemPrompt: string): string {
  return `# Agent: ${name}\n\n${systemPrompt.trim()}`
}

const VOICE_SPEAK_MODE = [
  '## Voice Speak Mode',
  'This turn came from spoken input. The assistant reply will be spoken aloud through TTS.',
  'Write naturally for listening: short sentences, conversational wording, and clear next steps.',
  'Avoid long lists, raw paths, logs, code blocks, dense citations, or implementation details unless the user explicitly needs them.',
  'If tool work or detailed output is needed, give a brief spoken-friendly summary first, then keep any detailed text compact and scannable.',
  'Do not output special speech markup tags. Write the actual reply text directly.',
].join('\n')

function workdir(ctx: BuildPromptContextOptions): string {
  const homeDir = os.homedir()
  const lines = [
    '# Work Directory',
    `Current work directory: ${displayPath(ctx.workingDirectory, homeDir) ?? ctx.workingDirectory} (${ctx.workingDirectory})`,
  ]
  const roots = displayRoots(ctx.workingDirectoryRoots, homeDir)
  if (roots.length > 0) {
    lines.push('Additional work directories:')
    for (const root of roots) lines.push(`- ${root.displayPath} (${root.path})`)
  }
  if (ctx.hasTools) {
    lines.push('', '## Tool Workspace Rules')
    lines.push('- read, edit, write, and bash use the current work directory by default.')
    lines.push('- To change the work directory, call `variable` with action="set", name="workdir", value=<directory>.')
  }
  return lines.join('\n')
}

function activeProject(project: PromptActiveProject): string {
  return [
    '# Active Project',
    `- path: ${project.displayPath}`,
    project.description ? `- description: ${project.description}` : '',
  ].filter(Boolean).join('\n')
}

function knownProjects(known: PromptKnownProjects): string {
  const lines = ['# Known Projects']
  for (const item of known.entries ?? []) {
    lines.push(`- ${item.displayPath}${item.description ? ` — ${item.description}` : ''}`)
  }
  lines.push('', 'If a request clearly belongs to one of these directories and it is not already the current work directory, first call `variable` with action="set", name="workdir", value=<path>. Use `project_dirs get path=<path>` only to inspect remembered metadata; it does not change the work directory.')
  return lines.join('\n')
}

function os_(): string {
  switch (process.platform) {
    case 'darwin':
      return [
        'You are running on macOS. Use Unix/Bash-compatible syntax with forward slashes (/) for paths.',
        '',
        'For macOS native app automation (Notes, Reminders, Mail, Calendar, Finder), use `osascript`.',
        `Detailed examples and syntax: ${getMacOSAutomationDocsPath()}`,
      ].join('\n')
    case 'win32':
      return 'You are running on Windows.\nWhen executing shell commands, use Windows-compatible syntax (e.g., PowerShell or CMD).\nUse backslashes (\\) for file paths when needed, though forward slashes (/) often work too.'
    default:
      return 'You are running on Linux.\nWhen executing shell commands, use Unix/Bash-compatible syntax.\nUse forward slashes (/) for file paths.'
  }
}

function permissions(ctx: BuildPromptContextOptions): string {
  const lines = [
    '## Permission Context',
    '',
    'Tool execution may require user approval before side effects. Approval can be granted for one action, the current session, or the current work directory.',
  ]
  if (ctx.workingDirectory) lines.push('', `Current work directory boundary: ${ctx.workingDirectory}`)
  if (ctx.workingDirectoryRoots?.length) {
    lines.push('Additional work directory boundaries:')
    for (const root of ctx.workingDirectoryRoots) lines.push(`- ${root}`)
  }
  return lines.join('\n')
}

function skills(skillDefs: SkillDefinition[]): string | undefined {
  if (skillDefs.length === 0) return undefined
  const lines = [
    '## Available Skills',
    'You have access to the following skills. When a task involves using a skill, read its SKILL.md file first to understand how to use it properly.',
    '',
  ]
  for (const skill of skillDefs) {
    lines.push(`- **${skill.name}**: ${skill.description}`)
    if (skill.directoryPath) lines.push(`  - SKILL.md location: \`${skill.directoryPath}/SKILL.md\``)
    else if (skill.path) lines.push(`  - SKILL.md location: \`${skill.path}\``)
  }
  lines.push('', '**How to use skills:**', '1. If the skill directory is outside the current work directory list, use the `variable` tool with action=append, name=workdir, value=<skill-directory> before reading or editing it. Append the specific skill directory, not `~`.', '2. Use read tool to read the skill documentation', '3. Follow the instructions in SKILL.md to execute the skill', '4. Skills may have scripts or specific commands to run')
  return lines.join('\n')
}

function toolCatalog(ctx: BuildPromptContextOptions): string | undefined {
  const toolNames = [...(ctx.toolNames ?? [])].sort()
  const mcpToolNames = [...(ctx.mcpToolNames ?? [])].sort()
  if (toolNames.length === 0 && mcpToolNames.length === 0) return undefined
  return [
    '## Enabled Tool Names',
    toolNames.length > 0 ? `Built-in tools: ${toolNames.join(', ')}` : '',
    mcpToolNames.length > 0 ? `MCP tools: ${mcpToolNames.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// AGENTS.md project instructions (reads files from disk)
// ────────────────────────────────────────────────────────────────────────────

export function loadAgentsMdInstructions(workingDirectory?: string): string | undefined {
  if (!workingDirectory) return undefined
  const target = path.resolve(workingDirectory)
  const projectRoot = findProjectRoot(target)
  const root = isPathContained(projectRoot, target) ? projectRoot : target
  const dirs = dirsFromRootToTarget(root, target)
  const parts: string[] = []
  for (const dir of dirs) {
    const candidates = ['AGENTS.override.md', 'AGENTS.md'].map(name => path.join(dir, name))
    const selected = candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile())
    if (!selected) continue
    const data = fs.readFileSync(selected)
    const text = data.length > AGENTS_MAX_BYTES
      ? `${data.subarray(0, AGENTS_MAX_BYTES).toString('utf-8')}\n\n<!-- AGENTS instructions truncated -->`
      : data.toString('utf-8')
    parts.push(`<project_instructions path="${selected}">\n${text}\n</project_instructions>`)
  }
  if (parts.length === 0) return undefined
  return [
    '<project_context>',
    '',
    'Project-specific instructions and guidelines:',
    '',
    ...parts,
    '',
    '</project_context>',
  ].join('\n')
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

function isPathContained(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function dirsFromRootToTarget(root: string, target: string): string[] {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  const parts = relative ? relative.split(path.sep).filter(Boolean) : []
  const dirs = [resolvedRoot]
  let cursor = resolvedRoot
  for (const part of parts) {
    cursor = path.join(cursor, part)
    dirs.push(cursor)
  }
  return dirs
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Drop falsy/empty entries, trim the rest. */
function compact(parts: Array<string | false | 0 | null | undefined>): string[] {
  return parts.map(part => (typeof part === 'string' ? part.trim() : '')).filter(Boolean)
}

async function collectPlugins(ctx: BuildPromptContextOptions): Promise<string[]> {
  const fragments = await collectPluginPromptContext({
    sessionId: ctx.sessionId,
    providerId: ctx.providerId,
    providerConfig: ctx.providerConfig,
    settings: ctx.settings,
    hasTools: ctx.hasTools,
    skills: ctx.skills,
    workingDirectory: ctx.workingDirectory,
    workingDirectoryRoots: ctx.workingDirectoryRoots,
    contextVariables: ctx.contextVariables,
    activeProject: ctx.activeProject,
    knownProjects: ctx.knownProjects,
    toolNames: ctx.toolNames,
    mcpToolNames: ctx.mcpToolNames,
  })
  return fragments.map(fragment => fragment.content)
}

function displayPath(input: string | undefined, homeDir: string): string | undefined {
  if (!input) return undefined
  return input.startsWith(homeDir) ? input.replace(homeDir, '~') : input
}

function displayRoots(roots: string[] | undefined, homeDir: string): Array<{ path: string; displayPath: string }> {
  return (roots ?? []).map(root => ({ path: root, displayPath: displayPath(root, homeDir) ?? root }))
}

function formatDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
