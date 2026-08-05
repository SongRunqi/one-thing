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
  const { toolName, args, context } = options

  try {
    if (context.abortSignal?.aborted) {
      return cancelledResult<TResult>()
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
