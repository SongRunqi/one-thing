/**
 * Google Gemini Provider Definition
 *
 * Uses the official @ai-sdk/google package.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import type { ProviderDefinition } from '../types.js'

const geminiProvider: ProviderDefinition = {
  id: 'gemini',

  info: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.0, Gemini 1.5 Pro/Flash and other Google AI models',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash-exp',
    icon: 'gemini',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
    // Models fetched dynamically from OpenRouter API
  },

  create: ({ apiKey, baseUrl }) => {
    const provider = createGoogleGenerativeAI({
      apiKey,
      baseURL: baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    })
    return {
      createModel: (modelId: string) => provider(modelId) as unknown as LanguageModel,
    }
  },
}

export default geminiProvider
