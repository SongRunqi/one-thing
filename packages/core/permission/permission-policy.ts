import { Permission } from './index.js'
import * as PermissionGrants from './permission-grants.js'
import { coversAll } from './capability-registry.js'
import { principalId, type Principal } from './principal.js'
import { toJsonObject } from '../json.js'

export type PermissionPolicyMode = Permission.Mode
export type PermissionPolicyDecision = 'allow' | 'ask' | 'deny'
export type PermissionMetadata = Record<string, unknown>
export type PermissionGrantMatcher = typeof PermissionGrants.matchGrant
export interface PermissionBridge {
  getMode(sessionId: string): Permission.Mode
  ask(input: Parameters<typeof Permission.ask>[0]): Promise<void>
}

export interface PermissionEffect {
  kind: string
  resources: string[]
  barrier?: boolean
  external?: boolean
  sensitive?: boolean
  metadata?: PermissionMetadata
}

export interface PermissionPreview {
  title?: string
  metadata?: PermissionMetadata
  diff?: string
  path?: string
  additions?: number
  deletions?: number
}

export interface PermissionPolicyInput {
  sessionId: string
  mode: PermissionPolicyMode
  effects: PermissionEffect[]
  workspaceRoot?: string
  userId?: string
  workspaceId?: string
  grantMatcher?: PermissionGrantMatcher
}

export interface EnforcePermissionPolicyInput {
  sessionId: string
  messageId: string
  toolCallId?: string
  toolName: string
  effects: PermissionEffect[]
  preview?: PermissionPreview
  workspaceRoot?: string
  userId?: string
  workspaceId?: string
  /**
   * Who is running this tool. Carried from the engine boundary, never derived
   * here. Nothing in `decidePermission` reads it yet — P0 only makes the actor
   * visible (permission card, audit ledger); the judgment gains its subject
   * dimension in P3.
   */
  principal?: Principal
  grantMatcher?: PermissionGrantMatcher
  permissionBridge?: PermissionBridge
}

export interface PermissionPolicyResult {
  decision: PermissionPolicyDecision
  effect?: PermissionEffect
  reason?: string
  grantId?: string
}

/**
 * Covered by a capability the app or the user declared — see
 * ./capability-registry.js. Not a grant: nobody was asked, because the answer
 * was decided ahead of time and is listed in settings.
 */
function isCapabilityCovered(effect: PermissionEffect): boolean {
  if (effect.resources.length === 0) return false
  if (isAutoAcceptedEditEffect(effect)) return coversAll(effect.resources, 'write')
  if (effect.kind === 'read') return coversAll(effect.resources, 'read')
  return false
}

function isHardDeny(effect: PermissionEffect): boolean {
  return effect.metadata?.hardDeny === true
}

function isAutoAcceptedEditEffect(effect: PermissionEffect): boolean {
  return effect.kind === 'file_edit' ||
    effect.kind === 'file_write' ||
    effect.kind === 'file_destructive_edit'
}

function effectPattern(effect: PermissionEffect): string | string[] {
  return effect.resources.length === 0 ? effect.kind : effect.resources
}

export function decidePermission(input: PermissionPolicyInput): PermissionPolicyResult {
  for (const effect of input.effects) {
    if (isHardDeny(effect)) {
      return { decision: 'deny', effect, reason: String(effect.metadata?.reason || 'Hard-denied tool effect') }
    }
  }

  if (input.mode === 'dangerously-allow-all') {
    return { decision: 'allow' }
  }

  const promptEffects = input.effects.filter(
    effect => effect.kind !== 'read' && !isCapabilityCovered(effect),
  )
  if (promptEffects.length === 0) return { decision: 'allow' }

  const matchGrant = input.grantMatcher ?? PermissionGrants.matchGrant
  const grantMatches = promptEffects.map(effect => ({
    effect,
    grant: matchGrant({
      type: effect.kind,
      pattern: effectPattern(effect),
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot,
      userId: input.userId,
      workspaceId: input.workspaceId,
    }),
  }))

  if (grantMatches.every(item => !!item.grant)) {
    return { decision: 'allow', effect: grantMatches[0]?.effect, grantId: grantMatches[0]?.grant?.id }
  }

  if (input.mode === 'auto-accept-edits' && promptEffects.every(isAutoAcceptedEditEffect)) {
    return { decision: 'allow' }
  }

  const askEffect = grantMatches.find(item => !item.grant)?.effect
  return askEffect ? { decision: 'ask', effect: askEffect } : { decision: 'allow' }
}

function titleForEffect(input: EnforcePermissionPolicyInput, effect: PermissionEffect): string {
  if (input.preview?.title) return input.preview.title
  if (effect.kind === 'bash') return String(effect.metadata?.command || 'Run bash command')
  if (effect.kind === 'mcp') return `Run MCP tool: ${input.toolName}`
  if (effect.kind === 'capability_change') {
    const target = String(effect.metadata?.variable || input.toolName)
    return `Repoint ${target} to: ${String(effect.metadata?.value || effect.resources[0] || '')}`
  }
  if (effect.kind === 'external_directory') return `Access directory outside project: ${effect.resources[0] || ''}`
  if (effect.kind === 'sensitive_file_read') return `Read sensitive file: ${String(effect.metadata?.path || effect.resources[0] || '')}`
  if (effect.kind === 'file_write') return `Write file: ${String(effect.metadata?.path || effect.resources[0] || '')}`
  if (effect.kind === 'file_edit' || effect.kind === 'file_destructive_edit') return `Edit file: ${String(effect.metadata?.path || effect.resources[0] || '')}`
  return `Use ${input.toolName}`
}

export async function enforcePermissionPolicy(input: EnforcePermissionPolicyInput): Promise<void> {
  if (input.effects.length === 0) return

  const permission = input.permissionBridge ?? Permission
  const mode = permission.getMode(input.sessionId)
  for (const effect of input.effects) {
    const result = decidePermission({
      sessionId: input.sessionId,
      mode,
      effects: [effect],
      workspaceRoot: input.workspaceRoot,
      userId: input.userId,
      workspaceId: input.workspaceId,
      grantMatcher: input.grantMatcher,
    })

    if (result.decision === 'deny') {
      throw new Error(result.reason || 'Tool call denied by permission policy')
    }

    if (result.decision === 'allow') continue

    await permission.ask({
      type: effect.kind,
      pattern: effectPattern(effect),
      sessionId: input.sessionId,
      messageId: input.messageId,
      callId: input.toolCallId,
      title: titleForEffect(input, effect),
      workingDirectory: input.workspaceRoot,
      userId: input.userId,
      workspaceId: input.workspaceId,
      principal: input.principal,
      metadata: toJsonObject({
        toolName: input.toolName,
        // Mirrored into metadata so transports that only carry the JSON blob
        // (SSE replay, persisted prompts) can still name the actor.
        ...(input.principal ? { principalId: principalId(input.principal) } : {}),
        ...(input.preview?.metadata ?? {}),
        ...(effect.metadata ?? {}),
        resources: effect.resources,
        effectKind: effect.kind,
        external: effect.external,
        sensitive: effect.sensitive,
        ...(input.preview?.diff && { diff: input.preview.diff }),
        ...(input.preview?.path && { path: input.preview.path }),
        ...(input.preview?.additions !== undefined && { additions: input.preview.additions }),
        ...(input.preview?.deletions !== undefined && { deletions: input.preview.deletions }),
      }),
    })
  }
}
