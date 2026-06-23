import fs from 'node:fs'
import path from 'node:path'
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
import { getUserSkillsPath } from '../../skills/index.js'
import { ReadTool } from '../../tools/builtin/read.js'
import { WriteTool } from '../../tools/builtin/write.js'
import { EditTool } from '../../tools/builtin/edit.js'
import { zodToJsonSchema } from '../../tools/core/tool.js'

const MAX_REVIEW_MESSAGES = 16
const MAX_TRANSCRIPT_CHARS = 12000
const MAX_SKILL_ACTIONS = 2
const MAX_SUPPORT_FILES_PER_SKILL = 6
const SUPPORT_FILE_ROOTS = new Set(['references', 'templates', 'scripts', 'assets'])

type VisibleSkill = ReturnType<typeof getSkillsForSession>[number]

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

interface SkillFileAgentToolBundle {
  tools: AgentTool[]
  mutatedPaths: Set<string>
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
    .map(skill => `- ${skill.name} [${skill.source}] ${skill.description} (SKILL.md: ${skill.path}; dir: ${skill.directoryPath})`)
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

function defaultUpdateSupportFile(description: string, instructions: string, reason?: string): SkillManageArgs {
  const content = [
    '# Background Review Update',
    '',
    `Description: ${description}`,
    reason?.trim() ? `Reason captured: ${reason.trim()}` : '',
    '',
    '## New Reusable Detail',
    '',
    instructions.trim(),
    '',
  ].filter(Boolean).join('\n')

  return {
    action: 'write_file',
    file_path: 'references/background-review-update.md',
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

function visibleSkill(name: string, workingDirectory?: string): VisibleSkill | undefined {
  return getSkillsForSession(workingDirectory).find(skill => skill.name === name)
}

function mutableSkill(name: string, workingDirectory?: string): VisibleSkill | undefined {
  const skill = visibleSkill(name, workingDirectory)
  if (!skill) return undefined
  return skill.source === 'user' || skill.source === 'project' ? skill : undefined
}

function supportFileExists(skill: VisibleSkill, filePath: string): boolean {
  return fs.existsSync(path.join(skill.directoryPath, filePath))
}

function slugFromText(text: string | undefined): string {
  const slug = text
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'background-review-update'
}

function uniqueSupportFilePath(
  skill: VisibleSkill | undefined,
  requestedPath: string | undefined,
  fallbackText: string | undefined,
  reserved: Set<string>,
): string {
  const normalized = normalizeSupportFilePath(requestedPath)
  const normalizedRoot = normalized?.split('/')[0]
  const directory = normalizedRoot && SUPPORT_FILE_ROOTS.has(normalizedRoot) ? normalizedRoot : 'references'
  const ext = normalized?.match(/\.[a-z0-9]+$/i)?.[0] ?? '.md'
  const rawBase = normalized
    ? normalized.replace(/\.[a-z0-9]+$/i, '').split('/').pop()
    : fallbackText
  const base = slugFromText(rawBase)

  for (let index = 1; index <= 1000; index++) {
    const suffix = index === 1 ? '' : `-${index}`
    const candidate = `${directory}/${base}${suffix}${ext}`
    if (reserved.has(candidate)) continue
    if (skill && supportFileExists(skill, candidate)) continue
    reserved.add(candidate)
    return candidate
  }

  const fallback = `${directory}/${base}-${Date.now()}${ext}`
  reserved.add(fallback)
  return fallback
}

function uniqueSupportFileActions(
  skillName: string,
  supportFiles: SkillManageArgs[],
  workingDirectory: string | undefined,
  reserved: Set<string>,
): SkillManageArgs[] {
  const skill = mutableSkill(skillName, workingDirectory)
  return supportFiles.map(file => {
    const rawPath = file.file_path ?? file.filePath
    const rawContent = file.file_content ?? file.fileContent ?? file.content ?? ''
    const nextPath = uniqueSupportFilePath(skill, rawPath, rawContent, reserved)
    return {
      ...file,
      action: 'write_file',
      name: skillName,
      file_path: nextPath,
      file_content: rawContent,
    }
  })
}

function appendSkillSupportReferences(
  skillName: string,
  supportPaths: string[],
  workingDirectory?: string,
): { mutated: boolean; success: boolean; error?: string } {
  const read = executeSkillManage({ action: 'read', name: skillName }, { workingDirectory })
  if (!read.success) {
    return { mutated: false, success: false, error: read.error ?? read.output }
  }

  const nextContent = ensureContentReferences(read.output, supportPaths)
  if (nextContent === read.output) {
    return { mutated: false, success: true }
  }

  const edited = executeSkillManage({
    action: 'edit',
    name: skillName,
    content: nextContent,
  }, { workingDirectory })

  return {
    mutated: edited.mutated,
    success: edited.success,
    error: edited.success ? undefined : edited.error ?? edited.output,
  }
}

function supportFilesForExistingUpdate(action: ReviewAction, skillName: string): SkillManageArgs[] {
  const supportFiles = supportFileActions(action, skillName)
  const description = action.description?.trim() || `Background review update for ${skillName}`
  const instructions = action.instructions?.trim() || action.content?.trim()

  if (supportFiles.length === 0 && instructions) {
    supportFiles.push(defaultUpdateSupportFile(description, instructions, action.reason))
  }

  return supportFiles
}

function agentToolError(error: unknown): { content: string; error: string } {
  return {
    content: '',
    error: error instanceof Error ? error.message : String(error),
  }
}

function isInsideDirectory(parentDir: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentDir), path.resolve(childPath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function mutableSkillRoots(workingDirectory?: string): string[] {
  const roots = new Set<string>([path.resolve(getUserSkillsPath())])
  for (const skill of getSkillsForSession(workingDirectory)) {
    if (skill.source === 'user' || skill.source === 'project') {
      roots.add(path.resolve(skill.directoryPath))
    }
  }
  return [...roots]
}

function resolveSkillToolPath(rawPath: string, ctx: Parameters<Trigger['execute']>[0]): string {
  const expanded = rawPath.startsWith('~')
    ? path.join(process.env.HOME ?? '', rawPath.slice(1))
    : rawPath
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(ctx.session.workingDirectory ?? getUserSkillsPath(), expanded)
}

function assertSkillToolPath(rawPath: string, ctx: Parameters<Trigger['execute']>[0]): string {
  const resolved = resolveSkillToolPath(rawPath, ctx)
  const roots = mutableSkillRoots(ctx.session.workingDirectory)
  if (!roots.some(root => isInsideDirectory(root, resolved))) {
    throw new Error(`Background skill review file tools can only access mutable skill directories. Rejected path: ${resolved}`)
  }
  return resolved
}

function toolSchema(parameters: any): Record<string, unknown> {
  const schema = zodToJsonSchema(parameters)
  return {
    type: 'object',
    properties: schema.properties,
    required: schema.required,
  }
}

function createToolContext(
  ctx: Parameters<Trigger['execute']>[0],
  toolCallId: string,
): any {
  return {
    sessionId: ctx.sessionId,
    messageId: `skill-review:${ctx.sessionId}`,
    toolCallId,
    workingDirectory: ctx.session.workingDirectory,
    workingDirectoryRoots: mutableSkillRoots(ctx.session.workingDirectory),
    metadata: () => {},
    updateResult: () => {},
    beforeSideEffect: async () => {},
  }
}

function posixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}

function listSkillSupportFiles(skillDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        files.push(posixRelative(skillDir, fullPath))
      }
    }
  }

  for (const root of SUPPORT_FILE_ROOTS) {
    const rootDir = path.join(skillDir, root)
    if (!fs.existsSync(rootDir)) continue
    try {
      walk(rootDir)
    } catch {
      // Ignore unreadable support directories; the review can still preserve SKILL.md.
    }
  }

  return files.sort()
}

function findSkillDirectoryForPath(mutatedPath: string, workingDirectory?: string): string | undefined {
  const roots = mutableSkillRoots(workingDirectory)
  let current = path.dirname(path.resolve(mutatedPath))

  while (roots.some(root => isInsideDirectory(root, current))) {
    const skillPath = path.join(current, 'SKILL.md')
    if (fs.existsSync(skillPath) && fs.statSync(skillPath).isFile()) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return undefined
}

function defaultAgentSupportFileContent(skillDir: string): string {
  const skillName = path.basename(skillDir)
  return [
    '# Background Review Notes',
    '',
    `This file keeps ${skillName} as a complete skill package after automatic background review.`,
    '',
    '## Review Capture',
    '',
    'The durable workflow is captured in SKILL.md. Add examples, checklists, templates, or scripts here when the workflow grows.',
    '',
  ].join('\n')
}

function ensureAgentReviewedSkillsComplete(mutatedPaths: Set<string>, workingDirectory?: string): boolean {
  const skillDirs = new Set<string>()
  for (const mutatedPath of mutatedPaths) {
    const skillDir = findSkillDirectoryForPath(mutatedPath, workingDirectory)
    if (skillDir) skillDirs.add(skillDir)
  }

  let mutated = false
  for (const skillDir of skillDirs) {
    const skillPath = path.join(skillDir, 'SKILL.md')
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isFile()) continue

    let supportFiles = listSkillSupportFiles(skillDir)
    if (supportFiles.length === 0) {
      const defaultSupportPath = fs.existsSync(path.join(skillDir, 'references', 'procedure.md'))
        ? 'references/background-review-notes.md'
        : 'references/procedure.md'
      const fullSupportPath = path.join(skillDir, defaultSupportPath)
      fs.mkdirSync(path.dirname(fullSupportPath), { recursive: true })
      fs.writeFileSync(fullSupportPath, defaultAgentSupportFileContent(skillDir), 'utf-8')
      supportFiles = [defaultSupportPath]
      mutated = true
    }

    const content = fs.readFileSync(skillPath, 'utf-8')
    const nextContent = ensureContentReferences(content, supportFiles)
    if (nextContent !== content) {
      fs.writeFileSync(skillPath, nextContent, 'utf-8')
      mutated = true
    }
  }

  return mutated
}

function createSkillFileAgentTools(ctx: Parameters<Trigger['execute']>[0]): SkillFileAgentToolBundle {
  const mutatedPaths = new Set<string>()
  const userSkillsRoot = getUserSkillsPath()

  const tools: AgentTool[] = [
    {
      name: 'read',
      description: [
        ReadTool.description,
        'For background skill review, read only existing user/project skill files before editing or rewriting them.',
      ].join(' '),
      parameters: toolSchema(ReadTool.parameters),
      async execute(args, toolCtx) {
        const parsed = ReadTool.parameters.safeParse(args)
        if (!parsed.success) return { content: '', error: parsed.error.message }
        try {
          const resolvedPath = assertSkillToolPath(parsed.data.path, ctx)
          const result = await ReadTool.execute({
            ...parsed.data,
            path: resolvedPath,
          }, createToolContext(ctx, toolCtx.toolCallId))
          return { content: result.output, data: { ...result.metadata, mutated: false, path: resolvedPath } }
        } catch (error) {
          return agentToolError(error)
        }
      },
    },
    {
      name: 'write',
      description: [
        WriteTool.description,
        `For background skill review, write only inside mutable skill directories or the user skills root: ${userSkillsRoot}.`,
        'You may create a new skill directory by writing SKILL.md and supporting files, or rewrite an existing user/project skill after reading it.',
      ].join(' '),
      parameters: toolSchema(WriteTool.parameters),
      async execute(args, toolCtx) {
        const parsed = WriteTool.parameters.safeParse(args)
        if (!parsed.success) return { content: '', error: parsed.error.message }
        try {
          const resolvedPath = assertSkillToolPath(parsed.data.path, ctx)
          const result = await WriteTool.execute({
            ...parsed.data,
            path: resolvedPath,
          }, createToolContext(ctx, toolCtx.toolCallId))
          mutatedPaths.add(resolvedPath)
          return { content: result.output, data: { ...result.metadata, mutated: true, path: resolvedPath } }
        } catch (error) {
          return agentToolError(error)
        }
      },
    },
    {
      name: 'edit',
      description: [
        EditTool.description,
        'For background skill review, edit only user/project skill files. Prefer targeted edits after using read.',
      ].join(' '),
      parameters: toolSchema(EditTool.parameters),
      async execute(args, toolCtx) {
        const parsed = EditTool.parameters.safeParse(args)
        if (!parsed.success) return { content: '', error: parsed.error.message }
        try {
          const resolvedPath = assertSkillToolPath(parsed.data.path, ctx)
          const result = await EditTool.execute({
            ...parsed.data,
            path: resolvedPath,
          }, createToolContext(ctx, toolCtx.toolCallId))
          mutatedPaths.add(resolvedPath)
          return { content: result.output, data: { ...result.metadata, mutated: true, path: resolvedPath } }
        } catch (error) {
          return agentToolError(error)
        }
      },
    },
  ]

  return { tools, mutatedPaths }
}

function buildReviewMessages(ctx: Parameters<Trigger['execute']>[0]): Array<{ role: 'system' | 'user'; content: string }> {
  const workingDirectory = ctx.session.workingDirectory
  const system = [
    'You are a background Hermes skill-review fork.',
    'The user-facing assistant response has already been delivered; do not answer the user.',
    'Decide whether the recent conversation revealed a durable, reusable procedure that should become a Hermes SKILL.md skill.',
    'Be conservative. Do not create a skill for one-off facts, transient debugging details, secrets, credentials, or project-specific trivia.',
    'Propose brand-new user-owned skills or safe updates to existing user/project skills.',
    'Return strict JSON with this shape: {"actions":[{"action":"create"|"update","name":"lowercase-name","description":"...","instructions":"Concise reusable detail","files":[{"file_path":"references/checklist.md","content":"..."}],"reason":"..."}]}.',
    'For create actions, include at least one supporting file when there is durable detail, a checklist, a reusable template, a script, or examples worth keeping outside the main SKILL.md.',
    'For update actions, provide only new reusable detail and supporting files. Do not rewrite or restate the full existing SKILL.md.',
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
  const roots = mutableSkillRoots(workingDirectory)
  const system = [
    'You are a background Hermes skill-review agent.',
    'The user-facing assistant response has already been delivered; do not answer the user.',
    'Decide whether the recent conversation revealed a durable, reusable procedure that should become a Hermes skill.',
    'Be conservative. Do not create a skill for one-off facts, transient debugging details, secrets, credentials, or project-specific trivia.',
    'Use the read, write, and edit tools to create, update, or rewrite skill files directly. Do not use skill_manage for updates.',
    'Before updating or rewriting an existing skill, read its current SKILL.md. Preserve useful existing instructions unless the new durable workflow truly supersedes them.',
    'A complete skill is a directory with SKILL.md plus at least one supporting file under references/, templates/, scripts/, or assets/.',
    'Use references/ for durable notes, checklists, examples, and procedure detail; templates/ for reusable user-facing formats; scripts/ only for executable helpers; assets/ only for static resources.',
    'Every tool path must be inside one of the mutable skill roots listed in the user message. Use absolute paths when possible.',
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
    'Mutable skill roots:',
    roots.map(root => `- ${root}`).join('\n'),
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
  const requested = action.action === 'update' || action.action === 'edit'
    ? 'update'
    : action.action === 'create'
      ? 'create'
      : null
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
      action: requested === 'update' ? 'update' : 'create',
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
  const skillFileTools = createSkillFileAgentTools(ctx)

  const result = await runAgentLoop({
    provider,
    model,
    messages: buildAgentReviewMessages(ctx),
    tools: skillFileTools.tools,
    selectedToolNames: ['read', 'write', 'edit'],
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
  const completedSkillPackage = skillFileTools.mutatedPaths.size > 0
    ? ensureAgentReviewedSkillsComplete(skillFileTools.mutatedPaths, ctx.session.workingDirectory)
    : false
  const mutated = agentMutated || skillFileTools.mutatedPaths.size > 0 || completedSkillPackage

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
  const reservedSupportFilesBySkill = new Map<string, Set<string>>()
  for (const action of actions) {
    const skillName = action.skill.name ?? ''
    const existing = skillName ? visibleSkill(skillName, ctx.session.workingDirectory) : undefined
    const mutable = skillName ? mutableSkill(skillName, ctx.session.workingDirectory) : undefined

    if (existing && !mutable) {
      console.warn(`[SkillReview] Skipping ${existing.source}-owned skill ${skillName}; automatic review can only update user/project skills.`)
      continue
    }

    if (mutable) {
      const reserved = reservedSupportFilesBySkill.get(skillName) ?? new Set<string>()
      reservedSupportFilesBySkill.set(skillName, reserved)
      const updates = supportFilesForExistingUpdate({
        action: 'update',
        name: skillName,
        description: action.skill.description,
        instructions: action.skill.instructions,
        content: action.skill.content,
        reason: action.skill.reason,
        files: action.supportFiles.map(file => ({
          file_path: file.file_path ?? file.filePath,
          content: file.file_content ?? file.fileContent ?? file.content,
        })),
      }, skillName)
      const updateFiles = uniqueSupportFileActions(skillName, updates, ctx.session.workingDirectory, reserved)
      const writtenPaths: string[] = []

      for (const supportFile of updateFiles) {
        const written = executeSkillManage(supportFile, { workingDirectory: ctx.session.workingDirectory })
        mutated = mutated || written.mutated
        if (written.success) {
          const supportPath = supportFile.file_path ?? supportFile.filePath
          if (supportPath) writtenPaths.push(supportPath)
          console.log(`[SkillReview] ${written.title}: ${written.path ?? ''}`)
        } else {
          console.warn(`[SkillReview] Support update failed: ${written.error ?? written.output}`)
        }
      }

      if (writtenPaths.length > 0) {
        const referenced = appendSkillSupportReferences(skillName, writtenPaths, ctx.session.workingDirectory)
        mutated = mutated || referenced.mutated
        if (!referenced.success) {
          console.warn(`[SkillReview] Support reference update failed for ${skillName}: ${referenced.error}`)
        }
      }

      continue
    }

    const applied = executeSkillManage({
      ...action.skill,
      action: 'create',
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
