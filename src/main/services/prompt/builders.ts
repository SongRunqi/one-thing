/**
 * Prompt Builders (V2)
 *
 * New prompt building functions using the Handlebars template system.
 * These functions transform the existing options to template variables
 * and render using PromptManager.
 */

import * as os from 'os'
import type { SkillDefinition, BuiltinAgentMode, SessionPlan } from '../../../shared/ipc.js'
import type { CustomAgent } from '../../../shared/ipc/custom-agents.js'
import { getPromptManager, PromptManager } from './prompt-manager.js'
import { getMacOSAutomationDocsPath, getToolUsageDocsPath } from '../../stores/paths.js'
import type {
  SystemPromptVariables,
  ToolAgentVariables,
  CustomAgentVariables,
  SkillsVariables,
  TemplatePlan,
  TemplateSkill,
  TemplateCustomTool,
} from './types.js'

/**
 * Transform SessionPlan to TemplatePlan for rendering
 */
function transformPlan(plan: SessionPlan | undefined): TemplatePlan | undefined {
  if (!plan?.items?.length) return undefined

  const items = plan.items.map(item => ({
    content: item.content,
    activeForm: item.activeForm,
    status: item.status,
  }))

  const completed = items.filter(i => i.status === 'completed').length

  return {
    items,
    completedCount: completed,
    totalCount: items.length,
  }
}

/**
 * Transform SkillDefinition to TemplateSkill for rendering
 */
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

/**
 * Build system prompt using templates (V2)
 *
 * This is the new template-based implementation.
 * Use this when USE_TEMPLATE_PROMPTS is enabled.
 */
export function buildSystemPromptV2(options: {
  hasTools: boolean
  skills: SkillDefinition[]
  workspaceSystemPrompt?: string
  userProfilePrompt?: string
  agentMemoryPrompt?: string
  providerId?: string
  workingDirectory?: string
  builtinMode?: BuiltinAgentMode
  sessionPlan?: SessionPlan
}): string {
  const pm = getPromptManager()
  const baseDir = os.homedir()

  // Calculate display path
  let displayPath: string | undefined
  if (options.workingDirectory) {
    displayPath = options.workingDirectory.startsWith(baseDir)
      ? options.workingDirectory.replace(baseDir, '~')
      : options.workingDirectory
  }

  // Get OS-specific docs path (only for macOS)
  const osType = PromptManager.detectOSType()
  const macosAutomationDocsPath = osType === 'macos' ? getMacOSAutomationDocsPath() : undefined

  // Get tool-related docs paths (only when tools are enabled)
  const toolUsageDocsPath = options.hasTools ? getToolUsageDocsPath() : undefined

  const variables: SystemPromptVariables = {
    hasTools: options.hasTools,
    workspaceSystemPrompt: options.workspaceSystemPrompt?.trim(),
    userProfilePrompt: options.userProfilePrompt?.trim(),
    agentMemoryPrompt: options.agentMemoryPrompt?.trim(),
    workingDirectory: options.workingDirectory,
    displayPath,
    baseDirectory: baseDir,
    osType,
    builtinMode: options.builtinMode,
    sessionPlan: transformPlan(options.sessionPlan),
    skills: transformSkills(options.skills),
    macosAutomationDocsPath,
    toolUsageDocsPath,
  }

  return pm.render('main/system-prompt', variables)
}

/**
 * Build tool agent system prompt using templates (V2)
 */
export function buildToolAgentSystemPromptV2(skills?: SkillDefinition[]): string {
  const pm = getPromptManager()

  const variables: ToolAgentVariables = {
    skills: skills ? transformSkills(skills) : undefined,
  }

  return pm.render('main/tool-agent', variables)
}

/**
 * Build custom agent system prompt using templates (V2)
 */
export function buildCustomAgentSystemPromptV2(agent: CustomAgent): string {
  const pm = getPromptManager()

  const customTools: TemplateCustomTool[] = agent.customTools.map(tool => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
    })),
  }))

  const variables: CustomAgentVariables = {
    systemPrompt: agent.systemPrompt,
    customTools,
    hasCustomTools: customTools.length > 0,
  }

  return pm.render('main/custom-agent', variables)
}

/**
 * Build skills awareness prompt using templates (V2)
 */
export function buildSkillsAwarenessPromptV2(skills: SkillDefinition[]): string {
  if (!skills || skills.length === 0) return ''

  const pm = getPromptManager()
  const variables: SkillsVariables = {
    skills: transformSkills(skills),
  }

  return pm.render('skills/awareness', variables)
}

/**
 * Build skills direct prompt using templates (V2)
 */
export function buildSkillsDirectPromptV2(skills: SkillDefinition[], maxInstructionLength = 1000): string {
  if (!skills || skills.length === 0) return ''

  const pm = getPromptManager()
  const variables: SkillsVariables = {
    skills: transformSkills(skills),
    maxInstructionLength,
  }

  return pm.render('skills/direct', variables)
}

/**
 * Build skills tool prompt using templates (V2)
 */
export function buildSkillsToolPromptV2(skills: SkillDefinition[]): string {
  if (!skills || skills.length === 0) return ''

  const pm = getPromptManager()
  const variables: SkillsVariables = {
    skills: transformSkills(skills),
  }

  return pm.render('skills/tool', variables)
}
