import * as os from 'os'
import type { SkillDefinition } from '../../../shared/ipc.js'
import { getMacOSAutomationDocsPath } from '../../stores/paths.js'
import type {
  PromptActiveProject,
  PromptKnownProjects,
  PromptSegment,
  TemplateSkill,
} from './types.js'

function transformSkills(skills: SkillDefinition[]): TemplateSkill[] {
  return skills.map(s => ({
    name: s.name,
    description: s.description,
    source: s.source,
    directoryPath: s.directoryPath,
    path: s.path,
    files: s.files,
    instructions: s.instructions,
  }))
}

function detectOSType(): 'macos' | 'windows' | 'linux' {
  switch (process.platform) {
    case 'darwin': return 'macos'
    case 'win32': return 'windows'
    default: return 'linux'
  }
}

function displayPath(input: string | undefined, homeDir = os.homedir()): string | undefined {
  if (!input) return undefined
  return input.startsWith(homeDir) ? input.replace(homeDir, '~') : input
}

function formatActiveProject(activeProject?: PromptActiveProject): string {
  if (!activeProject?.hasActive) return ''
  return [
    '# Active Project',
    `- path: ${activeProject.displayPath}`,
    activeProject.description ? `- description: ${activeProject.description}` : '',
  ].filter(Boolean).join('\n')
}

function formatKnownProjects(knownProjects?: PromptKnownProjects): string {
  if (!knownProjects?.hasAny) return ''
  return [
    '# Known Projects',
    ...(knownProjects.entries ?? []).map(item => `- ${item.displayPath}${item.description ? ` — ${item.description}` : ''}`),
    '',
    'If a request clearly belongs to one of these directories, use that directory as the working context. Use `project_dirs get path=<path>` to see prior context for that project.',
  ].join('\n')
}

function formatOsContext(osType: 'macos' | 'windows' | 'linux'): string {
  if (osType === 'macos') {
    return [
      '# Operating System Context',
      'You are running on macOS. Use Unix/Bash-compatible syntax with forward slashes (/) for paths.',
      '',
      'For macOS native app automation (Notes, Reminders, Mail, Calendar, Finder), use `osascript`.',
      `Detailed examples and syntax: ${getMacOSAutomationDocsPath()}`,
    ].join('\n')
  }
  if (osType === 'windows') {
    return '# Operating System Context\nYou are running on Windows.\nWhen executing shell commands, use Windows-compatible syntax (e.g., PowerShell or CMD).\nUse backslashes (\\) for file paths when needed, though forward slashes (/) often work too.'
  }
  return '# Operating System Context\nYou are running on Linux.\nWhen executing shell commands, use Unix/Bash-compatible syntax.\nUse forward slashes (/) for file paths.'
}

function formatWorkingDirectory(options: { hasTools: boolean; workingDirectory?: string; workingDirectoryRoots?: string[] }): string {
  if (!options.workingDirectory) return ''
  const homeDir = os.homedir()
  const lines = [
    '# Work Directory',
    `Current work directory: ${displayPath(options.workingDirectory, homeDir)} (${options.workingDirectory})`,
  ]
  const roots = options.workingDirectoryRoots ?? []
  if (roots.length > 0) {
    lines.push('Additional work directories:')
    for (const root of roots) lines.push(`- ${displayPath(root, homeDir)} (${root})`)
  }
  if (options.hasTools) {
    lines.push('read, edit, write, and bash use the current work directory by default. To change it, call variable with action="set", name="workdir", value=<directory>.')
  }
  return lines.join('\n')
}

export function buildSystemPrompt(options: {
  hasTools: boolean
  skills: SkillDefinition[]
  workspaceSystemPrompt?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  contextVariables?: string
  activeProject?: PromptActiveProject
  knownProjects?: PromptKnownProjects
}): { text: string; segments: PromptSegment[] } {
  const osType = detectOSType()
  const parts = [
    options.workspaceSystemPrompt?.trim() || 'You are onething, an expert coding assistant created by songyitian. You help users by reading files, executing commands, editing code, and writing new files.',
    options.hasTools ? formatActiveProject(options.activeProject) : '',
    options.hasTools ? formatKnownProjects(options.knownProjects) : '',
    options.contextVariables?.trim() ? `# Context Variables\n${options.contextVariables.trim()}` : '',
    options.hasTools ? formatWorkingDirectory(options) : '',
    formatOsContext(osType),
  ].filter(Boolean)
  const text = parts.join('\n\n')
  return { text, segments: [{ source: 'core/system-prompt', content: text, role: 'base' }] }
}

export function buildSkillsAwarenessPrompt(skills: SkillDefinition[]): string {
  const transformed = transformSkills(skills)
  if (transformed.length === 0) return ''
  const skillsList = transformed.map(skill => {
    const files = skill.files?.length ? `\n  Files: SKILL.md, ${skill.files.map(f => f.name).join(', ')}` : '\n  Files: SKILL.md'
    return `- **${skill.name}** (${skill.source})\n  Description: ${skill.description}${skill.directoryPath ? `\n  Path: ${skill.directoryPath}/` : ''}${files}`
  }).join('\n\n')
  return `## Available Skills\n\nYou have access to Claude Code Skills - modular capabilities that provide specialized instructions.\n\n### How to Use Skills\n\nWhen a user's request relates to a skill:\n1. **First explain**: Briefly tell the user what you're about to do (e.g., "Let me check the agent-plan skill instructions first.")\n2. **Then execute**: Read the skill's SKILL.md file using bash: \`cat {path}/SKILL.md\`\n3. **Continue**: Follow the instructions in the skill file and execute any scripts as needed\n\n**Important**: Always explain your intent before executing any command. Don't jump directly to tool calls.\n\n### Available Skills\n\n${skillsList}`
}

export function buildSkillsDirectPrompt(skills: SkillDefinition[], maxInstructionLength = 1000): string {
  const transformed = transformSkills(skills)
  if (transformed.length === 0) return ''
  const body = transformed.map(skill => {
    const instructions = skill.instructions && skill.instructions.length > maxInstructionLength
      ? `${skill.instructions.slice(0, maxInstructionLength)}\n\n... (instructions truncated)`
      : skill.instructions || ''
    return `### Skill: ${skill.name}\n**Description:** ${skill.description}\n\n${instructions}`
  }).join('\n\n---\n\n')
  return `## Available Skills\n如果当前的任务需要额外的能力，你可以使用skill来处理。\nYou have access to the following Claude Code Skills. Use them when the user's request matches their description.\n\n${body}`
}

export function buildSkillsToolPrompt(skills: SkillDefinition[]): string {
  const transformed = transformSkills(skills)
  if (transformed.length === 0) return ''
  const skillsList = transformed.map(skill => `- **${skill.name}**: ${skill.description}`).join('\n')
  return `## Available Skills\n\nYou have access to specialized skills through the \`skill\` tool.\n\n### How to Use Skills\n\nWhen a user's request relates to a skill:\n1. Use the \`skill\` tool with the skill name: \`skill({ name: "skill-name" })\`\n2. The tool will return the full skill instructions\n3. Follow the returned instructions to complete the task\n\n### Available Skills\n\n${skillsList}\n\n**Note**: Use the skill tool to load instructions - do not try to read skill files directly.`
}

export function buildContextCompactPrompt(messages: string, previousSummary?: string): string {
  return `You are a conversation summarization assistant. Please read the following conversation history and generate a structured summary.\n\n${previousSummary ? `## Existing Summary\n${previousSummary}\n\nUpdate and merge this existing summary with the additional conversation history below. Do not duplicate details.\n\n` : ''}## Conversation History\n${messages}\n\n## Task\nGenerate a summary that includes:\n1. **Main Topics**: What was primarily discussed\n2. **Key Decisions**: Important decisions or conclusions made\n3. **Context Information**: User preferences, conventions, important background\n4. **Ongoing Tasks**: Incomplete items or to-dos\n\n## Requirements\n- Output in clear Markdown format\n- Keep it within 500 words\n- Preserve all important technical details and context\n- Use third person description ("The user mentioned...", "The assistant suggested...")`
}
