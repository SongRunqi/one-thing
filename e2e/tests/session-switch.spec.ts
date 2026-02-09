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

test.describe('Session Switch - Message Persistence', () => {
  test('messages persist after switching between sessions', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create Session A and send a message
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    await sendChatMessage(page, 'Hello A')
    
    // Verify user message appears in Session A
    const userMessageA = page.locator('.message.user', { hasText: 'Hello A' })
    await expect(userMessageA).toBeVisible({ timeout: 10_000 })

    // Wait for AI response in Session A
    const assistantMessageA = page.locator('.message.assistant').first()
    await expect(assistantMessageA).toBeVisible({ timeout: 15_000 })
    await expect(assistantMessageA).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Wait for streaming to complete
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Store Session A reference
    const sessionAItem = page.locator('.session-item.active')
    const sessionAText = await sessionAItem.innerText()

    // Create Session B and send a different message
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    
    // Verify we're in a new session (messages from A should not be visible)
    await expect(userMessageA).not.toBeVisible()

    await sendChatMessage(page, 'Hello B')
    
    // Verify user message appears in Session B
    const userMessageB = page.locator('.message.user', { hasText: 'Hello B' })
    await expect(userMessageB).toBeVisible({ timeout: 10_000 })

    // Wait for AI response in Session B
    const assistantMessageB = page.locator('.message.assistant').first()
    await expect(assistantMessageB).toBeVisible({ timeout: 15_000 })
    await expect(assistantMessageB).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Wait for streaming to complete
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Switch back to Session A
    const sessionItems = page.locator('.sessions-list .session-item:not(.new-chat-item)')
    const sessionA = sessionItems.filter({ hasText: sessionAText.split('\n')[0] })
    await sessionA.first().click()
    await page.waitForTimeout(500)

    // CRITICAL: Verify "Hello A" is still displayed (not blank)
    await expect(userMessageA).toBeVisible({ timeout: 5_000 })
    await expect(assistantMessageA).toBeVisible({ timeout: 5_000 })
    await expect(assistantMessageA).toContainText('Hello from mock AI!')

    // Verify Session B messages are NOT visible
    await expect(userMessageB).not.toBeVisible()

    // Switch to Session B
    const sessionB = page.locator('.session-item.active').filter({ hasText: /Hello B/ })
    if (await sessionB.count() === 0) {
      // If Session B is not active, find it in the list
      const allSessions = page.locator('.sessions-list .session-item:not(.new-chat-item)')
      for (let i = 0; i < await allSessions.count(); i++) {
        const text = await allSessions.nth(i).innerText()
        if (text.includes('Hello B')) {
          await allSessions.nth(i).click()
          await page.waitForTimeout(500)
          break
        }
      }
    }

    // Verify "Hello B" is still displayed
    await expect(userMessageB).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.message.assistant', { hasText: 'Hello from mock AI!' })).toBeVisible({ timeout: 5_000 })

    // Verify Session A messages are NOT visible
    await expect(userMessageA).not.toBeVisible()
  })

  test('empty session shows empty state after switching', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create Session A with a message
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await sendChatMessage(page, 'Message in session A')
    await expect(page.locator('.message.user', { hasText: 'Message in session A' })).toBeVisible({ timeout: 10_000 })

    // Create empty Session B (don't send any message)
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    
    // Verify empty state is shown
    const emptyState = page.locator('.empty-state, .placeholder, [class*="empty"]').first()
    const hasEmptyState = await emptyState.isVisible({ timeout: 2_000 }).catch(() => false)
    
    // Switch back to Session A
    const sessionItems = page.locator('.sessions-list .session-item:not(.new-chat-item)')
    await sessionItems.first().click()
    await page.waitForTimeout(500)

    // Verify messages are visible in Session A
    await expect(page.locator('.message.user', { hasText: 'Message in session A' })).toBeVisible({ timeout: 5_000 })

    // Switch back to empty Session B
    await sessionItems.nth(1).click()
    await page.waitForTimeout(500)

    // Verify empty state is still shown (or no messages)
    if (hasEmptyState) {
      await expect(emptyState).toBeVisible({ timeout: 5_000 })
    }
    await expect(page.locator('.message.user')).toHaveCount(0)
  })
})
