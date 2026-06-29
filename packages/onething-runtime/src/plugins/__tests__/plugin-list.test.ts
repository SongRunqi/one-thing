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
      },
    ])
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
