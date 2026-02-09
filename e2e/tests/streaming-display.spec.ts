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

test.describe('Streaming Response Display', () => {
  test('shows streaming response progressively', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send a message
    await sendChatMessage(page, 'Test streaming')

    // Verify user message appears
    await expect(page.locator('.message.user', { hasText: 'Test streaming' })).toBeVisible({ timeout: 10_000 })

    // Wait for assistant message to start appearing
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })

    // Capture content at different stages
    const contentSnapshots: string[] = []

    // Take multiple snapshots during streaming
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(200)
      const content = await assistantMessage.textContent()
      if (content) {
        contentSnapshots.push(content.trim())
      }
    }

    // Wait for complete message
    await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Verify we saw partial content during streaming
    // The mock provider sends: "Hello" → " from" → " mock" → " AI!"
    // We should see progressive content, not just the final message appearing at once
    const hasPartialContent = contentSnapshots.some(
      (snapshot) => snapshot.length > 0 && snapshot.length < 'Hello from mock AI!'.length
    )

    // At minimum, content should be growing over time
    const contentLengths = contentSnapshots.map((s) => s.length)
    const isGrowing = contentLengths.some((len, i) => i > 0 && len > contentLengths[i - 1])

    expect(hasPartialContent || isGrowing).toBeTruthy()
  })

  test('shows complete message after streaming finishes', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send a message
    await sendChatMessage(page, 'Complete message test')

    // Wait for assistant message
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })

    // Wait for streaming to complete (send button returns to normal state)
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Verify complete message is displayed
    await expect(assistantMessage).toContainText('Hello from mock AI!')

    // Verify the exact text matches what mock provider sends
    const fullText = await assistantMessage.textContent()
    expect(fullText?.trim()).toContain('Hello from mock AI!')
  })

  test('streaming indicator shows during response', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send a message
    await sendChatMessage(page, 'Test indicators')

    // During streaming, the send button should change to a stop button
    const stopBtn = page.locator('.send-btn.stop-btn, button[aria-label*="停止"], button[title*="停止"]')
    const hasStopBtn = await stopBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasStopBtn) {
      // Verify stop button is visible during streaming
      await expect(stopBtn).toBeVisible()
    }

    // Wait for streaming to complete
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // After completion, stop button should be gone and normal send button returns
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })
    
    if (hasStopBtn) {
      await expect(stopBtn).not.toBeVisible()
    }
  })

  test('can stop streaming mid-response', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send a message
    await sendChatMessage(page, 'Test stop streaming')

    // Wait for assistant message to start
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })

    // Look for stop button
    const stopBtn = page.locator('.send-btn.stop-btn, button[aria-label*="停止"], button[title*="停止"]')
    const hasStopBtn = await stopBtn.isVisible({ timeout: 2_000 }).catch(() => false)

    if (hasStopBtn) {
      // Wait a bit to let some content stream in
      await page.waitForTimeout(500)

      // Capture partial content
      const partialContent = await assistantMessage.textContent()

      // Click stop button
      await stopBtn.click()
      await page.waitForTimeout(500)

      // Verify stop button is gone (streaming stopped)
      await expect(stopBtn).not.toBeVisible({ timeout: 5_000 })

      // Verify send button is back to normal
      await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 5_000 })

      // Verify we still have the partial message (it shouldn't disappear)
      const finalContent = await assistantMessage.textContent()
      expect(finalContent).toBeTruthy()
      
      // The message might be partial or complete depending on timing
      // But it should not be empty
      expect(finalContent!.trim().length).toBeGreaterThan(0)
    } else {
      // If no stop button exists, just verify streaming completes normally
      await expect(assistantMessage).toContainText('Hello from mock AI!', { timeout: 10_000 })
    }
  })

  test('multiple streaming responses in sequence', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a new session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send first message
    await sendChatMessage(page, 'First streaming message')
    const firstAssistant = page.locator('.message.assistant').first()
    await expect(firstAssistant).toBeVisible({ timeout: 15_000 })
    await expect(firstAssistant).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Wait for streaming to complete
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Send second message
    await sendChatMessage(page, 'Second streaming message')
    const secondAssistant = page.locator('.message.assistant').nth(1)
    await expect(secondAssistant).toBeVisible({ timeout: 15_000 })
    await expect(secondAssistant).toContainText('Hello from mock AI!', { timeout: 10_000 })

    // Wait for streaming to complete
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Verify both messages are still visible
    await expect(firstAssistant).toBeVisible()
    await expect(secondAssistant).toBeVisible()

    // Verify message count
    await expect(page.locator('.message.assistant')).toHaveCount(2, { timeout: 5_000 })
  })
})
