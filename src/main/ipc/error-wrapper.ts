/**
 * IPC Error Wrapper
 * REQ-007: High-order function to wrap IPC handlers with unified error handling
 *
 * Usage:
 *   ipcMain.handle('channel', wrapIPCHandler(async (_event, args) => {
 *     // handler logic
 *     return { success: true, data: result }
 *   }))
 */

import { classifyError, type AppError } from '../../shared/errors.js'

/**
 * Standard IPC error response format.
 * Backward-compatible: `success` and `error` fields match existing patterns.
 */
export interface IPCErrorResponse {
  success: false
  error: string              // 用户友好消息
  errorDetails?: string      // 技术细节（调试用）
  errorCategory?: string     // ErrorCategory value
  retryable?: boolean
}

/**
 * Wraps an IPC handler function with unified error classification.
 *
 * If the handler throws, the error is caught, classified via `classifyError`,
 * and returned as a standard `IPCErrorResponse`.
 *
 * The handler's own return value is passed through untouched — this wrapper
 * only intercepts uncaught exceptions.
 */
export function wrapIPCHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T
): (...args: Parameters<T>) => Promise<ReturnType<T> | IPCErrorResponse> {
  return async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      const appError: AppError = classifyError(error)
      console.error(`[IPC][${appError.category}] ${appError.technicalDetail}`)
      return {
        success: false as const,
        error: appError.message,
        errorDetails: appError.technicalDetail,
        errorCategory: appError.category,
        retryable: appError.retryable,
      }
    }
  }
}
