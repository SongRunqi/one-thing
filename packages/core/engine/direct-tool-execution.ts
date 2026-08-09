import type { JsonObject } from '../json.js'
import type { Principal } from '../permission/principal.js'
import { isToolAbortError } from '../tools/abort.js'
import {
  buildMCPPartialResultUpdate,
  buildMCPPermissionPlan,
  type CoreMCPPartialResultUpdate,
} from './tool-orchestration.js'

export interface CoreAbortSignalLike {
  aborted?: boolean
}

export interface CoreDirectToolExecutionContext<
  TMetadataUpdate = CoreDirectToolMetadataUpdate,
  TPartialResultUpdate = unknown,
  TStep = unknown,
> {
  sessionId: string
  messageId: string
  toolCallId?: string
  workingDirectory?: string
  workingDirectoryRoots?: string[]
  abortSignal?: CoreAbortSignalLike
  /** Actor behind this call; minted at the engine boundary (permission/principal.ts). */
  principal?: Principal
  onMetadata?: (update: TMetadataUpdate) => void
  onPartialResult?: (update: TPartialResultUpdate) => void
  onStepStart?: (step: TStep) => void
  onStepComplete?: (step: TStep) => void
  beforeSideEffect?: () => Promise<void>
}

export interface CoreDirectToolPreviewLike {
  title?: string
  metadata?: Record<string, unknown>
  path?: string
  diff?: string
  additions?: number
  deletions?: number
}

export interface CoreDirectToolMetadataUpdate {
  title?: string
  metadata?: Record<string, unknown>
}

export interface CoreDirectToolAnalysisLike<TEffect = unknown, TPreview extends CoreDirectToolPreviewLike = CoreDirectToolPreviewLike> {
  success: boolean
  error?: string
  effects?: TEffect[]
  preview?: TPreview
}

export interface CoreDirectToolApprovedAnalysis<TEffect = unknown, TPreview = unknown> {
  effects: TEffect[]
  preview?: TPreview
}

export interface CoreDirectToolExecutionContextWithApproval<TEffect = unknown, TPreview = unknown> {
  approvedAnalysis?: CoreDirectToolApprovedAnalysis<TEffect, TPreview>
}

export interface CoreDirectToolExecutionResultLike {
  success: boolean
  data?: unknown
  error?: string
  requiresConfirmation?: boolean
  commandType?: string
  aborted?: boolean
  rejected?: boolean
  rejectionReason?: string
}

export interface CoreDirectToolPermissionInput<TEffect = unknown, TPreview = unknown> {
  sessionId: string
  messageId: string
  toolCallId?: string
  toolName: string
  effects: TEffect[]
  preview?: TPreview
  workspaceRoot?: string
  principal?: Principal
}

export interface CoreDirectToolMCPExecutionOptions {
  onPartialResult?: (text: string, phase: string) => void
}

export interface CoreDirectToolLogger {
  log?: (...args: unknown[]) => void
  error?: (...args: unknown[]) => void
}

/* ── N4:工具调用拦截口 ───────────────────────────────────────────────────── */

export interface CoreDirectToolInterceptRequest {
  sessionId: string
  toolName: string
  toolCallId?: string
  input: JsonObject
}

/**
 * 拦截链的答复。`allow` 带回**可能已被改写**的参数 —— 后续 analyze / permission /
 * execute 全部用这一份,不留第二份"原始参数"在链上飘。
 */
export type CoreDirectToolInterceptVerdict =
  | { action: 'allow'; input: JsonObject }
  | { action: 'block'; reason: string }

/**
 * 宿主注入的拦截口(N4)。**core 侧只有一个函数类型**,没有任何插件依赖 ——
 * 与 sandboxHost / storePathHost 同一个姿势:core 定义形状,装配层塞实现。
 *
 * 契约:**从不抛错**。真正的实现(`app/plugins/tool-call-intercept.ts`)自己兜底,
 * 因为在 fail-closed 这一侧,"拦截口自己炸了"必须收敛成一个明确的 block 判决,
 * 而不是让工具执行路径去猜。
 */
export type CoreDirectToolInterceptor = (
  request: CoreDirectToolInterceptRequest,
) => Promise<CoreDirectToolInterceptVerdict>

export interface ExecuteCoreDirectToolOptions<
  TResult extends CoreDirectToolExecutionResultLike,
  TExecContext extends CoreDirectToolExecutionContextWithApproval<TEffect, TPreview>,
  TMetadataUpdate = CoreDirectToolMetadataUpdate,
  TPartialResultUpdate = unknown,
  TStep = unknown,
  TEffect = unknown,
  TPreview extends CoreDirectToolPreviewLike = CoreDirectToolPreviewLike,
> {
  toolName: string
  args: JsonObject
  context: CoreDirectToolExecutionContext<TMetadataUpdate, TPartialResultUpdate, TStep>
  isMCPTool: (toolName: string) => boolean
  executeMCPTool: (toolName: string, args: JsonObject, options: CoreDirectToolMCPExecutionOptions) => Promise<unknown>
  /** Qualifies MCP permission grants with the owning server; see buildMCPPermissionPlan. */
  resolveMCPServerId?: (toolRef: string) => string | undefined
  analyzeTool: (toolName: string, args: JsonObject, context: TExecContext) => Promise<CoreDirectToolAnalysisLike<TEffect, TPreview>>
  executeTool: (toolName: string, args: JsonObject, context: TExecContext) => Promise<TResult>
  enforcePermission: (input: CoreDirectToolPermissionInput<TEffect, TPreview>) => Promise<void>
  /**
   * N4:插件的工具调用拦截链。缺省(不注入)= 没有这道闸,一字不改的旧行为 ——
   * 只跑插件的桌面宿主接它,server / CLI daemon 不接。
   */
  interceptToolCall?: CoreDirectToolInterceptor
  createExecutionContext: (context: CoreDirectToolExecutionContext<TMetadataUpdate, TPartialResultUpdate, TStep>) => TExecContext
  isPermissionRejectedError?: (error: Error) => boolean
  permissionRejectedReason?: (error: Error) => string | undefined
  formatFailure: (failure: { error?: string; rejected?: boolean; rejectionReason?: string }) => string
  logger?: CoreDirectToolLogger
}

export function metadataUpdateFromToolPreview<TPreview extends CoreDirectToolPreviewLike>(
  preview: TPreview,
): CoreDirectToolMetadataUpdate {
  return {
    title: preview.title,
    metadata: {
      ...(preview.metadata ?? {}),
      ...(preview.path && { path: preview.path }),
      ...(preview.diff && { diff: preview.diff }),
      ...(preview.additions !== undefined && { additions: preview.additions }),
      ...(preview.deletions !== undefined && { deletions: preview.deletions }),
    },
  }
}

export async function executeCoreDirectTool<
  TResult extends CoreDirectToolExecutionResultLike,
  TExecContext extends CoreDirectToolExecutionContextWithApproval<TEffect, TPreview>,
  TMetadataUpdate = CoreDirectToolMetadataUpdate,
  TPartialResultUpdate = unknown,
  TStep = unknown,
  TEffect = unknown,
  TPreview extends CoreDirectToolPreviewLike = CoreDirectToolPreviewLike,
>(
  options: ExecuteCoreDirectToolOptions<TResult, TExecContext, TMetadataUpdate, TPartialResultUpdate, TStep, TEffect, TPreview>,
): Promise<TResult> {
  const { toolName, context } = options
  let args = options.args

  try {
    if (context.abortSignal?.aborted) {
      return cancelledResult<TResult>()
    }

    // ── N4:插件工具调用拦截链 ─────────────────────────────────────────────
    //
    // 挂点在这里,而且只在这里。理由是**这是每一次工具执行的唯一必经点**:
    // agent-loop 的每一次 tool-call-done、orchestrator 的每一次 start、
    // 子 agent 的每一次直调,最后都收敛到 executeCoreDirectTool。MCP 与内置
    // 两条分支也都在这一行之下,所以一处覆盖两族。
    //
    // 它排在 analyzeTool / enforcePermission **之前**,与规格给的
    // "权限 → 拦截"相反,理由有二(两条都指向同一个方向):
    //
    //  1. **改写必须先于授权,否则改写就是越权**。权限卡上写的是 analyze 出来
    //     的那份 effects/preview,来自当时那份参数。若允许在授权之后改参数,
    //     用户点头的是 `rm /tmp/x`,真正跑的是 `rm -rf /` —— 这恰恰是规格
    //     "插件不能绕过用户授权"那句话要禁的事。放在前面,改写结果照样要走
    //     analyze + permission,用户授权的永远是**最终会跑的那份参数**。
    //  2. **否决先于打扰**。block 排在前面意味着一次注定被挡的调用不会先弹一张
    //     审批卡给人点。
    //
    // 于是"插件不替代权限系统"这一条在结构上成立:这条链**没有**放行动作 ——
    // allow 只是"我不干预",它之后的权限闸一步不少。
    if (options.interceptToolCall) {
      const verdict = await options.interceptToolCall({
        sessionId: context.sessionId,
        toolName,
        toolCallId: context.toolCallId,
        input: args,
      })
      if (verdict.action === 'block') {
        options.logger?.log?.(`[DirectExec] Tool call blocked by plugin: ${toolName}`)
        // 阻断走**工具错误结果**这条既有路径(与工具自己抛错同路),模型据此
        // 改道。不新造一个"被插件挡了"的结果种类:那会要求每一个消费方
        // (UI / 历史重建 / 评估)都学会一个新状态,而它们对 isError 早已有
        // 完整处置。归因写在文案最前面(formatPluginToolCallBlockReason)。
        return {
          success: false,
          error: verdict.reason,
        } as TResult
      }
      args = verdict.input
    }

    if (options.isMCPTool(toolName)) {
      options.logger?.log?.(`[DirectExec] Executing MCP tool: ${toolName}`)
      if (context.abortSignal?.aborted) {
        return cancelledResult<TResult>()
      }

      const permissionPlan = buildMCPPermissionPlan(toolName, args, {
        resolveServerId: options.resolveMCPServerId,
      })
      if (permissionPlan) {
        await options.enforcePermission({
          sessionId: context.sessionId,
          messageId: context.messageId,
          toolCallId: context.toolCallId,
          toolName,
          effects: permissionPlan.effects as TEffect[],
          preview: permissionPlan.preview as unknown as TPreview,
          workspaceRoot: context.workingDirectory,
          principal: context.principal,
        })
        await context.beforeSideEffect?.()
      }

      const result = await options.executeMCPTool(toolName, args, {
        onPartialResult: (text, phase) => {
          context.onPartialResult?.(
            buildMCPPartialResultUpdate(text, phase, toolName, args) as CoreMCPPartialResultUpdate as TPartialResultUpdate,
          )
        },
      })

      if (context.abortSignal?.aborted) {
        return cancelledResult<TResult>()
      }
      return { success: true, data: result } as TResult
    }

    options.logger?.log?.(`[DirectExec] Executing built-in tool: ${toolName}`)
    const execContext = options.createExecutionContext(context)
    const analysis = await options.analyzeTool(toolName, args, execContext)
    if (!analysis.success) {
      return {
        success: false,
        error: analysis.error || 'Tool analysis failed',
      } as TResult
    }

    if (analysis.preview && context.onMetadata) {
      context.onMetadata(metadataUpdateFromToolPreview(analysis.preview) as TMetadataUpdate)
    }

    await options.enforcePermission({
      sessionId: context.sessionId,
      messageId: context.messageId,
      toolCallId: context.toolCallId,
      toolName,
      effects: analysis.effects ?? [],
      preview: analysis.preview,
      workspaceRoot: context.workingDirectory,
      principal: context.principal,
    })
    execContext.approvedAnalysis = {
      effects: analysis.effects ?? [],
      preview: analysis.preview,
    }

    return options.executeTool(toolName, args, execContext)
  } catch (error) {
    const caught = error instanceof Error ? error : new Error(String(error))
    if (options.isPermissionRejectedError?.(caught) || caught.name === 'PermissionRejectedError') {
      const rejectionReason = options.permissionRejectedReason?.(caught) ?? (caught as { reason?: string }).reason
      options.logger?.log?.(`[DirectExec] Permission rejected for tool ${toolName}`)
      return {
        success: false,
        error: options.formatFailure({ error: caught.message, rejected: true, rejectionReason }),
        rejected: true,
        rejectionReason,
      } as TResult
    }

    options.logger?.error?.('[DirectExec] Tool execution error:', caught)
    return {
      success: false,
      error: caught.message || 'Unknown error during tool execution',
      // Cancellation is read from the signal and from the structured abort
      // marker only. Message-substring probes used to mislabel genuine
      // failures as cancellations whenever the error text quoted file content
      // that happened to contain "aborted"/"cancelled" — e.g. an edit whose
      // "closest match" snippet came from a file mentioning abortSignal.
      aborted: Boolean(context.abortSignal?.aborted) || isToolAbortError(caught),
    } as TResult
  }
}

function cancelledResult<TResult extends CoreDirectToolExecutionResultLike>(): TResult {
  return {
    success: false,
    error: 'Execution cancelled by user',
    aborted: true,
  } as TResult
}
