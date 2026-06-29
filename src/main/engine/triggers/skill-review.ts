import type { AgentToolExecutionContext } from '@onething/core/agent-loop'
import type {
  CoreSkillReviewManageArgs,
} from '@onething/runtime/triggers'
import {
  createOnethingSkillReviewFileToolAdapters,
  createOnethingSkillReviewTrigger,
} from '@onething/runtime/triggers'
import type { ProviderAuthContext } from '../../auth/types.js'
import { createRequiredAppFetch } from '../../providers/bound-fetch.js'
import { generateChatResponse } from '../../providers/index.js'
import { dumpProviderRequest } from '../../providers/request-dump.js'
import { getUserSkillsPath } from '../../skills/index.js'
import { executeSkillManage, type SkillManageArgs } from '../../skills/manage.js'
import {
  getSkillsForSession,
  invalidateSessionSkillsCache as invalidateSkillsCache,
} from '../../skills/session-skills.js'
import { ReadTool } from '../../tools/builtin/read.js'
import { WriteTool } from '../../tools/builtin/write.js'
import { EditTool } from '../../tools/builtin/edit.js'
import type { ToolContext } from '../../tools/core/tool.js'
import type { Trigger, TriggerContext } from './index.js'

interface SkillReviewProviderAuthExtension {
  authContext?: ProviderAuthContext
}

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

export function createSkillReviewTrigger(): Trigger {
  return createOnethingSkillReviewTrigger<TriggerContext>({
    isDisabled: isSkillReviewDisabledByEnv,
    homeDir: () => process.env.HOME,
    getVisibleSkills: getFreshSkillsForSession,
    getUserSkillsPath,
    executeSkillManage: (args, options) =>
      executeSkillManage(asSkillManageArgs(args), { workingDirectory: options.workingDirectory }),
    invalidateSkillsCache,
    generateChatResponse: (providerId, providerConfig, messages, options) =>
      generateChatResponse(
        providerId,
        providerConfig as Parameters<typeof generateChatResponse>[1] & SkillReviewProviderAuthExtension,
        messages,
        options,
      ),
    fetchImpl: createRequiredAppFetch,
    requestDumper: dumpProviderRequest as never,
    fileTools: (ctx, options) => createMainSkillReviewFileToolAdapters(ctx, options.mutableRoots),
    logger: console,
  }) as Trigger
}
