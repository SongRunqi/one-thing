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

test.describe('Streaming', () => {
  test('text appears during streaming (not blank)', async ({ page }) => {
    await setupSession(page)
    await sendChatMessage(page, 'Stream test')

    // The assistant message should appear with visible text content (not blank).
    // This catches the Sprint 3 regression where UIMessage was written but
    // ChatMessage was read, resulting in blank messages.
    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toBeVisible({ timeout: 15_000 })
    await expect(assistantMsg).not.toBeEmpty({ timeout: 10_000 })
  })

  test('final content matches expected', async ({ page }) => {
    await setupSession(page)
    await sendChatMessage(page, 'Final content test')

    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toContainText('Hello from mock AI!', { timeout: 15_000 })
  })

  test('message persists after stream ends', async ({ page }) => {
    await setupSession(page)
    await sendChatMessage(page, 'Persistence test')

    const assistantMsg = page.locator('.message.assistant').first()
    await expect(assistantMsg).toContainText('Hello from mock AI!', { timeout: 15_000 })

    // Wait for streaming to complete
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)

    // Text should still be there
    await expect(assistantMsg).toContainText('Hello from mock AI!')
    await expect(assistantMsg).toBeVisible()
  })
})
