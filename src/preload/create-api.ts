/**
 * IPC Router API Factory (Preload)
 *
 * Provides createRouterAPI() to automatically generate typed
 * ipcRenderer.invoke() wrappers for all methods in a domain router.
 */

import { ipcRenderer } from 'electron'
import type { Router, DomainRoutes, RouteAPI } from '../shared/ipc/router.js'

/**
 * Create a typed API object for a domain router.
 *
 * Automatically generates ipcRenderer.invoke() wrappers for each
 * method using the auto-generated channel names.
 *
 * @param router - The domain router definition
 * @returns Object with typed methods that invoke the corresponding IPC channels
 *
 * @example
 * ```ts
 * const memoryFeedback = createRouterAPI(memoryFeedbackRouter)
 * // memoryFeedback.record({ filePath, feedbackType }) => Promise<RecordFeedbackResponse>
 * // memoryFeedback.getStats({ filePath }) => Promise<GetFeedbackStatsResponse>
 * ```
 */
export function createRouterAPI<T extends DomainRoutes>(
  router: Router<T>
): RouteAPI<T> {
  const api = {} as Record<string, (input: unknown) => Promise<unknown>>
  for (const method of router.methods) {
    const channel = router.channels[method]
    api[method] = (input: unknown) => ipcRenderer.invoke(channel, input)
  }
  return api as RouteAPI<T>
}
