import type { AIProvider, CachedModels } from '../../shared/ipc.js'
import { getModelsCachePath, readJsonFile, writeJsonFile } from './paths.js'

type ModelsCache = Record<string, CachedModels>

export function getModelsCache(): ModelsCache {
  return readJsonFile(getModelsCachePath(), {})
}

export function getCachedModels(provider: AIProvider): CachedModels | undefined {
  const cache = getModelsCache()
  return cache[provider]
}

export function setCachedModels(provider: AIProvider, models: CachedModels['models']): void {
  const cache = getModelsCache()
  cache[provider] = {
    provider,
    models,
    cachedAt: Date.now(),
  }
  writeJsonFile(getModelsCachePath(), cache)
}

export function clearModelsCache(provider?: AIProvider): void {
  if (provider) {
    const cache = getModelsCache()
    delete cache[provider]
    writeJsonFile(getModelsCachePath(), cache)
  } else {
    writeJsonFile(getModelsCachePath(), {})
  }
}
