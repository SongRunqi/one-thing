import { describe, expect, it } from 'vitest'
import { registerStandardVariableProviders } from '../bootstrap.js'
import { VariableRegistry } from '../registry.js'

function makeRegistry(): VariableRegistry {
  const registry = new VariableRegistry()
  registerStandardVariableProviders(registry, {
    workdir: {
      read: () => '/nonexistent-workdir-for-test',
      readRoots: () => [],
      write: () => undefined,
      writeRoots: () => undefined,
      expandPath: (input) => input,
    },
    notes: {
      read: () => '',
      write: () => undefined,
      expandPath: (input) => input,
    },
    globalStore: {
      read: () => [],
      write: () => undefined,
    },
    sessionStore: {
      read: () => [],
      write: () => undefined,
    },
    backgroundJobs: { listJobs: () => [] },
  })
  return registry
}

describe('registerStandardVariableProviders', () => {
  it('registers the full canonical provider set without conflicts', async () => {
    const registry = makeRegistry()
    const names = (await registry.list({ sessionId: 's' })).map(v => v.name)
    // Dynamic providers that emit unconditionally must be present; providers
    // that emit conditionally (git_branch, background_jobs) are covered by
    // their own tests — here the point is that every host gets the same set.
    expect(names).toContain('workdir')
    expect(names).toContain('datetime')
    expect(names).toContain('ai_note_dir')
  })

  it('is the single assembly point — registering twice conflicts', () => {
    const registry = makeRegistry()
    expect(() =>
      registerStandardVariableProviders(registry, {
        workdir: {
          read: () => '',
          readRoots: () => [],
          write: () => undefined,
          writeRoots: () => undefined,
          expandPath: (input) => input,
        },
        notes: { read: () => '', write: () => undefined, expandPath: (input) => input },
        globalStore: { read: () => [], write: () => undefined },
        sessionStore: { read: () => [], write: () => undefined },
      }),
    ).toThrow(/already registered/)
  })
})
