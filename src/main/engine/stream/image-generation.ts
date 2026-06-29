/**
 * Image Generation Module
 * Handles OpenAI DALL-E and Gemini image generation
 */

import { createAppFetch } from '../../providers/bound-fetch.js'
import {
  generateCoreGeminiImage,
  generateCoreOpenAIImage,
  normalizeImageModelId,
  type CoreImageGenerationResult,
} from '@onething/runtime/media'

export { normalizeImageModelId }

/**
 * Image generation result interface
 */
export interface ImageGenerationResult extends CoreImageGenerationResult {}

/**
 * Generate image using the OpenAI-compatible image generation REST API.
 */
export async function generateImage(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  options: { size?: string; quality?: string; style?: string } = {}
): Promise<ImageGenerationResult> {
  return generateCoreOpenAIImage({
    apiKey,
    baseUrl,
    model,
    prompt,
    imageOptions: options,
    fetch: createAppFetch({ policy: 'default' }),
    logger: console,
  })
}

/**
 * Generate image using Gemini's native image generation REST API.
 */
export async function generateGeminiImage(
  apiKey: string,
  model: string,
  prompt: string
): Promise<ImageGenerationResult> {
  return generateCoreGeminiImage({
    apiKey,
    model,
    prompt,
    fetch: createAppFetch({ policy: 'default' }),
    logger: console,
  })
}
