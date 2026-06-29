type MaybePromise<T> = T | Promise<T>

export interface OnethingToolRefreshIpcLogger {
  error?: (...args: unknown[]) => void
}

export interface OnethingAsyncToolRefreshContext {
  workingDirectory?: string
}

export interface RefreshOnethingAsyncToolsOptions {
  workingDirectory?: string
  setInitContext(context: OnethingAsyncToolRefreshContext): MaybePromise<unknown>
  initializeAsyncTools(): MaybePromise<unknown>
}

export interface RefreshOnethingAsyncToolsResult {
  success: true
}

export async function refreshOnethingAsyncTools(
  options: RefreshOnethingAsyncToolsOptions,
): Promise<RefreshOnethingAsyncToolsResult> {
  await options.setInitContext({
    workingDirectory: options.workingDirectory,
  })
  await options.initializeAsyncTools()
  return { success: true }
}

export async function refreshOnethingAsyncToolsForIpc(
  options: RefreshOnethingAsyncToolsOptions & { logger?: OnethingToolRefreshIpcLogger },
): Promise<RefreshOnethingAsyncToolsResult | { success: false; error: string }> {
  try {
    return await refreshOnethingAsyncTools(options)
  } catch (error) {
    options.logger?.error?.('[Tools IPC] Error refreshing async tools:', error)
    return {
      success: false,
      error: error instanceof Error && error.message ? error.message : 'Failed to refresh async tools',
    }
  }
}
