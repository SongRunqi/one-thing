import { z } from 'zod'
import type { JsonObject, JsonObjectProperty } from '@onething/core'
import { Tool } from '../tool.js'

export type ProjectDirsAction = 'list' | 'get' | 'add' | 'update' | 'remove'

export interface RuntimeProjectDirEntry {
  path: string
  description?: string
  lastUsedAt: number
}

export interface RuntimeProjectDirRecord {
  path: string
  description: string
  addedAt: number
  lastUsedAt: number
}

export interface RuntimeProjectDirsStore {
  list(): RuntimeProjectDirEntry[]
  get(path: string): RuntimeProjectDirRecord | null
  add(input: { path: string; description?: string }): RuntimeProjectDirRecord
  update(path: string, patch: { description: string }): RuntimeProjectDirRecord | null
  remove(path: string): boolean
}

export interface ProjectDirsToolAdapters {
  getStore(): RuntimeProjectDirsStore
}

interface ProjectDirsMetadata extends JsonObject {
  action: ProjectDirsAction
  path?: string
  count?: number
  [key: string]: JsonObjectProperty
}

export const ProjectDirsParameters = z.object({
  action: z.enum(['list', 'get', 'add', 'update', 'remove'])
    .describe('Operation on the project directory list.'),
  path: z.string().optional().describe('Project directory path. Required for get/add/update/remove.'),
  description: z.string().optional().describe('Human-readable label. Used by add (initial) and update.'),
})

function requireArg<T>(value: T | undefined, name: string, action: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required for ${action}`)
  }
  return value
}

function renderProject(project: RuntimeProjectDirRecord): string {
  const lines = [`path: ${project.path}`]
  if (project.description) lines.push(`description: ${project.description}`)
  lines.push(`added: ${new Date(project.addedAt).toISOString()}`)
  lines.push(`last_used: ${new Date(project.lastUsedAt).toISOString()}`)
  return lines.join('\n')
}

function renderList(entries: RuntimeProjectDirEntry[]): string {
  if (entries.length === 0) return 'No project directories recorded yet.'
  return entries.map((entry) => {
    const desc = entry.description ? ` - ${entry.description}` : ''
    return `${entry.path}${desc}`
  }).join('\n')
}

export function createProjectDirsTool(
  adapters: ProjectDirsToolAdapters,
): Tool.Info<typeof ProjectDirsParameters, ProjectDirsMetadata> {
  return Tool.define<typeof ProjectDirsParameters, ProjectDirsMetadata>('project_dirs', {
    name: 'ProjectDirs',
    description: `Inspect or manage the remembered list of known project directories. This tool does not change the session work directory. To actually switch into a project or make file tools resolve relative paths there, use variable { action: "set", name: "workdir", value: <project-directory> }.

Actions:
- list: returns recently used projects (path + description).
- get { path }: returns the full record for one project only; it does not switch cwd.
- add { path, description? }: register a new project directory or refresh its lastUsedAt. Description is set on first add or when explicitly provided.
- update { path, description }: rename a project's description without changing its order.
- remove { path }: forget a project directory.

Setting the work directory via the variable tool automatically records/touches project_dirs under the hood. Use project_dirs get/update only when you need remembered metadata, not when you need to enter the project.`,
    category: 'builtin',
    enabled: true,
    autoExecute: true,
    permissionGuard: 'safe',
    executionMode: 'parallel',
    renderKind: 'text',

    parameters: ProjectDirsParameters,

    async execute(args, ctx) {
      const store = adapters.getStore()
      const action: ProjectDirsAction = args.action
      ctx.updateResult?.({
        content: [{ type: 'text', text: `Running project_dirs ${action}...` }],
        details: { phase: 'running', action },
      })

      let output: string
      let resultPath: string | undefined

      if (action === 'list') {
        const entries = store.list().map((entry) => {
          const project = store.get(entry.path)
          return {
            path: entry.path,
            description: project?.description ?? '',
            lastUsedAt: entry.lastUsedAt,
          }
        })
        output = renderList(entries)
      } else if (action === 'get') {
        const path = requireArg(args.path, 'path', 'get')
        const project = store.get(path)
        output = project ? renderProject(project) : `No project found for path "${path}"`
        resultPath = path
      } else if (action === 'add') {
        const path = requireArg(args.path, 'path', 'add')
        const project = store.add({ path, description: args.description })
        output = renderProject(project)
        resultPath = path
      } else if (action === 'update') {
        const path = requireArg(args.path, 'path', 'update')
        const description = requireArg(args.description, 'description', 'update')
        const project = store.update(path, { description })
        if (!project) {
          throw new Error(`[NOT_FOUND] No project for path "${path}"`)
        }
        output = renderProject(project)
        resultPath = path
      } else {
        const path = requireArg(args.path, 'path', 'remove')
        const removed = store.remove(path)
        if (!removed) {
          throw new Error(`[NOT_FOUND] No project for path "${path}"`)
        }
        output = `Removed project at ${path}`
        resultPath = path
      }

      const meta: ProjectDirsMetadata = {
        action,
        path: resultPath,
        count: store.list().length,
      }
      ctx.updateResult?.({
        content: [{ type: 'text', text: output }],
        details: { phase: 'ready', ...meta },
      })
      ctx.metadata({ title: titleFor(action, resultPath), metadata: meta })

      return {
        title: titleFor(action, resultPath),
        output,
        metadata: meta,
      }
    },
  })
}

function titleFor(action: ProjectDirsAction, path?: string): string {
  switch (action) {
    case 'list': return 'Listed projects'
    case 'get': return `Project: ${path ?? ''}`
    case 'add': return `Added project ${path ?? ''}`
    case 'update': return `Renamed project ${path ?? ''}`
    case 'remove': return `Removed project ${path ?? ''}`
  }
}
