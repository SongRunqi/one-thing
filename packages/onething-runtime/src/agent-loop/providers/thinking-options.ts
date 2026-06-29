export interface OnethingAgentLoopThinkingProviderConfig {
  model: string
  thinkingByModel?: Record<string, boolean | undefined>
  thinkingEffortByModel?: Record<string, unknown>
}

export interface OnethingAgentLoopThinkingContext {
  providerId: string
  providerConfig: OnethingAgentLoopThinkingProviderConfig
}

export function normalizeDeepSeekReasoningEffort(value: unknown): 'high' | 'max' | undefined {
  return value === 'max' ? 'max' : value === 'high' ? 'high' : undefined
}

export function getOnethingAgentLoopThinkingOptions(ctx: OnethingAgentLoopThinkingContext): {
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: 'high' | 'max'
} {
  if (ctx.providerId !== 'deepseek') return {}
  const model = ctx.providerConfig.model
  const enabled = ctx.providerConfig.thinkingByModel?.[model]
  if (enabled === false) return { thinking: 'disabled' }
  if (enabled !== true) return {}

  return {
    thinking: 'enabled',
    reasoningEffort: normalizeDeepSeekReasoningEffort(ctx.providerConfig.thinkingEffortByModel?.[model]) ?? 'high',
  }
}
