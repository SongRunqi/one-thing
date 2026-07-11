import { describe, expect, it } from 'vitest'
import { splitVariablesForPrompt } from '../format.js'
import { SessionStoreProvider } from '../providers/session-store.js'
import type { ContextVariable } from '../types.js'

function makeProvider() {
  const store = new Map<string, ContextVariable[]>()
  return new SessionStoreProvider({
    read: sessionId => store.get(sessionId) ?? [],
    write: (sessionId, variables) => {
      store.set(sessionId, variables)
    },
  })
}

describe('custom variable volatility', () => {
  it('persists volatility through set/list and routes to the turn channel', async () => {
    const provider = makeProvider()
    const ctx = { sessionId: 's1' }
    await provider.set(ctx, { name: 'migration_state', value: 'phase 2/3', volatility: 'turn' })
    await provider.set(ctx, { name: 'deploy_target', value: 'staging' })

    const listed = provider.list(ctx)
    expect(listed.find(v => v.name === 'migration_state')?.volatility).toBe('turn')
    expect(listed.find(v => v.name === 'deploy_target')?.volatility).toBeUndefined()

    const { systemText, turnText } = splitVariablesForPrompt(listed)
    expect(turnText).toBe('- migration_state: phase 2/3')
    expect(systemText).toBe('- deploy_target: staging')
  })

  it('updating a turn variable keeps the static channel byte-identical', async () => {
    const provider = makeProvider()
    const ctx = { sessionId: 's1' }
    await provider.set(ctx, { name: 'deploy_target', value: 'staging' })
    await provider.set(ctx, { name: 'migration_state', value: 'phase 1/3', volatility: 'turn' })
    const before = splitVariablesForPrompt(provider.list(ctx)).systemText

    await provider.set(ctx, { name: 'migration_state', value: 'phase 2/3', volatility: 'turn' })
    const after = splitVariablesForPrompt(provider.list(ctx)).systemText

    expect(after).toBe(before)
  })
})
