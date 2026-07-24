/**
 * Variable subsystem IPC types — scalar variables only.
 *
 * Three RPCs:
 *   - VARIABLES_LIST   : pull a snapshot for a session
 *   - VARIABLES_SET    : set a variable (workdir or custom)
 *   - VARIABLES_DELETE : delete a custom variable
 *
 * Project directories live in their own module — see
 * `ipc/project-dirs.ts`.
 *
 * Live updates flow through the existing `session:variables-updated`
 * event on SESSION_EVENT, so renderer code only needs LIST for the
 * initial fetch.
 */

import type { ContextVariable } from './chat.js'

export interface VariablesListRequest {
  sessionId: string
}

export interface VariablesListResponse {
  success: boolean
  variables?: ContextVariable[]
  error?: string
  /** Stable error code (matches main-process VariableErrorCode). */
  code?: string
}

export interface VariablesSetRequest {
  sessionId: string
  name: string
  value: string
  scope?: 'global' | 'session'
  description?: string
}

export interface VariablesSetResponse {
  success: boolean
  variable?: ContextVariable
  error?: string
  code?: string
}

export interface VariablesDeleteRequest {
  sessionId: string
  name: string
  scope?: 'global' | 'session'
}

export interface VariablesDeleteResponse {
  success: boolean
  error?: string
  code?: string
}
