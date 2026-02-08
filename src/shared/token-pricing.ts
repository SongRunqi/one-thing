/**
 * Token Pricing Configuration
 * Pricing data for mainstream AI models (per 1M tokens)
 */

export interface ModelPricing {
  inputPricePerM: number  // Input token price per 1M tokens (USD)
  outputPricePerM: number // Output token price per 1M tokens (USD)
}

// Model pricing database (prices as of 2026-02)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude models
  'claude-opus-4.5': { inputPricePerM: 15, outputPricePerM: 75 },
  'claude-sonnet-4.5': { inputPricePerM: 3, outputPricePerM: 15 },
  'claude-sonnet-4': { inputPricePerM: 3, outputPricePerM: 15 },
  'claude-haiku-4': { inputPricePerM: 0.25, outputPricePerM: 1.25 },
  'claude-3.5-sonnet': { inputPricePerM: 3, outputPricePerM: 15 },
  'claude-3-opus': { inputPricePerM: 15, outputPricePerM: 75 },
  'claude-3-sonnet': { inputPricePerM: 3, outputPricePerM: 15 },
  'claude-3-haiku': { inputPricePerM: 0.25, outputPricePerM: 1.25 },

  // OpenAI models
  'gpt-4o': { inputPricePerM: 2.5, outputPricePerM: 10 },
  'gpt-4o-mini': { inputPricePerM: 0.15, outputPricePerM: 0.6 },
  'gpt-4-turbo': { inputPricePerM: 10, outputPricePerM: 30 },
  'gpt-4': { inputPricePerM: 30, outputPricePerM: 60 },
  'gpt-3.5-turbo': { inputPricePerM: 0.5, outputPricePerM: 1.5 },
  'o1': { inputPricePerM: 15, outputPricePerM: 60 },
  'o1-mini': { inputPricePerM: 3, outputPricePerM: 12 },

  // DeepSeek models
  'deepseek-chat': { inputPricePerM: 0.14, outputPricePerM: 0.28 },
  'deepseek-reasoner': { inputPricePerM: 0.55, outputPricePerM: 2.19 },

  // Gemini models
  'gemini-2.0-flash': { inputPricePerM: 0.3, outputPricePerM: 1.2 },
  'gemini-1.5-pro': { inputPricePerM: 1.25, outputPricePerM: 5 },
  'gemini-1.5-flash': { inputPricePerM: 0.075, outputPricePerM: 0.3 },
}

/**
 * Calculate estimated cost for token usage
 * @param model Model identifier (e.g., 'claude-opus-4.5', 'gpt-4o')
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @returns Estimated cost in USD, or null if model pricing is not found
 */
export function calculateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number | null {
  if (!model) return null

  // Normalize model name (handle provider prefixes like 'anthropic/', 'openai/')
  const normalizedModel = model.toLowerCase()
    .replace(/^(anthropic|openai|google|deepseek)\//, '')
    .trim()

  const pricing = MODEL_PRICING[normalizedModel]
  if (!pricing) {
    // Model not found in pricing database
    return null
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerM
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerM

  return inputCost + outputCost
}

/**
 * Format token count with K/M suffix
 * @param tokens Token count
 * @returns Formatted string (e.g., '1.2K', '12.5M')
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString()
  } else if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}K`.replace('.0K', 'K')
  } else {
    return `${(tokens / 1_000_000).toFixed(1)}M`.replace('.0M', 'M')
  }
}

/**
 * Format cost in USD
 * @param cost Cost in USD
 * @returns Formatted string (e.g., '$0.01', '$1.23')
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '<$0.01'
  }
  return `$${cost.toFixed(2)}`
}
