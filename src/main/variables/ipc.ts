/**
 * IPC handlers for the variable subsystem (scalar variables).
 *
 * Three RPCs cover what the renderer needs; live updates piggyback on
 * the existing `session:variables-updated` EventBus channel.
 *
 * Project directories have their own RPCs in
 * `src/main/project-dirs/ipc.ts`.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  VariablesDeleteRequest,
  VariablesDeleteResponse,
  VariablesListRequest,
  VariablesListResponse,
  VariablesSetRequest,
  VariablesSetResponse,
} from '../../shared/ipc/variables.js'
import { getVariableRegistry } from './registry.js'
import { VariableError } from './types.js'

function toErrorPayload(err: unknown): { error: string; code: string } {
  if (err instanceof VariableError) {
    return { error: err.message, code: err.code }
  }
  return {
    error: err instanceof Error ? err.message : 'Unknown variable error',
    code: 'INTERNAL',
  }
}

export function registerVariableHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VARIABLES_LIST, async (
    _event,
    req: VariablesListRequest,
  ): Promise<VariablesListResponse> => {
    try {
      const variables = await getVariableRegistry().list({ sessionId: req.sessionId })
      return { success: true, variables }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VARIABLES_SET, async (
    _event,
    req: VariablesSetRequest,
  ): Promise<VariablesSetResponse> => {
    try {
      const variable = await getVariableRegistry().set(
        { sessionId: req.sessionId },
        { name: req.name, value: req.value, scope: req.scope, description: req.description },
      )
      return { success: true, variable }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.VARIABLES_DELETE, async (
    _event,
    req: VariablesDeleteRequest,
  ): Promise<VariablesDeleteResponse> => {
    try {
      await getVariableRegistry().delete({ sessionId: req.sessionId }, req.name, req.scope)
      return { success: true }
    } catch (err) {
      return { success: false, ...toErrorPayload(err) }
    }
  })

  console.log('[variables] IPC handlers registered (list/set/delete)')
}
