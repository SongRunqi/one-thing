import type { ChatMessage } from '../../../shared/ipc.js'
import type { Trigger } from './index.js'
import {
  isSkillReviewRunning,
  markSkillReviewRunning,
  recordSkillReviewCounter,
} from './skill-review-state.js'
import { generateChatResponse } from '../../providers/index.js'
import { executeSkillManage, type SkillManageArgs } from '../../skills/manage.js'
import { getSkillsForSession, invalidateSkillsCache } from '../../ipc/skills.js'
import { createDeepSeekAgentProvider, runAgentLoop, type AgentMessage, type AgentTool } from '../../agent-loop/index.js'
import { SkillManageTool } from '../../tools/builtin/skill.js'
import { zodToJsonSchema } from '../../tools/core/tool.js'

const MAX_REVIEW_MESSAGES = 16
const MAX_TRANSCRIPT_CHARS = 12000
const MAX_SKILL_ACTIONS = 2
const MAX_SUPPORT_FILES_PER_SKILL = 6
const SUPPORT_FILE_ROOTS = new Set(['references', 'templates', 'scripts', 'assets'])

interface ReviewSupportFile {
  file_path?: string
  filePath?: string
  path?: string
  content?: string
  file_content?: string
  fileContent?: string
}

interface ReviewAction {
  action?: string
  name?: string
  description?: string
  instructions?: string
  content?: string
  files?: ReviewSupportFile[]
  support_files?: ReviewSupportFile[]
  supportFiles?: ReviewSupportFile[]
  reason?: string
}

interface NormalizedReviewAction {
  skill: SkillManageArgs
  supportFiles: SkillManageArgs[]
}

interface TrackedAgentSkill {
  name: string
  content?: string
}

interface SkillManageAgentToolBundle {
  tool: AgentTool
  createdSkills: Map<string, TrackedAgentSkill>
  supportFilesBySkill: Map<string, Set<string>>
}

interface ReviewDecision {
  actions?: ReviewAction[]
  rationale?: string
}

function isSkillReviewDisabledByEnv(): boolean {
  return process.env.ONETHING_DISABLE_SKILL_REVIEW === '1' ||
    process.env.ONETHING_DISABLE_SKILL_REVIEW === 'true'
}

function messageText(message: ChatMessage): string {
  const content: unknown = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (part?.type === 'text') return part.text
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(content ?? '')
}

function transcriptFromMessages(messages: ChatMessage[]): string {
  const recent = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_REVIEW_MESSAGES)

  let transcript = recent
    .map(message => {
      const text = messageText(message).trim()
      return `${message.role.toUpperCase()}: ${text || '[empty]'}`
    })
    .join('\n\n')

  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS)
  }
  return transcript
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : trimmed
}

function parseReviewDecision(raw: string): ReviewDecision {
  const text = stripJsonFence(raw)
  try {
    return JSON.parse(text) as ReviewDecision
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as ReviewDecision
    }
    throw new Error('Skill review did not return JSON')
  }
}

function userSkillSummary(workingDirectory?: string): string {
  const skills = getSkillsForSession(workingDirectory)
  if (skills.length === 0) return 'No installed skills are visible.'
  return skills
    .map(skill => `- ${skill.name} [${skill.source}] ${skill.description}`)
    .join('\n')
}

function supportFileActions(action: ReviewAction, skillName: string): SkillManageArgs[] {
  const files = action.files ?? action.support_files ?? action.supportFiles ?? []
  const seen = new Set<string>()
  const normalized: SkillManageArgs[] = []

  for (const file of files) {
    const rawPath = file.file_path ?? file.filePath ?? file.path
    const rawContent = file.content ?? file.file_content ?? file.fileContent
    const filePath = normalizeSupportFilePath(rawPath)
    const fileContent = typeof rawContent === 'string' ? rawContent : ''
    if (!filePath || !fileContent.trim() || seen.has(filePath)) continue

    seen.add(filePath)
    normalized.push({
      action: 'write_file',
      name: skillName,
      file_path: filePath,
      file_content: fileContent,
    })

    if (normalized.length >= MAX_SUPPORT_FILES_PER_SKILL) break
  }

  return normalized
}

function normalizeSupportFilePath(rawPath: string | undefined): string | null {
  const filePath = rawPath?.trim()
  if (!filePath || filePath.includes('\0') || filePath.includes('\\')) return null
  if (filePath.startsWith('/') || filePath.startsWith('~')) return null

  const segments = filePath.split('/').filter(Boolean)
  if (segments.length < 2 || !SUPPORT_FILE_ROOTS.has(segments[0])) return null
  if (segments.some(segment => segment === '.' || segment === '..')) return null

  return segments.join('/')
}

function defaultSupportFile(description: string, instructions: string, reason?: string): SkillManageArgs {
  const content = [
    '# Procedure Notes',
    '',
    `Description: ${description}`,
    reason?.trim() ? `Reason captured: ${reason.trim()}` : '',
    '',
    '## Reusable Procedure',
    '',
    instructions.trim(),
    '',
  ].filter(Boolean).join('\n')

  return {
    action: 'write_file',
    file_path: 'references/procedure.md',
    file_content: content,
  }
}

function ensureSupportFileReferences(instructions: string, supportFiles: SkillManageArgs[]): string {
  const paths = supportFiles
    .map(file => file.file_path ?? file.filePath)
    .filter((filePath): filePath is string => Boolean(filePath))

  const missingPaths = paths.filter(filePath => !instructions.includes(filePath))
  if (missingPaths.length === 0) {
    return instructions
  }

  const references = missingPaths.map(filePath => `- See \`${filePath}\`.`).join('\n')
  return `${instructions.trim()}\n\n## Supporting files\n${references}`
}

function ensureContentReferences(content: string, paths: string[]): string {
  const refs = paths.map(filePath => ({
    action: 'write_file' as const,
    file_path: filePath,
    file_content: '',
  }))
  return ensureSupportFileReferences(content, refs)
}

function buildReviewMessages(ctx: Parameters<Trigger['execute']>[0]): Array<{ role: 'system' | 'user'; content: string }> {
  const workingDirectory = ctx.session.workingDirectory
  const system = [
    'You are a background Hermes skill-review fork.',
    'The user-facing assistant response has already been delivered; do not answer the user.',
    'Decide whether the recent conversation revealed a durable, reusable procedure that should become a Hermes SKILL.md skill.',
    'Be conservative. Do not create a skill for one-off facts, transient debugging details, secrets, credentials, or project-specific trivia.',
    'Only propose user-owned skills. Return strict JSON with this shape: {"actions":[{"action":"create"|"edit","name":"lowercase-name","description":"...","instructions":"Concise SKILL.md body that references supporting files by relative path","files":[{"file_path":"references/checklist.md","content":"..."}],"reason":"..."}]}.',
    'For create actions, include at least one supporting file when there is durable detail, a checklist, a reusable template, a script, or examples worth keeping outside the main SKILL.md.',
    'Supporting files must use relative paths under references/, templates/, scripts/, or assets/ only. Do not include secrets, credentials, or transient project facts in SKILL.md or supporting files.',
    'Return {"actions":[]} when no skill should be created or updated.',
  ].join('\n')

  const user = [
    `Session id: ${ctx.sessionId}`,
    workingDirectory ? `Working directory: ${workingDirectory}` : 'Working directory: [none]',
    '',
    'Visible skills:',
    userSkillSummary(workingDirectory),
    '',
    'Recent transcript:',
    transcriptFromMessages(ctx.messages),
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function buildAgentReviewMessages(ctx: Parameters<Trigger['execute']>[0]): AgentMessage[] {
  const workingDirectory = ctx.session.workingDirectory
  const system = [
    'You are a background Hermes skill-review agent.',
    'The user-facing assistant response has already been delivered; do not answer the user.',
    'Decide whether the recent conversation revealed a durable, reusable procedure that should become a Hermes skill.',
    'Be conservative. Do not create a skill for one-off facts, transient debugging details, secrets, credentials, or project-specific trivia.',
    'Use the skill_manage tool as your only mutation API. Do not invent files in plain text; call skill_manage for each change.',
    'A complete created skill is a directory with SKILL.md plus at least one supporting file. First call skill_manage create for SKILL.md, then call skill_manage write_file for references/, templates/, scripts/, or assets/.',
    'Use references/ for durable notes, checklists, examples, and procedure detail; templates/ for reusable user-facing formats; scripts/ only for executable helpers; assets/ only for static resources.',
    'For create/edit, provide full SKILL.md markdown in the content argument, including YAML frontmatter with name and description. For supporting files, provide file_path and file_content.',
    'When no skill should be created or updated, do not call tools and return {"changed":false,"summary":"no durable skill update"}.',
    'After all necessary tool calls, return strict JSON: {"changed":true|false,"summary":"..."}',
  ].join('\n')

  const user = [
    `Session id: ${ctx.sessionId}`,
    workingDirectory ? `Working directory: ${workingDirectory}` : 'Working directory: [none]',
    '',
    'Visible skills:',
    userSkillSummary(workingDirectory),
    '',
    'Recent transcript:',
    transcriptFromMessages(ctx.messages),
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function normalizeReviewAction(action: ReviewAction): NormalizedReviewAction | null {
  const requested = action.action === 'update' ? 'edit' : action.action === 'edit' ? 'edit' : action.action === 'create' ? 'create' : null
  const name = action.name?.trim()
  const description = action.description?.trim()
  const instructions = action.instructions?.trim() || action.content?.trim()
  if (!requested || !name || !description || !instructions) return null
  const supportFiles = supportFileActions(action, name)
  if (requested === 'create' && supportFiles.length === 0) {
    supportFiles.push(defaultSupportFile(description, instructions, action.reason))
  }
  const skillInstructions = ensureSupportFileReferences(instructions, supportFiles)

  return {
    skill: {
      action: requested,
      name,
      description,
      instructions: skillInstructions,
      reason: action.reason,
    },
    supportFiles,
  }
}

function isDeepSeekThinkingModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  return lower.includes('reasoner') ||
    lower.includes('thinking') ||
    /(^|[^a-z])v4/.test(lower)
}

function normalizeReasoningEffort(value: unknown): 'high' | 'max' | undefined {
  if (value === 'high' || value === 'max') return value
  if (value === 'low' || value === 'medium') return 'high'
  if (value === 'xhigh') return 'max'
  return undefined
}

function createSkillManageAgentTool(ctx: Parameters<Trigger['execute']>[0]): SkillManageAgentToolBundle {
  const schema = zodToJsonSchema(SkillManageTool.parameters)
  const createdSkills = new Map<string, TrackedAgentSkill>()
  const supportFilesBySkill = new Map<string, Set<string>>()

  const tool: AgentTool = {
    name: 'skill_manage',
    description: [
      SkillManageTool.description,
      'Use create/edit to write SKILL.md with the content argument. Use write_file to create supporting files under references/, templates/, scripts/, or assets/.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: schema.properties,
      required: schema.required,
    },
    async execute(args) {
      const parsed = SkillManageTool.parameters.safeParse(args)
      if (!parsed.success) {
        const message = SkillManageTool.formatValidationError
          ? SkillManageTool.formatValidationError(parsed.error)
          : `Invalid skill_manage arguments: ${parsed.error.message}`
        return { content: '', error: message }
      }

      const skillArgs = parsed.data as SkillManageArgs
      const result = executeSkillManage(skillArgs, { workingDirectory: ctx.session.workingDirectory })
      const skillName = skillArgs.name?.trim()

      if (result.success && skillName) {
        if (skillArgs.action === 'create') {
          createdSkills.set(skillName, { name: skillName, content: skillArgs.content })
        } else if (skillArgs.action === 'delete') {
          createdSkills.delete(skillName)
          supportFilesBySkill.delete(skillName)
        } else if (skillArgs.action === 'write_file') {
          const filePath = normalizeSupportFilePath(skillArgs.file_path ?? skillArgs.filePath)
          if (filePath) {
            const paths = supportFilesBySkill.get(skillName) ?? new Set<string>()
            paths.add(filePath)
            supportFilesBySkill.set(skillName, paths)
          }
        } else if (skillArgs.action === 'remove_file') {
          const filePath = normalizeSupportFilePath(skillArgs.file_path ?? skillArgs.filePath)
          if (filePath) {
            supportFilesBySkill.get(skillName)?.delete(filePath)
          }
        }
      }

      return {
        content: result.output,
        error: result.success ? undefined : result.error,
        data: {
          action: result.action,
          skillName,
          path: result.path,
          mutated: result.mutated,
          success: result.success,
          diff: result.diff,
          additions: result.additions,
          deletions: result.deletions,
        },
      }
    },
  }

  return { tool, createdSkills, supportFilesBySkill }
}

function ensureAgentCreatedSkillsComplete(
  tracker: SkillManageAgentToolBundle,
  ctx: Parameters<Trigger['execute']>[0],
): boolean {
  let mutated = false

  for (const created of tracker.createdSkills.values()) {
    const supportPaths = new Set(tracker.supportFilesBySkill.get(created.name) ?? [])

    if (supportPaths.size === 0) {
      const read = executeSkillManage({ action: 'read', name: created.name }, { workingDirectory: ctx.session.workingDirectory })
      const skillContent = read.success ? read.output : created.content ?? ''
      const fallback = defaultSupportFile(
        `Procedure notes for ${created.name}`,
        skillContent || 'Reusable procedure captured by the background skill review agent.',
      )
      const written = executeSkillManage({
        ...fallback,
        name: created.name,
      }, { workingDirectory: ctx.session.workingDirectory })

      mutated = mutated || written.mutated
      if (written.success && fallback.file_path) {
        supportPaths.add(fallback.file_path)
        console.log(`[SkillReview] ${written.title}: ${written.path ?? ''}`)
      } else {
        console.warn(`[SkillReview] Agent support fallback failed: ${written.error ?? written.output}`)
      }
    }

    if (supportPaths.size === 0) continue

    const read = executeSkillManage({ action: 'read', name: created.name }, { workingDirectory: ctx.session.workingDirectory })
    if (!read.success) {
      console.warn(`[SkillReview] Could not verify support references for ${created.name}: ${read.error ?? read.output}`)
      continue
    }

    const nextContent = ensureContentReferences(read.output, [...supportPaths])
    if (nextContent === read.output) continue

    const edited = executeSkillManage({
      action: 'edit',
      name: created.name,
      content: nextContent,
    }, { workingDirectory: ctx.session.workingDirectory })

    mutated = mutated || edited.mutated
    if (edited.success) {
      console.log(`[SkillReview] ${edited.title}: ${edited.path ?? ''}`)
    } else {
      console.warn(`[SkillReview] Agent support reference edit failed: ${edited.error ?? edited.output}`)
    }
  }

  return mutated
}

async function runAgentSkillReview(ctx: Parameters<Trigger['execute']>[0]): Promise<void> {
  const model = ctx.providerConfig.model
  const thinkingByModel = (ctx.providerConfig as any).thinkingByModel?.[model]
  const thinking =
    thinkingByModel === true
      ? 'enabled'
      : thinkingByModel === false
        ? 'disabled'
        : isDeepSeekThinkingModel(model)
          ? 'enabled'
          : undefined
  const reasoningEffort = thinking === 'enabled'
    ? normalizeReasoningEffort((ctx.providerConfig as any).thinkingEffortByModel?.[model]) ?? 'high'
    : undefined
  const provider = createDeepSeekAgentProvider({
    apiKey: ctx.providerConfig.apiKey ?? '',
    baseUrl: ctx.providerConfig.baseUrl,
  })
  const skillManage = createSkillManageAgentTool(ctx)

  const result = await runAgentLoop({
    provider,
    model,
    messages: buildAgentReviewMessages(ctx),
    tools: [skillManage.tool],
    selectedToolNames: ['skill_manage'],
    toolChoice: 'auto',
    maxTurns: 8,
    temperature: thinking === 'enabled' ? undefined : 0.1,
    maxTokens: 3200,
    thinking,
    reasoningEffort,
    sessionId: ctx.sessionId,
    messageId: `skill-review:${ctx.sessionId}`,
    workingDirectory: ctx.session.workingDirectory,
    onEvent(event) {
      if (event.type === 'tool-result') {
        console.log(`[SkillReview] Agent tool ${event.toolCall.name}: ${event.result.error ?? 'ok'}`)
      }
    },
  })

  const agentMutated = result.toolResults.some(toolResult => {
    const metadata = toolResult.result.data as { mutated?: unknown } | undefined
    return metadata?.mutated === true
  })
  const fallbackMutated = ensureAgentCreatedSkillsComplete(skillManage, ctx)
  const mutated = agentMutated || fallbackMutated

  if (mutated) {
    invalidateSkillsCache()
  } else {
    console.log(`[SkillReview] Agent completed without skill changes for session ${ctx.sessionId}`)
  }
}

async function runJsonSkillReview(ctx: Parameters<Trigger['execute']>[0]): Promise<void> {
  const response = await generateChatResponse(
    ctx.providerId,
    {
      apiKey: ctx.providerConfig.apiKey ?? '',
      baseUrl: ctx.providerConfig.baseUrl,
      model: ctx.providerConfig.model,
      oauthToken: (ctx.providerConfig as any).oauthToken,
      authContext: (ctx.providerConfig as any).authContext,
    } as any,
    buildReviewMessages(ctx),
    {
      temperature: 0.1,
      maxTokens: 3200,
      debugPurpose: 'skill-review',
      debugSessionId: ctx.sessionId,
    },
  )

  const decision = parseReviewDecision(response)
  const actions = (decision.actions ?? [])
    .map(normalizeReviewAction)
    .filter((action): action is NormalizedReviewAction => Boolean(action))
    .slice(0, MAX_SKILL_ACTIONS)

  if (actions.length === 0) {
    console.log(`[SkillReview] No skill changes for session ${ctx.sessionId}`)
    return
  }

  let mutated = false
  for (const action of actions) {
    const existing = getSkillsForSession(ctx.session.workingDirectory)
      .find(skill => skill.source === 'user' && skill.name === action.skill.name)
    const applied = executeSkillManage({
      ...action.skill,
      action: existing ? 'edit' : 'create',
    }, { workingDirectory: ctx.session.workingDirectory })
    mutated = mutated || applied.mutated
    console.log(`[SkillReview] ${applied.title}: ${applied.path ?? ''}`)

    if (!applied.success) {
      console.warn(`[SkillReview] Skipping support files after failed ${action.skill.action}: ${applied.error ?? applied.output}`)
      continue
    }

    for (const supportFile of action.supportFiles) {
      const written = executeSkillManage({
        ...supportFile,
        name: action.skill.name,
      }, { workingDirectory: ctx.session.workingDirectory })
      mutated = mutated || written.mutated
      if (written.success) {
        console.log(`[SkillReview] ${written.title}: ${written.path ?? ''}`)
      } else {
        console.warn(`[SkillReview] Support file write failed: ${written.error ?? written.output}`)
      }
    }
  }

  if (mutated) {
    invalidateSkillsCache()
  }
}

async function runSkillReview(ctx: Parameters<Trigger['execute']>[0]): Promise<void> {
  if (ctx.providerId === 'deepseek') {
    await runAgentSkillReview(ctx)
    return
  }

  await runJsonSkillReview(ctx)
}

export function createSkillReviewTrigger(): Trigger {
  return {
    id: 'hermes-skill-review',
    name: 'Hermes Skill Review',
    priority: 100,

    async shouldTrigger(ctx) {
      if (isSkillReviewDisabledByEnv()) return false
      if (isSkillReviewRunning(ctx.sessionId)) return false

      return recordSkillReviewCounter({
        sessionId: ctx.sessionId,
        settings: ctx.settings,
        toolIterations: ctx.toolIterations ?? 0,
        skillManageAvailable: ctx.enabledToolNames?.includes('skill_manage') ?? false,
        skillManageCalled: ctx.skillManageCalled ?? false,
      })
    },

    async execute(ctx) {
      markSkillReviewRunning(ctx.sessionId, true)
      try {
        await runSkillReview(ctx)
      } finally {
        markSkillReviewRunning(ctx.sessionId, false)
      }
    },
  }
}
