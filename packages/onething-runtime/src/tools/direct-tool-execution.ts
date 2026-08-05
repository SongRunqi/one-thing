import {
  executeCoreDirectTool,
  type CoreAbortSignalLike,
  type CoreDirectToolAnalysisLike,
  type CoreDirectToolExecutionContext,
  type CoreDirectToolExecutionContextWithApproval,
  type CoreDirectToolExecutionResultLike,
  type CoreDirectToolLogger,
  type CoreDirectToolMCPExecutionOptions,
  type CoreDirectToolMetadataUpdate,
  type CoreDirectToolPermissionInput,
  type CoreDirectToolPreviewLike,
} from '@onething/core/engine'
import type { AgentJsonObject } from '@onething/core'
import { toolFailureText } from '@onething/core'

export type OnethingDirectToolArgs = AgentJsonObject

export interface OnethingDirectToolContext<
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
  onMetadata?: (update: TMetadataUpdate) => void
  onPartialResult?: (update: TPartialResultUpdate) => void
  onStepStart?: (step: TStep) => void
  onStepComplete?: (step: TStep) => void
  beforeSideEffect?: () => Promise<void>
}

export type OnethingDirectToolExecutionContext<
  TEffect = unknown,
  TPreview = unknown,
> = OnethingDirectToolContext & CoreDirectToolExecutionContextWithApproval<TEffect, TPreview>

export interface ExecuteOnethingDirectToolOptions<
  TResult extends CoreDirectToolExecutionResultLike,
  TExecContext extends CoreDirectToolExecutionContextWithApproval<TEffect, TPreview>,
  TMetadataUpdate = CoreDirectToolMetadataUpdate,
  TPartialResultUpdate = unknown,
  TStep = unknown,
  TEffect = unknown,
  TPreview extends CoreDirectToolPreviewLike = CoreDirectToolPreviewLike,
> {
  toolName: string
  args: OnethingDirectToolArgs
  context: OnethingDirectToolContext<TMetadataUpdate, TPartialResultUpdate, TStep>
  isMCPTool: (toolName: string) => boolean
  executeMCPTool: (
    toolName: string,
    args: OnethingDirectToolArgs,
    options: CoreDirectToolMCPExecutionOptions,
  ) => Promise<unknown>
  /** Qualifies MCP permission grants with the owning server. */
  resolveMCPServerId?: (toolRef: string) => string | undefined
  analyzeTool: (
    toolName: string,
    args: OnethingDirectToolArgs,
    context: TExecContext,
  ) => Promise<CoreDirectToolAnalysisLike<TEffect, TPreview>>
  executeTool: (
    toolName: string,
    args: OnethingDirectToolArgs,
    context: TExecContext,
  ) => Promise<TResult>
  enforcePermission: (input: CoreDirectToolPermissionInput<TEffect, TPreview>) => Promise<void>
  createExecutionContext?: (
    context: OnethingDirectToolContext<TMetadataUpdate, TPartialResultUpdate, TStep>,
  ) => TExecContext
  formatFailure?: (failure: { error?: string; rejected?: boolean; rejectionReason?: string }) => string
  logger?: CoreDirectToolLogger
}

export function createOnethingDirectToolExecutionContext<
  TExecContext extends CoreDirectToolExecutionContextWithApproval<TEffect, TPreview>,
  TMetadataUpdate = CoreDirectToolMetadataUpdate,
  TPartialResultUpdate = unknown,
  TStep = unknown,
  TEffect = unknown,
  TPreview = unknown,
>(
  context: OnethingDirectToolContext<TMetadataUpdate, TPartialResultUpdate, TStep>,
): TExecContext {
  return {
    sessionId: context.sessionId,
    messageId: context.messageId,
    toolCallId: context.toolCallId,
    workingDirectory: context.workingDirectory,
    workingDirectoryRoots: context.workingDirectoryRoots,
    abortSignal: context.abortSignal,
    onMetadata: context.onMetadata,
    onPartialResult: context.onPartialResult,
    onStepStart: context.onStepStart,
    onStepComplete: context.onStepComplete,
    beforeSideEffect: context.beforeSideEffect,
  } as unknown as TExecContext
}

export async function executeOnethingDirectTool<
  TResult extends CoreDirectToolExecutionResultLike,
  TExecContext extends CoreDirectToolExecutionContextWithApproval<TEffect, TPreview>,
  TMetadataUpdate = CoreDirectToolMetadataUpdate,
  TPartialResultUpdate = unknown,
  TStep = unknown,
  TEffect = unknown,
  TPreview extends CoreDirectToolPreviewLike = CoreDirectToolPreviewLike,
>(
  options: ExecuteOnethingDirectToolOptions<
    TResult,
    TExecContext,
    TMetadataUpdate,
    TPartialResultUpdate,
    TStep,
    TEffect,
    TPreview
  >,
): Promise<TResult> {
  return executeCoreDirectTool<
    TResult,
    TExecContext,
    TMetadataUpdate,
    TPartialResultUpdate,
    TStep,
    TEffect,
    TPreview
  >({
    toolName: options.toolName,
    args: options.args,
    context: options.context as CoreDirectToolExecutionContext<TMetadataUpdate, TPartialResultUpdate, TStep>,
    isMCPTool: options.isMCPTool,
    executeMCPTool: options.executeMCPTool,
    resolveMCPServerId: options.resolveMCPServerId,
    analyzeTool: options.analyzeTool,
    executeTool: options.executeTool,
    enforcePermission: options.enforcePermission,
    createExecutionContext:
      options.createExecutionContext ??
      createOnethingDirectToolExecutionContext,
    formatFailure: options.formatFailure ?? toolFailureText,
    logger: options.logger,
  })
}
