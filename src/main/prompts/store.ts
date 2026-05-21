import crypto from 'crypto'
import { z } from 'zod'
import type {
  PromptCreateRequest,
  PromptUpdateRequest,
  UserPrompt,
} from '../../shared/ipc.js'
import { getPromptsPath, readJsonFile, writeJsonFile } from '../stores/paths.js'

const PROMPT_SCHEMA = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const PROMPTS_FILE_SCHEMA = z.object({
  prompts: z.array(PROMPT_SCHEMA).default([]),
})

interface PromptsFile {
  prompts: UserPrompt[]
}

let promptsCache: PromptsFile | null = null
let promptsPathOverride: string | null = null

function getActivePromptsPath(): string {
  return promptsPathOverride || getPromptsPath()
}

function normalizeTags(tags: string[] | undefined): string[] | undefined {
  const normalized = Array.from(new Set(
    (tags || [])
      .map(tag => tag.trim())
      .filter(Boolean),
  ))
  return normalized.length > 0 ? normalized : undefined
}

function cleanPrompt(input: UserPrompt): UserPrompt {
  return {
    id: input.id,
    title: input.title.trim() || 'Untitled Prompt',
    body: input.body ?? '',
    description: input.description?.trim() || undefined,
    tags: normalizeTags(input.tags),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function parsePromptsFile(raw: unknown): PromptsFile {
  const parsed = PROMPTS_FILE_SCHEMA.safeParse(raw)
  if (!parsed.success) {
    console.warn('[prompts.store] persisted file failed schema validation, falling back to empty list', parsed.error.flatten())
    return { prompts: [] }
  }
  return {
    prompts: parsed.data.prompts.map(prompt => cleanPrompt(prompt)),
  }
}

function loadFromDisk(): PromptsFile {
  const raw = readJsonFile<unknown>(getActivePromptsPath(), { prompts: [] })
  return parsePromptsFile(raw)
}

function saveToDisk(state: PromptsFile): void {
  writeJsonFile(getActivePromptsPath(), state)
}

function getState(): PromptsFile {
  if (!promptsCache) promptsCache = loadFromDisk()
  return promptsCache
}

function persist(state: PromptsFile): void {
  promptsCache = state
  saveToDisk(state)
}

export function listPrompts(): UserPrompt[] {
  return [...getState().prompts].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      || b.updatedAt - a.updatedAt
  )
}

export function getPrompt(id: string): UserPrompt | undefined {
  return getState().prompts.find(prompt => prompt.id === id)
}

export function createPrompt(request: PromptCreateRequest): UserPrompt {
  const now = Date.now()
  const prompt: UserPrompt = cleanPrompt({
    id: crypto.randomUUID(),
    title: request.title,
    body: request.body,
    description: request.description,
    tags: request.tags,
    createdAt: now,
    updatedAt: now,
  })
  persist({ prompts: [...getState().prompts, prompt] })
  return prompt
}

export function updatePrompt(request: PromptUpdateRequest): UserPrompt | undefined {
  const state = getState()
  const index = state.prompts.findIndex(prompt => prompt.id === request.id)
  if (index === -1) return undefined

  const current = state.prompts[index]
  const updated = cleanPrompt({
    ...current,
    title: request.title ?? current.title,
    body: request.body ?? current.body,
    description: request.description ?? current.description,
    tags: request.tags ?? current.tags,
    updatedAt: Date.now(),
  })

  const prompts = [...state.prompts]
  prompts[index] = updated
  persist({ prompts })
  return updated
}

export function deletePrompt(id: string): boolean {
  const state = getState()
  const next = state.prompts.filter(prompt => prompt.id !== id)
  if (next.length === state.prompts.length) return false
  persist({ prompts: next })
  return true
}

export function invalidatePromptsCache(): void {
  promptsCache = null
}

export function setPromptsPathForTests(filePath: string | null): void {
  promptsPathOverride = filePath
  promptsCache = null
}
