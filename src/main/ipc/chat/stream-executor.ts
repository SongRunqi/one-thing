/**
 * Stream Executor Module
 * Unified entry point for message streaming
 * Automatically detects image generation vs text streaming
 */

import type { WebContents } from 'electron'
import type { AppSettings, ProviderConfig, ToolSettings } from '../../../shared/ipc.js'
import * as modelRegistry from '../../services/ai/model-registry.js'
import { processImageGenerationStream } from './image-stream.js'
import { executeStreamGeneration, type StreamGenerationResult } from './tool-loop.js'
import { activeStreams, type StreamContext } from './stream-processor.js'
import type { HistoryMessage } from './message-helpers.js'

// Re-export for convenience
export { activeStreams }
export type { HistoryMessage }

/**
 * Provider config with API key
 */
export interface ProviderConfigWithKey extends ProviderConfig {
  apiKey: string
}

/**
 * Parameters for unified stream execution
 */
export interface StreamExecutionParams {
  sender: WebContents
  sessionId: string
  assistantMessageId: string
  messageContent: string  // The prompt (for image) or last user message (for context)
  historyMessages: HistoryMessage[]
  configWithApiKey: ProviderConfigWithKey
  providerId: string
  settings: AppSettings
  toolSettings?: ToolSettings
  sessionName?: string
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
 * Automatically detects whether to use image generation or text streaming
 *
 * @param params Stream execution parameters
 * @param abortController Optional abort controller for cancellation
 * @returns Result indicating how the stream was handled
 */
export async function executeMessageStream(
  params: StreamExecutionParams,
  abortController?: AbortController
): Promise<StreamExecutionResult> {
  const {
    sender,
    sessionId,
    assistantMessageId,
    messageContent,
    historyMessages,
    configWithApiKey,
    providerId,
    settings,
    toolSettings,
    sessionName,
  } = params

  // Create abort controller if not provided
  const controller = abortController || new AbortController()
  activeStreams.set(sessionId, controller)

  try {
    // Check if this is an image generation model
    const supportsImageGen = await modelRegistry.modelSupportsImageGeneration(
      configWithApiKey.model,
      providerId
    )

    if (supportsImageGen) {
      console.log(`[StreamExecutor] Detected image generation model: ${configWithApiKey.model}`)

      // Process image generation
      const handled = await processImageGenerationStream({
        sender,
        sessionId,
        assistantMessageId,
        prompt: messageContent,
        providerId,
        apiKey: configWithApiKey.apiKey,
        model: configWithApiKey.model,
        baseUrl: configWithApiKey.baseUrl,
        sessionName,
      })

      // Image generation always completes (no pause for confirmation)
      activeStreams.delete(sessionId)

      return {
        handled,
        isImageGeneration: true,
        pausedForConfirmation: false,
      }
    } else {
      // Normal text streaming
      console.log(`[StreamExecutor] Using text streaming for model: ${configWithApiKey.model}`)

      const ctx: StreamContext = {
        sender,
        sessionId,
        assistantMessageId,
        abortSignal: controller.signal,
        settings,
        providerConfig: configWithApiKey,
        providerId,
        toolSettings,
      }

      const result: StreamGenerationResult = await executeStreamGeneration(
        ctx,
        historyMessages,
        sessionName
      )

      // Only remove controller if stream completed (not paused for confirmation)
      if (!result.pausedForConfirmation) {
        activeStreams.delete(sessionId)
      }

      return {
        handled: true,
        isImageGeneration: false,
        pausedForConfirmation: result.pausedForConfirmation,
      }
    }
  } catch (error: any) {
    // On error, always remove controller
    console.error('[StreamExecutor] Error:', error)
    activeStreams.delete(sessionId)
    throw error
  }
}
