import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'

const mockProvider = createMockProvider({ port: 19876 })
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
})

test.afterAll(async () => {
  await mockProvider.stop()
})

test.afterEach(async () => {
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

test.describe('Provider Integration', () => {
  test('handles invalid API key gracefully (401)', async ({ page }) => {
    await setupSession(page)

    // Set persistent 401 error
    mockProvider.setError(401)

    await sendChatMessage(page, 'Test authentication error')

    // Should show authentication error message
    const errorMsg = page.locator('.message.error')
    await expect(errorMsg).toBeVisible({ timeout: 15_000 })
    const errorBubble = errorMsg.locator('.error-bubble')
    await expect(errorBubble).toBeVisible({ timeout: 5_000 })

    // Should have retry button available
    const retryBtn = errorMsg.locator('.retry-btn')
    await expect(retryBtn).toBeVisible({ timeout: 5_000 })

    // Clear error and test that retry works
    mockProvider.clearError()
    await retryBtn.click()

    // Should get successful response after retry
    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toBeVisible({ timeout: 15_000 })
    await expect(assistantMsg).toContainText(/Hello from mock AI!/i, { timeout: 10_000 })
  })

  test('handles rate limit (429)', async ({ page }) => {
    await setupSession(page)

    // Set persistent 429 error
    mockProvider.setError(429)

    await sendChatMessage(page, 'Test rate limit')

    // Should show rate limit error message
    const errorMsg = page.locator('.message.error')
    await expect(errorMsg).toBeVisible({ timeout: 15_000 })
    const errorBubble = errorMsg.locator('.error-bubble')
    await expect(errorBubble).toBeVisible({ timeout: 5_000 })

    // Clear error and verify can retry
    mockProvider.clearError()

    // Click retry button
    const retryBtn = errorMsg.locator('.retry-btn')
    await expect(retryBtn).toBeVisible({ timeout: 5_000 })
    await retryBtn.click()

    // After retry, should get successful response
    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toBeVisible({ timeout: 15_000 })
    await expect(assistantMsg).toContainText(/Hello from mock AI!/i, { timeout: 10_000 })
  })

  test('handles network timeout', async ({ page }) => {
    await setupSession(page)

    // Set a server error to simulate timeout behavior
    mockProvider.setError(504) // Gateway Timeout

    await sendChatMessage(page, 'Test timeout')

    // Should show timeout/gateway error message
    const errorMsg = page.locator('.message.error')
    await expect(errorMsg).toBeVisible({ timeout: 15_000 })
    const errorBubble = errorMsg.locator('.error-bubble')
    await expect(errorBubble).toBeVisible({ timeout: 5_000 })

    // Verify UI is still responsive
    const input = page.locator('textarea.composer-input')
    await expect(input).toBeEnabled({ timeout: 3_000 })
  })

  test('handles server error (500)', async ({ page }) => {
    await setupSession(page)

    // Set persistent 500 error
    mockProvider.setError(500)

    await sendChatMessage(page, 'Test server error')

    // Should show server error message
    const errorMsg = page.locator('.message.error')
    await expect(errorMsg).toBeVisible({ timeout: 15_000 })
    const errorBubble = errorMsg.locator('.error-bubble')
    await expect(errorBubble).toBeVisible({ timeout: 5_000 })

    // Clear error to test retry functionality
    mockProvider.clearError()

    // Click retry button
    const retryBtn = errorMsg.locator('.retry-btn')
    await expect(retryBtn).toBeVisible({ timeout: 5_000 })
    await retryBtn.click()

    // Should receive successful response
    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toBeVisible({ timeout: 15_000 })
    await expect(assistantMsg).toContainText(/Hello from mock AI!/i, { timeout: 10_000 })
  })

  test('recovers from transient errors', async ({ page }) => {
    await setupSession(page)

    // Send a successful message first
    await sendChatMessage(page, 'Initial message')
    const firstMsg = page.locator('.message.assistant').first()
    await expect(firstMsg).toBeVisible({ timeout: 15_000 })
    await expect(firstMsg).toContainText(/Hello from mock AI!/i, { timeout: 10_000 })

    // Simulate a transient error
    mockProvider.setError(503) // Service Unavailable
    await sendChatMessage(page, 'Message during outage')

    const errorMsg = page.locator('.message.error')
    await expect(errorMsg).toBeVisible({ timeout: 15_000 })

    // Service recovers
    mockProvider.clearError()

    // Click retry to continue
    const retryBtn = errorMsg.locator('.retry-btn')
    await expect(retryBtn).toBeVisible({ timeout: 5_000 })
    await retryBtn.click()

    // After retry, should get successful response
    const recoveryMsg = page.locator('.message.assistant').last()
    await expect(recoveryMsg).toBeVisible({ timeout: 15_000 })
    await expect(recoveryMsg).toContainText(/Hello from mock AI!/i, { timeout: 10_000 })
  })
})
