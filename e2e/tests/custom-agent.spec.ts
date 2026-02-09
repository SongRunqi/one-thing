/**
 * Custom Agent E2E Tests (REQ-013 Phase 2)
 *
 * Test scenarios:
 * 1. Create Agent - fill name/prompt → save → appears in list
 * 2. Edit Agent - modify prompt → save → takes effect
 * 3. Delete Agent - delete → confirm → removed from list
 * 4. Switch Agent - select different agents → chat uses corresponding prompt
 * 5. Pin to Sidebar - pin → shows in sidebar → unpin → disappears
 */
import { test, expect } from '../fixtures/app'

test.describe('Custom Agent CRUD', () => {
  test('create a custom agent', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create an agent programmatically via IPC
    const agentConfig = {
      name: 'Test Agent 1',
      description: 'A test agent for E2E testing',
      systemPrompt: 'You are a helpful test assistant.',
      avatar: { type: 'emoji' as const, value: '🤖' },
      customTools: [],
      maxToolCalls: 20,
      timeoutMs: 120000,
      allowBuiltinTools: false,
      allowedBuiltinTools: [],
      enableMemory: true,
    }

    const result = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createCustomAgent(config, 'user')
    }, agentConfig)

    // Verify creation succeeded
    expect(result.success).toBe(true)
    expect(result.agent).toBeDefined()
    expect(result.agent?.name).toBe('Test Agent 1')

    // Reload to reflect changes
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Verify the agent appears in the agents list (via IPC)
    const agents = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getCustomAgents()
      return response.agents
    })

    expect(agents).toBeDefined()
    const testAgent = agents.find((a: any) => a.name === 'Test Agent 1')
    expect(testAgent).toBeDefined()
    expect(testAgent.description).toBe('A test agent for E2E testing')
  })

  test('edit an existing custom agent', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create an agent first
    const agentConfig = {
      name: 'Test Agent 2',
      description: 'Original description',
      systemPrompt: 'Original prompt',
      avatar: { type: 'emoji' as const, value: '🧪' },
      customTools: [],
      allowBuiltinTools: false,
      allowedBuiltinTools: [],
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createCustomAgent(config, 'user')
    }, agentConfig)

    expect(createResult.success).toBe(true)
    const agentId = createResult.agent.id

    // Update the agent
    const updates = {
      description: 'Updated description',
      systemPrompt: 'Updated prompt for testing',
    }

    const updateResult = await page.evaluate(async ({ id, updates }) => {
      const api = (window as any).electronAPI
      return await api.updateCustomAgent(id, updates)
    }, { id: agentId, updates })

    // Verify update succeeded
    expect(updateResult.success).toBe(true)
    expect(updateResult.agent?.description).toBe('Updated description')
    expect(updateResult.agent?.systemPrompt).toBe('Updated prompt for testing')

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const agents = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getCustomAgents()
      return response.agents
    })

    const updatedAgent = agents.find((a: any) => a.name === 'Test Agent 2')
    expect(updatedAgent).toBeDefined()
    expect(updatedAgent.description).toBe('Updated description')
    expect(updatedAgent.systemPrompt).toBe('Updated prompt for testing')
  })

  test('delete a custom agent', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create an agent first
    const agentConfig = {
      name: 'Test Agent to Delete',
      description: 'This agent will be deleted',
      systemPrompt: 'Temporary agent',
      avatar: { type: 'emoji' as const, value: '🗑️' },
      customTools: [],
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createCustomAgent(config, 'user')
    }, agentConfig)

    expect(createResult.success).toBe(true)
    const agentId = createResult.agent.id

    // Verify it exists
    let agents = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getCustomAgents()
      return response.agents
    })

    let testAgent = agents.find((a: any) => a.id === agentId)
    expect(testAgent).toBeDefined()

    // Delete the agent
    const deleteResult = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      return await api.deleteCustomAgent(id)
    }, agentId)

    expect(deleteResult.success).toBe(true)

    // Verify it's removed from the list
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    agents = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getCustomAgents()
      return response.agents
    })

    testAgent = agents.find((a: any) => a.id === agentId)
    expect(testAgent).toBeUndefined()
  })

  test('switch agent in a session', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create two different agents
    const agent1Config = {
      name: 'Agent Alpha',
      description: 'First test agent',
      systemPrompt: 'You are Agent Alpha.',
      avatar: { type: 'emoji' as const, value: '🅰️' },
      customTools: [],
    }

    const agent2Config = {
      name: 'Agent Beta',
      description: 'Second test agent',
      systemPrompt: 'You are Agent Beta.',
      avatar: { type: 'emoji' as const, value: '🅱️' },
      customTools: [],
    }

    const result = await page.evaluate(async ({ config1, config2 }) => {
      const api = (window as any).electronAPI
      const agent1 = await api.createCustomAgent(config1, 'user')
      const agent2 = await api.createCustomAgent(config2, 'user')
      return { agent1, agent2 }
    }, { config1: agent1Config, config2: agent2Config })

    expect(result.agent1.success).toBe(true)
    expect(result.agent2.success).toBe(true)

    const agent1Id = result.agent1.agent.id
    const agent2Id = result.agent2.agent.id

    // Create a test session
    const sessionResult = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      return await api.createSession('Test Agent Switching')
    })

    expect(sessionResult.success).toBe(true)
    const sessionId = sessionResult.session.id

    // Switch to Agent Alpha
    const switchResult1 = await page.evaluate(async ({ sessionId, agentId }) => {
      const api = (window as any).electronAPI
      return await api.updateSessionAgent(sessionId, agentId)
    }, { sessionId, agentId: agent1Id })

    expect(switchResult1.success).toBe(true)

    // Verify session is using Agent Alpha
    let sessionData = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      const response = await api.getSession(id)
      return response.session
    }, sessionId)

    expect(sessionData.agentId).toBe(agent1Id)

    // Switch to Agent Beta
    const switchResult2 = await page.evaluate(async ({ sessionId, agentId }) => {
      const api = (window as any).electronAPI
      return await api.updateSessionAgent(sessionId, agentId)
    }, { sessionId, agentId: agent2Id })

    expect(switchResult2.success).toBe(true)

    // Verify session is now using Agent Beta
    sessionData = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      const response = await api.getSession(id)
      return response.session
    }, sessionId)

    expect(sessionData.agentId).toBe(agent2Id)

    // Switch back to no agent (null)
    const switchResult3 = await page.evaluate(async (sessionId) => {
      const api = (window as any).electronAPI
      return await api.updateSessionAgent(sessionId, null)
    }, sessionId)

    expect(switchResult3.success).toBe(true)

    // Verify session is now using default (no agent)
    sessionData = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      const response = await api.getSession(id)
      return response.session
    }, sessionId)

    // agentId should be null or undefined when no agent is assigned
    expect(sessionData.agentId).toBeFalsy()
  })

  test('pin and unpin agent to sidebar', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create an agent
    const agentConfig = {
      name: 'Pinnable Agent',
      description: 'This agent can be pinned',
      systemPrompt: 'You are a pinnable agent.',
      avatar: { type: 'emoji' as const, value: '📌' },
      customTools: [],
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createCustomAgent(config, 'user')
    }, agentConfig)

    expect(createResult.success).toBe(true)
    const agentId = createResult.agent.id

    // Verify it's not pinned initially
    let agentsData = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      return await api.getCustomAgents()
    })

    expect(agentsData.pinnedAgentIds).toBeDefined()
    expect(agentsData.pinnedAgentIds.includes(agentId)).toBe(false)

    // Pin the agent
    const pinResult = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      return await api.pinCustomAgent(id)
    }, agentId)

    expect(pinResult.success).toBe(true)
    expect(pinResult.pinnedAgentIds).toBeDefined()
    expect(pinResult.pinnedAgentIds.includes(agentId)).toBe(true)

    // Reload and verify it's still pinned
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    agentsData = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      return await api.getCustomAgents()
    })

    expect(agentsData.pinnedAgentIds.includes(agentId)).toBe(true)

    // Unpin the agent
    const unpinResult = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      return await api.unpinCustomAgent(id)
    }, agentId)

    expect(unpinResult.success).toBe(true)
    expect(unpinResult.pinnedAgentIds).toBeDefined()
    expect(unpinResult.pinnedAgentIds.includes(agentId)).toBe(false)

    // Reload and verify it's unpinned
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    agentsData = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      return await api.getCustomAgents()
    })

    expect(agentsData.pinnedAgentIds.includes(agentId)).toBe(false)
  })
})
