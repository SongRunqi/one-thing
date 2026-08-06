import { describe, expect, it } from 'vitest'
import {
  projectOnethingPluginCommandsForRenderer,
  projectOnethingPluginsForRenderer,
} from '../plugin-list.js'

describe('projectOnethingPluginsForRenderer', () => {
  it('projects loaded plugin state into renderer-safe plugin info', () => {
    expect(projectOnethingPluginsForRenderer([
      {
        definition: {
          id: 'demo',
          source: 'builtin',
          manifest: {
            name: 'Demo',
            version: '1.2.3',
            description: 'Demo plugin',
            author: 'onething',
          },
          enabled: true,
          dirPath: 'builtin://demo',
          needsInstall: true,
        },
        loaded: false,
        commands: ['/demo'],
        error: 'install deps',
        health: {
          status: 'disabled',
          consecutiveFailures: 3,
          lastError: 'boom',
          lastErrorScope: 'promptContext:notes',
          disabledReason: '3 consecutive failures (last: promptContext:notes — boom)',
        },
      },
    ])).toEqual([
      {
        id: 'demo',
        source: 'builtin',
        name: 'Demo',
        version: '1.2.3',
        description: 'Demo plugin',
        author: 'onething',
        loaded: false,
        enabled: true,
        commands: ['/demo'],
        error: 'install deps',
        dirPath: 'builtin://demo',
        needsInstall: true,
        healthStatus: 'disabled',
        healthFailures: 3,
        healthReason: '3 consecutive failures (last: promptContext:notes — boom)',
      },
    ])
  })

  it('falls back to the last runtime error when the breaker has not tripped', () => {
    expect(projectOnethingPluginsForRenderer([
      {
        definition: {
          id: 'demo',
          manifest: { name: 'Demo', version: '1.0.0' },
          enabled: true,
          dirPath: '/plugins/demo',
        },
        loaded: true,
        commands: [],
        health: {
          status: 'degraded',
          consecutiveFailures: 1,
          lastError: 'timed out',
          lastErrorScope: 'promptContext:notes (timeout)',
        },
      },
    ])[0]).toMatchObject({
      healthStatus: 'degraded',
      healthFailures: 1,
      healthReason: 'promptContext:notes (timeout): timed out',
    })
  })

  it('uses renderer defaults for optional plugin fields', () => {
    expect(projectOnethingPluginsForRenderer([
      {
        definition: {
          id: 'user-plugin',
          manifest: {
            name: 'User Plugin',
            version: '0.1.0',
          },
          enabled: false,
          dirPath: '/plugins/user-plugin',
        },
        loaded: true,
        commands: [],
      },
    ])).toEqual([
      {
        id: 'user-plugin',
        source: 'user',
        name: 'User Plugin',
        version: '0.1.0',
        description: '',
        author: '',
        loaded: true,
        enabled: false,
        commands: [],
        error: '',
        dirPath: '/plugins/user-plugin',
        needsInstall: false,
        healthStatus: 'healthy',
        healthFailures: 0,
        healthReason: '',
      },
    ])
  })

  it('projects plugin slash commands for renderer lists', () => {
    expect(projectOnethingPluginCommandsForRenderer([
      { name: '/demo', description: 'Run demo', usage: '/demo arg' },
      { name: '/brief' },
    ])).toEqual([
      {
        id: 'demo',
        name: '/demo',
        description: 'Run demo',
        usage: '/demo arg',
      },
      {
        id: 'brief',
        name: '/brief',
        description: 'Plugin command',
        usage: '/brief',
      },
    ])
  })
})
