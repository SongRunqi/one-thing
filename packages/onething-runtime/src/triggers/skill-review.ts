import {
  runAgentLoop,
  type AgentJsonObject,
  type AgentToolExecutionContext,
} from '@onething/core/agent-loop'
import { toJsonObject } from '@onething/core'
import { createDeepSeekAgentProvider } from '../agent-loop/providers/index.js'
import {
  MAX_SKILL_ACTIONS,
  SUPPORT_FILE_ROOTS,
  appendSkillSupportReferencesWithAdapters,
  applySkillReviewDecisionWithAdapters,
  assertSkillReviewToolPath,
  buildSkillReviewAgentRunPlan,
  buildSkillReviewFileAgentTools,
  buildSkillReviewMessages,
  collectSkillReviewMutableRoots,
  ensureAgentReviewedSkillsCompleteWithAdapters,
  findMutableSkillReviewSkill,
  findSkillReviewVisibleSkill,
  formatSkillReviewVisibleSkillSummary,
  hasSkillReviewAgentMutation,
  isMutatedToolResult,
  skillReviewTranscriptFromMessages,
  type CoreSkillReviewExecutionResult,
  type CoreSkillReviewFileToolAdapter,
  type CoreSkillReviewManageArgs,
  type CoreSkillReviewMessage,
  type CoreSkillReviewPromptMessage,
  type CoreSkillReviewSupportReferenceResult,
  type CoreSkillReviewVisibleSkill,
} from './skill-review-core.js'
import type { CoreSkillReviewSettings } from './skill-review-state-core.js'
import type {
  CoreTrigger,
  CoreTriggerContext,
} from '@onething/core/engine'
import {
  isFile,
  listFilesUnderRoots,
  pathExistsInDir,
  readTextFile,
  writeTextFile,
  writeTextFileInDir,
} from '@onething/core/storage'
import {
  Tool,
  zodToJsonSchema,
} from '../tools/index.js'
import {
  isSkillReviewRunning,
  markSkillReviewRunning,
  recordOnethingSkillReviewCounter,
} from './skill-review-state.js'

export interface OnethingSkillReviewSessionLike {
  workingDirectory?: string
}

export interface OnethingSkillReviewProviderConfigLike {
  apiKey?: string
  baseUrl?: string
  model: string
  oauthToken?: unknown
  authContext?: unknown
  thinkingByModel?: Record<string, boolean | undefined>
  thinkingEffortByModel?: Record<string, unknown>
}

export type OnethingSkillReviewContext<
  TSettings extends CoreSkillReviewSettings = CoreSkillReviewSettings,
  TSession extends OnethingSkillReviewSessionLike = OnethingSkillReviewSessionLike,
  TMessage = unknown,
  TProviderConfig extends OnethingSkillReviewProviderConfigLike = OnethingSkillReviewProviderConfigLike,
> = CoreTriggerContext<TSettings, TSession, TMessage, TProviderConfig>

export type OnethingSkillReviewFileToolAdapters<TContext> = Record<
  'read' | 'write' | 'edit',
  CoreSkillReviewFileToolAdapter
> | ((ctx: TContext, options: { mutableRoots: string[] }) => Record<
  'read' | 'write' | 'edit',
  CoreSkillReviewFileToolAdapter
>)

export interface OnethingSkillReviewFileTools {
  read: Tool.Info
  write: Tool.Info
  edit: Tool.Info
}

export interface CreateOnethingSkillReviewFileToolAdaptersOptions {
  tools: OnethingSkillReviewFileTools
  toToolContext(toolCtx: AgentToolExecutionContext): Tool.Context
}

export interface OnethingSkillReviewGenerateOptions {
  temperature: number
  maxTokens: number
  debugPurpose: string
  debugSessionId: string
}

export interface OnethingSkillReviewProviderRequestDump {
  providerId: string
  model: string
  mode: 'stream'
  metadata?: Record<string, unknown>
  requestBody: unknown
}

export interface OnethingSkillReviewAdapters<
  TContext extends OnethingSkillReviewContext = OnethingSkillReviewContext,
  TSkill extends CoreSkillReviewVisibleSkill = CoreSkillReviewVisibleSkill,
> {
  isDisabled?(): boolean
  homeDir?(): string | undefined
  getVisibleSkills(workingDirectory?: string): readonly TSkill[]
  getUserSkillsPath(): string
  executeSkillManage(
    args: CoreSkillReviewManageArgs,
    options: { workingDirectory?: string },
  ): CoreSkillReviewExecutionResult | Promise<CoreSkillReviewExecutionResult>
  invalidateSkillsCache?(): void | Promise<void>
  generateChatResponse(
    providerId: string,
    providerConfig: {
      apiKey: string
      baseUrl?: string
      model: string
      oauthToken?: unknown
      authContext?: unknown
    },
    messages: CoreSkillReviewPromptMessage[],
    options: OnethingSkillReviewGenerateOptions,
  ): Promise<string>
  fetchImpl?(): typeof globalThis.fetch
  requestDumper?(request: OnethingSkillReviewProviderRequestDump): Promise<string | undefined>
  fileTools: OnethingSkillReviewFileToolAdapters<TContext>
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}

type SkillReviewTrigger = CoreTrigger<OnethingSkillReviewContext>

function getLogger<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
): Pick<Console, 'log' | 'warn' | 'error'> {
  return adapters.logger ?? console
}

function toolSchema(parameters: Tool.Info['parameters']): AgentJsonObject {
  const schema = zodToJsonSchema(parameters)
  return toJsonObject({
    type: 'object',
    properties: schema.properties,
    required: schema.required,
  })
}

function createFileToolAdapter(tool: Tool.Info, toToolContext: (toolCtx: AgentToolExecutionContext) => Tool.Context): CoreSkillReviewFileToolAdapter {
  return {
    description: tool.description,
    parameters: toolSchema(tool.parameters),
    parse(args) {
      const parsed = tool.parameters.safeParse(args)
      return parsed.success
        ? { success: true, data: parsed.data as AgentJsonObject & { path: string } }
        : { success: false, error: parsed.error.message }
    },
    async execute(args, toolCtx) {
      const result = await tool.execute(
        args as never,
        toToolContext(toolCtx),
      )
      return {
        output: result.output,
        metadata: result.metadata as Record<string, unknown>,
      }
    },
  }
}

export function createOnethingSkillReviewFileToolAdapters(
  options: CreateOnethingSkillReviewFileToolAdaptersOptions,
): Record<'read' | 'write' | 'edit', CoreSkillReviewFileToolAdapter> {
  return {
    read: createFileToolAdapter(options.tools.read, options.toToolContext),
    write: createFileToolAdapter(options.tools.write, options.toToolContext),
    edit: createFileToolAdapter(options.tools.edit, options.toToolContext),
  }
}

function userSkillSummary<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  workingDirectory?: string,
): string {
  return formatSkillReviewVisibleSkillSummary(adapters.getVisibleSkills(workingDirectory))
}

function visibleSkill<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  name: string,
  workingDirectory?: string,
): CoreSkillReviewVisibleSkill | undefined {
  return findSkillReviewVisibleSkill(adapters.getVisibleSkills(workingDirectory), name)
}

function mutableSkill<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  name: string,
  workingDirectory?: string,
): CoreSkillReviewVisibleSkill | undefined {
  return findMutableSkillReviewSkill(adapters.getVisibleSkills(workingDirectory), name)
}

function supportFileExists(skill: CoreSkillReviewVisibleSkill, filePath: string): boolean {
  return pathExistsInDir(skill.directoryPath, filePath)
}

function appendSkillSupportReferences<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  skillName: string,
  supportPaths: string[],
  workingDirectory?: string,
): Promise<CoreSkillReviewSupportReferenceResult> {
  return appendSkillSupportReferencesWithAdapters({
    skillName,
    supportPaths,
    readSkill: name => adapters.executeSkillManage({ action: 'read', name }, { workingDirectory }),
    editSkill: (name, content) => adapters.executeSkillManage({
      action: 'edit',
      name,
      content,
    }, { workingDirectory }),
  })
}

function mutableSkillRoots<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  workingDirectory?: string,
): string[] {
  return collectSkillReviewMutableRoots(
    adapters.getUserSkillsPath(),
    adapters.getVisibleSkills(workingDirectory),
  )
}

function assertSkillToolPath<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  rawPath: string,
  ctx: TContext,
): string {
  return assertSkillReviewToolPath({
    rawPath,
    workingDirectory: ctx.session.workingDirectory,
    userSkillsPath: adapters.getUserSkillsPath(),
    homeDir: adapters.homeDir?.(),
    mutableRoots: mutableSkillRoots(adapters, ctx.session.workingDirectory),
  })
}

function listSkillSupportFiles(skillDir: string): string[] {
  return listFilesUnderRoots(skillDir, SUPPORT_FILE_ROOTS)
}

function ensureAgentReviewedSkillsComplete<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  mutatedPaths: Set<string>,
  workingDirectory?: string,
): boolean {
  return ensureAgentReviewedSkillsCompleteWithAdapters({
    mutatedPaths,
    mutableRoots: mutableSkillRoots(adapters, workingDirectory),
    adapters: {
      isSkillFile: isFile,
      readSkillFile: readTextFile,
      writeSkillFile: writeTextFile,
      listSupportFiles: listSkillSupportFiles,
      supportFileExists: pathExistsInDir,
      writeSupportFile: writeTextFileInDir,
    },
  })
}

function resolveFileToolAdapters<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  ctx: TContext,
): Record<'read' | 'write' | 'edit', CoreSkillReviewFileToolAdapter> {
  const fileTools = adapters.fileTools
  return typeof fileTools === 'function'
    ? fileTools(ctx, { mutableRoots: mutableSkillRoots(adapters, ctx.session.workingDirectory) })
    : fileTools
}

function createSkillFileAgentTools<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  ctx: TContext,
) {
  return buildSkillReviewFileAgentTools({
    userSkillsRoot: adapters.getUserSkillsPath(),
    resolvePath: rawPath => assertSkillToolPath(adapters, rawPath, ctx),
    adapters: resolveFileToolAdapters(adapters, ctx),
  })
}

function buildReviewMessages<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  ctx: TContext,
): CoreSkillReviewPromptMessage[] {
  const workingDirectory = ctx.session.workingDirectory
  return buildSkillReviewMessages({
    sessionId: ctx.sessionId,
    workingDirectory,
    visibleSkillSummary: userSkillSummary(adapters, workingDirectory),
    transcript: skillReviewTranscriptFromMessages(ctx.messages as CoreSkillReviewMessage[]),
  })
}

async function runAgentSkillReview<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  ctx: TContext,
): Promise<void> {
  const model = ctx.providerConfig.model
  const workingDirectory = ctx.session.workingDirectory
  const runPlan = buildSkillReviewAgentRunPlan({
    model,
    thinkingByModel: ctx.providerConfig.thinkingByModel,
    thinkingEffortByModel: ctx.providerConfig.thinkingEffortByModel,
    sessionId: ctx.sessionId,
    workingDirectory,
    visibleSkillSummary: userSkillSummary(adapters, workingDirectory),
    mutableSkillRoots: mutableSkillRoots(adapters, workingDirectory),
    transcript: skillReviewTranscriptFromMessages(ctx.messages as CoreSkillReviewMessage[]),
  })
  const provider = createDeepSeekAgentProvider({
    apiKey: ctx.providerConfig.apiKey ?? '',
    baseUrl: ctx.providerConfig.baseUrl,
    fetchImpl: adapters.fetchImpl?.(),
    requestDumper: adapters.requestDumper as Parameters<typeof createDeepSeekAgentProvider>[0]['requestDumper'],
  })
  const skillFileTools = createSkillFileAgentTools(adapters, ctx)

  const result = await runAgentLoop({
    provider,
    model: runPlan.model,
    messages: runPlan.messages,
    tools: skillFileTools.tools,
    selectedToolNames: runPlan.selectedToolNames,
    toolChoice: runPlan.toolChoice,
    maxTurns: runPlan.maxTurns,
    temperature: runPlan.temperature,
    maxTokens: runPlan.maxTokens,
    thinking: runPlan.thinking,
    reasoningEffort: runPlan.reasoningEffort,
    sessionId: runPlan.sessionId,
    messageId: runPlan.messageId,
    workingDirectory: runPlan.workingDirectory,
    onEvent(event) {
      if (event.type === 'tool-result') {
        getLogger(adapters).log(`[SkillReview] Agent tool ${event.toolCall.name}: ${event.result.error ?? 'ok'}`)
      }
    },
  })

  const agentMutated = result.toolResults.some(toolResult => {
    return isMutatedToolResult(toolResult.result.data)
  })
  const completedSkillPackage = skillFileTools.mutatedPaths.size > 0
    ? ensureAgentReviewedSkillsComplete(adapters, skillFileTools.mutatedPaths, ctx.session.workingDirectory)
    : false
  const mutated = hasSkillReviewAgentMutation({
    agentMutated,
    mutatedPathCount: skillFileTools.mutatedPaths.size,
    completedSkillPackage,
  })

  if (mutated) {
    await adapters.invalidateSkillsCache?.()
  } else {
    getLogger(adapters).log(`[SkillReview] Agent completed without skill changes for session ${ctx.sessionId}`)
  }
}

async function runJsonSkillReview<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  ctx: TContext,
): Promise<void> {
  const response = await adapters.generateChatResponse(
    ctx.providerId,
    {
      apiKey: ctx.providerConfig.apiKey ?? '',
      baseUrl: ctx.providerConfig.baseUrl,
      model: ctx.providerConfig.model,
      oauthToken: ctx.providerConfig.oauthToken,
      authContext: ctx.providerConfig.authContext,
    },
    buildReviewMessages(adapters, ctx),
    {
      temperature: 0.1,
      maxTokens: 3200,
      debugPurpose: 'skill-review',
      debugSessionId: ctx.sessionId,
    },
  )

  const result = await applySkillReviewDecisionWithAdapters({
    response,
    maxActions: MAX_SKILL_ACTIONS,
    findVisibleSkill: name => visibleSkill(adapters, name, ctx.session.workingDirectory),
    findMutableSkill: name => mutableSkill(adapters, name, ctx.session.workingDirectory),
    supportFileExists,
    executeSkillManage: args =>
      adapters.executeSkillManage(args, { workingDirectory: ctx.session.workingDirectory }),
    appendSkillSupportReferences: (skillName, supportPaths) =>
      appendSkillSupportReferences(adapters, skillName, supportPaths, ctx.session.workingDirectory),
    invalidateSkillsCache: adapters.invalidateSkillsCache,
    logger: getLogger(adapters),
  })

  if (result.actionCount === 0) {
    getLogger(adapters).log(`[SkillReview] No skill changes for session ${ctx.sessionId}`)
  }
}

export async function runOnethingSkillReview<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
  ctx: TContext,
): Promise<void> {
  if (ctx.providerId === 'deepseek') {
    await runAgentSkillReview(adapters, ctx)
    return
  }

  await runJsonSkillReview(adapters, ctx)
}

export function createOnethingSkillReviewTrigger<TContext extends OnethingSkillReviewContext>(
  adapters: OnethingSkillReviewAdapters<TContext>,
): CoreTrigger<TContext> {
  return {
    id: 'hermes-skill-review',
    name: 'Hermes Skill Review',
    priority: 100,

    async shouldTrigger(ctx) {
      if (adapters.isDisabled?.()) return false
      if (isSkillReviewRunning(ctx.sessionId)) return false

      return recordOnethingSkillReviewCounter({
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
        await runOnethingSkillReview(adapters, ctx)
      } finally {
        markSkillReviewRunning(ctx.sessionId, false)
      }
    },
  }
}

export type { AgentJsonObject, SkillReviewTrigger }
