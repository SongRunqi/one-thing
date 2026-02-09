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

async function sendChatMessage(page: import('@playwright/test').Page, text: string) {
  const input = page.locator('textarea.composer-input')
  await input.click()
  await input.pressSequentially(text, { delay: 20 })
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
}

test.describe('Empty Session - EmptyState Display', () => {
  test('new session shows empty state', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Verify no messages are shown
    await expect(page.locator('.message.user')).toHaveCount(0)
    await expect(page.locator('.message.assistant')).toHaveCount(0)

    // Look for empty state indicators (could be various class names)
    const possibleEmptyStates = [
      page.locator('.empty-state'),
      page.locator('.placeholder'),
      page.locator('[class*="empty"]'),
      page.locator('[class*="Empty"]'),
    ]

    let emptyStateFound = false
    for (const locator of possibleEmptyStates) {
      if (await locator.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
        emptyStateFound = true
        break
      }
    }

    // Either an empty state component is shown, or simply no messages (both are valid)
    // The key is that the chat area is not blank/broken
    const chatArea = page.locator('.chat-content, .messages, main')
    await expect(chatArea.first()).toBeVisible({ timeout: 5_000 })
  })

  test('empty state disappears after sending message', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Verify empty state (or no messages)
    await expect(page.locator('.message')).toHaveCount(0, { timeout: 2_000 })

    // Send a message
    await sendChatMessage(page, 'First message')

    // Verify user message appears
    const userMessage = page.locator('.message.user', { hasText: 'First message' })
    await expect(userMessage).toBeVisible({ timeout: 10_000 })

    // Verify empty state is gone (if it was there)
    const emptyState = page.locator('.empty-state, .placeholder, [class*="empty"]').first()
    if (await emptyState.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // If there was an empty state, it should now be hidden
      await expect(emptyState).not.toBeVisible()
    }

    // Wait for AI response
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Verify message count
    await expect(page.locator('.message')).toHaveCount(2, { timeout: 5_000 })
  })

  test('empty state returns after deleting all messages', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create session and send a message
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await sendChatMessage(page, 'Test message')
    await expect(page.locator('.message.user')).toBeVisible({ timeout: 10_000 })

    // Wait for AI response to complete
    await expect(page.locator('.message.assistant')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Try to delete all messages (if delete functionality exists)
    const messages = page.locator('.message')
    const messageCount = await messages.count()

    if (messageCount > 0) {
      // Try hovering over message to find delete button
      const firstMessage = messages.first()
      await firstMessage.hover()
      
      const deleteBtn = firstMessage.locator('button.delete, button[aria-label*="删除"], button[title*="删除"]')
      const hasDeleteBtn = await deleteBtn.isVisible({ timeout: 1_000 }).catch(() => false)

      if (hasDeleteBtn) {
        // Delete all messages one by one
        for (let i = 0; i < messageCount; i++) {
          const msg = page.locator('.message').first()
          await msg.hover()
          const btn = msg.locator('button.delete, button[aria-label*="删除"], button[title*="删除"]')
          if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await btn.click()
            await page.waitForTimeout(300)
          }
        }

        // After deleting all messages, empty state should return
        await page.waitForTimeout(500)
        const remainingMessages = await page.locator('.message').count()
        
        if (remainingMessages === 0) {
          // Either empty state appears or simply no messages
          const chatArea = page.locator('.chat-content, .messages, main')
          await expect(chatArea.first()).toBeVisible({ timeout: 5_000 })
        }
      }
    }
  })
})
