/**
 * MCP Connection E2E Tests
 *
 * Tests MCP (Model Context Protocol) server connection, disconnection,
 * reconnection, and tool listing functionality.
 *
 * Since settings window has multi-window limitations in Playwright,
 * these tests use IPC calls through the renderer process (window.electronAPI)
 * to test MCP functionality.
 */

import { test, expect } from '../fixtures/app'
import { createMockMCPServer } from '../fixtures/mock-mcp-server'
import { v4 as uuidv4 } from 'uuid'

test.describe('MCP Connection', () => {
  test('add MCP server and connect successfully', async ({ page }) => {
    const mockServer = createMockMCPServer({
      name: 'test-server',
      tools: [
        {
          name: 'get_time',
          description: 'Get current time',
        },
      ],
    })

    try {
      // Add MCP server via electronAPI
      const serverId = uuidv4()
      const serverConfig = {
        id: serverId,
        name: mockServer.config.name,
        transport: mockServer.config.transport,
        command: mockServer.config.command,
        args: mockServer.config.args,
        enabled: true,
      }

      const addResult = await page.evaluate(async (config) => {
        // @ts-ignore
        return await window.electronAPI.mcpAddServer(config)
      }, serverConfig)

      // Verify server was added successfully
      expect(addResult).toHaveProperty('success', true)

      // Connect to the server
      const connectResult = await page.evaluate(async (id) => {
        // @ts-ignore
        return await window.electronAPI.mcpConnectServer(id)
      }, serverId)

      // Verify connection succeeded
      expect(connectResult).toHaveProperty('success', true)

      // Wait a bit for connection to stabilize
      await page.waitForTimeout(1000)

      // Get server list to verify status
      const servers = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetServers()
      })

      // Verify server is in connected state
      expect(servers).toHaveProperty('success', true)
      const server = (servers as any).servers.find((s: any) => s.config.id === serverId)
      expect(server).toBeDefined()
      expect(server.status).toBe('connected')

      // Get tools list
      const toolsResult = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetTools()
      })

      // Verify tools are available
      expect(toolsResult).toHaveProperty('success', true)
      const tools = (toolsResult as any).tools
      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some((t: any) => t.name === 'get_time')).toBe(true)

      // Cleanup: disconnect and remove server
      await page.evaluate(async (id) => {
        // @ts-ignore
        await window.electronAPI.mcpDisconnectServer(id)
        // @ts-ignore
        await window.electronAPI.mcpRemoveServer(id)
      }, serverId)
    } finally {
      mockServer.cleanup()
    }
  })

  test('connection failure - invalid server', async ({ page }) => {
    const serverId = uuidv4()
    const invalidConfig = {
      id: serverId,
      name: 'invalid-server',
      transport: 'stdio' as const,
      command: 'nonexistent-command-12345',
      args: [],
      enabled: true,
    }

    try {
      // Add server
      const addResult = await page.evaluate(async (config) => {
        // @ts-ignore
        return await window.electronAPI.mcpAddServer(config)
      }, invalidConfig)

      expect(addResult).toHaveProperty('success', true)

      // Attempt to connect - call will succeed, but server will fail to connect
      const connectResult = await page.evaluate(async (id) => {
        // @ts-ignore
        return await window.electronAPI.mcpConnectServer(id)
      }, serverId)

      // The IPC call itself succeeds, but the connection will fail asynchronously
      expect(connectResult).toHaveProperty('success', true)

      // Wait for connection to fail
      await page.waitForTimeout(2000)

      // Get server list to verify error status
      const servers = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetServers()
      })

      const server = (servers as any).servers.find((s: any) => s.config.id === serverId)
      expect(server).toBeDefined()
      expect(server.status).toBe('error')
      expect(server.error).toBeDefined()

      // Retry connection - IPC call succeeds, but will fail to connect again
      const retryResult = await page.evaluate(async (id) => {
        // @ts-ignore
        return await window.electronAPI.mcpConnectServer(id)
      }, serverId)

      // The retry call itself succeeds, but connection will fail
      expect(retryResult).toHaveProperty('success', true)

      // Cleanup
      await page.evaluate(async (id) => {
        // @ts-ignore
        await window.electronAPI.mcpRemoveServer(id)
      }, serverId)
    } catch (error) {
      // Cleanup on error
      await page.evaluate(async (id) => {
        // @ts-ignore
        await window.electronAPI.mcpRemoveServer(id)
      }, serverId)
      throw error
    }
  })

  test('disconnect and reconnect', async ({ page }) => {
    const mockServer = createMockMCPServer({
      name: 'reconnect-test-server',
    })

    try {
      const serverId = uuidv4()
      const serverConfig = {
        id: serverId,
        name: mockServer.config.name,
        transport: mockServer.config.transport,
        command: mockServer.config.command,
        args: mockServer.config.args,
        enabled: true,
      }

      // Add and connect
      await page.evaluate(async (config) => {
        // @ts-ignore
        await window.electronAPI.mcpAddServer(config)
        // @ts-ignore
        await window.electronAPI.mcpConnectServer(config.id)
      }, serverConfig)

      // Wait for connection
      await page.waitForTimeout(1000)

      // Verify connected
      let servers = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetServers()
      })

      let server = (servers as any).servers.find((s: any) => s.config.id === serverId)
      expect(server.status).toBe('connected')

      // Disconnect
      const disconnectResult = await page.evaluate(async (id) => {
        // @ts-ignore
        return await window.electronAPI.mcpDisconnectServer(id)
      }, serverId)

      expect(disconnectResult).toHaveProperty('success', true)

      // Wait for disconnect
      await page.waitForTimeout(500)

      // Verify disconnected
      servers = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetServers()
      })

      server = (servers as any).servers.find((s: any) => s.config.id === serverId)
      expect(server.status).toBe('disconnected')

      // Reconnect
      const reconnectResult = await page.evaluate(async (id) => {
        // @ts-ignore
        return await window.electronAPI.mcpConnectServer(id)
      }, serverId)

      expect(reconnectResult).toHaveProperty('success', true)

      // Wait for reconnection
      await page.waitForTimeout(1000)

      // Verify reconnected
      servers = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetServers()
      })

      server = (servers as any).servers.find((s: any) => s.config.id === serverId)
      expect(server.status).toBe('connected')

      // Cleanup
      await page.evaluate(async (id) => {
        // @ts-ignore
        await window.electronAPI.mcpDisconnectServer(id)
        // @ts-ignore
        await window.electronAPI.mcpRemoveServer(id)
      }, serverId)
    } finally {
      mockServer.cleanup()
    }
  })

  test('MCP tool list displays correctly', async ({ page }) => {
    const customTools = [
      {
        name: 'custom_tool_1',
        description: 'First custom tool',
        parameters: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
      },
      {
        name: 'custom_tool_2',
        description: 'Second custom tool',
        parameters: {
          type: 'object',
          properties: {
            param2: { type: 'number' },
          },
        },
      },
    ]

    const mockServer = createMockMCPServer({
      name: 'tools-test-server',
      tools: customTools,
    })

    try {
      const serverId = uuidv4()
      const serverConfig = {
        id: serverId,
        name: mockServer.config.name,
        transport: mockServer.config.transport,
        command: mockServer.config.command,
        args: mockServer.config.args,
        enabled: true,
      }

      // Add and connect
      await page.evaluate(async (config) => {
        // @ts-ignore
        await window.electronAPI.mcpAddServer(config)
        // @ts-ignore
        await window.electronAPI.mcpConnectServer(config.id)
      }, serverConfig)

      // Wait for connection
      await page.waitForTimeout(1000)

      // Get tools
      const toolsResult = await page.evaluate(async () => {
        // @ts-ignore
        return await window.electronAPI.mcpGetTools()
      })

      expect(toolsResult).toHaveProperty('success', true)
      const tools = (toolsResult as any).tools

      // Verify custom tools are present
      expect(tools.some((t: any) => t.name === 'custom_tool_1')).toBe(true)
      expect(tools.some((t: any) => t.name === 'custom_tool_2')).toBe(true)

      // Verify tool details
      const tool1 = tools.find((t: any) => t.name === 'custom_tool_1')
      expect(tool1.description).toBe('First custom tool')
      expect(tool1.serverId).toBe(serverId)
      expect(tool1.inputSchema).toHaveProperty('properties')

      // Cleanup
      await page.evaluate(async (id) => {
        // @ts-ignore
        await window.electronAPI.mcpDisconnectServer(id)
        // @ts-ignore
        await window.electronAPI.mcpRemoveServer(id)
      }, serverId)
    } finally {
      mockServer.cleanup()
    }
  })
})
