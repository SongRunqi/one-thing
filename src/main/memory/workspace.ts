import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_AGENT_ID } from '../../shared/ipc.js'
import type { AppSettings } from '../../shared/ipc.js'
import { normalizeSoulMemorySettings } from '../../shared/defaults/settings.js'
import { getAgentsDir, getStorePath } from '../stores/paths.js'
import { getSettings } from '../stores/settings.js'
import { getVariablesStore } from '../variables/index.js'
import { expandPath } from '../tools/core/sandbox.js'
import * as store from '../store.js'
import type { MemoryWorkspace, ResolvedSoulMemorySettings } from './types.js'

export const SOUL_MEMORY_PLUGIN_ID = 'soul-memory'

export const SOUL_MEMORY_RULES_PROMPT = `# Soul Memory Rules
- SOUL.md是你的个性文件
- memory/YYYY-MM-DD.md is for AI daily working notes, session process, and medium-confidence context.
- MEMORY.md is for durable promoted memory.
`

export const SOUL_TEMPLATE = `# SOUL.md

`

export const DREAMING_SCHEDULER_TASK_ID = 'memory-dreaming-promotion'
export const SCOPED_DREAMING_SCHEDULER_TASK_ID = `plugin:${SOUL_MEMORY_PLUGIN_ID}:${DREAMING_SCHEDULER_TASK_ID}`
export const CAPTURE_PENDING_STORE_KEY = 'pendingCaptures'
export const CAPTURE_MAX_PENDING = 20
export const CANONICAL_MIGRATION_STORE_KEY = 'canonicalMemoryMigrationV1Done'
export const GRAPH_MIGRATION_STORE_KEY = 'graphMemoryMigrationV1Done'
export const USER_SELF_ENTITY_ID = 'user:self'

export function normalizeMemoryRelativePath(value: string): string {
  return value.split(path.sep).join('/')
}

export function isIndexableMarkdownPath(relativePath: string): boolean {
  const normalized = normalizeMemoryRelativePath(relativePath)
  if (normalized === 'MEMORY.md') return true
  return normalized.startsWith('memory/') &&
    !normalized.startsWith('memory/.dreams/') &&
    normalized.toLowerCase().endsWith('.md')
}

export function todayString(): string {
  const now = new Date()
  return dateString(now)
}

export function dateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateStringDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return dateString(date)
}

export function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 80)).trimEnd()}\n\n[Truncated at ${maxChars} chars]`
}

export function estimateTokens(value: string): number {
  const words = value.trim().split(/\s+/).filter(Boolean).length
  const charEstimate = Math.ceil(value.length / 4)
  return Math.max(words, charEstimate, 1)
}

export function resolveSettings(settings?: AppSettings): ResolvedSoulMemorySettings {
  return normalizeSoulMemorySettings(settings?.general?.soulMemory) as ResolvedSoulMemorySettings
}

export function sanitizeAgentPathSegment(agentId: string): string {
  return agentId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_AGENT_ID
}

export function resolveSessionAgentId(sessionId?: string): string {
  if (!sessionId) return DEFAULT_AGENT_ID
  return store.getSession(sessionId)?.agentId || DEFAULT_AGENT_ID
}

export function resolveRoot(settings: ResolvedSoulMemorySettings, agentId = DEFAULT_AGENT_ID): string {
  if (agentId !== DEFAULT_AGENT_ID) {
    return path.join(getAgentsDir(), sanitizeAgentPathSegment(agentId))
  }
  if (settings.directoryMode === 'custom' && settings.customDirectory.trim()) {
    return path.resolve(expandPath(settings.customDirectory.trim()))
  }
  const aiNoteDir = getVariablesStore().getAiNoteDir() || '~/.onething/notes'
  return path.resolve(expandPath(aiNoteDir))
}

export function getWorkspace(appSettings?: AppSettings, agentId = DEFAULT_AGENT_ID): MemoryWorkspace {
  const settings = resolveSettings(appSettings || getSettings())
  const resolvedAgentId = agentId || DEFAULT_AGENT_ID
  const root = resolveRoot(settings, resolvedAgentId)
  const memoryDir = path.join(root, 'memory')
  const today = todayString()
  const dataDir = resolvedAgentId === DEFAULT_AGENT_ID
    ? path.join(getStorePath(), 'plugin-data')
    : path.join(root, 'plugin-data')
  return {
    settings,
    agentId: resolvedAgentId,
    root,
    memoryDir,
    soulPath: path.join(root, 'SOUL.md'),
    userPath: path.join(root, 'USER.md'),
    memoryPath: path.join(root, 'MEMORY.md'),
    dreamsPath: path.join(root, 'DREAMS.md'),
    todayPath: path.join(memoryDir, `${today}.md`),
    dbPath: path.join(dataDir, 'soul-memory.sqlite'),
  }
}

export async function writeIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fsp.access(filePath, fs.constants.F_OK)
  } catch {
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, content, 'utf-8')
  }
}

export function readLimited(filePath: string, maxChars: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return truncate(content, maxChars)
  } catch {
    return ''
  }
}

export function normalizeBulletText(value: string): string {
  return value
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function asBullet(value: string): string {
  const text = normalizeBulletText(value)
  return text ? `- ${text}` : ''
}

export function slugifyMemoryKeyPart(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80)
  return slug || sha(value).slice(0, 10)
}

export function sanitizeMemoryKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 160)
}

export function extractCandidateValue(text: string): string {
  const cleaned = normalizeBulletText(text).replace(/\.$/, '').trim()
  const patterns = [
    /(?:user(?:'s)? name is|user is named|user identifies as|user is known as|call the user|call user)\s+([^.;,\n]+)/i,
    /(?:user is|the user is)\s+([^.;,\n]+)/i,
    /(?:my name is|i am|i'm|call me)\s+([^.;,\n]+)/i,
    /(?:我叫|我是|我的名字是)\s*([^。；，\n]+)/,
  ]
  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match?.[1]) return match[1].replace(/^["'""]+|["'""]+$/g, '').trim()
  }
  return cleaned
}

export function looksLikeNameValue(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean)
  return words.length <= 3 && value.length <= 80 && !/\b(prefers?|likes?|works?|uses?|wants?|needs?|developer|engineer|project)\b/i.test(value)
}

export function canonicalKindFromCaptureKind(kind: import('./types.js').CaptureCandidateKind | string): import('../../shared/ipc.js').CanonicalMemoryKind {
  if (
    kind === 'identity' ||
    kind === 'preference' ||
    kind === 'decision' ||
    kind === 'project' ||
    kind === 'constraint'
  ) {
    return kind
  }
  return 'fact'
}

export function canonicalTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]+/gu) || [],
  )
}

export function tokenJaccard(left: string, right: string): number {
  const a = canonicalTokens(left)
  const b = canonicalTokens(right)
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const token of a) {
    if (b.has(token)) overlap++
  }
  return overlap / (a.size + b.size - overlap)
}

const DURABLE_CAPTURE_KINDS = new Set<import('./types.js').CaptureCandidateKind>([
  'identity',
  'preference',
  'decision',
  'project',
  'constraint',
  'fact',
])

export function isDurableCandidate(candidate: import('./types.js').CaptureCandidate): boolean {
  return DURABLE_CAPTURE_KINDS.has(candidate.kind)
}

export function normalizeForDedupe(value: string): string {
  return value
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '')
    .replace(/[`*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function previewLine(value: string, maxChars = 220): string {
  return truncate(value.replace(/\s+/g, ' ').trim(), maxChars)
}

export function cosine(left?: number[], right?: number[]): number {
  if (!left || !right || left.length === 0 || right.length === 0) return 0
  const count = Math.min(left.length, right.length)
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < count; i++) {
    dot += left[i] * right[i]
    leftNorm += left[i] * left[i]
    rightNorm += right[i] * right[i]
  }
  if (leftNorm === 0 || rightNorm === 0) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

export function ftsQuery(query: string): string {
  const terms = query
    .normalize('NFKC')
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.slice(0, 12) || []
  if (terms.length === 0) return `"${query.replace(/"/g, '""').slice(0, 80)}"`
  return terms.map(term => `"${term.replace(/"/g, '""')}"`).join(' OR ')
}

export async function replaceFileAtomic(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  await fsp.writeFile(tmpPath, content, 'utf-8')
  await fsp.rename(tmpPath, filePath)
}
