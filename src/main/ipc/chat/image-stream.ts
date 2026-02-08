/**
 * Image Stream Module
 * Handles image generation streaming flow (IPC messages, media saving, etc.)
 */

import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc.js'
import {
  updateMessageContent,
  updateMessageStreaming,
} from '../../stores/sessions.js'
import { saveMediaImage } from '../media.js'
import {
  normalizeImageModelId,
  generateImage,
  generateGeminiImage,
  type ImageGenerationResult,
} from './image-generation.js'

export interface ImageStreamParams {
  sender: WebContents
  sessionId: string
  assistantMessageId: string
  prompt: string
  providerId: string
  apiKey: string
  model: string
  baseUrl?: string
  sessionName?: string
}

/**
 * Process image generation stream
 * Handles the full flow: send progress, generate, save, send result
 *
 * @returns true if image generation was handled, false to continue with text stream
 */
export async function processImageGenerationStream(
  params: ImageStreamParams
): Promise<boolean> {
  const {
    sender,
    sessionId,
    assistantMessageId,
    prompt,
    providerId,
    apiKey,
    model,
    baseUrl,
    sessionName,
  } = params

  console.log(`[ImageStream] Processing image generation for model: ${model}`)

  // Send a "thinking" message to show progress
  sender.send(IPC_CHANNELS.STREAM_CHUNK, {
    type: 'text',
    content: '正在生成图片...\n\n',
    messageId: assistantMessageId,
    sessionId,
  })
  updateMessageContent(sessionId, assistantMessageId, '正在生成图片...\n\n')

  let result: ImageGenerationResult
  let modelForDisplay: string

  // Use provider ID to determine which image generation API to use
  if (providerId === 'gemini') {
    console.log(`[ImageStream] Using Gemini image generation`)
    modelForDisplay = model
    result = await generateGeminiImage(apiKey, model, prompt)
  } else {
    // OpenAI-compatible image generation (DALL-E, etc.)
    const normalizedModel = normalizeImageModelId(model)
    console.log(`[ImageStream] Using OpenAI image generation: ${normalizedModel}`)
    modelForDisplay = normalizedModel
    result = await generateImage(
      apiKey,
      baseUrl || 'https://api.openai.com/v1',
      normalizedModel,
      prompt
    )
  }

  if (result.success && result.imageBase64) {
    // Save image to media storage
    const mediaItem = await saveMediaImage({
      base64: result.imageBase64,
      prompt: prompt,
      revisedPrompt: result.revisedPrompt,
      model: modelForDisplay,
      sessionId,
      messageId: assistantMessageId,
    })
    console.log('[ImageStream] Image saved to media:', mediaItem.id)

    // Format the response
    let responseContent = ''
    if (result.revisedPrompt && result.revisedPrompt !== prompt) {
      responseContent += `**优化后的提示词:** ${result.revisedPrompt}\n\n`
    }
    // Use base64 data URL for displaying in message
    // Store mediaId in alt text for gallery lookup
    const imageDataUrl = `data:image/png;base64,${result.imageBase64}`
    responseContent += `![Generated Image|mediaId:${mediaItem.id}](${imageDataUrl})`

    // Update message
    updateMessageContent(sessionId, assistantMessageId, responseContent)
    updateMessageStreaming(sessionId, assistantMessageId, false)

    // Send complete content to frontend
    sender.send(IPC_CHANNELS.STREAM_CHUNK, {
      type: 'text',
      content: responseContent,
      messageId: assistantMessageId,
      sessionId,
      replace: true,
    })

    // Notify frontend about the generated image
    sender.send(IPC_CHANNELS.IMAGE_GENERATED, {
      id: mediaItem.id,
      mediaId: mediaItem.id,
      filePath: mediaItem.filePath,
      prompt: prompt,
      revisedPrompt: result.revisedPrompt,
      model: modelForDisplay,
      sessionId,
      messageId: assistantMessageId,
      createdAt: mediaItem.createdAt,
    })

    // Send stream complete
    sender.send(IPC_CHANNELS.STREAM_COMPLETE, {
      messageId: assistantMessageId,
      sessionId,
      sessionName,
    })

    console.log('[ImageStream] Image generation complete')
    return true
  } else {
    // Handle error
    const errorContent = `图片生成失败: ${result.error || '未知错误'}`
    updateMessageContent(sessionId, assistantMessageId, errorContent)
    updateMessageStreaming(sessionId, assistantMessageId, false)

    sender.send(IPC_CHANNELS.STREAM_ERROR, {
      messageId: assistantMessageId,
      sessionId,
      error: result.error || 'Image generation failed',
    })

    return true // Still handled (as error)
  }
}
