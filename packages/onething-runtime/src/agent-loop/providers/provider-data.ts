import type { AgentProviderData } from '@onething/core/agent-loop'
import {
  appendOrderedPart,
  type ApplyAgentLoopProviderDataRuntimeOptions,
  type CoreHistoryContentPart,
  type CoreOrderedPartLike,
} from '@onething/core/engine'

type MaybePromise<T> = T | Promise<T>

export interface OnethingGeneratedImageMediaItem {
  id: string
  filePath: string
  prompt: string
  revisedPrompt?: string
  model: string
  createdAt: number
}

export interface OnethingGeneratedImageNotification extends OnethingGeneratedImageMediaItem {
  mediaId: string
  sessionId: string
  messageId: string
}

export interface ApplyOnethingAgentLoopProviderDataOptions<TContentPart extends CoreOrderedPartLike>
  extends ApplyAgentLoopProviderDataRuntimeOptions<TContentPart> {
  saveMediaImage(input: {
    base64: string
    prompt: string
    revisedPrompt?: string
    model: string
    sessionId: string
    messageId: string
  }): MaybePromise<OnethingGeneratedImageMediaItem>
  notifyImageGenerated?(notification: OnethingGeneratedImageNotification): MaybePromise<void>
}

export function providerDataFromOnethingContentPart(part: CoreHistoryContentPart): AgentProviderData | undefined {
  if (part.providerData) return part.providerData

  if (
    part.provider === 'codex' &&
    typeof part.encryptedReasoning === 'string' &&
    part.encryptedReasoning.length > 0
  ) {
    return {
      provider: 'codex',
      type: 'encrypted-reasoning',
      encryptedContent: part.encryptedReasoning,
    }
  }

  return undefined
}

export function buildOnethingGeneratedImageMarkdown(mediaId: string, revisedPrompt?: string): string {
  const imageUrl = `media://${mediaId}.png`
  const promptText = revisedPrompt?.trim()
  return `${promptText ? `**Revised prompt:** ${promptText}\n\n` : ''}![Generated Image|mediaId:${mediaId}](${imageUrl})`
}

export function buildOnethingGeneratedImageTextDelta(
  currentContent: string,
  mediaId: string,
  revisedPrompt?: string,
): string {
  const markdown = buildOnethingGeneratedImageMarkdown(mediaId, revisedPrompt)
  const prefix = currentContent && !currentContent.endsWith('\n') ? '\n\n' : ''
  return `${prefix}${markdown}`
}

export async function applyOnethingAgentLoopProviderData<TContentPart extends CoreOrderedPartLike>(
  options: ApplyOnethingAgentLoopProviderDataOptions<TContentPart>,
): Promise<boolean | undefined> {
  const providerData = options.providerData
  if (providerData.provider !== 'codex') return undefined

  if (
    providerData.type === 'encrypted-reasoning' &&
    typeof providerData.encryptedContent === 'string' &&
    providerData.encryptedContent.length > 0
  ) {
    appendOrderedPart(options.orderedParts, {
      type: 'provider-data',
      providerData,
      turnIndex: options.turnIndex,
    } as unknown as TContentPart)
    return true
  }

  if (providerData.type === 'image-generation-start') {
    options.emitter.sendContentPart({
      type: 'image-loading',
      turnIndex: options.turnIndex,
      label: 'Generating image',
    } as unknown as TContentPart)
    return true
  }

  if (
    providerData.type === 'image-generation-result' &&
    typeof providerData.result === 'string' &&
    providerData.result.length > 0
  ) {
    const mediaItem = await options.saveMediaImage({
      base64: providerData.result,
      prompt: options.latestUserPrompt?.trim() || 'Image generation',
      revisedPrompt: typeof providerData.revisedPrompt === 'string' ? providerData.revisedPrompt : undefined,
      model: options.model,
      sessionId: options.sessionId,
      messageId: options.messageId,
    })

    const displayContent = options.handleTextChunk(
      buildOnethingGeneratedImageTextDelta(
        options.content.value,
        mediaItem.id,
        mediaItem.revisedPrompt,
      ),
      options.content,
      options.turnIndex,
    )
    if (displayContent) {
      appendOrderedPart(options.orderedParts, {
        type: 'text',
        content: displayContent,
        turnIndex: options.turnIndex,
      } as TContentPart)
    }

    await options.notifyImageGenerated?.({
      id: mediaItem.id,
      mediaId: mediaItem.id,
      filePath: mediaItem.filePath,
      prompt: mediaItem.prompt,
      revisedPrompt: mediaItem.revisedPrompt,
      model: mediaItem.model,
      sessionId: options.sessionId,
      messageId: options.messageId,
      createdAt: mediaItem.createdAt,
    })

    return true
  }

  return false
}
