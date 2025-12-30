/**
 * Image Generation Module
 * Handles OpenAI DALL-E and Gemini image generation
 */

import { experimental_generateImage as aiGenerateImage, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

/**
 * Normalize model ID for API call (for OpenAI image models)
 */
export function normalizeImageModelId(modelId: string): string {
  const normalized = modelId.toLowerCase().replace(/[\s-]+/g, '')
  if (normalized.includes('dalle3')) return 'dall-e-3'
  if (normalized.includes('dalle2')) return 'dall-e-2'
  // chatgpt-image-latest should use gpt-image-1 (the API-accessible version)
  if (normalized.includes('chatgptimage')) return 'gpt-image-1'
  // gpt-image models use their original ID
  return modelId
}

/**
 * Image generation result interface
 */
export interface ImageGenerationResult {
  success: boolean
  imageUrl?: string
  imageBase64?: string
  revisedPrompt?: string
  error?: string
}

/**
 * Generate image using OpenAI DALL-E API via AI SDK
 */
export async function generateImage(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  options: { size?: string; quality?: string; style?: string } = {}
): Promise<ImageGenerationResult> {
  try {
    // Create OpenAI provider with custom settings
    const openai = createOpenAI({
      apiKey,
      baseURL: baseUrl || 'https://api.openai.com/v1',
    })

    // Build provider options based on model
    const providerOptions: Record<string, any> = {}
    if (model === 'dall-e-3') {
      providerOptions.openai = {
        style: options.style || 'vivid',
        quality: options.quality || 'standard',
      }
    } else if (model.includes('gpt-image')) {
      providerOptions.openai = {
        quality: options.quality || 'auto',
      }
    }

    // Generate image using AI SDK
    const result = await aiGenerateImage({
      model: openai.image(model),
      prompt,
      size: (options.size || '1024x1024') as `${number}x${number}`,
      providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
    })

    // Get the first image
    const image = result.image

    return {
      success: true,
      imageBase64: image.base64,
      revisedPrompt: (result as any).providerMetadata?.openai?.revisedPrompt,
    }
  } catch (error: any) {
    console.error('[Image Generation] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate image',
    }
  }
}

/**
 * Generate image using Gemini API
 * Gemini 2.5 Flash Image uses generateText and returns images in result.files
 */
export async function generateGeminiImage(
  apiKey: string,
  model: string,
  prompt: string
): Promise<ImageGenerationResult> {
  try {
    console.log(`[Gemini Image] Generating image with model: ${model}`)
    const google = createGoogleGenerativeAI({ apiKey })

    const result = await generateText({
      model: google(model),
      prompt,
    })

    console.log(`[Gemini Image] Response received, files: ${result.files?.length ?? 0}`)

    // Extract image from result.files
    if (result.files && result.files.length > 0) {
      for (const file of result.files) {
        if (file.mediaType?.startsWith('image/')) {
          console.log(`[Gemini Image] Found image: ${file.mediaType}`)
          return {
            success: true,
            imageBase64: file.base64,
          }
        }
      }
    }

    // No image in files - check if model returned text instead
    if (result.text) {
      console.log(`[Gemini Image] No image generated, got text: ${result.text.substring(0, 100)}...`)
      return {
        success: false,
        error: `Model returned text instead of image: ${result.text.substring(0, 200)}`,
      }
    }

    return {
      success: false,
      error: 'No image generated',
    }
  } catch (error: any) {
    console.error('[Gemini Image] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate image',
    }
  }
}
