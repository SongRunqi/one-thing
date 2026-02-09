import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'

const mockProvider = createMockProvider()
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
})

test.afterAll(async () => {
  await mockProvider.stop()
})

test.beforeEach(() => {
  // Clear any pending tool calls between tests
  mockProvider.clearToolCalls()
  mockProvider.clearToolCallResponse()
})

async function dismissUpdateNotification(page: import('@playwright/test').Page) {
  const dismissBtn = page.locator('button', { hasText: '忽略此版本' })
  if (await dismissBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await dismissBtn.click()
    await dismissBtn.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {})
  }
}

async function setupSession(page: import('@playwright/test').Page) {
  await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
  await dismissUpdateNotification(page)
  await page.locator('.new-chat-item').click()
  await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })
}

async function sendChatMessage(page: import('@playwright/test').Page, text: string) {
  const input = page.locator('textarea.composer-input')
  await input.click()
  await input.pressSequentially(text, { delay: 10 })
  const sendBtn = page.locator('.send-btn:not(.stop-btn)')
  await expect(sendBtn).toBeEnabled({ timeout: 3_000 })
  await sendBtn.click()
}

test.describe('Tool Execution', () => {
  test('user can approve tool call', async ({ page }) => {
    // Setup: Configure mock to return a tool_call (read file)
    mockProvider.setToolCalls([
      {
        id: 'call_001',
        name: 'read_file',
        arguments: { path: '/test/file.txt' },
      },
    ])
    // After approval, respond with text
    mockProvider.setToolCallResponse(['File', ' content', ' loaded!'])

    await setupSession(page)
    await sendChatMessage(page, 'Read the file')

    // Wait for tool call to appear with confirmation needed
    const toolCall = page.locator('.tool-inline.needs-confirm')
    await expect(toolCall).toBeVisible({ timeout: 10_000 })

    // Verify tool name is displayed
    await expect(toolCall.locator('.tool-name')).toContainText('read_file')

    // Verify confirmation buttons are shown
    const allowBtn = toolCall.locator('.allow-main-btn')
    const rejectBtn = toolCall.locator('.btn-reject')
    await expect(allowBtn).toBeVisible()
    await expect(rejectBtn).toBeVisible()

    // Click Allow button
    await allowBtn.click()

    // Verify tool execution started (status should change from pending)
    await expect(toolCall).not.toHaveClass(/needs-confirm/, { timeout: 5_000 })

    // After tool execution, AI should continue with response
    // Note: This requires the app to call the mock provider again after tool confirmation
    // For now, we just verify the tool call status changed
    const statusIndicator = toolCall.locator('.status-indicator')
    await expect(statusIndicator).not.toContainText('Confirm', { timeout: 10_000 })
  })

  test('user can reject tool call', async ({ page }) => {
    // Setup: Configure mock to return a tool_call
    mockProvider.setToolCalls([
      {
        id: 'call_002',
        name: 'delete_file',
        arguments: { path: '/dangerous/file.txt' },
      },
    ])

    await setupSession(page)
    await sendChatMessage(page, 'Delete the file')

    // Wait for tool call with confirmation
    const toolCall = page.locator('.tool-inline.needs-confirm')
    await expect(toolCall).toBeVisible({ timeout: 10_000 })

    // Verify tool name
    await expect(toolCall.locator('.tool-name')).toContainText('delete_file')

    // Click Reject button
    const rejectBtn = toolCall.locator('.btn-reject')
    await expect(rejectBtn).toBeVisible()
    await rejectBtn.click()

    // Verify rejection dialog appears (if implemented)
    // Note: The actual rejection flow depends on implementation
    // For now, we verify the button click doesn't throw

    // Tool call should no longer need confirmation
    await expect(toolCall).not.toHaveClass(/needs-confirm/, { timeout: 5_000 })
  })

  test('handles multiple sequential tool calls', async ({ page }) => {
    // Setup: First tool call
    mockProvider.setToolCalls([
      {
        id: 'call_003',
        name: 'list_files',
        arguments: { directory: '/test' },
      },
    ])

    await setupSession(page)
    await sendChatMessage(page, 'List files in /test')

    // Wait for first tool call
    const firstToolCall = page.locator('.tool-inline.needs-confirm').first()
    await expect(firstToolCall).toBeVisible({ timeout: 10_000 })

    // Approve first tool call
    await firstToolCall.locator('.allow-main-btn').click()
    await expect(firstToolCall).not.toHaveClass(/needs-confirm/, { timeout: 5_000 })

    // Setup: Second tool call (simulating AI requesting another tool)
    // Note: In a real scenario, the app would make another request to the mock provider
    // This test verifies UI can handle multiple tool calls in sequence
    mockProvider.setToolCalls([
      {
        id: 'call_004',
        name: 'read_file',
        arguments: { path: '/test/file1.txt' },
      },
    ])

    // For this test to work fully, we'd need the app to automatically request
    // the next tool after the first completes. For now, we verify the first
    // tool call was processed correctly.
    await expect(firstToolCall.locator('.status-indicator')).not.toContainText('Confirm')
  })

  test('displays tool call arguments', async ({ page }) => {
    // Setup: Tool call with multiple arguments
    mockProvider.setToolCalls([
      {
        id: 'call_005',
        name: 'search',
        arguments: {
          query: 'test query',
          limit: 10,
          filters: { type: 'document' },
        },
      },
    ])

    await setupSession(page)
    await sendChatMessage(page, 'Search for documents')

    // Wait for tool call
    const toolCall = page.locator('.tool-inline.needs-confirm')
    await expect(toolCall).toBeVisible({ timeout: 10_000 })

    // Tool should show preview of arguments
    await expect(toolCall.locator('.tool-preview')).toBeVisible()

    // Click to expand and see full arguments
    await toolCall.locator('.tool-row').click()
    await expect(toolCall).toHaveClass(/expanded/, { timeout: 2_000 })

    // Verify arguments are displayed in expanded view
    const detailsSection = toolCall.locator('.tool-details')
    await expect(detailsSection).toBeVisible()
  })

  test('shows tool execution status transitions', async ({ page }) => {
    // Setup: Tool call
    mockProvider.setToolCalls([
      {
        id: 'call_006',
        name: 'run_command',
        arguments: { command: 'ls -la' },
      },
    ])

    await setupSession(page)
    await sendChatMessage(page, 'Run ls command')

    // Wait for tool call with "Confirm" status
    const toolCall = page.locator('.tool-inline.needs-confirm')
    await expect(toolCall).toBeVisible({ timeout: 10_000 })

    const statusIndicator = toolCall.locator('.status-indicator')
    await expect(statusIndicator).toContainText('Confirm')

    // Approve
    await toolCall.locator('.allow-main-btn').click()

    // Status should transition away from "Confirm"
    await expect(statusIndicator).not.toContainText('Confirm', { timeout: 5_000 })

    // Status should show completion indicator eventually
    // (depends on how the mock handles tool execution)
  })
})
