type MaybePromise<T> = T | Promise<T>

export interface OnethingMediaIpcLogger {
  error?: (...args: unknown[]) => void
}

export interface ListOnethingMediaAssetsOptions<TQuery = unknown, TAsset = unknown> {
  query: TQuery
  listAssets(query: TQuery): MaybePromise<TAsset[]>
}

export async function listOnethingMediaAssets<TQuery = unknown, TAsset = unknown>(
  options: ListOnethingMediaAssetsOptions<TQuery, TAsset>,
): Promise<TAsset[]> {
  return await options.listAssets(options.query)
}

export interface HideOnethingMediaAssetOptions {
  id: string
  hideAsset(id: string): MaybePromise<boolean>
}

export interface HideOnethingMediaAssetResult {
  success: boolean
}

export async function hideOnethingMediaAsset(
  options: HideOnethingMediaAssetOptions,
): Promise<HideOnethingMediaAssetResult> {
  return {
    success: await options.hideAsset(options.id),
  }
}

export interface RebuildOnethingMediaLibraryOptions<TSession = unknown> {
  sessions: TSession[]
  rebuildFromSessions(sessions: TSession[]): MaybePromise<{ added: number; skipped: number }>
}

export interface RebuildOnethingMediaLibraryResult {
  success: true
  added: number
  skipped: number
}

export async function rebuildOnethingMediaLibrary<TSession = unknown>(
  options: RebuildOnethingMediaLibraryOptions<TSession>,
): Promise<RebuildOnethingMediaLibraryResult> {
  const result = await options.rebuildFromSessions(options.sessions)
  return {
    success: true,
    ...result,
  }
}

export async function rebuildOnethingMediaLibraryForIpc<TSession = unknown>(
  options: {
    listSessions(): MaybePromise<TSession[]>
    rebuildFromSessions(sessions: TSession[]): MaybePromise<{ added: number; skipped: number }>
    logger?: OnethingMediaIpcLogger
  },
): Promise<RebuildOnethingMediaLibraryResult | {
  success: false
  added: number
  skipped: number
  error: string
}> {
  try {
    return await rebuildOnethingMediaLibrary({
      sessions: await options.listSessions(),
      rebuildFromSessions: options.rebuildFromSessions,
    })
  } catch (error) {
    options.logger?.error?.('[Media IPC] Failed to rebuild media library:', error)
    return {
      success: false,
      added: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export interface GetOnethingMediaGalleryOptions<TQuery = unknown, TAsset = unknown> {
  assetId: string
  query: TQuery
  getGallery(assetId: string, query: TQuery): MaybePromise<{ images: TAsset[]; currentIndex: number }>
}

export async function getOnethingMediaGallery<TQuery = unknown, TAsset = unknown>(
  options: GetOnethingMediaGalleryOptions<TQuery, TAsset>,
): Promise<{ images: TAsset[]; currentIndex: number }> {
  return await options.getGallery(options.assetId, options.query)
}

export interface ListOnethingLegacyMediaImagesOptions<TMediaItem = unknown> {
  listLegacyImages(): MaybePromise<TMediaItem[]>
}

export async function listOnethingLegacyMediaImages<TMediaItem = unknown>(
  options: ListOnethingLegacyMediaImagesOptions<TMediaItem>,
): Promise<TMediaItem[]> {
  return await options.listLegacyImages()
}

export interface DeleteOnethingMediaItemOptions {
  id: string
  hideAsset(id: string): MaybePromise<boolean>
}

export async function deleteOnethingMediaItem(
  options: DeleteOnethingMediaItemOptions,
): Promise<boolean> {
  return await options.hideAsset(options.id)
}

export interface ClearOnethingMediaLibraryOptions {
  hideAllAssets(): MaybePromise<void>
}

export async function clearOnethingMediaLibrary(
  options: ClearOnethingMediaLibraryOptions,
): Promise<void> {
  await options.hideAllAssets()
}
