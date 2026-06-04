import type { ToolEffect, ToolPreview } from './tool-effect.js'
import * as PermissionGrants from '../../permission/permission-grants.js'
import { Permission } from '../../permission/index.js'

export type PermissionPolicyMode = 'normal' | 'auto-accept-edits' | 'dangerously-allow-all'
export type PermissionPolicyDecision = 'allow' | 'ask' | 'deny'

export interface PermissionPolicyInput {
  sessionId: string
  mode: PermissionPolicyMode
  effects: ToolEffect[]
  workspaceRoot?: string
}

export interface EnforcePermissionPolicyInput {
  sessionId: string
  messageId: string
  toolCallId?: string
  toolName: string
  effects: ToolEffect[]
  preview?: ToolPreview
  workspaceRoot?: string
}

export interface PermissionPolicyResult {
  decision: PermissionPolicyDecision
  effect?: ToolEffect
  reason?: string
  grantId?: string
}

function isHardDeny(effect: ToolEffect): boolean {
  return effect.metadata?.hardDeny === true
}

function isAutoAcceptedEditEffect(effect: ToolEffect): boolean {
  return effect.kind === 'file_edit' ||
    effect.kind === 'file_write' ||
    effect.kind === 'file_destructive_edit'
}

function effectPattern(effect: ToolEffect): string | string[] {
  return effect.resources.length === 0 ? effect.kind : effect.resources
}

/**
 * Centralized permission policy used by the Orchestrator/tool execution path.
 */
export function decidePermission(input: PermissionPolicyInput): PermissionPolicyResult {
  for (const effect of input.effects) {
    if (isHardDeny(effect)) {
      return { decision: 'deny', effect, reason: String(effect.metadata?.reason || 'Hard-denied tool effect') }
    }
  }

  if (input.mode === 'dangerously-allow-all') {
    return { decision: 'allow' }
  }

  const promptEffects = input.effects.filter(effect => effect.kind !== 'read')
  if (promptEffects.length === 0) return { decision: 'allow' }

  const grantMatches = promptEffects.map(effect => ({
    effect,
    grant: PermissionGrants.matchGrant({
      type: effect.kind,
      pattern: effectPattern(effect),
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot,
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

function titleForEffect(input: EnforcePermissionPolicyInput, effect: ToolEffect): string {
  if (input.preview?.title) return input.preview.title
  if (effect.kind === 'bash') return String(effect.metadata?.command || 'Run bash command')
  if (effect.kind === 'mcp') return `Run MCP tool: ${input.toolName}`
  if (effect.kind === 'external_directory') return `Access directory outside project: ${effect.resources[0] || ''}`
  if (effect.kind === 'sensitive_file_read') return `Read sensitive file: ${String(effect.metadata?.path || effect.resources[0] || '')}`
  if (effect.kind === 'file_write') return `Write file: ${String(effect.metadata?.path || effect.resources[0] || '')}`
  if (effect.kind === 'file_edit' || effect.kind === 'file_destructive_edit') return `Edit file: ${String(effect.metadata?.path || effect.resources[0] || '')}`
  return `Use ${input.toolName}`
}

export async function enforcePermissionPolicy(input: EnforcePermissionPolicyInput): Promise<void> {
  if (input.effects.length === 0) return

  const mode = Permission.getMode(input.sessionId)
  for (const effect of input.effects) {
    const result = decidePermission({
      sessionId: input.sessionId,
      mode,
      effects: [effect],
      workspaceRoot: input.workspaceRoot,
    })

    if (result.decision === 'deny') {
      throw new Error(result.reason || 'Tool call denied by permission policy')
    }

    if (result.decision === 'allow') continue

    await Permission.ask({
      type: effect.kind,
      pattern: effectPattern(effect),
      sessionId: input.sessionId,
      messageId: input.messageId,
      callId: input.toolCallId,
      title: titleForEffect(input, effect),
      workingDirectory: input.workspaceRoot,
      metadata: {
        toolName: input.toolName,
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
      },
    })
  }
}
