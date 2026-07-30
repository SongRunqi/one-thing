import { describe, expect, it } from 'vitest'
import {
  enterAllowlistMode,
  isFollowGlobal,
  isToolSelected,
  leaveAllowlistMode,
  modelBindingPayload,
  readToolAllowlist,
  toggleTool,
  toolAllowlistPayload,
  validateToolAllowlist,
  type ToolAllowlistState,
} from '../agent-config-form'

describe('agent tool allowlist state machine', () => {
  it('treats null as follow-global and an array as an allowlist', () => {
    expect(isFollowGlobal(null)).toBe(true)
    expect(isFollowGlobal([])).toBe(false)
    expect(isFollowGlobal(['read'])).toBe(false)
  })

  it('enters allowlist mode empty so nothing is curated by accident', () => {
    expect(enterAllowlistMode(null)).toEqual([])
  })

  it('keeps an existing allowlist when re-entering the mode', () => {
    const existing = ['read', 'write']
    const next = enterAllowlistMode(existing)
    expect(next).toEqual(['read', 'write'])
    expect(next).not.toBe(existing)
  })

  it('leaves allowlist mode back to null (follow global)', () => {
    expect(leaveAllowlistMode()).toBeNull()
  })

  it('toggles tools on and off without mutating the previous state', () => {
    const start: ToolAllowlistState = []
    const withRead = toggleTool(start, 'read')
    expect(withRead).toEqual(['read'])
    expect(start).toEqual([])

    const withBoth = toggleTool(withRead, 'bash')
    expect(withBoth).toEqual(['read', 'bash'])

    expect(toggleTool(withBoth, 'read')).toEqual(['bash'])
  })

  it('reports selection only in allowlist mode', () => {
    expect(isToolSelected(null, 'read')).toBe(false)
    expect(isToolSelected(['read'], 'read')).toBe(true)
    expect(isToolSelected(['read'], 'write')).toBe(false)
  })

  it('blocks saving an empty allowlist but allows follow-global', () => {
    expect(validateToolAllowlist([])).not.toBe('')
    expect(validateToolAllowlist(null)).toBe('')
    expect(validateToolAllowlist(['read'])).toBe('')
  })

  it('sends null for follow-global and a deduped array for an allowlist', () => {
    expect(toolAllowlistPayload(null)).toBeNull()
    expect(toolAllowlistPayload(['read', 'read', ' write ', ''])).toEqual(['read', 'write'])
  })

  it('collapses an all-blank allowlist to null rather than a total ban', () => {
    expect(toolAllowlistPayload([])).toBeNull()
    expect(toolAllowlistPayload(['  ', ''])).toBeNull()
  })

  it('reads a stored agent back into form state', () => {
    expect(readToolAllowlist(undefined)).toBeNull()
    expect(readToolAllowlist(null)).toBeNull()
    expect(readToolAllowlist([])).toBeNull()
    expect(readToolAllowlist(['read'])).toEqual(['read'])
  })

  it('round-trips allowlist → payload → form state', () => {
    const payload = toolAllowlistPayload(toggleTool(enterAllowlistMode(null), 'read'))
    expect(payload).toEqual(['read'])
    expect(readToolAllowlist(payload)).toEqual(['read'])
  })
})

describe('agent model binding payload', () => {
  it('clears the binding when no provider is chosen', () => {
    expect(modelBindingPayload(null)).toBeNull()
    expect(modelBindingPayload({})).toBeNull()
    expect(modelBindingPayload({ providerId: '  ' })).toBeNull()
    expect(modelBindingPayload({ modelId: 'gpt-5' })).toBeNull()
  })

  it('keeps a provider-only pin (the coordinator stamps provider alone)', () => {
    expect(modelBindingPayload({ providerId: 'claude' })).toEqual({ providerId: 'claude' })
  })

  it('sends the provider/model pair', () => {
    expect(modelBindingPayload({ providerId: 'claude', modelId: 'sonnet' }))
      .toEqual({ providerId: 'claude', modelId: 'sonnet' })
  })

  it('preserves a thinking effort the editor never surfaces', () => {
    expect(modelBindingPayload({ providerId: 'claude', modelId: 'sonnet', thinking: 'high' }))
      .toEqual({ providerId: 'claude', modelId: 'sonnet', thinking: 'high' })
  })
})
