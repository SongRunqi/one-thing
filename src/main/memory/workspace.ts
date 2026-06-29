import { DEFAULT_AGENT_ID } from '../../shared/ipc.js'
import type { AppSettings } from '../../shared/ipc.js'
import { normalizeSoulMemorySettings } from '../../shared/defaults/settings.js'
import { getAgentsDir, getStorePath } from '../stores/paths.js'
import { getSettings } from '../stores/settings.js'
import { getVariablesStore } from '../variables/index.js'
import { expandPath } from '../tools/core/sandbox.js'
import * as store from '../store.js'
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

export function resolveSessionAgentId(sessionId?: string): string {
  if (!sessionId) return DEFAULT_AGENT_ID
  return store.getSession(sessionId)?.agentId || DEFAULT_AGENT_ID
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
