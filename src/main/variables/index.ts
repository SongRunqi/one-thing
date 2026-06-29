/**
 * Public entry for the variable subsystem (scalar variables only).
 *
 * Bootstrap:
 *  1. Initialize the variables store (loads variables.json).
 *  2. Register the three built-in providers.
 *  3. Bridge registry change events onto the EventBus as
 *     `session:variables-updated` for the renderer.
 *  4. Make sure ai_note_dir's directory exists on disk.
 *
 * Project directories live in their own module — see
 * `src/main/project-dirs/`. Bootstrap order in `src/main/index.ts`
 * runs both modules' bootstraps separately; they have no boot-time
 * coupling.
 *
 * Idempotent — `bootstrapVariableSystem` can be called multiple times
 * but only takes effect once. Tests bypass this and use registry
 * directly with isolated providers.
 */

import * as fs from 'fs/promises'
import { getEventBus } from '../events/index.js'
import { expandPath } from '../tools/core/sandbox.js'
import { enforcePermissionPolicy } from '../tools/core/permission-policy.js'
import { CoreProvider } from '@onething/runtime/variables/providers/core'
import { GlobalStoreProvider } from '@onething/runtime/variables/providers/global-store'
import { NotesProvider } from '@onething/runtime/variables/providers/notes'
import { SessionStoreProvider } from '@onething/runtime/variables/providers/session-store'
import { getVariableRegistry } from '@onething/runtime/variables/registry'
import { getVariablesStore } from './store/index.js'
import type { VariableProvider } from '@onething/runtime/variables'
import {
  notesGateway,
  globalStoreGateway,
  sessionStoreGateway,
  workdirGateway,
  notifyNotesDirChanged,
  notifySessionVariablesChanged,
  notifyWorkdirChanged,
} from './gateways.js'
import { formatVariablesForPrompt } from '@onething/runtime/variables/format'
import type { ContextVariable, VariableContext } from '@onething/runtime/variables'

let bootstrapped = false
let unsubscribeBridge: (() => void) | null = null

export function bootstrapVariableSystem(): void {
  if (bootstrapped) return
  bootstrapped = true

  // Persistence layer comes online first — providers read from it.
  getVariablesStore().initialize()

  const registry = getVariableRegistry()
  registry.register(new CoreProvider(workdirGateway, { enforcePermission: enforcePermissionPolicy }))
  registry.register(new NotesProvider(notesGateway))
  registry.register(new GlobalStoreProvider(globalStoreGateway))
  registry.register(new SessionStoreProvider(sessionStoreGateway))

  // Make sure the configured ai_note_dir directory exists on disk.
  // Fire-and-forget: failure is non-fatal, the AI will get an error
  // on first write and can fall back to set a different path.
  ensureAiNoteDir().catch(err =>
    console.error('[variables] ensureAiNoteDir failed:', err))

  // Bridge registry change events to the EventBus so the renderer
  // refreshes via the existing session:variables-updated channel.
  unsubscribeBridge = registry.subscribe((ctx, snapshot) => {
    // Broadcasts (e.g. notes from a global state change) come with an
    // empty sessionId; we have no target to emit to in that case.
    if (!ctx.sessionId) return
    const workdirVariable = snapshot.find(v => v.name === 'workdir')
    const workdir = workdirVariable?.value || undefined
    const workdirRoots = workdirVariable?.values?.slice(workdir ? 1 : 0)
    try {
      getEventBus().emit(ctx.sessionId, {
        type: 'session:variables-updated',
        workingDirectory: workdir,
        workingDirectoryRoots: workdirRoots,
        variables: snapshot,
      }).catch(err =>
        console.error('[variables] EventBus emit failed:', err))
    } catch {
      // EventBus not initialized (test or pre-bootstrap path) — ignore.
    }
  })

  console.log('[variables] subsystem bootstrapped (4 providers)')
}

/**
 * Tear down the subsystem. Used in tests; the runtime app does not
 * normally need this since the process exits on shutdown.
 */
export function shutdownVariableSystem(): void {
  if (unsubscribeBridge) {
    unsubscribeBridge()
    unsubscribeBridge = null
  }
  getVariableRegistry().reset()
  bootstrapped = false
}

/**
 * Create the configured ai_note_dir directory if it doesn't exist yet.
 */
async function ensureAiNoteDir(): Promise<void> {
  const raw = getVariablesStore().getAiNoteDir()
  if (!raw) return
  const resolved = expandPath(raw)
  try {
    await fs.mkdir(resolved, { recursive: true })
  } catch (err) {
    console.warn('[variables] could not create ai_note_dir:', resolved, err)
  }
}

// ── Helpers used by call sites ──────────────────────

export async function listContextVariables(sessionId: string): Promise<ContextVariable[]> {
  return getVariableRegistry().list({ sessionId })
}

/**
 * Build the prompt-injection string for non-workdir custom variables.
 * Workdir/cwd is rendered by the prompt builder itself, so it is filtered
 * out here to avoid duplicate directory instructions.
 */
export async function buildContextVariablesPromptText(sessionId: string): Promise<string> {
  const list = (await listContextVariables(sessionId)).filter(variable => variable.name !== 'workdir')
  return formatVariablesForPrompt(list)
}

/**
 * Plugin entry point. External code calls this to add a custom
 * provider to the live registry. Must be called after
 * `bootstrapVariableSystem()`. Throws PROVIDER_CONFLICT on
 * duplicate IDs.
 */
export function registerVariableProvider(provider: VariableProvider): void {
  getVariableRegistry().register(provider)
}

// Re-exports for ergonomic imports at call sites.
export { getVariableRegistry } from '@onething/runtime/variables/registry'
export { formatVariablesForPrompt } from '@onething/runtime/variables/format'
export { VariableError } from '@onething/runtime/variables'
export type {
  ContextVariable,
  SetInput,
  VariableContext,
  VariableProvider,
} from '@onething/runtime/variables'
export {
  notifyNotesDirChanged,
  notifySessionVariablesChanged,
  notifyWorkdirChanged,
} from './gateways.js'
export { getVariablesStore } from './store/index.js'
