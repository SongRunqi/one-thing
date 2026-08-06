import {
  ONETHING_QWEN_PROVIDER_ID,
  resolveOnethingQwenBaseUrl,
  type OnethingQwenEndpointConfig,
} from './qwen.js'

export type OnethingZhipuApiMode = 'standard' | 'coding-plan'

export const ONETHING_ZHIPU_STANDARD_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
export const ONETHING_ZHIPU_CODING_PLAN_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4'

export interface OnethingZhipuBaseUrlConfig {
  baseUrl?: string
  zhipuApiMode?: OnethingZhipuApiMode
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '')
}

function isKnownZhipuBaseUrl(value: string | undefined): boolean {
  const normalized = normalizeBaseUrl(value)
  return normalized === ONETHING_ZHIPU_STANDARD_BASE_URL ||
    normalized === ONETHING_ZHIPU_CODING_PLAN_BASE_URL
}

export function resolveOnethingZhipuBaseUrl(
  config: OnethingZhipuBaseUrlConfig | undefined,
): string {
  const baseUrl = normalizeBaseUrl(config?.baseUrl)
  const mode = config?.zhipuApiMode

  if (mode === 'coding-plan' && (!baseUrl || isKnownZhipuBaseUrl(baseUrl))) {
    return ONETHING_ZHIPU_CODING_PLAN_BASE_URL
  }
  if (mode === 'standard' && (!baseUrl || isKnownZhipuBaseUrl(baseUrl))) {
    return ONETHING_ZHIPU_STANDARD_BASE_URL
  }

  return baseUrl || ONETHING_ZHIPU_STANDARD_BASE_URL
}

export function resolveOnethingProviderBaseUrl(
  providerId: string,
  config: (OnethingZhipuBaseUrlConfig & OnethingQwenEndpointConfig) | undefined,
): string | undefined {
  if (providerId === 'zhipu') return resolveOnethingZhipuBaseUrl(config)
  if (providerId === ONETHING_QWEN_PROVIDER_ID) return resolveOnethingQwenBaseUrl(config)
  return normalizeBaseUrl(config?.baseUrl) || undefined
}
