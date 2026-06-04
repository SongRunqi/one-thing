import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  PromptContextRole,
  SkillDefinition,
  AppSettings,
} from '../../../shared/ipc.js'
import { getMacOSAutomationDocsPath } from '../../stores/paths.js'
import { getAgent } from '../../agents/index.js'
import type {
  PromptActiveProject,
  PromptKnownProjects,
  PromptSegment,
  TemplateSkill,
} from './types.js'
import { collectPluginPromptContext } from './plugin-context.js'
import { getToolPromptGuidelines, getToolPromptSnippet } from '../../tools/registry.js'

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

export interface BuildPromptOptions extends BuildPromptContextOptions {
  providerId: string
  historyMessages: PromptRequestMessage[]
}

export interface BuildPromptResult {
  messages: PromptRequestMessage[]
  systemPrompt: string
  systemPromptSegments: PromptSegment[]
  debugSections: PromptSegment[]
}

interface PromptSection {
  role: 'system' | PromptContextRole
  source: string
  content: string
}

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
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

function detectOSType(): 'macos' | 'windows' | 'linux' {
  switch (process.platform) {
    case 'darwin': return 'macos'
    case 'win32': return 'windows'
    default: return 'linux'
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

function formatDateForPrompt(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatAvailableTools(toolNames: string[] | undefined, mcpToolNames: string[] | undefined): string {
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

function buildSystemSection(options: BuildPromptContextOptions): PromptSection {
  const promptCwd = options.workingDirectory?.replace(/\\/g, '/')
  const additionalRoots = (options.workingDirectoryRoots ?? [])
    .filter(root => root && root !== options.workingDirectory)
    .map(root => root.replace(/\\/g, '/'))

  const guidelines = [
    'Use write for new files or complete rewrites.',
    'Follow the Tool Workspace Rules when choosing file paths or command directories.',
    'Prefer specific file/search tools over bash when they fit the task.',
    'When changing code, run an appropriate check when practical, then summarize changed paths clearly.',
    'Be concise in your responses.',
    'Show file paths clearly when working with files.',
    ...getToolPromptGuidelines(options.toolNames ?? []),
  ]

  const parts = [
    'You are onething, an expert coding assistant created by songyitian. You help users by reading files, executing commands, editing code, and writing new files.',
    '',
    'Available tools:',
    options.hasTools ? formatAvailableTools(options.toolNames, options.mcpToolNames) : '(none)',
    '',
    'Guidelines:',
    ...guidelines.map(item => `- ${item}`),
  ]

  if (promptCwd) parts.push('', `Current work directory: ${promptCwd}`)
  if (additionalRoots.length > 0) {
    parts.push('', 'Additional work directories:', ...additionalRoots.map(root => `- ${root}`))
  }
  parts.push('', `Current date: ${formatDateForPrompt()}`)

  return { role: 'system', source: 'core/system-prompt', content: parts.join('\n') }
}

function section(role: 'developer' | 'user', source: string, content: string | undefined): PromptSection | undefined {
  const trimmed = content?.trim()
  if (!trimmed) return undefined
  return { role, source, content: trimmed }
}

function formatWorkingDirectoryContext(options: BuildPromptContextOptions): string | undefined {
  if (!options.workingDirectory) return undefined
  const homeDir = os.homedir()
  const lines = [
    '# Work Directory',
    `Current work directory: ${displayPath(options.workingDirectory, homeDir) ?? options.workingDirectory} (${options.workingDirectory})`,
  ]
  const roots = displayRoots(options.workingDirectoryRoots, homeDir)
  if (roots.length > 0) {
    lines.push('Additional work directories:')
    for (const root of roots) lines.push(`- ${root.displayPath} (${root.path})`)
  }
  if (options.hasTools) {
    lines.push('', '## Tool Workspace Rules')
    lines.push('- read, edit, write, and bash use the current work directory by default.')
    lines.push('- To change the work directory, call `variable` with action="set", name="workdir", value=<directory>.')
  }
  return lines.join('\n')
}

function formatActiveProjectContext(activeProject?: PromptActiveProject): string | undefined {
  if (!activeProject?.hasActive) return undefined
  return [
    '# Active Project',
    `- path: ${activeProject.displayPath}`,
    activeProject.description ? `- description: ${activeProject.description}` : '',
  ].filter(Boolean).join('\n')
}

function formatKnownProjectsContext(knownProjects?: PromptKnownProjects): string | undefined {
  if (!knownProjects?.hasAny) return undefined
  const lines = ['# Known Projects']
  for (const item of knownProjects.entries ?? []) {
    lines.push(`- ${item.displayPath}${item.description ? ` — ${item.description}` : ''}`)
  }
  lines.push('', 'If a request clearly belongs to one of these directories and it is not already the current work directory, first call `variable` with action="set", name="workdir", value=<path>. Use `project_dirs get path=<path>` only to inspect remembered metadata; it does not change the work directory.')
  return lines.join('\n')
}

function formatOsContext(): string {
  const osType = detectOSType()
  if (osType === 'macos') {
    return [
      'You are running on macOS. Use Unix/Bash-compatible syntax with forward slashes (/) for paths.',
      '',
      'For macOS native app automation (Notes, Reminders, Mail, Calendar, Finder), use `osascript`.',
      `Detailed examples and syntax: ${getMacOSAutomationDocsPath()}`,
    ].join('\n')
  }
  if (osType === 'windows') {
    return 'You are running on Windows.\nWhen executing shell commands, use Windows-compatible syntax (e.g., PowerShell or CMD).\nUse backslashes (\\) for file paths when needed, though forward slashes (/) often work too.'
  }
  return 'You are running on Linux.\nWhen executing shell commands, use Unix/Bash-compatible syntax.\nUse forward slashes (/) for file paths.'
}

function formatPermissionContext(options: BuildPromptContextOptions): string | undefined {
  if (!options.hasTools) return undefined
  const lines = [
    '## Permission Context',
    '',
    'Tool execution may require user approval before side effects. Approval can be granted for one action, the current session, or the current work directory.',
  ]
  if (options.workingDirectory) lines.push('', `Current work directory boundary: ${options.workingDirectory}`)
  if (options.workingDirectoryRoots?.length) {
    lines.push('Additional work directory boundaries:')
    for (const root of options.workingDirectoryRoots) lines.push(`- ${root}`)
  }
  return lines.join('\n')
}

function formatSkillsContext(skills: SkillDefinition[]): string | undefined {
  const transformed = transformSkills(skills)
  if (transformed.length === 0) return undefined
  const lines = [
    '## Available Skills',
    'You have access to the following skills. When a task involves using a skill, read its SKILL.md file first to understand how to use it properly.',
    '',
  ]
  for (const skill of transformed) {
    lines.push(`- **${skill.name}**: ${skill.description}`)
    if (skill.directoryPath) lines.push(`  - SKILL.md location: \`${skill.directoryPath}/SKILL.md\``)
    else if (skill.path) lines.push(`  - SKILL.md location: \`${skill.path}\``)
  }
  lines.push('', '**How to use skills:**', '1. If the skill directory is outside the current work directory list, use the `variable` tool with action=append, name=workdir, value=<skill-directory> before reading or editing it. Append the specific skill directory, not `~`.', '2. Use read tool to read the skill documentation', '3. Follow the instructions in SKILL.md to execute the skill', '4. Skills may have scripts or specific commands to run')
  return lines.join('\n')
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

function toSegment(item: PromptSection): PromptSegment {
  return {
    source: item.source,
    content: item.content,
    role: item.role === 'system' ? 'base' : item.role,
    hash: sha(`${item.role}\n${item.source}\n${item.content}`),
  }
}

async function buildPromptSections(options: BuildPromptContextOptions): Promise<PromptSection[]> {
  const sections: Array<PromptSection | undefined> = [buildSystemSection(options)]

  const agent = getAgent(options.agentId)
  if (agent.systemPrompt.trim()) {
    sections.push(section('developer', `agents/${agent.id}/system-prompt`, [
      `# Agent: ${agent.name}`,
      agent.systemPrompt.trim(),
    ].join('\n\n')))
  }

  if (options.speakMode ?? options.voiceConversation) {
    sections.push(section('developer', 'context/voice-speak-mode', [
      '## Voice Speak Mode',
      'This turn came from spoken input. The assistant reply will be spoken aloud through TTS.',
      'Write naturally for listening: short sentences, conversational wording, and clear next steps.',
      'Avoid long lists, raw paths, logs, code blocks, dense citations, or implementation details unless the user explicitly needs them.',
      'If tool work or detailed output is needed, give a brief spoken-friendly summary first, then keep any detailed text compact and scannable.',
      'Do not output special speech markup tags. Write the actual reply text directly.',
    ].join('\n')))
  }

  sections.push(section('developer', 'context/working-directory', formatWorkingDirectoryContext(options)))
  sections.push(section('developer', 'context/active-project', formatActiveProjectContext(options.activeProject)))
  sections.push(section('developer', 'context/known-projects', formatKnownProjectsContext(options.knownProjects)))
  if (options.contextVariables?.trim()) {
    sections.push(section('developer', 'context/context-variables', `# Context Variables\n${options.contextVariables.trim()}`))
  }
  sections.push(section('developer', `os/${detectOSType()}`, formatOsContext()))
  sections.push(section('developer', 'security/permissions', formatPermissionContext(options)))
  sections.push(section('developer', 'context/skills', formatSkillsContext(options.skills)))

  const toolNames = [...(options.toolNames ?? [])].sort()
  const mcpToolNames = [...(options.mcpToolNames ?? [])].sort()
  if (options.hasTools && (toolNames.length > 0 || mcpToolNames.length > 0)) {
    sections.push(section('developer', 'context/tool-catalog', [
      '## Enabled Tool Names',
      toolNames.length > 0 ? `Built-in tools: ${toolNames.join(', ')}` : '',
      mcpToolNames.length > 0 ? `MCP tools: ${mcpToolNames.join(', ')}` : '',
    ].filter(Boolean).join('\n')))
  }

  sections.push(section('developer', 'context/agents-md', loadAgentsMdInstructions(options.workingDirectory)))

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
    sections.push(section(item.role, item.source || 'plugins/context', item.content))
  }

  return sections.filter((item): item is PromptSection => item !== undefined)
}

export async function buildPrompt(options: BuildPromptOptions): Promise<BuildPromptResult> {
  const sections = await buildPromptSections(options)
  const systemSection = sections.find(item => item.role === 'system') ?? buildSystemSection(options)
  // IMPORTANT: sections built by this prompt builder are injected app/project
  // context, not chat history. Even when a section is about the user-facing
  // context, it must not be sent with role="user"; only real conversation
  // messages from options.historyMessages may use the user role.
  const injectedContextSections = sections.filter(item => item !== systemSection)
  const debugSections = sections.map(toSegment)
  const systemSegment = toSegment(systemSection)

  if (options.providerId === 'codex') {
    return {
      messages: [
        { role: 'system', content: systemSection.content, sourceSegments: [systemSegment] },
        ...injectedContextSections.map(item => ({ role: 'developer' as const, content: item.content, sourceSegments: [toSegment(item)] })),
        ...options.historyMessages,
      ],
      systemPrompt: [systemSection.content, ...injectedContextSections.map(item => item.content)].filter(Boolean).join('\n\n'),
      systemPromptSegments: [systemSegment],
      debugSections,
    }
  }

  const systemPrompt = [systemSection.content, ...injectedContextSections.map(item => item.content)].filter(Boolean).join('\n\n')
  const systemSegments = [systemSegment, ...injectedContextSections.map(toSegment)]
  return {
    messages: [
      { role: 'system', content: systemPrompt, sourceSegments: systemSegments },
      ...options.historyMessages,
    ],
    systemPrompt,
    systemPromptSegments: systemSegments,
    debugSections,
  }
}
