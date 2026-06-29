import type { SkillDefinition } from '@/types'
import type { PaletteItem, PaletteItemType } from '@/types/palette'
import type { UserPrompt } from '@shared/ipc'
import { getCommands } from './commands'

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/^\//, '').trim()
}

function normalizeText(value: string | undefined): string {
  return (value || '').toLowerCase()
}

function startsWithWord(value: string | undefined, query: string): boolean {
  return normalizeText(value)
    .split(/[\s:/_-]+/)
    .some(part => part.startsWith(query))
}

/**
 * Score how strongly an item matches the query. Higher is more relevant.
 *   4 = exact match on a primary field (title/name)
 *   3 = primary field starts with query
 *   2 = a word inside a primary field starts with query
 *   1 = description / usage / keyword contains query (weak fallback)
 *   0 = no match
 * Empty query scores 1 so order is preserved at the call site.
 */
function itemMatchScore(item: PaletteItem, query: string): number {
  if (!query) return 1

  const primaryFields = [
    item.title.replace(/^\//, ''),
    item.command?.id,
    item.command?.name,
    item.skill?.name,
    item.prompt?.title,
  ]

  if (primaryFields.some(f => normalizeText(f) === query)) return 4
  if (primaryFields.some(f => normalizeText(f).startsWith(query))) return 3
  if (primaryFields.some(f => startsWithWord(f, query))) return 2

  const searchable = [
    item.description,
    item.usage,
    ...(item.keywords || []),
  ].join(' ').toLowerCase()

  return searchable.includes(query) ? 1 : 0
}

export function getPaletteItems(
  skills: SkillDefinition[] = [],
  prompts: UserPrompt[] = [],
  types?: PaletteItemType[],
): PaletteItem[] {
  const include = (type: PaletteItemType) => !types || types.includes(type)
  const commandItems: PaletteItem[] = getCommands().map(command => ({
    id: `command:${command.id}`,
    type: 'command',
    title: command.displayLabel || `/${command.id}`,
    description: command.description,
    usage: command.usage,
    keywords: [
      command.id,
      command.name,
      command.description,
      command.usage,
      command.displayLabel || '',
    ],
    command,
  }))

  const skillItems: PaletteItem[] = skills.map(skill => ({
    id: `skill:${skill.id}`,
    type: 'skill',
    title: skill.name,
    description: skill.description,
    usage: 'skill',
    keywords: [skill.name, skill.description, skill.source],
    skill,
  }))

  const promptItems: PaletteItem[] = prompts.map(prompt => ({
    id: `prompt:${prompt.id}`,
    type: 'prompt',
    title: prompt.title,
    description: prompt.description || prompt.body.slice(0, 120),
    usage: 'prompt',
    keywords: [prompt.title, prompt.description || '', prompt.body, ...(prompt.tags || [])],
    prompt,
  }))

  return [
    ...(include('command') ? commandItems : []),
    ...(include('skill') ? skillItems : []),
    ...(include('prompt') ? promptItems : []),
  ]
}

export function filterPaletteItems(
  query: string,
  skills: SkillDefinition[] = [],
  prompts: UserPrompt[] = [],
  types?: PaletteItemType[],
): PaletteItem[] {
  const normalized = normalizeQuery(query)
  const scored = getPaletteItems(skills, prompts, types)
    .map((item, originalIndex) => ({ item, originalIndex, score: itemMatchScore(item, normalized) }))
    .filter(s => s.score > 0)
  scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
  return scored.map(s => s.item)
}
