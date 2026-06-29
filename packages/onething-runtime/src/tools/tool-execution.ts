import {
  toJsonValue,
  toolFailureText,
  toolResultToStructured,
  type JsonValue,
  type ToolResultLike,
} from '@onething/core'
import {
  executeCoreToolAndUpdate,
  type CoreExecutableStepLike,
  type CoreExecutableSessionLike,
  type CoreExecutableToolCallLike,
  type CoreToolExecutionResultLike,
  type CoreToolMetadataUpdate,
  type CoreToolResultLike,
  type ExecuteCoreToolAndUpdateOptions,
} from '@onething/core/engine'

export type ExecuteOnethingToolAndUpdateOptions<
  TToolCall extends CoreExecutableToolCallLike<TJson, TChanges>,
  TStep extends CoreExecutableStepLike<TToolCall>,
  TResult extends CoreToolExecutionResultLike,
  TMetadataUpdate extends CoreToolMetadataUpdate = CoreToolMetadataUpdate,
  TPartialResult extends CoreToolResultLike = CoreToolResultLike,
  TStructuredResult = CoreToolResultLike,
  TJson extends JsonValue | undefined = JsonValue | undefined,
  TChanges = unknown,
  TSession extends CoreExecutableSessionLike<TStep> = CoreExecutableSessionLike<TStep>,
> = Omit<
  ExecuteCoreToolAndUpdateOptions<
    TToolCall,
    TStep,
    TResult,
    TMetadataUpdate,
    TPartialResult,
    TStructuredResult,
    TJson,
    TChanges,
    TSession
  >,
  'toJsonValue' | 'toStructured' | 'formatFailure'
>

export async function executeOnethingToolAndUpdate<
  TToolCall extends CoreExecutableToolCallLike<TJson, TChanges>,
  TStep extends CoreExecutableStepLike<TToolCall>,
  TResult extends CoreToolExecutionResultLike,
  TMetadataUpdate extends CoreToolMetadataUpdate = CoreToolMetadataUpdate,
  TPartialResult extends CoreToolResultLike = CoreToolResultLike,
  TStructuredResult = CoreToolResultLike,
  TJson extends JsonValue | undefined = JsonValue | undefined,
  TChanges = unknown,
  TSession extends CoreExecutableSessionLike<TStep> = CoreExecutableSessionLike<TStep>,
>(
  options: ExecuteOnethingToolAndUpdateOptions<
    TToolCall,
    TStep,
    TResult,
    TMetadataUpdate,
    TPartialResult,
    TStructuredResult,
    TJson,
    TChanges,
    TSession
  >,
): Promise<void> {
  await executeCoreToolAndUpdate<
    TToolCall,
    TStep,
    TResult,
    TMetadataUpdate,
    TPartialResult,
    TStructuredResult,
    TJson,
    TChanges,
    TSession
  >({
    ...options,
    toJsonValue: value => toJsonValue(value) as TJson,
    toStructured: value =>
      toolResultToStructured(value as ToolResultLike | string | undefined) as TStructuredResult,
    formatFailure: toolFailureText,
  })
}
