import { describe, expect, it, vi } from 'vitest'
import {
  listOnethingSettingsTools,
  listOnethingSettingsToolsForIpc,
  type ListOnethingSettingsToolsOptions,
  type OnethingToolSessionContextLike,
  type OnethingToolSessionListItemLike,
  type OnethingVisibleToolLike,
} from '../tool-list-presentation.js'

interface TestTool extends OnethingVisibleToolLike {
  name: string
}

type TestSessionListItem = OnethingToolSessionListItemLike
type TestSession = OnethingToolSessionContextLike
type TestOptions = ListOnethingSettingsToolsOptions<
  TestTool,
  TestSessionListItem,
  TestSession
>

function listTestTools(options: TestOptions) {
  return listOnethingSettingsTools<
    TestTool,
    TestSessionListItem,
    TestSession
  >(options)
}

describe('listOnethingSettingsTools', () => {
  it('sets async tool context from the first session and projects visible tool sources', async () => {
    const setInitContext = vi.fn()

    await expect(listTestTools({
      getSessionsList: () => [{ id: 'session-1' }],
      getSession: () => ({
        workingDirectory: '/repo',
        workingDirectoryRoots: ['/repo', '/tmp/project'],
      }),
      getAllToolsAsync: () => [
        { id: 'read', name: 'Read' },
        { id: 'plugin:notes', name: 'Notes' },
        { id: 'mcp:legacy-server:tool', name: 'Legacy MCP' },
      ],
      getMCPRouterToolDefinition: () => ({ id: 'mcp-router', name: 'MCP Router' }),
      setInitContext,
      cwd: () => '/cwd',
    })).resolves.toEqual([
      { id: 'read', name: 'Read', source: 'builtin' },
      { id: 'plugin:notes', name: 'Notes', source: 'plugin' },
      { id: 'mcp-router', name: 'MCP Router', source: 'mcp' },
    ])

    expect(setInitContext).toHaveBeenCalledWith({
      workingDirectory: '/repo',
      workingDirectoryRoots: ['/repo', '/tmp/project'],
    })
  })

  it('falls back to cwd when there are no sessions', async () => {
    const setInitContext = vi.fn()

    await listTestTools({
      getSessionsList: () => [],
      getSession: vi.fn(),
      getAllToolsAsync: () => [],
      getMCPRouterToolDefinition: () => null,
      setInitContext,
      cwd: () => '/cwd',
    })

    expect(setInitContext).toHaveBeenCalledWith({
      workingDirectory: '/cwd',
      workingDirectoryRoots: [],
    })
  })

  it('does not duplicate an already visible MCP router tool', async () => {
    await expect(listTestTools({
      getSessionsList: () => [],
      getSession: vi.fn(),
      getAllToolsAsync: () => [{ id: 'mcp-router', name: 'MCP Router' }],
      getMCPRouterToolDefinition: () => ({ id: 'mcp-router', name: 'MCP Router' }),
      setInitContext: vi.fn(),
      cwd: () => '/cwd',
    })).resolves.toEqual([
      { id: 'mcp-router', name: 'MCP Router', source: 'builtin' },
    ])
  })

  it('normalizes settings-visible tool list failures for IPC callers', async () => {
    const logger = { error: vi.fn() }

    await expect(listOnethingSettingsToolsForIpc({
      getSessionsList: () => [],
      getSession: vi.fn(),
      getAllToolsAsync: () => {
        throw new Error('tools failed')
      },
      getMCPRouterToolDefinition: () => null,
      setInitContext: vi.fn(),
      cwd: () => '/cwd',
      logger,
    })).resolves.toEqual({
      success: false,
      error: 'tools failed',
    })

    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
