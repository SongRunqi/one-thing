import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'
import { setupSession, sendChatMessage, waitForAssistantReply } from '../fixtures/helpers'

const mockProvider = createMockProvider()
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
})

test.afterAll(async () => {
  await mockProvider.stop()
})

test.describe('Chat Flow', () => {
  test('send a message', async ({ page }) => {
    await setupSession(page)
    // Capture console logs for debugging
    const consoleLogs: string[] = []
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`))

    await sendChatMessage(page, 'Hello world')

    // Wait and capture debug info
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e/test-results/debug-after-send.png' })

    // Dump logs to help debug
    const fs = await import('fs')
    fs.writeFileSync('e2e/test-results/debug-console.log', consoleLogs.join('\n'))

    // Verify user message appears
    const userMessage = page.locator('.message.user').first()
    await expect(userMessage).toBeVisible({ timeout: 10_000 })
    await expect(userMessage).toContainText('Hello world')
  })

  test('receive AI reply', async ({ page }) => {
    await setupSession(page)

    // Capture all console logs
    const logs: string[] = []
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))

    await sendChatMessage(page, 'Say hello')

    // Wait for assistant message or timeout
    try {
      const assistantMessage = await waitForAssistantReply(page, 0)
      await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })
    } catch (e) {
      const fs = await import('fs')
      fs.writeFileSync('e2e/test-results/debug-receive-reply.log', logs.join('\n'))
      throw e
    }
  })

  test('multi-turn conversation', async ({ page }) => {
    await setupSession(page)

    // First turn
    await sendChatMessage(page, 'First message')
    const firstAssistant = await waitForAssistantReply(page, 0)
    await expect(firstAssistant).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Second turn
    await sendChatMessage(page, 'Second message')
    const secondAssistant = await waitForAssistantReply(page, 1)
    await expect(secondAssistant).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Verify message count and order
    await expect(page.locator('.message.user')).toHaveCount(2, { timeout: 5_000 })
    await expect(page.locator('.message.assistant')).toHaveCount(2, { timeout: 5_000 })
  })
})
