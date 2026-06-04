/**
 * `project_dirs` tool — AI-facing API for the project directory list.
 *
 * Single tool with an action enum. As future "data kinds" are added
 * (reflections, tags, activity), they get new actions here:
 *   note_add / note_list / note_remove / tag_set / ...
 *
 * Once the action set passes ~10 consider splitting into focused
 * tools (e.g. `project_notes`).
 */

import { z } from 'zod'
import { Tool } from '../tools/core/tool.js'
import { getProjectsStore } from './store/index.js'
import type { Project } from './types.js'

type ProjectDirsAction = 'list' | 'get' | 'add' | 'update' | 'remove'

interface ProjectDirsMetadata {
  action: ProjectDirsAction
  path?: string
  count?: number
  [key: string]: unknown
}

const ProjectDirsParameters = z.object({
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

function renderProject(p: Project): string {
  const lines = [`path: ${p.path}`]
  if (p.description) lines.push(`description: ${p.description}`)
  lines.push(`added: ${new Date(p.addedAt).toISOString()}`)
  lines.push(`last_used: ${new Date(p.lastUsedAt).toISOString()}`)
  return lines.join('\n')
}

function renderList(entries: Array<{ path: string; description: string; lastUsedAt: number }>): string {
  if (entries.length === 0) return 'No project directories recorded yet.'
  return entries.map((e) => {
    const desc = e.description ? ` — ${e.description}` : ''
    return `${e.path}${desc}`
  }).join('\n')
}

export const ProjectDirsTool = Tool.define<typeof ProjectDirsParameters, ProjectDirsMetadata>('project_dirs', {
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
  promptSnippet: 'Inspect remembered project directories without changing workdir',

  parameters: ProjectDirsParameters,

  async execute(args, ctx) {
    const store = getProjectsStore()
    const action: ProjectDirsAction = args.action
    ctx.updateResult?.({
      content: [{ type: 'text', text: `Running project_dirs ${action}...` }],
      details: { phase: 'running', action },
    })

    let output: string
    let resultPath: string | undefined

    if (action === 'list') {
      const entries = store.list().map((e) => {
        const project = store.get(e.path)
        return {
          path: e.path,
          description: project?.description ?? '',
          lastUsedAt: e.lastUsedAt,
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
      // remove
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

function titleFor(action: ProjectDirsAction, path?: string): string {
  switch (action) {
    case 'list': return 'Listed projects'
    case 'get': return `Project: ${path ?? ''}`
    case 'add': return `Added project ${path ?? ''}`
    case 'update': return `Renamed project ${path ?? ''}`
    case 'remove': return `Removed project ${path ?? ''}`
  }
}
