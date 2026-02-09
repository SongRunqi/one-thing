import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'

const mockProvider = createMockProvider()
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
  console.log('[Test] Mock provider started at:', mockProvider.url)
})

test.afterAll(async () => {
  await mockProvider.stop()
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

test.describe('Tool Execution - Simple', () => {
  test('basic streaming works', async ({ page }) => {
    await setupSession(page)
    await sendChatMessage(page, 'Hello')

    // Wait for assistant message
    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toBeVisible({ timeout: 15_000 })
    await expect(assistantMsg).toContainText('Hello from mock AI!', { timeout: 10_000 })

    console.log('[Test] Basic streaming test passed')
  })

  test('can set tool calls', async ({ page }) => {
    // Just verify the mock provider accepts tool call configuration
    mockProvider.setToolCalls([
      {
        id: 'call_test',
        name: 'test_tool',
        arguments: { arg1: 'value1' },
      },
    ])
    mockProvider.clearToolCalls()

    console.log('[Test] Tool call configuration test passed')
  })
})
