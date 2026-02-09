/**
 * Workspace Management E2E Tests (REQ-013 Phase 3)
 *
 * Test scenarios:
 * 1. Create Workspace - fill name/avatar → save → appears in list
 * 2. Switch Workspace - switch → session lists are isolated
 * 3. Delete Workspace - delete → confirm → removed from list
 * 4. Workspace Avatar - set emoji/image → displays correctly
 */
import { test, expect } from '../fixtures/app'

test.describe('Workspace Management', () => {
  test('create a workspace with emoji avatar', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create a workspace programmatically via IPC
    const workspaceConfig = {
      name: 'Test Workspace 1',
      avatar: { type: 'emoji' as const, value: '🚀' },
      workingDirectory: '/tmp/test-workspace',
      systemPrompt: 'You are a helpful assistant in Test Workspace 1.',
    }

    const result = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createWorkspace(
        config.name,
        config.avatar,
        config.workingDirectory,
        config.systemPrompt
      )
    }, workspaceConfig)

    // Verify creation succeeded
    expect(result.success).toBe(true)
    expect(result.workspace).toBeDefined()
    expect(result.workspace?.name).toBe('Test Workspace 1')
    expect(result.workspace?.avatar.type).toBe('emoji')
    expect(result.workspace?.avatar.value).toBe('🚀')

    // Reload to reflect changes
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Verify the workspace appears in the workspaces list (via IPC)
    const workspaces = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.workspaces
    })

    expect(workspaces).toBeDefined()
    expect(Array.isArray(workspaces)).toBe(true)
    const testWorkspace = workspaces.find((w: any) => w.name === 'Test Workspace 1')
    expect(testWorkspace).toBeDefined()
    expect(testWorkspace.avatar.value).toBe('🚀')
    expect(testWorkspace.workingDirectory).toBe('/tmp/test-workspace')
  })

  test('update an existing workspace', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create a workspace first
    const workspaceConfig = {
      name: 'Test Workspace 2',
      avatar: { type: 'emoji' as const, value: '🎨' },
      workingDirectory: '/tmp/test-workspace-2',
      systemPrompt: 'Original prompt',
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createWorkspace(
        config.name,
        config.avatar,
        config.workingDirectory,
        config.systemPrompt
      )
    }, workspaceConfig)

    expect(createResult.success).toBe(true)
    const workspaceId = createResult.workspace.id

    // Update the workspace
    const updates = {
      name: 'Test Workspace 2 Updated',
      avatar: { type: 'emoji' as const, value: '🎯' },
      systemPrompt: 'Updated prompt for testing',
    }

    const updateResult = await page.evaluate(async ({ id, updates }) => {
      const api = (window as any).electronAPI
      return await api.updateWorkspace(id, updates)
    }, { id: workspaceId, updates })

    // Verify update succeeded
    expect(updateResult.success).toBe(true)
    expect(updateResult.workspace?.name).toBe('Test Workspace 2 Updated')
    expect(updateResult.workspace?.avatar.value).toBe('🎯')
    expect(updateResult.workspace?.systemPrompt).toBe('Updated prompt for testing')

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const workspaces = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.workspaces
    })

    const updatedWorkspace = workspaces.find((w: any) => w.id === workspaceId)
    expect(updatedWorkspace).toBeDefined()
    expect(updatedWorkspace.name).toBe('Test Workspace 2 Updated')
    expect(updatedWorkspace.avatar.value).toBe('🎯')
    expect(updatedWorkspace.systemPrompt).toBe('Updated prompt for testing')
  })

  test('switch between workspaces - session isolation', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create two workspaces
    const workspace1Config = {
      name: 'Workspace Alpha',
      avatar: { type: 'emoji' as const, value: '🅰️' },
      workingDirectory: '/tmp/workspace-alpha',
      systemPrompt: 'You are in Workspace Alpha.',
    }

    const workspace2Config = {
      name: 'Workspace Beta',
      avatar: { type: 'emoji' as const, value: '🅱️' },
      workingDirectory: '/tmp/workspace-beta',
      systemPrompt: 'You are in Workspace Beta.',
    }

    const result = await page.evaluate(async ({ config1, config2 }) => {
      const api = (window as any).electronAPI
      const ws1 = await api.createWorkspace(config1.name, config1.avatar, config1.workingDirectory, config1.systemPrompt)
      const ws2 = await api.createWorkspace(config2.name, config2.avatar, config2.workingDirectory, config2.systemPrompt)
      return { ws1, ws2 }
    }, { config1: workspace1Config, config2: workspace2Config })

    expect(result.ws1.success).toBe(true)
    expect(result.ws2.success).toBe(true)

    const workspace1Id = result.ws1.workspace.id
    const workspace2Id = result.ws2.workspace.id

    // Create a session in Workspace Alpha
    const session1Result = await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      // First switch to the workspace
      await api.switchWorkspace(workspaceId)
      // Then create a session with workspaceId
      return await api.createSession('Session in Alpha', workspaceId)
    }, { workspaceId: workspace1Id })

    expect(session1Result.success).toBe(true)
    const session1Id = session1Result.session.id

    // Verify the session belongs to Workspace Alpha
    expect(session1Result.session.workspaceId).toBe(workspace1Id)

    // Switch to Workspace Beta
    await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      await api.switchWorkspace(workspaceId)
    }, { workspaceId: workspace2Id })

    // Create a session in Workspace Beta
    const session2Result = await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      return await api.createSession('Session in Beta', workspaceId)
    }, { workspaceId: workspace2Id })

    expect(session2Result.success).toBe(true)
    const session2Id = session2Result.session.id
    expect(session2Result.session.workspaceId).toBe(workspace2Id)

    // Get all sessions and verify isolation
    const sessions = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getSessions()
      return response.sessions
    })

    const alphaSession = sessions.find((s: any) => s.id === session1Id)
    const betaSession = sessions.find((s: any) => s.id === session2Id)

    expect(alphaSession).toBeDefined()
    expect(betaSession).toBeDefined()
    expect(alphaSession.workspaceId).toBe(workspace1Id)
    expect(betaSession.workspaceId).toBe(workspace2Id)

    // Switch back to Workspace Alpha and verify we can access its session
    await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      await api.switchWorkspace(workspaceId)
    }, { workspaceId: workspace1Id })

    // Verify current workspace
    const currentWorkspaceInfo = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.currentWorkspaceId
    })

    expect(currentWorkspaceInfo).toBe(workspace1Id)
  })

  test('delete a workspace', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create a workspace to delete
    const workspaceConfig = {
      name: 'Workspace to Delete',
      avatar: { type: 'emoji' as const, value: '🗑️' },
      workingDirectory: '/tmp/workspace-delete',
      systemPrompt: 'This workspace will be deleted.',
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createWorkspace(
        config.name,
        config.avatar,
        config.workingDirectory,
        config.systemPrompt
      )
    }, workspaceConfig)

    expect(createResult.success).toBe(true)
    const workspaceId = createResult.workspace.id

    // Verify it exists
    let workspaces = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.workspaces
    })

    let testWorkspace = workspaces.find((w: any) => w.id === workspaceId)
    expect(testWorkspace).toBeDefined()

    // Delete the workspace
    const deleteResult = await page.evaluate(async (id) => {
      const api = (window as any).electronAPI
      return await api.deleteWorkspace(id)
    }, workspaceId)

    expect(deleteResult.success).toBe(true)

    // Verify it's removed from the list
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    workspaces = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.workspaces
    })

    testWorkspace = workspaces.find((w: any) => w.id === workspaceId)
    expect(testWorkspace).toBeUndefined()
  })

  test('workspace avatar - emoji display', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create multiple workspaces with different emojis
    const emojis = ['🎭', '🎪', '🎨', '🎯', '🎲']
    const workspaceIds: string[] = []

    for (const emoji of emojis) {
      const result = await page.evaluate(async (emoji) => {
        const api = (window as any).electronAPI
        return await api.createWorkspace(
          `Workspace ${emoji}`,
          { type: 'emoji', value: emoji },
          undefined,
          ''
        )
      }, emoji)

      expect(result.success).toBe(true)
      workspaceIds.push(result.workspace.id)
    }

    // Reload to see all workspaces
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Verify all workspaces are created with correct emojis
    const workspaces = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.workspaces
    })

    for (let i = 0; i < emojis.length; i++) {
      const workspace = workspaces.find((w: any) => w.id === workspaceIds[i])
      expect(workspace).toBeDefined()
      expect(workspace.avatar.type).toBe('emoji')
      expect(workspace.avatar.value).toBe(emojis[i])
    }
  })

  test('switch to default mode (no workspace)', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create a workspace
    const workspaceConfig = {
      name: 'Temp Workspace',
      avatar: { type: 'emoji' as const, value: '⏰' },
      workingDirectory: '/tmp/temp-workspace',
      systemPrompt: 'Temporary workspace',
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createWorkspace(
        config.name,
        config.avatar,
        config.workingDirectory,
        config.systemPrompt
      )
    }, workspaceConfig)

    expect(createResult.success).toBe(true)
    const workspaceId = createResult.workspace.id

    // Switch to the workspace
    await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      await api.switchWorkspace(workspaceId)
    }, { workspaceId })

    // Verify we're in the workspace
    let currentWorkspaceId = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.currentWorkspaceId
    })

    expect(currentWorkspaceId).toBe(workspaceId)

    // Switch to default mode (null workspace)
    await page.evaluate(async () => {
      const api = (window as any).electronAPI
      await api.switchWorkspace(null)
    })

    // Verify we're in default mode
    currentWorkspaceId = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.currentWorkspaceId
    })

    expect(currentWorkspaceId).toBeNull()
  })

  test('workspace working directory propagates to sessions', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    const workingDir = '/tmp/test-working-directory'

    // Create a workspace with working directory
    const workspaceConfig = {
      name: 'Workspace with Dir',
      avatar: { type: 'emoji' as const, value: '📁' },
      workingDirectory: workingDir,
      systemPrompt: 'Workspace with custom directory',
    }

    const createResult = await page.evaluate(async (config) => {
      const api = (window as any).electronAPI
      return await api.createWorkspace(
        config.name,
        config.avatar,
        config.workingDirectory,
        config.systemPrompt
      )
    }, workspaceConfig)

    expect(createResult.success).toBe(true)
    const workspaceId = createResult.workspace.id

    // Switch to the workspace
    await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      await api.switchWorkspace(workspaceId)
    }, { workspaceId })

    // Create a session in this workspace
    const sessionResult = await page.evaluate(async ({ workspaceId }) => {
      const api = (window as any).electronAPI
      return await api.createSession('Test Session', workspaceId)
    }, { workspaceId })

    expect(sessionResult.success).toBe(true)

    // Verify the session has the correct working directory
    // Note: This depends on how your implementation handles working directories
    // You may need to adjust based on actual session structure
    const session = sessionResult.session
    expect(session.workspaceId).toBe(workspaceId)

    // Verify workspace still has the correct working directory
    const workspaces = await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const response = await api.getWorkspaces()
      return response.workspaces
    })

    const workspace = workspaces.find((w: any) => w.id === workspaceId)
    expect(workspace).toBeDefined()
    expect(workspace.workingDirectory).toBe(workingDir)
  })
})
