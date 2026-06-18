import type { AppSettings, OpenRouterModel, ProviderInfo } from '@/types'

export interface SessionModelLike {
  lastProvider?: string
  lastModel?: string
}

interface ResolveProviderModelOptions {
  settings?: AppSettings | null
  session?: SessionModelLike | null
  providers?: ProviderInfo[]
  getCachedModels?: (providerId: string) => OpenRouterModel[]
}

interface ResolvedProviderModel {
  providerId: string
  model: string
}

export function resolveProviderModelSelection({
  settings,
  session,
  providers = [],
  getCachedModels,
}: ResolveProviderModelOptions): ResolvedProviderModel {
  const globalProviderId = settings?.ai?.provider || ''
  const globalModel = globalProviderId
    ? settings?.ai?.providers?.[globalProviderId]?.model || ''
    : ''
  const sessionProviderId = session?.lastProvider || ''
  const sessionModel = session?.lastModel || ''

  if (sessionProviderId && sessionModel) {
    if (providerHasModel(settings, providers, getCachedModels, sessionProviderId, sessionModel)) {
      return { providerId: sessionProviderId, model: sessionModel }
    }

    const inferredProviderId = findProviderForModel(settings, providers, getCachedModels, sessionModel, globalProviderId)
    if (inferredProviderId) {
      return { providerId: inferredProviderId, model: sessionModel }
    }

    return { providerId: sessionProviderId, model: sessionModel }
  }

  if (sessionProviderId) {
    const providerModel = settings?.ai?.providers?.[sessionProviderId]?.model || ''
    if (providerModel) {
      return { providerId: sessionProviderId, model: providerModel }
    }
  }

  if (sessionModel) {
    const inferredProviderId = findProviderForModel(settings, providers, getCachedModels, sessionModel, globalProviderId)
    if (inferredProviderId) {
      return { providerId: inferredProviderId, model: sessionModel }
    }
  }

  return { providerId: globalProviderId, model: globalModel }
}

function findProviderForModel(
  settings: AppSettings | null | undefined,
  providers: ProviderInfo[],
  getCachedModels: ((providerId: string) => OpenRouterModel[]) | undefined,
  modelId: string,
  preferredProviderId = '',
): string {
  for (const providerId of providerCandidates(settings, providers, preferredProviderId)) {
    if (providerHasModel(settings, providers, getCachedModels, providerId, modelId)) {
      return providerId
    }
  }
  return ''
}

function providerCandidates(
  settings: AppSettings | null | undefined,
  providers: ProviderInfo[],
  preferredProviderId: string,
): string[] {
  const seen = new Set<string>()
  const ids: string[] = []

  const add = (id?: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  add(preferredProviderId)
  add(settings?.ai?.provider)
  for (const provider of providers) add(provider.id)
  for (const id of Object.keys(settings?.ai?.providers || {})) add(id)

  return ids
}

function providerHasModel(
  settings: AppSettings | null | undefined,
  providers: ProviderInfo[],
  getCachedModels: ((providerId: string) => OpenRouterModel[]) | undefined,
  providerId: string,
  modelId: string,
): boolean {
  const config = settings?.ai?.providers?.[providerId]
  if (config?.model === modelId) return true
  if (config?.selectedModels?.includes(modelId)) return true
  if (config?.models && Object.prototype.hasOwnProperty.call(config.models, modelId)) return true

  const provider = providers.find(item => item.id === providerId)
  if (provider?.defaultModel === modelId) return true
  if (provider?.models?.some(model => model.id === modelId)) return true

  return getCachedModels?.(providerId)?.some(model => model.id === modelId) || false
}
