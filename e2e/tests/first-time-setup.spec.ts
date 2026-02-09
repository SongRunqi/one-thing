import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'
import { dismissUpdateNotification, sendChatMessage, waitForAssistantReply, setupSession } from '../fixtures/helpers'

const mockProvider = createMockProvider({ port: 18322 })
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
})

test.afterAll(async () => {
  await mockProvider.stop()
})

test.describe('First-Time Setup Flow', () => {
  test('user can send first message after setup', async ({ page }) => {
    // Note: Provider is pre-configured via createChatTest fixture
    // This simulates a user who has already gone through initial setup
    
    await setupSession(page)

    // Send first message
    await sendChatMessage(page, 'Hello! This is my first message.')

    // Verify user message appears
    const userMessage = page.locator('.message.user').first()
    await expect(userMessage).toBeVisible({ timeout: 10_000 })
    await expect(userMessage).toContainText('Hello! This is my first message.')

    // Verify AI reply is received
    const assistantMessage = await waitForAssistantReply(page, 0)
    await expect(assistantMessage).toContainText('Hello from mock AI!')
  })

  test('new session can be created after first use', async ({ page }) => {
    await setupSession(page)

    // Send a message in first session
    await sendChatMessage(page, 'Message in first session')
    await waitForAssistantReply(page, 0)

    // Create another new session
    await page.locator('.new-chat-item, button').filter({ hasText: /新对话|New/ }).first().click()
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send message in second session
    await sendChatMessage(page, 'Message in second session')
    const assistantMessage = await waitForAssistantReply(page, 0)
    await expect(assistantMessage).toContainText('Hello from mock AI!')

    // Verify we have 2 sessions
    const sessions = page.locator('.session-item')
    await expect(sessions).toHaveCount(2, { timeout: 5_000 })
  })
})
