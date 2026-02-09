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

test.afterEach(async () => {
  // Always clear errors between tests
  mockProvider.clearError()
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

test.describe('Error Handling', () => {
  test('API error shows error message', async ({ page }) => {
    await setupSession(page)

    // Set persistent error — all /responses requests will return 500
    // (persistent because the AI SDK retries failed requests)
    mockProvider.setError(500)

    await sendChatMessage(page, 'This should fail')

    // The error message should appear with the .message.error selector
    const errorMessage = page.locator('.message.error')
    await expect(errorMessage).toBeVisible({ timeout: 15_000 })

    // Error bubble should contain error text
    const errorBubble = errorMessage.locator('.error-bubble')
    await expect(errorBubble).toBeVisible({ timeout: 5_000 })
  })

  test('error message has retry button', async ({ page }) => {
    await setupSession(page)

    // Set persistent error
    mockProvider.setError(500)

    await sendChatMessage(page, 'Trigger error for retry test')

    // Wait for error message
    const errorMessage = page.locator('.message.error')
    await expect(errorMessage).toBeVisible({ timeout: 15_000 })

    // Retry button should be visible
    const retryBtn = errorMessage.locator('.retry-btn')
    await expect(retryBtn).toBeVisible({ timeout: 5_000 })
    await expect(retryBtn).toContainText('Retry')
  })

  test('retry after error works', async ({ page }) => {
    await setupSession(page)

    // Set persistent error
    mockProvider.setError(500)

    await sendChatMessage(page, 'Will fail then succeed')

    // Wait for error message
    const errorMessage = page.locator('.message.error')
    await expect(errorMessage).toBeVisible({ timeout: 15_000 })

    // Clear the error so next request succeeds
    mockProvider.clearError()

    // Click retry button
    const retryBtn = errorMessage.locator('.retry-btn')
    await expect(retryBtn).toBeVisible({ timeout: 5_000 })
    await retryBtn.click()

    // After retry, an assistant message should appear with the mock response
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })
  })
})
