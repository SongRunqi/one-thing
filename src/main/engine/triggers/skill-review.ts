import type { AgentToolExecutionContext } from '@onething/core/agent-loop'
import type {
  CoreSkillReviewManageArgs,
} from '@onething/runtime/triggers'
import {
  createOnethingSkillReviewFileToolAdapters,
  createOnethingSkillReviewTrigger,
} from '@onething/runtime/triggers'
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
import { billSkillUsage } from '../../usage/bill-side-line.js'
import { createUtilityProvider } from '../../providers/utility-provider.js'

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

// No fallback to the chat provider on purpose: skill review is background
// work, and running it silently on an expensive chat model is worse than not
// running it at all. Leaving the tool-call model unset disables the feature.
async function createSkillReviewAgentProvider(ctx: TriggerContext) {
  return createUtilityProvider(ctx.settings, {
    workingDirectory: ctx.session.workingDirectory,
    sessionId: ctx.sessionId,
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
    createAgentProvider: createSkillReviewAgentProvider,
    onUsage: (usage, context) =>
      billSkillUsage(context.providerId, context.model, context.sessionId)(usage),
    fileTools: (ctx, options) => createMainSkillReviewFileToolAdapters(ctx, options.mutableRoots),
    logger: console,
  }) as Trigger
}
