export interface OnethingAgentLoopThinkingProviderConfig {
  model: string
  thinkingByModel?: Record<string, boolean | undefined>
  thinkingEffortByModel?: Record<string, unknown>
}

export interface OnethingAgentLoopThinkingContext {
  providerId: string
  providerConfig: OnethingAgentLoopThinkingProviderConfig
}

export type OnethingAgentLoopReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export interface OnethingAgentLoopThinkingOptions {
  thinking?: 'enabled' | 'disabled'
  reasoningEffort?: OnethingAgentLoopReasoningEffort
}

const EFFORT_VALUES: readonly OnethingAgentLoopReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

export function normalizeAgentLoopReasoningEffort(
  value: unknown,
): OnethingAgentLoopReasoningEffort | undefined {
  return EFFORT_VALUES.includes(value as OnethingAgentLoopReasoningEffort)
    ? (value as OnethingAgentLoopReasoningEffort)
    : undefined
}

export function normalizeDeepSeekReasoningEffort(value: unknown): 'high' | 'max' | undefined {
  return value === 'max' ? 'max' : value === 'high' ? 'high' : undefined
}

// Kimi thinking-model families (https://platform.kimi.com/docs/guide/use-kimi-k2-thinking-model):
// - kimi-k3: always thinks; configured via OpenAI-compatible reasoning_effort ("max" is
//   the only accepted value); thinking.type is not supported.
// - kimi-k2.7-code (+ -highspeed) and kimi-k2-thinking: always think; the thinking
//   param must not be sent to disable them, so send nothing.
// - kimi-k2.5 / kimi-k2.6: thinking on by default, toggleable via thinking.type.
function isKimiAlwaysThinkingModel(model: string): boolean {
  return model.includes('code') || model.includes('thinking')
}

function getKimiThinkingOptions(
  config: OnethingAgentLoopThinkingProviderConfig,
): OnethingAgentLoopThinkingOptions {
  const model = config.model.toLowerCase()
  if (model.startsWith('kimi-k3')) {
    // K3 always reasons server-side; the toggle only controls whether we
    // explicitly declare the (sole) "max" effort.
    if (config.thinkingByModel?.[config.model] === false) return {}
    return { reasoningEffort: 'max' }
  }
  if (isKimiAlwaysThinkingModel(model)) return {}
  const enabled = config.thinkingByModel?.[config.model]
  if (enabled === false) return { thinking: 'disabled' }
  if (enabled === true) return { thinking: 'enabled' }
  return {}
}

function getDeepSeekThinkingOptions(
  config: OnethingAgentLoopThinkingProviderConfig,
): OnethingAgentLoopThinkingOptions {
  const model = config.model
  const enabled = config.thinkingByModel?.[model]
  if (enabled === false) return { thinking: 'disabled' }
  if (enabled !== true) return {}
  return {
    thinking: 'enabled',
    reasoningEffort:
      normalizeDeepSeekReasoningEffort(config.thinkingEffortByModel?.[model]) ?? 'high',
  }
}

/**
 * Generic user-intent resolution: `thinkingByModel` decides on/off,
 * `thinkingEffortByModel` carries the abstract effort. The provider request
 * builders own the wire format (Anthropic thinking/output_config, OpenAI
 * reasoning_effort, Gemini thinkingConfig, …) and only emit parameters their
 * API accepts, so an unset toggle never changes the request.
 */
function getGenericThinkingOptions(
  config: OnethingAgentLoopThinkingProviderConfig,
): OnethingAgentLoopThinkingOptions {
  const model = config.model
  const enabled = config.thinkingByModel?.[model]
  if (enabled === false) return { thinking: 'disabled' }
  if (enabled !== true) return {}
  return {
    thinking: 'enabled',
    reasoningEffort: normalizeAgentLoopReasoningEffort(config.thinkingEffortByModel?.[model]),
  }
}

export function getOnethingAgentLoopThinkingOptions(
  ctx: OnethingAgentLoopThinkingContext,
): OnethingAgentLoopThinkingOptions {
  if (ctx.providerId === 'kimi') return getKimiThinkingOptions(ctx.providerConfig)
  if (ctx.providerId === 'deepseek') return getDeepSeekThinkingOptions(ctx.providerConfig)
  return getGenericThinkingOptions(ctx.providerConfig)
}
