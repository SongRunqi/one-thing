/**
 * Stream Executor Module
 * Unified entry point for message streaming
 * Routes host-specific special streams before falling back to text streaming
 *
 * Uses StreamEngine for AbortController lifecycle management.
 */

import type { AppSettings, ProviderConfig, ToolSettings } from '../../../shared/ipc.js'
import * as modelRegistry from '../../providers/model-registry.js'
import {
  CODEX_NATIVE_IMAGE_GENERATION_TOOL,
  getCodexNativeToolsForConfig,
} from './codex-native-tools.js'
import { processImageGenerationStream } from './image-stream.js'
import {
  executeAgentLoopStreamGeneration,
  type AgentLoopStreamGenerationResult,
} from './agent-loop-executor.js'
import { type StreamContext, type StreamSender } from './stream-processor.js'
import { getStreamEngine } from '../index.js'
import type { HistoryMessage } from './message-helpers.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import type { AgentOutputModality } from '@onething/core/agent-loop'
import {
  executeCoreMessageStream,
} from '@onething/core/engine'

// Re-export for convenience
export type { HistoryMessage }

/**
 * Provider config with API key
 */
export interface ProviderConfigWithKey extends ProviderConfig {
  apiKey: string
  model: string
  authContext?: ProviderAuthContext
}

/**
 * Parameters for unified stream execution
 */
export interface StreamExecutionParams {
  sender: StreamSender
  sessionId: string
  assistantMessageId: string
  messageContent: string  // The prompt (for image) or last user message (for context)
  historyMessages: HistoryMessage[]
  configWithApiKey: ProviderConfigWithKey
  providerId: string
  requestedOutputModalities?: AgentOutputModality[]
  settings: AppSettings
  toolSettings?: ToolSettings
  sessionName?: string
  voiceConversation?: boolean
  speakMode?: boolean
}

/**
 * Result of stream execution
 */
export interface StreamExecutionResult {
  handled: boolean
  isImageGeneration: boolean
  pausedForConfirmation?: boolean
}

/**
 * Unified stream execution entry point
 * Automatically detects whether to use a host-specific special stream or text streaming
 *
 * @param params Stream execution parameters
 * @param abortController Optional abort controller for cancellation
 * @returns Result indicating how the stream was handled
 */
/**
 * Resolve the requested output modalities for this stream.
 * Mirrors the system-prompt snapshot's native-tool resolution
 * (getNativeProviderTools) so the request body matches what the
 * prompt tells the model: when the Codex native image_generation
 * tool is available, request image output so the provider attaches it.
 */
async function resolveRequestedOutputModalities(
  params: StreamExecutionParams,
): Promise<AgentOutputModality[] | undefined> {
  if (params.requestedOutputModalities) return params.requestedOutputModalities
  try {
    const nativeTools = await getCodexNativeToolsForConfig({
      providerId: params.providerId,
      providerConfig: params.configWithApiKey,
      toolSettings: params.toolSettings,
      supportsTools: await modelRegistry.modelSupportsTools(
        params.configWithApiKey.model,
        params.providerId,
      ),
    })
    return nativeTools.includes(CODEX_NATIVE_IMAGE_GENERATION_TOOL) ? ['image'] : undefined
  } catch (error) {
    console.warn('[StreamExecutor] Failed to resolve native provider tools:', error)
    return undefined
  }
}

export async function executeMessageStream(
  params: StreamExecutionParams,
  abortController?: AbortController
): Promise<StreamExecutionResult> {
  const engine = getStreamEngine()
  const result = await executeCoreMessageStream({
    params: {
      ...params,
      requestedOutputModalities: await resolveRequestedOutputModalities(params),
    },
    controller: abortController,
    createController: () => new AbortController(),
    registry: {
      registerController: (sessionId, controller) => engine.registerController(sessionId, controller),
      removeController: sessionId => engine.removeController(sessionId),
      getSteeringQueue: sessionId => engine.getSteeringQueue(sessionId),
      getFollowUpQueue: sessionId => engine.getFollowUpQueue(sessionId),
    },
    supportsSpecialStream: (model, providerId) =>
      modelRegistry.modelSupportsImageGeneration(model, providerId),
    processSpecialStream: input => processImageGenerationStream(input),
    executeTextStream: (ctx, historyMessages, sessionName): Promise<AgentLoopStreamGenerationResult> =>
      executeAgentLoopStreamGeneration(ctx as StreamContext, historyMessages, sessionName),
    logger: console,
  })

  return {
    handled: result.handled,
    isImageGeneration: result.usedSpecialStream,
    pausedForConfirmation: result.pausedForConfirmation,
  }
}
