import type { AgentToolExecutionContext } from '@onething/core/agent-loop'
import type {
  CoreSkillReviewManageArgs,
} from '@onething/runtime/triggers'
import {
  createOnethingSkillReviewFileToolAdapters,
  createOnethingSkillReviewTrigger,
} from '@onething/runtime/triggers'
import { createAgentProviderFromRuntime } from '../../agent-loop/index.js'
import { getUserSkillsPath } from '../../skills/index.js'
import { executeSkillManage, type SkillManageArgs } from '../../skills/manage.js'
import {
  getSkillsForSession,
  invalidateSessionSkillsCache as invalidateSkillsCache,
} from '../../skills/session-skills.js'
import {
  getProviderApiType,
  resolveProviderAuth,
} from '../stream/provider-helpers.js'
import { ReadTool } from '../../tools/builtin/read.js'
import { WriteTool } from '../../tools/builtin/write.js'
import { EditTool } from '../../tools/builtin/edit.js'
import type { ToolContext } from '../../tools/core/tool.js'
import type { Trigger, TriggerContext } from './index.js'

function isSkillReviewDisabledByEnv(): boolean {
  return process.env.ONETHING_DISABLE_SKILL_REVIEW === '1' ||
    process.env.ONETHING_DISABLE_SKILL_REVIEW === 'true'
}

function asSkillManageArgs(args: CoreSkillReviewManageArgs): SkillManageArgs {
  return args as SkillManageArgs
}

function getFreshSkillsForSession(workingDirectory?: string): ReturnType<typeof getSkillsForSession> {
  invalidateSkillsCache()
  return getSkillsForSession(workingDirectory)
}

function createToolContext(
  ctx: TriggerContext,
  toolCallId: string,
  mutableRoots: string[],
): ToolContext {
  return {
    sessionId: ctx.sessionId,
    messageId: `skill-review:${ctx.sessionId}`,
    toolCallId,
    workingDirectory: ctx.session.workingDirectory,
    workingDirectoryRoots: mutableRoots,
    metadata: () => {},
    updateResult: () => {},
    beforeSideEffect: async () => {},
  }
}

function createMainSkillReviewFileToolAdapters(
  ctx: TriggerContext,
  mutableRoots: string[],
): ReturnType<typeof createOnethingSkillReviewFileToolAdapters> {
  return createOnethingSkillReviewFileToolAdapters({
    tools: {
      read: ReadTool,
      write: WriteTool,
      edit: EditTool,
    },
    toToolContext: (toolCtx: AgentToolExecutionContext): ToolContext =>
      createToolContext(ctx, toolCtx.toolCallId, mutableRoots),
  })
}

async function createSkillReviewAgentProvider(ctx: TriggerContext) {
  const toolCallModel = ctx.settings.tools?.toolCallModel
  const providerId = toolCallModel?.providerId?.trim()
  const model = toolCallModel?.model?.trim()
  if (!providerId || !model) return undefined

  const providerConfig = ctx.settings.ai.providers[providerId]
  if (!providerConfig) return undefined

  const authContext = await resolveProviderAuth(providerId, providerConfig)
  if (!authContext) return undefined

  const provider = createAgentProviderFromRuntime(providerId, {
    ...providerConfig,
    model,
    apiKey: authContext.kind === 'api-key' ? authContext.apiKey : '',
    authContext,
    oauthToken: authContext.kind === 'oauth' ? authContext.token : providerConfig.oauthToken,
    apiType: getProviderApiType(ctx.settings, providerId),
  }, {
    workingDirectory: ctx.session.workingDirectory,
    localSessionId: ctx.sessionId,
  })
  if (!provider) return undefined

  return {
    provider,
    providerId,
    model,
    thinking: typeof toolCallModel?.thinking === 'boolean' ? toolCallModel.thinking : undefined,
    thinkingEffort: toolCallModel?.thinkingEffort,
    thinkingByModel: providerConfig.thinkingByModel,
    thinkingEffortByModel: providerConfig.thinkingEffortByModel,
  }
}

export function createSkillReviewTrigger(): Trigger {
  return createOnethingSkillReviewTrigger<TriggerContext>({
    isDisabled: isSkillReviewDisabledByEnv,
    homeDir: () => process.env.HOME,
    getVisibleSkills: getFreshSkillsForSession,
    getUserSkillsPath,
    executeSkillManage: (args, options) =>
      executeSkillManage(asSkillManageArgs(args), { workingDirectory: options.workingDirectory }),
    invalidateSkillsCache,
    createAgentProvider: createSkillReviewAgentProvider,
    fileTools: (ctx, options) => createMainSkillReviewFileToolAdapters(ctx, options.mutableRoots),
    logger: console,
  }) as Trigger
}
