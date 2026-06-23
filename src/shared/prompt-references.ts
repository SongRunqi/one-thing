import type { PromptReferenceSnapshot } from './ipc/prompts.js'
import type { SkillReferenceSnapshot } from './ipc/skills.js'

export const PROMPT_REF_PATTERN = /\{\{prompt:([^}]+)\}\}/g
export const SKILL_REF_PATTERN = /\{\{skill:([^}]+)\}\}/g
export const COMPOSER_REF_PATTERN = /\{\{(prompt|skill):([^}]+)\}\}/g

export function createPromptToken(promptId: string): string {
  return `{{prompt:${promptId}}}`
}

export function createSkillToken(skillId: string): string {
  return `{{skill:${skillId}}}`
}

export function getPromptIdFromToken(token: string): string | null {
  const match = token.match(/^\{\{prompt:([^}]+)\}\}$/)
  return match ? match[1] : null
}

export function getSkillIdFromToken(token: string): string | null {
  const match = token.match(/^\{\{skill:([^}]+)\}\}$/)
  return match ? match[1] : null
}

export function formatPromptForModel(title: string, body: string): string {
  return `<user_prompt name="${title.replace(/"/g, '&quot;')}">\n${body}\n</user_prompt>`
}

export interface SkillModelPaths {
  path?: string
  directoryPath?: string
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatSkillForModel(
  name: string,
  _source: string,
  _description: string,
  body: string,
  paths: SkillModelPaths = {},
): string {
  const location = paths.path || paths.directoryPath || ''
  const referenceBase = paths.directoryPath || location || '.'

  return `<skill name="${escapeAttr(name)}" location="${escapeAttr(location)}">\nReferences are relative to ${referenceBase}.\n\n${body}\n</skill>`
}

export function displayTextFromPromptParts(
  content: string,
  contentParts?: Array<{ type: string; content?: string; title?: string; name?: string } | PromptReferenceSnapshot | SkillReferenceSnapshot>,
): string {
  if (!contentParts || contentParts.length === 0) return content
  return contentParts
    .map(part => {
      if ('type' in part && part.type === 'text') return part.content || ''
      if ('type' in part && part.type === 'prompt-ref') return `[Prompt: ${part.title || 'Untitled'}]`
      if ('type' in part && part.type === 'skill-ref') return `[Skill: ${part.name || 'Untitled'}]`
      return ''
    })
    .join('')
}

export function rawTextFromPromptParts(
  content: string,
  contentParts?: Array<{ type: string; content?: string; promptId?: string; skillId?: string }>,
): string {
  if (!contentParts || contentParts.length === 0) return content
  return contentParts
    .map(part => {
      if (part.type === 'text') return part.content || ''
      if (part.type === 'prompt-ref' && part.promptId) return createPromptToken(part.promptId)
      if (part.type === 'skill-ref' && part.skillId) return createSkillToken(part.skillId)
      return ''
    })
    .join('')
}
