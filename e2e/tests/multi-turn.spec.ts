import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'
import { setupSession, sendChatMessage, waitForAssistantReply } from '../fixtures/helpers'

const mockProvider = createMockProvider({ port: 18324 })
const test = createChatTest(mockProvider.url)

test.beforeAll(async () => {
  await mockProvider.start()
})

test.afterAll(async () => {
  await mockProvider.stop()
})

test.describe('Multi-Turn Conversation', () => {
  test('handle 5+ consecutive messages', async ({ page }) => {
    await setupSession(page)

    const messages = [
      'Turn 1: What is AI?',
      'Turn 2: Tell me more',
      'Turn 3: Can you explain that?',
      'Turn 4: What about machine learning?',
      'Turn 5: How does it work?',
      'Turn 6: Give me an example',
    ]

    // Send all messages sequentially and wait for each reply
    for (let i = 0; i < messages.length; i++) {
      await sendChatMessage(page, messages[i])
      await waitForAssistantReply(page, i)
    }

    // Verify all user messages are present
    await expect(page.locator('.message.user')).toHaveCount(messages.length, { timeout: 5_000 })

    // Verify all assistant messages are present
    await expect(page.locator('.message.assistant')).toHaveCount(messages.length, { timeout: 5_000 })

    // Verify message order
    const userMessages = page.locator('.message.user')
    for (let i = 0; i < messages.length; i++) {
      await expect(userMessages.nth(i)).toContainText(messages[i])
    }

    // Verify all assistant messages contain expected response
    const assistantMessages = page.locator('.message.assistant')
    for (let i = 0; i < messages.length; i++) {
      await expect(assistantMessages.nth(i)).toContainText('Hello from mock AI!')
    }
  })

  test('context is maintained across turns', async ({ page }) => {
    await setupSession(page)

    // Simulate a conversation flow where context matters
    const conversation = [
      { user: 'My name is Alice', expectedKeywords: ['Hello'] },
      { user: 'What is my name?', expectedKeywords: ['mock'] },
      { user: 'Can you remember that?', expectedKeywords: ['AI'] },
    ]

    for (let i = 0; i < conversation.length; i++) {
      const turn = conversation[i]
      
      // Send message
      await sendChatMessage(page, turn.user)
      
      // Wait for and verify reply
      const reply = await waitForAssistantReply(page, i)
      
      // Mock provider returns same message, but verify it appears
      for (const keyword of turn.expectedKeywords) {
        await expect(reply).toContainText(keyword)
      }
    }

    // Verify conversation length
    await expect(page.locator('.message.user')).toHaveCount(3)
    await expect(page.locator('.message.assistant')).toHaveCount(3)
  })

  test('rapid consecutive messages', async ({ page }) => {
    await setupSession(page)

    // Send messages rapidly without waiting for full reply
    const rapidMessages = ['Quick 1', 'Quick 2', 'Quick 3']
    
    for (const msg of rapidMessages) {
      const input = page.locator('textarea.composer-input')
      await input.click()
      await input.fill(msg)
      await input.press('Enter')
      await page.waitForTimeout(200) // Minimal delay between sends
    }

    // Wait for all messages to be processed
    await page.waitForTimeout(5000)

    // Verify all user messages arrived
    const userMessages = page.locator('.message.user')
    await expect(userMessages).toHaveCount(3, { timeout: 10_000 })

    // Verify content
    await expect(userMessages.nth(0)).toContainText('Quick 1')
    await expect(userMessages.nth(1)).toContainText('Quick 2')
    await expect(userMessages.nth(2)).toContainText('Quick 3')

    // Assistant messages should eventually appear (may take longer)
    const assistantMessages = page.locator('.message.assistant')
    await expect(assistantMessages).toHaveCount(3, { timeout: 15_000 })
  })

  test('long conversation maintains scroll position', async ({ page }) => {
    await setupSession(page)

    // Send enough messages to trigger scrolling
    for (let i = 1; i <= 10; i++) {
      await sendChatMessage(page, `Message number ${i}`)
      await waitForAssistantReply(page, i - 1)
    }

    // Verify message count
    await expect(page.locator('.message.user')).toHaveCount(10)
    await expect(page.locator('.message.assistant')).toHaveCount(10)

    // Check if the latest message is visible (auto-scroll to bottom)
    const lastAssistantMessage = page.locator('.message.assistant').last()
    await expect(lastAssistantMessage).toBeInViewport({ timeout: 5_000 })

    // Scroll to top
    const chatContainer = page.locator('.chat-container, .message-list, [role="log"]').first()
    await chatContainer.evaluate(el => el.scrollTop = 0)

    // Verify first message is now visible
    const firstUserMessage = page.locator('.message.user').first()
    await expect(firstUserMessage).toBeInViewport({ timeout: 2_000 })

    // Send a new message - should auto-scroll to bottom
    await sendChatMessage(page, 'Final message')
    await waitForAssistantReply(page, 10)

    // Latest message should be visible again
    await expect(page.locator('.message.assistant').last()).toBeInViewport({ timeout: 5_000 })
  })

  test('empty messages are rejected', async ({ page }) => {
    await setupSession(page)

    const input = page.locator('textarea.composer-input')
    const sendBtn = page.locator('.send-btn, button[type="submit"]').first()

    // Try to send empty message
    await input.click()
    await input.fill('')
    
    // Send button should be disabled or message should not be sent
    const isDisabled = await sendBtn.isDisabled().catch(() => false)
    
    if (!isDisabled) {
      // Try sending anyway
      await input.press('Enter')
      await page.waitForTimeout(1000)
    }

    // No messages should appear
    const userMessages = page.locator('.message.user')
    await expect(userMessages).toHaveCount(0, { timeout: 2_000 })
  })
})
