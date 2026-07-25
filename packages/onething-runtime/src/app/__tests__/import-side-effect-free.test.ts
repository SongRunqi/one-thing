/**
 * Assembly-layer fence: importing src/app modules must configure NOTHING.
 *
 * Before the createOnethingBackend factory existed, eleven modules wired
 * runtime adapters at import time. In a process that assembles its own
 * runtime (apps/server), merely importing those modules clobbered the host's
 * configuration (last-writer-wins). All wiring now happens exclusively
 * through configureAppRuntimeAdapters() / createOnethingBackend().
 */
import { describe, expect, it, vi } from 'vitest'

const spy = vi.hoisted(() => ({ calls: [] as string[] }))

vi.mock('@onething/runtime/tools/sandbox-runtime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureOnethingToolSandboxRuntime: () => { spy.calls.push('sandbox') },
}))
vi.mock('@onething/runtime/tools/background-jobs', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureCoreBackgroundJobs: () => { spy.calls.push('background-jobs') },
}))
vi.mock('@onething/runtime/scheduler', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureOnethingScheduler: () => { spy.calls.push('scheduler') },
}))
vi.mock('@onething/runtime/files/ripgrep', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureOnethingRipgrepRuntime: () => { spy.calls.push('ripgrep') },
}))
vi.mock('@onething/runtime/search', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureOnethingSearchProviders: () => { spy.calls.push('search') },
}))
vi.mock('@onething/runtime/skills', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureOnethingSkillManageRuntime: () => { spy.calls.push('skill-manage') },
  configureOnethingSkillsLoaderRuntime: () => { spy.calls.push('skills-loader') },
}))
vi.mock('@onething/runtime/permissions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureOnethingPermissionGrantStorage: () => { spy.calls.push('permission-grants') },
}))
vi.mock('../providers/registry.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  initializeRegistry: () => { spy.calls.push('provider-registry') },
}))
vi.mock('../permission/capabilities.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registerBuiltinCapabilities: () => { spy.calls.push('capabilities') },
}))

describe('src/app import purity', () => {
  it('importing the formerly side-effectful modules configures nothing', { timeout: 60_000 }, async () => {
    await import('../tools/core/sandbox.js')
    await import('../tools/core/background-jobs.js')
    await import('../tools/core/bash-executor.js')
    await import('../providers/index.js')
    await import('../scheduler/index.js')
    await import('../utils/ripgrep.js')
    await import('../search/providers.js')
    await import('../skills/manage.js')
    await import('../skills/loader.js')
    await import('../permission/permission-grants.js')

    expect(spy.calls).toEqual([])
  })

  it('configureAppRuntimeAdapters wires every adapter exactly once', { timeout: 60_000 }, async () => {
    const { configureAppRuntimeAdapters } = await import('../backend.js')

    configureAppRuntimeAdapters()
    configureAppRuntimeAdapters()

    expect([...spy.calls].sort()).toEqual([
      'background-jobs',
      'capabilities',
      'permission-grants',
      'provider-registry',
      'ripgrep',
      'sandbox',
      'scheduler',
      'search',
      'skill-manage',
      'skills-loader',
    ])
  })
})
