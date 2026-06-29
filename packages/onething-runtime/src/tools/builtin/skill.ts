/**
 * Skill tools - list, view, and manage onething skills on demand.
 */

import { z } from 'zod'
import type { JsonObjectProperty } from '@onething/core'
import {
  extnamePath,
  isAbsolutePath,
  readTextFile,
  relativePath,
  resolvePath,
} from '@onething/core/storage'
import { Tool, type InitContext, type ToolContext, type ToolResult } from '../tool.js'

export interface RuntimeSkillFile {
  name: string
  path: string
  type: string
}

export interface RuntimeSkillDefinition {
  id: string
  name: string
  description: string
  source: 'user' | 'project' | 'plugin' | 'builtin'
  category?: string
  tags?: string[]
  relatedSkills?: string[]
  path: string
  directoryPath: string
  rootPath?: string
  relativePath?: string
  enabled: boolean
  instructions: string
  runtimeContext?: string
  files?: RuntimeSkillFile[]
}

/**
 * Skill tool metadata for UI display.
 */
export interface SkillMetadata {
  skillName: string
  skillSource: string
  [key: string]: JsonObjectProperty
}

export interface SkillManageMetadata {
  action: string
  skillName?: string
  path?: string
  mutated?: boolean
  [key: string]: JsonObjectProperty
}

export type SkillManageAction =
  | 'create'
  | 'edit'
  | 'patch'
  | 'delete'
  | 'write_file'
  | 'remove_file'
  | 'list'
  | 'read'
  | 'update'
  | 'edit_file'

export interface SkillManageArgs {
  action: SkillManageAction
  name?: string
  content?: string
  category?: string
  file_path?: string
  filePath?: string
  file_content?: string
  fileContent?: string
  old_string?: string
  oldString?: string
  new_string?: string
  newString?: string
  replace_all?: boolean
  replaceAll?: boolean
  absorbed_into?: string
  absorbedInto?: string
  description?: string
  instructions?: string
  old_text?: string
  oldText?: string
  new_text?: string
  newText?: string
  overwrite?: boolean
  reason?: string
}

export interface SkillManageOptions {
  workingDirectory?: string
}

export interface SkillManagePreview {
  path?: string
  diff?: string
  additions?: number
  deletions?: number
  created?: boolean
  deleted?: boolean
  mutated: boolean
  title: string
  error?: string
}

export interface SkillManageResult {
  success: boolean
  action: SkillManageAction
  title: string
  output: string
  mutated: boolean
  path?: string
  diff?: string
  additions?: number
  deletions?: number
  error?: string
}

export interface SkillManageAdapters {
  previewSkillManage(
    args: SkillManageArgs,
    options?: SkillManageOptions,
  ): SkillManagePreview | Promise<SkillManagePreview>
  executeSkillManage(
    args: SkillManageArgs,
    options?: SkillManageOptions,
  ): SkillManageResult | Promise<SkillManageResult>
  isSkillManageMutation(action: SkillManageAction | string): boolean
  invalidateSkillCachesAfterMutation?(
    mutated: boolean,
    result: SkillManageResult,
  ): void | Promise<void>
}

type LinkedFiles = {
  references: string[]
  templates: string[]
  assets: string[]
  scripts: string[]
  other: string[]
}

interface FuzzyMatchTarget<T> {
  item: T
  text: string
}

interface FuzzyMatchResult<T> {
  item: T
  score: number
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_\-/.:]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function acronym(value: string): string {
  return normalize(value)
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
}

function sequentialScore(query: string, text: string): number {
  let score = 0
  let cursor = 0
  let lastIndex = -1

  for (const char of query) {
    const index = text.indexOf(char, cursor)
    if (index === -1) return 0
    score += lastIndex === index - 1 ? 2 : 1
    cursor = index + 1
    lastIndex = index
  }

  return score / Math.max(text.length, 1)
}

function fuzzyScore(query: string | undefined, text: string): number {
  const q = normalize(query || '')
  if (!q) return 1

  const t = normalize(text)
  if (!t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 80 - Math.min(t.length - q.length, 40)
  if (t.includes(q)) return 60 - Math.min(t.indexOf(q), 30)

  const initials = acronym(t)
  if (initials && initials.startsWith(q)) return 45

  const compactQuery = q.replace(/\s+/g, '')
  const compactText = t.replace(/\s+/g, '')
  const seq = sequentialScore(compactQuery, compactText)
  return seq > 0 ? 20 + seq * 20 : 0
}

function fuzzyFilter<T>(
  items: Array<FuzzyMatchTarget<T>>,
  query?: string,
  limit = 50,
): Array<FuzzyMatchResult<T>> {
  const q = query?.trim()
  return items
    .map(target => ({
      item: target.item,
      score: fuzzyScore(q, target.text),
    }))
    .filter(result => !q || result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function filterSkills(skills: RuntimeSkillDefinition[], query?: string): RuntimeSkillDefinition[] {
  const normalizedQuery = query?.trim()
  return normalizedQuery
    ? fuzzyFilter(
        skills.map(skill => ({
          item: skill,
          text: `${skill.name} ${skill.description}`,
        })),
        normalizedQuery,
      ).map(result => result.item)
    : skills
}

function resolveSkillByName(
  skills: RuntimeSkillDefinition[],
  name: string,
): RuntimeSkillDefinition | undefined {
  const normalized = name.trim()
  return skills.find(skill => skill.name === normalized)
    ?? skills.find(skill => skill.category ? `${skill.category}/${skill.name}` === normalized : false)
    ?? skills.find(skill => skill.id === normalized)
}

function resolveSkillFile(skill: RuntimeSkillDefinition, filePath: string): string | null {
  const skillDir = resolvePath(skill.directoryPath)
  const resolved = resolvePath(skillDir, filePath)
  const relative = relativePath(skillDir, resolved)
  if (!relative || relative.startsWith('..') || isAbsolutePath(relative)) return null
  return resolved
}

function linkedFiles(skill: RuntimeSkillDefinition): LinkedFiles {
  const result: LinkedFiles = {
    references: [],
    templates: [],
    assets: [],
    scripts: [],
    other: [],
  }
  for (const file of skill.files ?? []) {
    if (file.name.startsWith('references/')) result.references.push(file.name)
    else if (file.name.startsWith('templates/')) result.templates.push(file.name)
    else if (file.name.startsWith('assets/')) result.assets.push(file.name)
    else if (file.name.startsWith('scripts/') || file.type === 'script') result.scripts.push(file.name)
    else result.other.push(file.name)
  }
  return result
}

function skillListPayload(
  skills: RuntimeSkillDefinition[],
  category?: string,
  query?: string,
): string {
  const categoryFilter = category?.trim()
  const filtered = filterSkills(skills, query)
    .filter(skill => !categoryFilter || skill.category === categoryFilter)
    .slice()
    .sort((a, b) => `${a.category ?? ''}/${a.name}`.localeCompare(`${b.category ?? ''}/${b.name}`))

  const categories = Array.from(new Set(skills.map(skill => skill.category).filter((item): item is string => Boolean(item)))).sort()
  return JSON.stringify({
    success: true,
    skills: filtered.map(skill => ({
      name: skill.name,
      description: skill.description,
      category: skill.category ?? null,
      path: skill.relativePath ?? skill.path,
      skill_dir: skill.directoryPath,
    })),
    categories,
    count: filtered.length,
    hint: 'Use skill_view(name) to see full content, tags, linked files, and absolute paths.',
  })
}

function errorPayload(error: string, hint: string): string {
  return JSON.stringify({ success: false, error, hint })
}

function skillViewPayload(
  skills: RuntimeSkillDefinition[],
  name: string | undefined,
  rawFilePath?: string,
): string {
  if (!name?.trim()) {
    return errorPayload('Missing skill name.', 'Call skills_list() to discover available skills, then call skill_view(name).')
  }

  const skill = resolveSkillByName(skills, name)
  if (!skill) {
    return errorPayload(`Skill "${name}" not found.`, 'Call skills_list() to discover available skills.')
  }

  const filePath = rawFilePath?.trim()
  const targetPath = filePath ? resolveSkillFile(skill, filePath) : skill.path
  if (!targetPath) {
    return errorPayload('Invalid file_path.', 'file_path must be a relative path inside the skill directory.')
  }

  try {
    const rawContent = readTextFile(targetPath)
    if (filePath) {
      return JSON.stringify({
        success: true,
        name: skill.name,
        file: filePath,
        content: rawContent,
        file_type: extnamePath(filePath),
        path: targetPath,
        skill_dir: skill.directoryPath,
      })
    }
    const content = skill.runtimeContext
      ? `${rawContent.trimEnd()}\n\n${skill.runtimeContext}`
      : rawContent

    return JSON.stringify({
      success: true,
      name: skill.name,
      content,
      instructions: skill.instructions,
      runtime_context: skill.runtimeContext ?? null,
      description: skill.description,
      tags: skill.tags ?? [],
      related_skills: skill.relatedSkills ?? [],
      linked_files: linkedFiles(skill),
      path: skill.relativePath ?? skill.path,
      absolute_path: skill.path,
      skill_dir: skill.directoryPath,
      root: skill.rootPath ?? null,
      readiness_status: 'available',
      setup_needed: false,
      setup_note: null,
      setup_skipped: false,
      gateway_setup_hint: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorPayload(`Error reading skill file: ${message}`, 'Check the skill path and file permissions.')
  }
}

export const SkillsListTool = Tool.define(
  'skills_list',
  {
    name: 'Skills List',
    category: 'builtin',
    autoExecute: true,
    permissionGuard: 'safe',
    executionMode: 'parallel',
    renderKind: 'text',
  },
  async (ctx?: InitContext) => {
    const skills = (ctx?.skills ?? []) as RuntimeSkillDefinition[]
    const parameters = z.object({
      category: z.string().optional().describe('Optional category to filter skills by.'),
      query: z.string().optional().describe('Optional fuzzy search text.'),
      task_id: z.string().optional().describe('Optional task id for compatibility.'),
    })

    return {
      description: 'List installed onething skills as JSON. Use this to discover skill names and categories before calling skill_view.',
      parameters,
      executionMode: 'parallel',
      renderKind: 'text',

      async execute(
        args: { category?: string; query?: string; task_id?: string },
        toolCtx: ToolContext<SkillMetadata>,
      ): Promise<ToolResult<SkillMetadata>> {
        const output = skillListPayload(skills, args.category, args.query)
        toolCtx.updateResult?.({
          content: [{ type: 'text', text: output }],
          details: { phase: 'ready', skillName: args.category || args.query || 'all' },
        })
        return {
          title: args.category ? `Skills in category: ${args.category}` : 'Available skills',
          output,
          metadata: {
            skillName: args.category || args.query || 'all',
            skillSource: 'list',
          },
        }
      },
    }
  },
)

export const SkillViewTool = Tool.define(
  'skill_view',
  {
    name: 'Skill View',
    category: 'builtin',
    autoExecute: true,
    permissionGuard: 'safe',
    executionMode: 'parallel',
    renderKind: 'text',
  },
  async (ctx?: InitContext) => {
    const skills = (ctx?.skills ?? []) as RuntimeSkillDefinition[]
    const parameters = z.object({
      name: z.string().describe('Skill name, id, or category/name to view.'),
      file_path: z.string().optional().describe('Optional relative path inside the skill directory.'),
      filePath: z.string().optional().describe('Optional camelCase alias for file_path.'),
      task_id: z.string().optional().describe('Optional task id for compatibility.'),
      preprocess: z.boolean().optional().describe('Compatibility flag. Content is returned as stored.'),
    })

    return {
      description: 'View an onething skill or one of its linked files as JSON. Returns full SKILL.md content, tags, linked files, and absolute paths.',
      parameters,
      executionMode: 'parallel',
      renderKind: 'text',

      async execute(
        args: { name: string; file_path?: string; filePath?: string; task_id?: string; preprocess?: boolean },
        toolCtx: ToolContext<SkillMetadata>,
      ): Promise<ToolResult<SkillMetadata>> {
        const filePath = args.file_path ?? args.filePath
        toolCtx.updateResult?.({
          content: [{ type: 'text', text: filePath ? `Loading skill file: ${args.name}/${filePath}...` : `Loading skill: ${args.name}...` }],
          details: { phase: 'loading', skillName: args.name },
        })
        const output = skillViewPayload(skills, args.name, filePath)
        toolCtx.updateResult?.({
          content: [{ type: 'text', text: output }],
          details: { phase: 'ready', skillName: args.name },
        })
        return {
          title: filePath ? `Loaded skill file: ${args.name}/${filePath}` : `Loaded skill: ${args.name}`,
          output,
          metadata: {
            skillName: args.name,
            skillSource: 'view',
          },
        }
      },
    }
  },
)

const SkillManageParameters = z.object({
  action: z.enum(['create', 'patch', 'edit', 'delete', 'write_file', 'remove_file']).describe('Management action for procedural-memory skills. create/edit replace SKILL.md, patch performs targeted replacement, delete removes a skill, and write_file/remove_file manage supporting files.'),
  name: z.string().describe('Skill name. Must match SKILL.md frontmatter name and use lowercase letters, numbers, dots, underscores, or hyphens.'),
  content: z.string().optional().describe('Full SKILL.md content for create or edit, including YAML frontmatter with name and description.'),
  old_string: z.string().optional().describe('Text to replace for patch. Must match once unless replace_all is true.'),
  new_string: z.string().optional().describe('Replacement text for patch.'),
  replace_all: z.boolean().optional().describe('When true, replace every exact occurrence of old_string.'),
  category: z.string().optional().describe('Optional single directory segment under the user skills root for newly created skills.'),
  file_path: z.string().optional().describe('Relative supporting file path under references/, templates/, scripts/, or assets/. Omit for patching SKILL.md.'),
  file_content: z.string().optional().describe('Full content for write_file. Supporting files are limited to 1 MiB.'),
  absorbed_into: z.string().optional().describe('Optional existing skill that absorbed this skill before delete.'),
})

export function createSkillManageTool(adapters: SkillManageAdapters): Tool.Info<typeof SkillManageParameters, SkillManageMetadata> {
  return Tool.define<typeof SkillManageParameters, SkillManageMetadata>(
    'skill_manage',
    {
      name: 'Skill Manage',
      description: [
        'Create, edit, patch, delete, or maintain supporting files for onething skills as durable procedural memory.',
        'Use this only when a reusable workflow, preference-handling procedure, or tool-use habit should become future SKILL.md instructions.',
        'New skills are created under the configured user skills root; existing user or project skills can be modified, while builtin and plugin skills are protected.',
        'Supporting files must stay under references/, templates/, scripts/, or assets/.',
      ].join(' '),
      category: 'builtin',
      enabled: true,
      autoExecute: false,
      permissionGuard: 'permission-gated',
      executionMode: 'sequential',
      renderKind: 'diff',

      parameters: SkillManageParameters,

      async analyze(args, ctx) {
        const preview = await adapters.previewSkillManage(args as SkillManageArgs, { workingDirectory: ctx.workingDirectory })
        if (!adapters.isSkillManageMutation(args.action as SkillManageAction) || !preview.path) {
          return { effects: [] }
        }
        return {
          effects: [{
            kind: preview.deleted ? 'file_destructive_edit' as const : preview.created ? 'file_write' as const : 'file_edit' as const,
            resources: [preview.path],
            barrier: true,
            metadata: {
              path: preview.path,
              created: preview.created,
              deleted: preview.deleted,
              additions: preview.additions,
              deletions: preview.deletions,
              error: preview.error,
            },
          }],
          preview: {
            title: preview.title,
            path: preview.path,
            diff: preview.diff,
            additions: preview.additions,
            deletions: preview.deletions,
          },
        }
      },

      async execute(args, ctx) {
        const action = args.action as SkillManageAction
        const skillName = args.name?.trim()
        ctx.updateResult?.({
          content: [{ type: 'text', text: skillName ? `${action}: ${skillName}` : action }],
          details: { phase: 'preparing', action, skillName },
        })

        if (adapters.isSkillManageMutation(action)) {
          await ctx.beforeSideEffect?.()
        }

        const result = await adapters.executeSkillManage(args as SkillManageArgs, { workingDirectory: ctx.workingDirectory })
        await adapters.invalidateSkillCachesAfterMutation?.(result.mutated, result)

        ctx.updateResult?.({
          content: [{ type: 'text', text: result.diff || result.output }],
          details: {
            phase: 'ready',
            action,
            skillName,
            path: result.path,
            mutated: result.mutated,
          },
        })

        return {
          title: result.title,
          output: result.output,
          metadata: {
            action,
            skillName,
            path: result.path,
            mutated: result.mutated,
            diff: result.diff,
            additions: result.additions,
            deletions: result.deletions,
          },
        }
      },
    },
  )
}
