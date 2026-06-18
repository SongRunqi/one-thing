import type {
  ProviderConfig,
  ProviderEnvStatus,
  ProviderEnvVarCandidate,
} from '../../shared/ipc.js'

type ApiKeyConfig = Pick<ProviderConfig, 'apiKey'>

const DEFAULT_PROVIDER_API_KEY_ENV_VARS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  kimi: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  zhipu: ['ZHIPU_API_KEY', 'ZHIPUAI_API_KEY', 'ZAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'],
}

function normalizeEnvVarName(value: string | undefined): string | undefined {
  const name = value?.trim()
  if (!name) return undefined
  return name
}

function normalizeApiKey(value: string | undefined): string | undefined {
  const key = value?.trim()
  if (!key) return undefined
  return key
}

function providerIdToEnvPrefix(providerId: string): string | undefined {
  const normalized = providerId
    .trim()
    .replace(/^custom-/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return normalized || undefined
}

function dedupeEnvVars(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const name = normalizeEnvVarName(value)
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }

  return result
}

export function getProviderApiKeyEnvCandidates(
  providerId: string,
): string[] {
  const prefix = providerIdToEnvPrefix(providerId)
  return dedupeEnvVars([
    ...(DEFAULT_PROVIDER_API_KEY_ENV_VARS[providerId] ?? []),
    prefix ? `${prefix}_API_KEY` : undefined,
  ])
}

function readEnvApiKey(envVar: string | undefined): string | undefined {
  const name = normalizeEnvVarName(envVar)
  if (!name) return undefined
  return normalizeApiKey(process.env[name])
}

function findSetEnvVar(
  providerId: string,
): { envVar: string; apiKey: string } | undefined {
  for (const envVar of getProviderApiKeyEnvCandidates(providerId)) {
    const apiKey = readEnvApiKey(envVar)
    if (apiKey) return { envVar, apiKey }
  }
  return undefined
}

export function resolveProviderApiKey(
  providerId: string,
  config: ApiKeyConfig | undefined,
): string | null {
  const manualKey = normalizeApiKey(config?.apiKey)
  if (manualKey) return manualKey

  return findSetEnvVar(providerId)?.apiKey ?? null
}

export function withResolvedProviderApiKey<T extends ApiKeyConfig>(
  providerId: string,
  config: T,
): T {
  const apiKey = resolveProviderApiKey(providerId, config)
  return apiKey ? { ...config, apiKey } : config
}

export function getProviderEnvStatus(
  providerId: string,
): ProviderEnvStatus {
  const candidates: ProviderEnvVarCandidate[] = getProviderApiKeyEnvCandidates(providerId).map((name) => ({
    name,
    isSet: Boolean(readEnvApiKey(name)),
  }))
  const detectedEnvVar = candidates.find(candidate => candidate.isSet)?.name

  return {
    providerId,
    ...(detectedEnvVar ? { detectedEnvVar } : {}),
    ...(detectedEnvVar ? { resolvedEnvVar: detectedEnvVar } : {}),
    candidates,
  }
}
