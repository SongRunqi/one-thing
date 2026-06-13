/**
 * Skill Tool - Load skills on-demand
 *
 * Instead of exposing all skills in the system prompt, this tool allows
 * the AI to load skills on-demand. This provides:
 * - Dynamic descriptions based on available skills
 * - No Bash dependency (no `cat SKILL.md`)
 */

import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { Tool, type InitContext, type ToolContext, type ToolResult } from '../core/tool.js'
import type { SkillDefinition } from '../../../shared/ipc.js'
import { fuzzyFilter } from '../../utils/fuzzy.js'
import { executeSkillManage, isSkillManageMutation, previewSkillManage, type SkillManageAction, type SkillManageArgs } from '../../skills/manage.js'

/**
 * Skill tool metadata for UI display
 */
interface SkillMetadata {
  skillName: string
  skillSource: string
  [key: string]: unknown
}

interface SkillManageMetadata {
  action: string
  skillName?: string
  path?: string
  mutated?: boolean
  [key: string]: unknown
}

type LinkedFiles = {
  references: string[]
  templates: string[]
  assets: string[]
  scripts: string[]
  other: string[]
}

/**
 * Build a compact, stable description. The available skill list is returned by
 * action=list instead of being embedded in the model-facing tool schema.
 */
function buildDescription(): string {
  return [
    'Search, find, list, load, or view installed Hermes Agent skills on demand.',
    'Use action="search" or action="find" with query text to fuzzy-search relevant skills, then action="load" with a skill name when the user asks for a skill or after search identifies a relevant skill.',
    'Use filePath with action="load" or action="view" to read supporting files inside a loaded skill directory.',
  ].join(' ')
}

function formatSkillList(skills: SkillDefinition[], query?: string): string {
  const normalizedQuery = query?.trim()
  const filtered = filterSkills(skills, query)

  if (filtered.length === 0) {
    return normalizedQuery
      ? `No skills matched query "${query}".`
      : 'No skills are currently available.'
  }

  return filtered
    .map(skill => {
      const category = skill.category ? ` [${skill.category}]` : ''
      const tags = skill.tags?.length ? `tags: ${skill.tags.join(', ')}` : ''
      return `- ${skill.name}${category}: ${skill.description}${tags ? ` (${tags})` : ''}`
    })
    .join('\n')
}

function filterSkills(skills: SkillDefinition[], query?: string): SkillDefinition[] {
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

function resolveSkillByName(skills: SkillDefinition[], name: string): SkillDefinition | undefined {
  const normalized = name.trim()
  return skills.find(skill => skill.name === normalized)
    ?? skills.find(skill => skill.category ? `${skill.category}/${skill.name}` === normalized : false)
    ?? skills.find(skill => skill.id === normalized)
}

function resolveSkillFile(skill: SkillDefinition, filePath: string): string | null {
  const skillDir = path.resolve(skill.directoryPath)
  const resolved = path.resolve(skillDir, filePath)
  const relative = path.relative(skillDir, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

function formatLoadedSkill(content: string, skill: SkillDefinition): string {
  const lines = [content.trim()]

  lines.push('', '---', 'Skill paths:')
  lines.push(`- current: ${skill.directoryPath}`)
  lines.push(`- instructions: ${skill.path}`)
  if (skill.rootPath) {
    lines.push(`- root: ${skill.rootPath}`)
  }
  if (skill.relativePath) {
    lines.push(`- relative: ${skill.relativePath}`)
  }
  if (skill.files?.length) {
    lines.push('')
    lines.push('Supporting files:')
    for (const file of skill.files) {
      lines.push(`- ${file.name} (${file.type}) path: ${file.path}`)
    }
    lines.push('Use the skill tool with action="view", the same skill name, and filePath to read a supporting file.')
  }
  if (skill.relatedSkills?.length) {
    lines.push(`Related skills: ${skill.relatedSkills.join(', ')}`)
  }
  return lines.join('\n')
}

function linkedFiles(skill: SkillDefinition): LinkedFiles {
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

function skillListPayload(skills: SkillDefinition[], category?: string, query?: string): string {
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

function skillViewPayload(skills: SkillDefinition[], name: string | undefined, rawFilePath?: string): string {
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
    const content = fs.readFileSync(targetPath, 'utf-8')
    if (filePath) {
      return JSON.stringify({
        success: true,
        name: skill.name,
        file: filePath,
        content,
        file_type: path.extname(filePath),
        path: targetPath,
        skill_dir: skill.directoryPath,
      })
    }

    return JSON.stringify({
      success: true,
      name: skill.name,
      content,
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
  } catch (error: any) {
    return errorPayload(`Error reading skill file: ${error.message}`, 'Check the skill path and file permissions.')
  }
}

/**
 * SkillTool - async tool with dynamic initialization
 */
export const SkillTool = Tool.define(
  'skill',
  {
    name: 'Skill',
    category: 'builtin',
    autoExecute: true, // Skills are read-only, safe to auto-execute
    permissionGuard: 'safe',
    executionMode: 'parallel',
    renderKind: 'text',
  },
  async (ctx?: InitContext) => {
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const skillNames = skills.map(s => s.name)

    const parameters = z.object({
      action: z.enum(['search', 'find', 'list', 'load', 'view']).describe('Use "search" or "find" to fuzzy-search skills, "list" to show available skills, "load" to read one skill instruction file, or "view" to read a supporting file.'),
      name: z.string().optional().describe('Skill name, id, or category/name to load. Required when action is "load" or "view".'),
      query: z.string().optional().describe('Fuzzy search text for action "search" or "find". Optional for action "list".'),
      filePath: z.string().optional().describe('Relative path inside the skill directory to read. Optional for action "load"; required for action "view".'),
    })

    return {
      description: buildDescription(),
      parameters,
      executionMode: 'parallel',
      renderKind: 'text',

      async execute(
        args: { action: 'search' | 'find' | 'list' | 'load' | 'view'; name?: string; query?: string; filePath?: string },
        toolCtx: ToolContext<SkillMetadata>
      ): Promise<ToolResult<SkillMetadata>> {
        const { action, name, query, filePath } = args

        if (action === 'search' || action === 'find' || action === 'list') {
          const output = formatSkillList(skills, query)
          toolCtx.updateResult?.({
            content: [{ type: 'text', text: output }],
            details: { phase: 'ready', skillName: query || 'all' },
          })
          return {
            title: query ? `Skills matching: ${query}` : 'Available skills',
            output,
            metadata: {
              skillName: query || 'all',
              skillSource: 'list',
            },
          }
        }

        if (!name?.trim()) {
          return {
            title: 'Skill name required',
            output: `Error: action "${action}" requires a skill name. Use action "search" or "find" first if you need to discover available skills.`,
            metadata: {
              skillName: '',
              skillSource: 'unknown',
            },
          }
        }

        const skillName = name.trim()

        toolCtx.updateResult?.({
          content: [{ type: 'text', text: filePath ? `Loading skill file: ${skillName}/${filePath}...` : `Loading skill: ${skillName}...` }],
          details: { phase: 'loading', skillName },
        })

        const skill = resolveSkillByName(skills, skillName)
        if (!skill) {
          return {
            title: `Skill not found: ${skillName}`,
            output: `Error: Skill "${skillName}" not found. Use action "search" or "find" to discover available skills.${skillNames.length > 0 ? ` Available skill names: ${skillNames.join(', ')}` : ''}`,
            metadata: {
              skillName,
              skillSource: 'unknown',
            },
          }
        }

        toolCtx.metadata({
          title: `Loading skill: ${skillName}`,
          metadata: {
            skillName,
            skillSource: skill.source,
          },
        })

        if (action === 'view' && !filePath?.trim()) {
          return {
            title: 'Skill file path required',
            output: 'Error: action "view" requires filePath. Use action "load" first to see supporting files for this skill.',
            metadata: {
              skillName,
              skillSource: skill.source,
            },
          }
        }

        try {
          const targetPath = filePath?.trim() ? resolveSkillFile(skill, filePath.trim()) : skill.path
          if (!targetPath) {
            return {
              title: `Invalid skill file path: ${filePath}`,
              output: 'Error: filePath must be a relative path inside the skill directory.',
              metadata: {
                skillName,
                skillSource: skill.source,
              },
            }
          }

          const content = fs.readFileSync(targetPath, 'utf-8')
          const output = filePath?.trim()
            ? content
            : formatLoadedSkill(content, skill)
          toolCtx.updateResult?.({
            content: [{ type: 'text', text: output }],
            details: { phase: 'ready', skillName, skillSource: skill.source },
          })
          return {
            title: filePath ? `Loaded skill file: ${skillName}/${filePath}` : `Loaded skill: ${skillName}`,
            output,
            metadata: {
              skillName,
              skillSource: skill.source,
            },
          }
        } catch (error: any) {
          return {
            title: `Failed to load skill: ${skillName}`,
            output: `Error reading skill file: ${error.message}`,
            metadata: {
              skillName,
              skillSource: skill.source,
            },
          }
        }
      },
    }
  }
)

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
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const parameters = z.object({
      category: z.string().optional().describe('Optional category to filter skills by.'),
      query: z.string().optional().describe('Optional fuzzy search text.'),
      task_id: z.string().optional().describe('Optional task id for compatibility.'),
    })

    return {
      description: 'List installed Hermes Agent skills as JSON. Use this to discover skill names and categories before calling skill_view.',
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
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const parameters = z.object({
      name: z.string().describe('Skill name, id, or category/name to view.'),
      file_path: z.string().optional().describe('Optional relative path inside the skill directory.'),
      filePath: z.string().optional().describe('Optional camelCase alias for file_path.'),
      task_id: z.string().optional().describe('Optional task id for compatibility.'),
      preprocess: z.boolean().optional().describe('Compatibility flag. Content is returned as stored.'),
    })

    return {
      description: 'View a Hermes Agent skill or one of its linked files as JSON. Returns full SKILL.md content, tags, linked files, and absolute paths.',
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
  category: z.string().optional().describe('Optional single directory segment under ~/.onething/skills for newly created skills.'),
  file_path: z.string().optional().describe('Relative supporting file path under references/, templates/, scripts/, or assets/. Omit for patching SKILL.md.'),
  file_content: z.string().optional().describe('Full content for write_file. Supporting files are limited to 1 MiB.'),
  absorbed_into: z.string().optional().describe('Optional existing skill that absorbed this skill before delete.'),
})

async function invalidateSkillCachesAfterMutation(mutated: boolean): Promise<void> {
  if (!mutated) return
  try {
    const { invalidateSkillsCache } = await import('../../ipc/skills.js')
    invalidateSkillsCache()
  } catch (error) {
    console.warn('[SkillManage] Failed to invalidate skill cache:', error)
  }
}

export const SkillManageTool = Tool.define<typeof SkillManageParameters, SkillManageMetadata>(
  'skill_manage',
  {
    name: 'Skill Manage',
    description: [
      'Create, edit, patch, delete, or maintain supporting files for Hermes Agent skills as durable procedural memory.',
      'Use this only when a reusable workflow, preference-handling procedure, or tool-use habit should become future SKILL.md instructions.',
      'New skills are created under ~/.onething/skills; existing user or project skills can be modified, while builtin and plugin skills are protected.',
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
      const preview = previewSkillManage(args as SkillManageArgs, { workingDirectory: ctx.workingDirectory })
      if (!isSkillManageMutation(args.action as SkillManageAction) || !preview.path) {
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

      if (isSkillManageMutation(action)) {
        await ctx.beforeSideEffect?.()
      }

      const result = executeSkillManage(args as SkillManageArgs, { workingDirectory: ctx.workingDirectory })
      await invalidateSkillCachesAfterMutation(result.mutated)

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
