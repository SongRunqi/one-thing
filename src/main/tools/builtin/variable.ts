/**
 * Built-in Tool: Variable
 *
 * Thin wrapper over the variable registry. Persistence, validation,
 * and event fan-out are owned by the providers — this tool's job is
 * to translate AI-shaped arguments into registry calls and shape the
 * output back into the tool result envelope.
 *
 * Scope: scalar variables only (workdir, ai_note_dir, user_note_dir,
 * work_note_dir, custom session/global vars). Project directories have their own tool
 * (`project_dirs`) — see `src/main/project-dirs/`.
 */

import { z } from 'zod'
import { Tool } from '../core/tool.js'
import {
  getVariableRegistry,
  VariableError,
  type ContextVariable,
} from '../../variables/index.js'

type VariableAction = 'list' | 'set' | 'delete'

interface VariableMetadata {
  action: VariableAction
  name?: string
  variables: Array<{ name: string; scope?: 'global' | 'session'; readonly?: boolean }>
  [key: string]: unknown
}

const VariableParameters = z.object({
  action: z.enum(['list', 'set', 'delete']).describe('Operation to perform on context variables.'),
  name: z.string().optional().describe('Variable name (required for set/delete).'),
  value: z.string().optional().describe('Variable value (required for set; for workdir/note dirs, must be an existing directory).'),
  scope: z.enum(['session', 'global']).optional().describe('Scope for custom variables. Defaults to session. Built-in note dirs are global; workdir is session.'),
  description: z.string().optional().describe('Short description, surfaced in the prompt and the Context inspector.'),
})

function summarizeForMetadata(snapshot: ContextVariable[]) {
  return snapshot.map(v => ({
    name: v.name,
    scope: v.scope,
    readonly: v.readonly,
  }))
}

function renderForOutput(snapshot: ContextVariable[]): string {
  if (snapshot.length === 0) return 'No context variables are set.'
  return snapshot.map(v => {
    const flags = `${v.scope ? ` [${v.scope}]` : ''}${v.readonly ? ' [readonly]' : ''}`
    const desc = v.description ? ` — ${v.description}` : ''
    const value = v.value || '(empty)'
    return `${v.name} = ${value}${flags}${desc}`
  }).join('\n')
}

function rethrow(err: unknown): never {
  if (err instanceof VariableError) {
    const e = new Error(`[${err.code}] ${err.message}`)
    e.name = err.name
    throw e
  }
  throw err
}

export const VariableTool = Tool.define<typeof VariableParameters, VariableMetadata>('variable', {
  name: 'Variable',
  description: `Manage session context variables.

Use this tool when the user asks to switch projects, change directories, remember a project hint, or adjust context for future tool calls.

System variables:
- workdir: current working directory and file-tool sandbox boundary. It can be changed with action=set but cannot be deleted.
- ai_note_dir: directory where the assistant stores its scratch notes (default ~/.onething/notes).
- user_note_dir: directory where the user keeps personal notes. Read for context; only modify with explicit user permission.
- work_note_dir: directory where work or project notes are kept. Read for context; only modify with explicit user permission.

Custom variables (any non-reserved name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/) can be added, updated, listed, and deleted. Use scope="session" for current-session context and scope="global" for variables shared across sessions. Variables are injected into the system prompt and shown in the Context inspector.

Project directories (the "project_dirs" list) are managed by a separate tool — call \`project_dirs\` for list/get/add/update/remove operations.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',

  parameters: VariableParameters,

  async execute(args, ctx) {
    const registry = getVariableRegistry()
    const variableCtx = { sessionId: ctx.sessionId }
    const action: VariableAction = args.action

    try {
      if (action === 'set') {
        if (!args.name) throw new Error('name is required for set')
        if (args.value === undefined) throw new Error('value is required for set')
        await registry.set(variableCtx, {
          name: args.name,
          value: args.value,
          scope: args.scope,
          description: args.description,
        })
      } else if (action === 'delete') {
        if (!args.name) throw new Error('name is required for delete')
        await registry.delete(variableCtx, args.name, args.scope)
      }

      const snapshot = await registry.list(variableCtx)
      const metadataSummary = summarizeForMetadata(snapshot)

      ctx.metadata({
        title: action === 'list' ? 'Listed variables' : `${action[0].toUpperCase()}${action.slice(1)} ${args.name}`,
        metadata: {
          action,
          name: args.name,
          variables: metadataSummary,
        },
      })

      return {
        title: action === 'list' ? 'Variables' : `Variable ${action}`,
        output: renderForOutput(snapshot),
        metadata: {
          action,
          name: args.name,
          variables: metadataSummary,
        },
      }
    } catch (err) {
      rethrow(err)
    }
  },
})
