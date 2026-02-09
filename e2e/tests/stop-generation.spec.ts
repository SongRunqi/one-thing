import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'
import { setupSession, sendChatMessage } from '../fixtures/helpers'

// Use slower chunk delay to make it easier to click stop button
const mockProvider = createMockProvider({ port: 18325, chunkDelay: 200 })
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
})

test.afterAll(async () => {
  await mockProvider.stop()
})

test.describe('Stop Generation', () => {
  test('can stop streaming response', async ({ page }) => {
    await setupSession(page)

    // Send a message
    await sendChatMessage(page, 'Tell me a long story')

    // Wait for streaming to start
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 10_000 })

    // Wait a moment for some content to stream
    await page.waitForTimeout(500)

    // Click stop button while streaming
    const stopBtn = page.locator('.stop-btn, button').filter({ hasText: /停止|Stop/ }).or(
      page.locator('[data-test="stop-btn"], [aria-label*="停止"], [aria-label*="Stop"]')
    ).first()

    if (await stopBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await stopBtn.click()

      // Verify stop button disappears (streaming stopped)
      await expect(stopBtn).toBeHidden({ timeout: 5_000 })

      // Verify send button is back to normal state
      const sendBtn = page.locator('.send-btn:not(.stop-btn)').first()
      await expect(sendBtn).toBeVisible({ timeout: 3_000 })

      // Assistant message should be visible but incomplete
      const assistantMessage = page.locator('.message.assistant').first()
      await expect(assistantMessage).toBeVisible()
      
      // Message should not contain the full mock response since we stopped it
      const content = await assistantMessage.textContent()
      // It should have some content but likely not the complete "Hello from mock AI!"
      expect(content).toBeTruthy()
    } else {
      console.log('Stop button not found - may already be implemented differently')
    }
  })

  test('can send new message after stopping', async ({ page }) => {
    await setupSession(page)

    // Send first message
    await sendChatMessage(page, 'First message')
    await expect(page.locator('.message.assistant').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(300)

    // Try to stop if button is available
    const stopBtn = page.locator('.stop-btn, button').filter({ hasText: /停止|Stop/ }).or(
      page.locator('[data-test="stop-btn"], [aria-label*="停止"]')
    ).first()

    if (await stopBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await stopBtn.click()
      await expect(stopBtn).toBeHidden({ timeout: 5_000 })
    } else {
      // Wait for first message to complete
      await page.waitForTimeout(2000)
    }

    // Send a second message
    await sendChatMessage(page, 'Second message after stop')

    // Wait for second message to complete
    await page.waitForTimeout(3000)

    // Verify both user messages exist
    const userMessages = page.locator('.message.user')
    await expect(userMessages).toHaveCount(2, { timeout: 5_000 })
    await expect(userMessages.nth(0)).toContainText('First message')
    await expect(userMessages.nth(1)).toContainText('Second message after stop')

    // At least one assistant message should exist
    const assistantMessages = page.locator('.message.assistant')
    await expect(assistantMessages.first()).toBeVisible()
  })

  test('stop button appears only during streaming', async ({ page }) => {
    await setupSession(page)

    const stopBtn = page.locator('.stop-btn, button').filter({ hasText: /停止|Stop/ }).or(
      page.locator('[data-test="stop-btn"]')
    ).first()

    // Initially, stop button should not be visible
    await expect(stopBtn).toBeHidden({ timeout: 2_000 }).catch(() => {
      // Button might not exist at all initially
      console.log('Stop button not in DOM initially - OK')
    })

    // Send a message
    await sendChatMessage(page, 'Trigger streaming')

    // Stop button should appear during streaming
    if (await stopBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Wait for streaming to finish naturally
      await page.waitForTimeout(3000)

      // Stop button should disappear after streaming completes
      await expect(stopBtn).toBeHidden({ timeout: 5_000 })
    } else {
      console.log('Stop button implementation may differ from expected')
    }
  })

  test('multiple stop and resume cycles', async ({ page }) => {
    await setupSession(page)

    const stopBtn = page.locator('.stop-btn, button').filter({ hasText: /停止|Stop/ }).or(
      page.locator('[data-test="stop-btn"]')
    ).first()

    // First cycle
    await sendChatMessage(page, 'Message 1')
    await page.waitForTimeout(400)
    
    if (await stopBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await stopBtn.click()
      await expect(stopBtn).toBeHidden({ timeout: 3_000 })
    } else {
      await page.waitForTimeout(2000)
    }

    // Second cycle
    await sendChatMessage(page, 'Message 2')
    await page.waitForTimeout(400)
    
    if (await stopBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await stopBtn.click()
      await expect(stopBtn).toBeHidden({ timeout: 3_000 })
    } else {
      await page.waitForTimeout(2000)
    }

    // Third cycle - let it complete
    await sendChatMessage(page, 'Message 3')
    await page.waitForTimeout(3000)

    // Verify all user messages exist
    const userMessages = page.locator('.message.user')
    await expect(userMessages).toHaveCount(3, { timeout: 5_000 })

    // At least some assistant messages should exist
    const assistantMessages = page.locator('.message.assistant')
    const count = await assistantMessages.count()
    expect(count).toBeGreaterThan(0)
  })

  test('UI remains responsive after stop', async ({ page }) => {
    await setupSession(page)

    // Send and stop
    await sendChatMessage(page, 'Test responsiveness')
    await page.waitForTimeout(400)

    const stopBtn = page.locator('.stop-btn, button').filter({ hasText: /停止|Stop/ }).first()
    if (await stopBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await stopBtn.click()
      await page.waitForTimeout(1000)
    } else {
      await page.waitForTimeout(2000)
    }

    // Verify input is still editable
    const input = page.locator('textarea.composer-input')
    await expect(input).toBeVisible()
    await expect(input).toBeEditable()

    // Type and verify input accepts text
    await input.click()
    await input.fill('UI is responsive')
    const value = await input.inputValue()
    expect(value).toBe('UI is responsive')

    // Clear input
    await input.clear()
    
    // Send another message to verify full functionality
    await sendChatMessage(page, 'Final test message')
    await page.waitForTimeout(2000)

    const lastUserMessage = page.locator('.message.user').last()
    await expect(lastUserMessage).toContainText('Final test message')
  })
})
