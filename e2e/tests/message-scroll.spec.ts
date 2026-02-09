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

test.describe('Message Scroll Behavior', () => {
  test('long conversation is scrollable', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send multiple messages to create a long conversation
    const messageCount = 8
    for (let i = 1; i <= messageCount; i++) {
      await sendChatMessage(page, `Message ${i}`)
      
      // Wait for user message to appear
      await expect(page.locator('.message.user', { hasText: `Message ${i}` })).toBeVisible({ timeout: 10_000 })
      
      // Wait for AI response (but don't wait for full completion on every message)
      if (i < messageCount) {
        // For intermediate messages, just wait for response to start
        await expect(page.locator('.message.assistant').nth(i - 1)).toBeVisible({ timeout: 15_000 })
        await page.waitForTimeout(1000) // Brief pause between messages
      } else {
        // For the last message, wait for completion
        const lastAssistant = page.locator('.message.assistant').nth(i - 1)
        await expect(lastAssistant).toBeVisible({ timeout: 15_000 })
        await expect(lastAssistant).toContainText('Hello from mock AI!', { timeout: 10_000 })
        await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })
      }
    }

    // Verify total message count (user + assistant)
    await expect(page.locator('.message')).toHaveCount(messageCount * 2, { timeout: 10_000 })

    // Check if the chat container is scrollable
    const chatContainer = page.locator('.message-list').first()
    await expect(chatContainer).toBeVisible({ timeout: 5_000 })

    // Get scroll dimensions
    const scrollInfo = await chatContainer.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    }))

    // If scrollHeight > clientHeight, the container is scrollable
    const isScrollable = scrollInfo.scrollHeight > scrollInfo.clientHeight
    expect(isScrollable).toBeTruthy()

    // Try scrolling to the top
    await chatContainer.evaluate((el) => { el.scrollTop = 0 })
    await page.waitForTimeout(300)

    // Verify we can see an early message
    const firstMessage = page.locator('.message.user', { hasText: 'Message 1' })
    const firstMessageVisible = await firstMessage.isVisible({ timeout: 2_000 }).catch(() => false)
    expect(firstMessageVisible).toBeTruthy()
  })

  test('auto-scrolls to bottom when new message arrives', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send several messages to create scrollable content
    for (let i = 1; i <= 6; i++) {
      await sendChatMessage(page, `Setup message ${i}`)
      await expect(page.locator('.message.user', { hasText: `Setup message ${i}` })).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.message.assistant').nth(i - 1)).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(800)
    }

    // Wait for the last response to complete
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    const chatContainer = page.locator('.message-list').first()
    
    // Scroll to the top manually
    await chatContainer.evaluate((el) => { el.scrollTop = 0 })
    await page.waitForTimeout(500)

    // Verify we're at the top (scrollTop should be near 0)
    const scrollTopBefore = await chatContainer.evaluate((el) => el.scrollTop)
    expect(scrollTopBefore).toBeLessThan(100)

    // Send a new message
    await sendChatMessage(page, 'New message at bottom')
    await expect(page.locator('.message.user', { hasText: 'New message at bottom' })).toBeVisible({ timeout: 10_000 })

    // Wait for AI response
    const newAssistant = page.locator('.message.assistant').last()
    await expect(newAssistant).toBeVisible({ timeout: 15_000 })
    await expect(newAssistant).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Wait a bit for auto-scroll to complete
    await page.waitForTimeout(1000)

    // Verify we've auto-scrolled to the bottom
    const scrollInfo = await chatContainer.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))

    // Check if we're near the bottom (within 100px tolerance)
    const distanceFromBottom = scrollInfo.scrollHeight - scrollInfo.scrollTop - scrollInfo.clientHeight
    expect(distanceFromBottom).toBeLessThan(100)

    // Verify the new message is visible
    const newMessage = page.locator('.message.user', { hasText: 'New message at bottom' })
    await expect(newMessage).toBeVisible({ timeout: 2_000 })
  })

  test('stays at bottom during streaming', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    const chatContainer = page.locator('.message-list').first()

    // Send a message
    await sendChatMessage(page, 'Test streaming scroll')
    await expect(page.locator('.message.user')).toBeVisible({ timeout: 10_000 })

    // Wait for assistant message to start appearing
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })

    // During streaming, check scroll position multiple times
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(500)
      
      const scrollInfo = await chatContainer.evaluate((el) => ({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))

      const distanceFromBottom = scrollInfo.scrollHeight - scrollInfo.scrollTop - scrollInfo.clientHeight
      
      // Should stay near the bottom during streaming (within 150px tolerance)
      expect(distanceFromBottom).toBeLessThan(150)
    }

    // Wait for streaming to complete
    await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Final check: should still be at the bottom
    const finalScrollInfo = await chatContainer.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))

    const finalDistanceFromBottom = finalScrollInfo.scrollHeight - finalScrollInfo.scrollTop - finalScrollInfo.clientHeight
    expect(finalDistanceFromBottom).toBeLessThan(100)
  })
})
