/**
 * Image Generation Module
 * Handles OpenAI DALL-E and Gemini image generation
 */

import { createAppFetch } from '../../providers/bound-fetch.js'

type FetchFn = typeof globalThis.fetch

interface OpenAIImageGenerationResponse {
  data?: Array<{
    b64_json?: string
    revised_prompt?: string
    url?: string
  }>
  b64_json?: string
  revised_prompt?: string
  url?: string
  error?: {
    message?: string
  }
}

interface OpenAIImageGenerationRequest {
  model: string
  prompt: string
  size: string
  style?: string
  quality?: string
  response_format?: 'b64_json'
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inlineData?: {
          data?: string
          mimeType?: string
        }
        inline_data?: {
          data?: string
          mime_type?: string
        }
      }>
    }
  }>
  error?: {
    message?: string
  }
}

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

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } }
    return parsed.error?.message || text
  } catch {
    return text
  }
}

async function fetchImageUrlAsBase64(url: string, fetchImpl: FetchFn): Promise<string> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(await responseError(response, `Failed to fetch generated image: ${response.status}`))
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.toString('base64')
}

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
  try {
    const fetchImpl = createAppFetch()
    const body: OpenAIImageGenerationRequest = {
      model,
      prompt,
      size: options.size || '1024x1024',
    }

    if (model === 'dall-e-3') {
      body.style = options.style || 'vivid'
      body.quality = options.quality || 'standard'
      body.response_format = 'b64_json'
    } else if (model.includes('gpt-image')) {
      body.quality = options.quality || 'auto'
    } else {
      body.response_format = 'b64_json'
    }

    const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(await responseError(response, `OpenAI image API error: ${response.status}`))
    }

    const payload = await response.json() as OpenAIImageGenerationResponse
    if (payload.error?.message) throw new Error(payload.error.message)

    const first = payload.data?.[0] ?? payload
    const imageBase64 = first.b64_json || (first.url
      ? await fetchImageUrlAsBase64(first.url, fetchImpl)
      : undefined)

    if (!imageBase64) {
      return {
        success: false,
        error: 'No image generated',
      }
    }

    return {
      success: true,
      imageBase64,
      revisedPrompt: first.revised_prompt,
    }
  } catch (error) {
    const imageError = error instanceof Error ? error : new Error(String(error))
    console.error('[Image Generation] Error:', imageError)
    return {
      success: false,
      error: imageError.message || 'Failed to generate image',
    }
  }
}

/**
 * Generate image using Gemini's native image generation REST API.
 */
export async function generateGeminiImage(
  apiKey: string,
  model: string,
  prompt: string
): Promise<ImageGenerationResult> {
  try {
    console.log(`[Gemini Image] Generating image with model: ${model}`)
    const fetchImpl = createAppFetch()
    const encodedModel = encodeURIComponent(model)
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: prompt }],
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      },
    )
    if (!response.ok) {
      throw new Error(await responseError(response, `Gemini image API error: ${response.status}`))
    }

    const result = await response.json() as GeminiGenerateContentResponse
    if (result.error?.message) throw new Error(result.error.message)
    const parts = result.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
    console.log(`[Gemini Image] Response received, parts: ${parts.length}`)

    for (const part of parts) {
      const inlineData = part.inlineData ?? (part.inline_data
        ? {
            data: part.inline_data.data,
            mimeType: part.inline_data.mime_type,
          }
        : undefined)
      if (inlineData?.data && inlineData.mimeType?.startsWith('image/')) {
        console.log(`[Gemini Image] Found image: ${inlineData.mimeType}`)
        return {
          success: true,
          imageBase64: inlineData.data,
        }
      }
    }

    const text = parts
      .map(part => part.text)
      .filter(Boolean)
      .join('\n')

    if (text) {
      console.log(`[Gemini Image] No image generated, got text: ${text.substring(0, 100)}...`)
      return {
        success: false,
        error: `Model returned text instead of image: ${text.substring(0, 200)}`,
      }
    }

    return {
      success: false,
      error: 'No image generated',
    }
  } catch (error) {
    const imageError = error instanceof Error ? error : new Error(String(error))
    console.error('[Gemini Image] Error:', imageError)
    return {
      success: false,
      error: imageError.message || 'Failed to generate image',
    }
  }
}
