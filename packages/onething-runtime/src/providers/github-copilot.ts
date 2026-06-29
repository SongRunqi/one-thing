import { toJsonObject, type JsonValue } from '@onething/core'

export interface OnethingModelInfo {
  id: string
  name: string
  description?: string
  type?: 'chat' | 'image' | 'embedding' | 'audio' | 'tts' | 'other'
}

export interface OnethingCopilotModelCapabilities {
  hasVision: boolean
  hasImageGeneration: boolean
  hasTools: boolean
  hasReasoning: boolean
  contextLength: number
}

export function modelInfoFromCopilotEntry(entry: JsonValue): OnethingModelInfo | null {
  const record = toJsonObject(entry)
  const id = record.id
  if (typeof id !== 'string' || !id) return null
  const description = record.description
  return {
    id,
    name: id,
    description: typeof description === 'string' ? description : getCopilotModelDescription(id),
    type: 'chat',
  }
}

export function getCopilotModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'gpt-4o': 'Most capable OpenAI model',
    'gpt-4o-mini': 'Fast and affordable',
    'gpt-4.1': 'Latest GPT-4 update',
    'gpt-4-turbo': 'GPT-4 Turbo with vision',
    'o1': 'Deep reasoning model',
    'o1-mini': 'Reasoning, cost-effective',
    'o1-preview': 'Reasoning preview',
    'o3': 'Advanced reasoning',
    'o3-mini': 'Advanced reasoning, fast',
    'o4-mini': 'Latest reasoning, fast',
    'claude-3.5-sonnet': 'Anthropic Claude 3.5 Sonnet',
    'claude-3.7-sonnet': 'Anthropic Claude 3.7 Sonnet',
    'claude-sonnet-4': 'Anthropic Claude Sonnet 4',
    'gemini-1.5-pro': 'Google Gemini 1.5 Pro',
    'gemini-2.0-flash': 'Google Gemini 2.0 Flash',
    'gemini-2.0-flash-001': 'Google Gemini 2.0 Flash',
  }
  return descriptions[modelId] || 'GitHub Copilot model'
}

export function detectCopilotModelCapabilities(modelId: string): OnethingCopilotModelCapabilities {
  const id = modelId.toLowerCase()

  const visionModels = [
    'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4.1',
    'claude-3', 'claude-3.5', 'claude-3.7', 'claude-sonnet-4', 'claude-opus',
    'gemini-1.5', 'gemini-2', 'gemini-pro-vision',
  ]
  const hasVision = visionModels.some(value => id.includes(value.toLowerCase()))

  const imageGenModels = ['dall-e', 'dalle', 'gpt-image', 'imagen']
  const hasImageGeneration = imageGenModels.some(value => id.includes(value.toLowerCase()))

  const noToolsModels = ['o1-preview', 'o1-mini']
  const hasTools = !noToolsModels.some(value => id.includes(value.toLowerCase())) &&
    !hasImageGeneration

  const reasoningIndicators = ['o1', 'o3', 'o4', 'deepseek-r1', 'reasoner']
  const hasReasoning = reasoningIndicators.some(value => id.includes(value.toLowerCase()))

  let contextLength = 128000
  if (id.includes('gpt-4o')) contextLength = 128000
  else if (id.includes('gpt-4-turbo')) contextLength = 128000
  else if (id.includes('gpt-4.1')) contextLength = 1000000
  else if (id.includes('claude-3.5') || id.includes('claude-3.7')) contextLength = 200000
  else if (id.includes('claude-sonnet-4') || id.includes('claude-opus')) contextLength = 200000
  else if (id.includes('gemini-1.5-pro')) contextLength = 2000000
  else if (id.includes('gemini-2')) contextLength = 1000000
  else if (id.includes('o1') || id.includes('o3')) contextLength = 200000

  return {
    hasVision,
    hasImageGeneration,
    hasTools,
    hasReasoning,
    contextLength,
  }
}
