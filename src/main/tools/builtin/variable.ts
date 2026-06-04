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

type VariableAction = 'list' | 'set' | 'append' | 'remove' | 'delete'

interface VariableMetadata {
  action: VariableAction
  name?: string
  variables: Array<{
    name: string
    value?: string
    values?: string[]
    scope?: 'global' | 'session'
    readonly?: boolean
    description?: string
  }>
  [key: string]: unknown
}

const VariableParameters = z.object({
  action: z.enum(['list', 'set', 'append', 'remove', 'delete']).describe('Operation to perform on context variables.'),
  name: z.string().optional().describe('Variable name (required for set/append/remove/delete).'),
  value: z.string().optional().describe('Variable value (required for set/append/remove; for the work directory and note directories, must be an existing directory).'),
  scope: z.enum(['session', 'global']).optional().describe('Scope for custom variables. Defaults to session. Built-in note directories are global; the work directory variable is session-scoped.'),
  description: z.string().optional().describe('Short description, surfaced in the prompt and the Context inspector.'),
})

function summarizeForMetadata(snapshot: ContextVariable[]): VariableMetadata['variables'] {
  return snapshot.map(v => ({
    name: v.name,
    value: v.value,
    values: v.values,
    scope: v.scope,
    readonly: v.readonly,
    description: v.description,
  }))
}

function renderForOutput(snapshot: ContextVariable[]): string {
  if (snapshot.length === 0) return 'No context variables are set.'
  return snapshot.map(v => {
    const flags = `${v.scope ? ` [${v.scope}]` : ''}${v.readonly ? ' [readonly]' : ''}`
    const desc = v.description ? ` — ${v.description}` : ''
    if (v.values && v.values.length > 0) {
      return `${v.name} = ${v.value || '(empty)'}\nvalues:\n${v.values.map((value, index) => `  [${index}] ${value}${index === 0 && v.value ? ' (current)' : ''}`).join('\n')}${flags}${desc}`
    }
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
- work directory (variable name: workdir): ordered directory list. The first value is the active directory for relative paths, bash defaults, AGENTS.md, project skills, and project todo state. Later values are additional sandbox roots for file/bash tools. Use action=set to change the active work directory, action=append to add a root needed for the current task, and action=remove to remove an extra root. It cannot be deleted.
- ai_note_dir: directory where the assistant stores its scratch notes (default ~/.onething/notes).
- user_note_dir: directory where the user keeps personal notes. Read for context; only modify with explicit user permission.
- work_note_dir: directory where work or project notes are kept. Read for context; only modify with explicit user permission.

Custom variables (any non-reserved name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/) can be added, updated, listed, and deleted. Use scope="session" for current-session context and scope="global" for variables shared across sessions. Variables are injected into the system prompt and shown in the Context inspector.

Project directories (the "project_dirs" list) are managed by a separate tool — call \`project_dirs\` for list/get/add/update/remove operations.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'sequential',
  renderKind: 'text',
  promptSnippet: 'Manage session variables such as workdir',

  parameters: VariableParameters,

  async execute(args, ctx) {
    const registry = getVariableRegistry()
    const variableCtx = {
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      toolCallId: ctx.toolCallId,
    }
    const action: VariableAction = args.action

    try {
      if (action === 'set' || action === 'append' || action === 'remove') {
        if (!args.name) throw new Error(`name is required for ${action}`)
        if (args.value === undefined) throw new Error(`value is required for ${action}`)
        const input = {
          name: args.name,
          value: args.value,
          scope: args.scope,
          description: args.description,
        }
        if (action === 'set') {
          await registry.set(variableCtx, input)
        } else if (action === 'append') {
          await registry.append(variableCtx, input)
        } else if (action === 'remove') {
          await registry.remove(variableCtx, input)
        }
      } else if (action === 'delete') {
        if (!args.name) throw new Error('name is required for delete')
        await registry.delete(variableCtx, args.name, args.scope)
      }

      const snapshot = await registry.list(variableCtx)
      const metadataSummary = summarizeForMetadata(snapshot)
      const output = renderForOutput(snapshot)

      ctx.updateResult?.({
        content: [{ type: 'text', text: output }],
        details: { phase: 'ready', action, name: args.name, variables: metadataSummary },
      })

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
        output,
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
