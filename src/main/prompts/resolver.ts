import crypto from 'crypto'
import type {
  ChatMessage,
  ContentPart,
  PromptReferenceSnapshot,
  SkillDefinition,
  SkillReferenceSnapshot,
  UserPrompt,
} from '../../shared/ipc.js'
import {
  COMPOSER_REF_PATTERN,
  formatSkillForModel,
  formatPromptForModel,
} from '../../shared/prompt-references.js'
import { getPrompt } from './store.js'

export interface ResolvePromptReferencesOptions {
  skills?: SkillDefinition[]
}

export interface ResolvedPromptReferences {
  modelContent: string
  displayContent: string
  contentParts?: ContentPart[]
  missingPromptIds: string[]
  missingSkillIds: string[]
  hasPromptReferences: boolean
  hasSkillReferences: boolean
}

interface ComposerReferenceMatch {
  kind: 'prompt' | 'skill'
  refId: string
  token: string
  start: number
  end: number
}

const BARE_SLASH_SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

function bodyHash(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)
}

function snapshotFromPrompt(prompt: UserPrompt): PromptReferenceSnapshot {
  return {
    promptId: prompt.id,
    title: prompt.title,
    content: prompt.body,
    description: prompt.description,
    bodyHash: bodyHash(prompt.body),
  }
}

function snapshotFromSkill(skill: SkillDefinition): SkillReferenceSnapshot {
  return {
    skillId: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    content: skill.instructions,
    bodyHash: bodyHash(skill.instructions),
  }
}

function pushTextPart(parts: ContentPart[], text: string): void {
  if (!text) return
  const last = parts[parts.length - 1]
  if (last?.type === 'text') {
    last.content += text
    return
  }
  parts.push({ type: 'text', content: text })
}

function hasWhitespaceTokenBoundaries(content: string, start: number, end: number): boolean {
  const before = start > 0 ? content[start - 1] : ''
  const after = content[end] || ''
  return (!before || /\s/.test(before)) && (!after || /\s/.test(after))
}

function collectCaseInsensitiveSkillTokenMatches(
  rawContent: string,
  token: string,
  skill: SkillDefinition,
): ComposerReferenceMatch[] {
  const matches: ComposerReferenceMatch[] = []
  const lowerContent = rawContent.toLowerCase()
  const lowerToken = token.toLowerCase()
  let searchFrom = 0

  while (searchFrom < rawContent.length) {
    const start = lowerContent.indexOf(lowerToken, searchFrom)
    if (start === -1) break
    const end = start + token.length

    if (hasWhitespaceTokenBoundaries(rawContent, start, end)) {
      matches.push({
        kind: 'skill',
        refId: skill.id,
        token: rawContent.slice(start, end),
        start,
        end,
      })
    }

    searchFrom = end
  }

  return matches
}

function collectReferenceMatches(rawContent: string, skills: SkillDefinition[]): ComposerReferenceMatch[] {
  const matches: ComposerReferenceMatch[] = []
  COMPOSER_REF_PATTERN.lastIndex = 0
  for (const match of rawContent.matchAll(COMPOSER_REF_PATTERN)) {
    const start = match.index ?? 0
    matches.push({
      kind: match[1] as 'prompt' | 'skill',
      refId: match[2],
      token: match[0],
      start,
      end: start + match[0].length,
    })
  }

  const skillsByLength = [...skills].sort((a, b) => b.name.length - a.name.length)
  for (const skill of skillsByLength) {
    matches.push(
      ...collectCaseInsensitiveSkillTokenMatches(rawContent, `/skill:${skill.name}`, skill),
    )

    if (BARE_SLASH_SKILL_NAME_PATTERN.test(skill.name)) {
      matches.push(
        ...collectCaseInsensitiveSkillTokenMatches(rawContent, `/${skill.name}`, skill),
      )
    }
  }

  return matches.sort((a, b) => a.start - b.start || b.end - a.end)
}

export function resolvePromptReferences(
  rawContent: string,
  options: ResolvePromptReferencesOptions = {},
): ResolvedPromptReferences {
  const parts: ContentPart[] = []
  const missingPromptIds: string[] = []
  const missingSkillIds: string[] = []
  const skills = options.skills || []
  const skillsById = new Map(skills.map(skill => [skill.id, skill]))
  let modelContent = ''
  let displayContent = ''
  let cursor = 0
  let hasPromptReferences = false
  let hasSkillReferences = false

  for (const match of collectReferenceMatches(rawContent, skills)) {
    if (match.start < cursor) continue
    const { kind, refId, token, start, end } = match
    const before = rawContent.slice(cursor, start)
    modelContent += before
    displayContent += before
    pushTextPart(parts, before)

    if (kind === 'prompt') {
      const prompt = getPrompt(refId)
      if (!prompt) {
        missingPromptIds.push(refId)
        modelContent += token
        displayContent += token
        pushTextPart(parts, token)
      } else {
        const snapshot = snapshotFromPrompt(prompt)
        modelContent += formatPromptForModel(prompt.title, prompt.body)
        displayContent += `[Prompt: ${prompt.title}]`
        parts.push({ type: 'prompt-ref', ...snapshot })
        hasPromptReferences = true
      }
    }

    if (kind === 'skill') {
      const skill = skillsById.get(refId)
      if (!skill) {
        missingSkillIds.push(refId)
        modelContent += token
        displayContent += token
        pushTextPart(parts, token)
      } else {
        const snapshot = snapshotFromSkill(skill)
        modelContent += formatSkillForModel(skill.name, skill.source, skill.description, skill.instructions, {
          path: skill.path,
          directoryPath: skill.directoryPath,
        })
        displayContent += `[Skill: ${skill.name}]`
        parts.push({ type: 'skill-ref', ...snapshot })
        hasSkillReferences = true
      }
    }

    cursor = end
  }

  const after = rawContent.slice(cursor)
  modelContent += after
  displayContent += after
  pushTextPart(parts, after)

  return {
    modelContent,
    displayContent,
    contentParts: hasPromptReferences || hasSkillReferences ? parts : undefined,
    missingPromptIds,
    missingSkillIds,
    hasPromptReferences,
    hasSkillReferences,
  }
}

export function displayContentForMessage(message: Pick<ChatMessage, 'content' | 'contentParts'>): string {
  if (!message.contentParts || message.contentParts.length === 0) return message.content
  return message.contentParts
    .map(part => {
      if (part.type === 'text') return part.content
      if (part.type === 'prompt-ref') return `[Prompt: ${part.title}]`
      if (part.type === 'skill-ref') return `[Skill: ${part.name}]`
      return ''
    })
    .join('')
}
