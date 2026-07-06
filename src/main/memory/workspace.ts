import { DEFAULT_AGENT_ID } from '../../shared/ipc.js'
import type { AppSettings } from '../../shared/ipc.js'
import { normalizeSoulMemorySettings } from '../../shared/defaults/settings.js'
import { getAgentsDir, getStorePath } from '../stores/paths.js'
import { getSettings } from '../stores/settings.js'
import { getVariablesStore } from '../variables/index.js'
import { expandPath } from '../tools/core/sandbox.js'
import * as store from '../store.js'
import { LOCAL_CLIENT_USER_ID } from '../channel/origin.js'
import type { MemoryWorkspace, ResolvedSoulMemorySettings } from '@onething/runtime/memory/types'
import {
  planSoulMemoryWorkspacePaths as corePlanSoulMemoryWorkspacePaths,
  resolveSoulMemoryRootPath as coreResolveSoulMemoryRootPath,
} from '@onething/runtime/plugins'
import {
  canonicalKindFromCaptureKind as runtimeCanonicalKindFromCaptureKind,
  isDurableCandidate as runtimeIsDurableCandidate,
  sanitizeAgentPathSegment as runtimeSanitizeAgentPathSegment,
} from '@onething/runtime/memory/workspace'

export {
  CAPTURE_MAX_PENDING,
  CAPTURE_PENDING_STORE_KEY,
  CANONICAL_MIGRATION_STORE_KEY,
  DREAMING_SCHEDULER_TASK_ID,
  GRAPH_MIGRATION_STORE_KEY,
  SCOPED_DREAMING_SCHEDULER_TASK_ID,
  SOUL_MEMORY_PLUGIN_ID,
  SOUL_MEMORY_RULES_PROMPT,
  SOUL_TEMPLATE,
  USER_SELF_ENTITY_ID,
  asBullet,
  canonicalTokens,
  cosine,
  dateString,
  dateStringDaysAgo,
  estimateTokens,
  extractCandidateValue,
  ftsQuery,
  isIndexableMarkdownPath,
  looksLikeNameValue,
  normalizeBulletText,
  normalizeForDedupe,
  normalizeMemoryRelativePath,
  previewLine,
  readLimited,
  replaceFileAtomic,
  sanitizeMemoryKey,
  sha,
  slugifyMemoryKeyPart,
  todayString,
  tokenJaccard,
  truncate,
  writeIfMissing,
} from '@onething/runtime/memory/workspace'

export function resolveSettings(settings?: AppSettings): ResolvedSoulMemorySettings {
  return normalizeSoulMemorySettings(settings?.general?.soulMemory) as ResolvedSoulMemorySettings
}

export function sanitizeAgentPathSegment(agentId: string): string {
  return runtimeSanitizeAgentPathSegment(agentId, DEFAULT_AGENT_ID)
}

function profileIdFromMemoryScope(memoryScopeId?: string): string | undefined {
  if (!memoryScopeId) return undefined
  const clientPrefix = 'client:'
  if (memoryScopeId.startsWith(clientPrefix)) return memoryScopeId.slice(clientPrefix.length) || undefined
  return sanitizeAgentPathSegment(memoryScopeId)
}

export function resolveSessionMemoryProfileId(sessionId?: string): string {
  if (!sessionId) return DEFAULT_AGENT_ID
  const session = store.getSession(sessionId)
  return session?.memoryProfileId
    || profileIdFromMemoryScope(session?.memoryScopeId)
    || session?.agentId
    || DEFAULT_AGENT_ID
}

function memoryWorkspaceIdForProfile(profileId: string): string {
  return profileId === LOCAL_CLIENT_USER_ID ? DEFAULT_AGENT_ID : profileId
}

export function resolveSessionAgentId(sessionId?: string): string {
  return memoryWorkspaceIdForProfile(resolveSessionMemoryProfileId(sessionId))
}

export function resolveRoot(settings: ResolvedSoulMemorySettings, agentId = DEFAULT_AGENT_ID): string {
  return coreResolveSoulMemoryRootPath({
    settings,
    agentId,
    defaultAgentId: DEFAULT_AGENT_ID,
    agentsDir: getAgentsDir(),
    aiNoteDir: getVariablesStore().getAiNoteDir() || '~/.onething/notes',
    expandPath,
  })
}

export function getWorkspace(appSettings?: AppSettings, agentId = DEFAULT_AGENT_ID): MemoryWorkspace {
  const settings = resolveSettings(appSettings || getSettings())
  const resolvedAgentId = agentId || DEFAULT_AGENT_ID
  const plan = corePlanSoulMemoryWorkspacePaths({
    settings,
    agentId: resolvedAgentId,
    defaultAgentId: DEFAULT_AGENT_ID,
    agentsDir: getAgentsDir(),
    storePath: getStorePath(),
    aiNoteDir: getVariablesStore().getAiNoteDir() || '~/.onething/notes',
    expandPath,
  })
  return {
    settings,
    ...plan,
  }
}

export function canonicalKindFromCaptureKind(
  kind: import('@onething/runtime/memory/types').CaptureCandidateKind | string,
): import('../../shared/ipc.js').CanonicalMemoryKind {
  return runtimeCanonicalKindFromCaptureKind(kind) as import('../../shared/ipc.js').CanonicalMemoryKind
}

export function isDurableCandidate(candidate: import('@onething/runtime/memory/types').CaptureCandidate): boolean {
  return runtimeIsDurableCandidate(candidate)
}
