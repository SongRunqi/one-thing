/**
 * IPC Router Registration Helper (Main Process)
 *
 * Provides registerRouter() to automatically register ipcMain.handle
 * handlers for all methods defined in a domain router.
 */

import { ipcMain } from 'electron'
import type { Router, DomainRoutes, RouteHandlers } from '../../shared/ipc/router.js'

/**
 * Register all handlers for a domain router.
 *
 * Automatically maps each router method to an ipcMain.handle() call
 * using the auto-generated channel names.
 *
 * @param router - The domain router definition
 * @param handlers - Object implementing all route handlers
 *
 * @example
 * ```ts
 * registerRouter(memoryFeedbackRouter, {
 *   record: async (req) => {
 *     await recordMemoryFeedback(req.filePath, req.feedbackType)
 *     return { success: true }
 *   },
 *   getStats: async (req) => {
 *     const stats = await getMemoryFeedbackStats(req.filePath)
 *     return { success: true, stats }
 *   },
 * })
 * ```
 */
export function registerRouter<T extends DomainRoutes>(
  router: Router<T>,
  handlers: RouteHandlers<T>
): void {
  for (const method of router.methods) {
    const channel = router.channels[method]
    const handler = handlers[method]
    ipcMain.handle(channel, async (_event, input) => {
      return handler(input)
    })
  }
  console.log(`[IPC] Router registered: ${router.domain} (${router.methods.length} methods)`)
}
