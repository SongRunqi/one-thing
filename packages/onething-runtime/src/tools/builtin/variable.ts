import { z } from 'zod'
import type { JsonObject, JsonObjectProperty } from '@onething/core'
import { Tool } from '../tool.js'

export type VariableAction = 'list' | 'set' | 'append' | 'remove' | 'delete'
export type VariableScope = 'global' | 'session'

export interface RuntimeContextVariable {
  name: string
  value?: string
  values?: string[]
  scope?: VariableScope
  readonly?: boolean
  description?: string
}

export interface RuntimeVariableContext {
  sessionId: string
  messageId?: string
  toolCallId?: string
}

export interface RuntimeVariableSetInput {
  name: string
  value: string
  scope?: VariableScope
  description?: string
}

export interface RuntimeVariableRegistry {
  list(ctx: RuntimeVariableContext): Promise<RuntimeContextVariable[]> | RuntimeContextVariable[]
  set(ctx: RuntimeVariableContext, input: RuntimeVariableSetInput): Promise<RuntimeContextVariable> | RuntimeContextVariable
  append(ctx: RuntimeVariableContext, input: RuntimeVariableSetInput): Promise<RuntimeContextVariable> | RuntimeContextVariable
  remove(ctx: RuntimeVariableContext, input: RuntimeVariableSetInput): Promise<RuntimeContextVariable> | RuntimeContextVariable
  delete(ctx: RuntimeVariableContext, name: string, scope?: VariableScope): Promise<void> | void
}

export interface VariableToolAdapters {
  getRegistry(): RuntimeVariableRegistry
  isVariableError?(error: unknown): boolean
}

interface VariableMetadataVariable extends JsonObject {
  name: string
  value?: string
  values?: string[]
  scope?: VariableScope
  readonly?: boolean
  description?: string
}

interface VariableMetadata extends JsonObject {
  action: VariableAction
  name?: string
  variables: VariableMetadataVariable[]
  [key: string]: JsonObjectProperty
}

export const VariableParameters = z.object({
  action: z.enum(['list', 'set', 'append', 'remove', 'delete']).describe('Operation to perform on context variables.'),
  name: z.string().optional().describe('Variable name (required for set/append/remove/delete).'),
  value: z.string().optional().describe('Variable value (required for set/append/remove; for the work directory and note directories, must be an existing directory).'),
  scope: z.enum(['session', 'global']).optional().describe('Scope for custom variables. Defaults to session. Built-in note directories are global; the work directory variable is session-scoped.'),
  description: z.string().optional().describe('Short description, surfaced in the prompt and the Context inspector.'),
})

function summarizeForMetadata(snapshot: RuntimeContextVariable[]): VariableMetadata['variables'] {
  return snapshot.map(v => ({
    name: v.name,
    value: v.value,
    values: v.values,
    scope: v.scope,
    readonly: v.readonly,
    description: v.description,
  }))
}

function renderForOutput(snapshot: RuntimeContextVariable[]): string {
  if (snapshot.length === 0) return 'No context variables are set.'
  return snapshot.map(v => {
    const flags = `${v.scope ? ` [${v.scope}]` : ''}${v.readonly ? ' [readonly]' : ''}`
    const desc = v.description ? ` - ${v.description}` : ''
    if (v.values && v.values.length > 0) {
      return `${v.name} = ${v.value || '(empty)'}\nvalues:\n${v.values.map((value, index) => `  [${index}] ${value}${index === 0 && v.value ? ' (current)' : ''}`).join('\n')}${flags}${desc}`
    }
    const value = v.value || '(empty)'
    return `${v.name} = ${value}${flags}${desc}`
  }).join('\n')
}

function rethrowVariableError(
  err: Error | object | string | number | boolean | null | undefined,
  adapters: VariableToolAdapters,
): never {
  if (adapters.isVariableError?.(err) && err instanceof Error) {
    const code = 'code' in err && typeof err.code === 'string' ? err.code : undefined
    const e = new Error(code ? `[${code}] ${err.message}` : err.message)
    e.name = err.name
    throw e
  }
  throw err
}

export function createVariableTool(adapters: VariableToolAdapters): Tool.Info<typeof VariableParameters, VariableMetadata> {
  return Tool.define<typeof VariableParameters, VariableMetadata>('variable', {
    name: 'Variable',
    description: `Manage session context variables.

Use this tool when the user asks to switch projects, change directories, remember a project hint, or adjust context for future tool calls.

System variables:
- work directory (variable name: workdir): ordered directory list. The first value is the active directory for relative paths, bash defaults, AGENTS.md, project skills, and project todo state. Later values are additional sandbox roots for file/bash tools. Use action=set to change the active work directory, action=append to add a root needed for the current task, and action=remove to remove an extra root. It cannot be deleted.
- ai_note_dir: directory where the assistant stores its scratch notes (default ~/.onething/notes).
- user_note_dir: directory where the user keeps personal notes. Read for context; only modify with explicit user permission.
- work_note_dir: directory where work or project notes are kept. Read for context; only modify with explicit user permission.

Custom variables (any non-reserved name matching /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/) can be added, updated, listed, and deleted. Use scope="session" for current-session context and scope="global" for variables shared across sessions. Variables are injected into the system prompt and shown in the Context inspector.

Project directories (the "project_dirs" list) are managed by a separate tool - call \`project_dirs\` for list/get/add/update/remove operations.`,
    category: 'builtin',
    enabled: true,
    autoExecute: true,
    permissionGuard: 'safe',
    executionMode: 'sequential',
    renderKind: 'text',

    parameters: VariableParameters,

    async execute(args, ctx) {
      const registry = adapters.getRegistry()
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
        const caught = err instanceof Error || (err && typeof err === 'object') ? err : String(err)
        rethrowVariableError(caught, adapters)
      }
    },
  })
}
