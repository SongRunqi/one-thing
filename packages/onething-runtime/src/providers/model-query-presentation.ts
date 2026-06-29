type MaybePromise<T> = T | Promise<T>

export interface OnethingModelQueryIpcLogger {
  error?: (...args: unknown[]) => void
}

export interface GetAllOnethingModelRegistryModelsOptions<TModel = unknown> {
  getAllModels(): MaybePromise<TModel[]>
}

export interface OnethingModelRegistryModelsResult<TModel = unknown> {
  success: true
  models: TModel[]
}

export async function getAllOnethingModelRegistryModels<TModel = unknown>(
  options: GetAllOnethingModelRegistryModelsOptions<TModel>,
): Promise<OnethingModelRegistryModelsResult<TModel>> {
  return {
    success: true,
    models: await options.getAllModels(),
  }
}

export async function getAllOnethingModelRegistryModelsForIpc<TModel = unknown>(
  options: GetAllOnethingModelRegistryModelsOptions<TModel> & { logger?: OnethingModelQueryIpcLogger },
): Promise<OnethingModelRegistryModelsResult<TModel> | { success: false; error: string }> {
  try {
    return await getAllOnethingModelRegistryModels(options)
  } catch (error) {
    return modelQueryIpcError(options.logger, 'get all models', error)
  }
}

export interface SearchOnethingModelRegistryOptions<TModel = unknown> {
  query: string
  providerId?: string
  searchModels(query: string, providerId?: string): MaybePromise<TModel[]>
}

export async function searchOnethingModelRegistry<TModel = unknown>(
  options: SearchOnethingModelRegistryOptions<TModel>,
): Promise<OnethingModelRegistryModelsResult<TModel>> {
  return {
    success: true,
    models: await options.searchModels(options.query, options.providerId),
  }
}

export async function searchOnethingModelRegistryForIpc<TModel = unknown>(
  options: SearchOnethingModelRegistryOptions<TModel> & { logger?: OnethingModelQueryIpcLogger },
): Promise<OnethingModelRegistryModelsResult<TModel> | { success: false; error: string }> {
  try {
    return await searchOnethingModelRegistry(options)
  } catch (error) {
    return modelQueryIpcError(options.logger, 'search models', error)
  }
}

export interface RefreshOnethingModelRegistryOptions {
  forceRefresh(): MaybePromise<unknown>
}

export interface RefreshOnethingModelRegistryResult {
  success: true
}

export async function refreshOnethingModelRegistry(
  options: RefreshOnethingModelRegistryOptions,
): Promise<RefreshOnethingModelRegistryResult> {
  await options.forceRefresh()
  return { success: true }
}

export async function refreshOnethingModelRegistryForIpc(
  options: RefreshOnethingModelRegistryOptions & { logger?: OnethingModelQueryIpcLogger },
): Promise<RefreshOnethingModelRegistryResult | { success: false; error: string }> {
  try {
    return await refreshOnethingModelRegistry(options)
  } catch (error) {
    return modelQueryIpcError(options.logger, 'refresh model registry', error)
  }
}

export interface GetOnethingModelRegistryNameAliasesOptions {
  getModelNameAliases(): Record<string, string>
}

export interface GetOnethingModelRegistryNameAliasesResult {
  success: true
  aliases: Record<string, string>
}

export function getOnethingModelRegistryNameAliases(
  options: GetOnethingModelRegistryNameAliasesOptions,
): GetOnethingModelRegistryNameAliasesResult {
  return {
    success: true,
    aliases: options.getModelNameAliases(),
  }
}

export function getOnethingModelRegistryNameAliasesForIpc(
  options: GetOnethingModelRegistryNameAliasesOptions & { logger?: OnethingModelQueryIpcLogger },
): GetOnethingModelRegistryNameAliasesResult | { success: false; error: string } {
  try {
    return getOnethingModelRegistryNameAliases(options)
  } catch (error) {
    return modelQueryIpcError(options.logger, 'get model name aliases', error)
  }
}

export interface GetOnethingModelRegistryDisplayNameOptions {
  modelId: string
  getModelDisplayName(modelId: string): string
}

export interface GetOnethingModelRegistryDisplayNameResult {
  success: true
  displayName: string
}

export function getOnethingModelRegistryDisplayName(
  options: GetOnethingModelRegistryDisplayNameOptions,
): GetOnethingModelRegistryDisplayNameResult {
  return {
    success: true,
    displayName: options.getModelDisplayName(options.modelId),
  }
}

export function getOnethingModelRegistryDisplayNameForIpc(
  options: GetOnethingModelRegistryDisplayNameOptions & { logger?: OnethingModelQueryIpcLogger },
): GetOnethingModelRegistryDisplayNameResult | { success: false; error: string } {
  try {
    return getOnethingModelRegistryDisplayName(options)
  } catch (error) {
    return modelQueryIpcError(options.logger, 'get model display name', error)
  }
}

function modelQueryIpcError(
  logger: OnethingModelQueryIpcLogger | undefined,
  label: string,
  error: unknown,
): { success: false; error: string } {
  logger?.error?.(`[Models] Failed to ${label}:`, error)
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }
}
