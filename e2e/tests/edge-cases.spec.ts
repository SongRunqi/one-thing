import { createChatTest, expect } from '../fixtures/app'
import { createMockProvider } from '../fixtures/mock-provider'
import http from 'http'

/**
 * Custom mock provider that supports custom responses
 */
function createCustomMockProvider() {
  const port = 18323
  let server: http.Server
  let customResponse: string | null = null

  function handleResponses(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      let parsed: any = {}
      try { parsed = JSON.parse(body) } catch {}

      const stream = parsed.stream !== false

      if (!stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'resp_mock_001',
          object: 'response',
          created_at: Math.floor(Date.now() / 1000),
          model: parsed.model ?? 'mock-model',
          status: 'completed',
          output: [{
            type: 'message',
            id: 'msg_mock_001',
            role: 'assistant',
            content: [{ type: 'output_text', text: customResponse ?? 'Default response' }],
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }))
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const responseId = 'resp_mock_001'
      const itemId = 'msg_mock_001'
      const model = parsed.model ?? 'mock-model'
      const createdAt = Math.floor(Date.now() / 1000)

      res.write(`event: response.created\ndata: ${JSON.stringify({
        type: 'response.created',
        response: { id: responseId, created_at: createdAt, model, service_tier: 'default' },
      })}\n\n`)

      res.write(`event: response.output_item.added\ndata: ${JSON.stringify({
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: itemId },
      })}\n\n`)

      const content = customResponse ?? 'Default response'
      const chunkSize = 10
      const chunks: string[] = []
      
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize))
      }

      let index = 0
      const interval = setInterval(() => {
        if (index < chunks.length) {
          res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({
            type: 'response.output_text.delta',
            item_id: itemId,
            delta: chunks[index],
          })}\n\n`)
          index++
        } else {
          clearInterval(interval)

          res.write(`event: response.output_item.done\ndata: ${JSON.stringify({
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: itemId,
              role: 'assistant',
              content: [{ type: 'output_text', text: content }],
            },
          })}\n\n`)

          res.write(`event: response.completed\ndata: ${JSON.stringify({
            type: 'response.completed',
            response: {
              usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: null, output_tokens_details: null },
            },
          })}\n\n`)

          res.end()
        }
      }, 30)
    })
  }

  function createServer() {
    server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.url?.includes('/responses')) {
        handleResponses(req, res)
        return
      }

      if (req.url?.includes('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          data: [{ id: 'mock-model', object: 'model', owned_by: 'e2e-test' }],
        }))
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    })
  }

  return {
    port,
    start: () => {
      createServer()
      return new Promise<void>((resolve, reject) => {
        server.on('error', reject)
        server.listen(port, () => resolve())
      })
    },
    stop: () => new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve())
      } else {
        resolve()
      }
    }),
    url: `http://localhost:${port}/v1`,
    setResponse(content: string) { customResponse = content },
    clearResponse() { customResponse = null },
  }
}

const mockProvider = createCustomMockProvider()
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
  await input.pressSequentially(text, { delay: 20 })
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
}

test.describe('Edge Cases', () => {
  test('handles large message content', async ({ page }) => {
    await setupSession(page)

    // Generate a large text response (5000 characters)
    const largeText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100)
    mockProvider.setResponse(largeText)

    await sendChatMessage(page, 'Send large text')

    // Wait for assistant message
    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })

    // Wait for streaming to complete (longer timeout for large text)
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 30_000 })

    // Verify message contains the large text
    const messageText = await assistantMessage.textContent()
    expect(messageText).toBeTruthy()
    expect(messageText!.length).toBeGreaterThan(4000)

    // Verify the message container is scrollable or properly rendered
    const messageContainer = page.locator('.messages-container, .message-list')
    await expect(messageContainer).toBeVisible()

    // Verify we can scroll within the messages area
    const boundingBox = await messageContainer.boundingBox()
    expect(boundingBox).toBeTruthy()
    expect(boundingBox!.height).toBeGreaterThan(0)

    mockProvider.clearResponse()
  })

  test('handles special characters and emoji', async ({ page }) => {
    await setupSession(page)

    // Test various special characters and emoji
    const specialContent = `
Special characters: @#$%^&*()_+-=[]{}|;:'",.<>?/~\`
Emoji: 😀 😃 😄 😁 🎉 🎊 ❤️ 💯 🚀 ⭐
Unicode: 你好 こんにちは 안녕하세요 مرحبا
Math symbols: ∑ ∫ √ π ∞ ≈ ≠ ≤ ≥
Arrows: → ← ↑ ↓ ⇒ ⇐ ⇑ ⇓
Combining: café, naïve, Zürich
`
    mockProvider.setResponse(specialContent)

    await sendChatMessage(page, 'Test special characters')

    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Verify all special content is displayed
    await expect(assistantMessage).toContainText('😀')
    await expect(assistantMessage).toContainText('🚀')
    await expect(assistantMessage).toContainText('你好')
    await expect(assistantMessage).toContainText('→')
    await expect(assistantMessage).toContainText('café')

    mockProvider.clearResponse()
  })

  test('handles rapid session switching', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await dismissUpdateNotification(page)

    // Create a few sessions with adequate wait time between each
    const newSessionsToCreate = 3
    for (let i = 0; i < newSessionsToCreate; i++) {
      await page.locator('.new-chat-item').click()
      // Wait for active session to change
      await page.waitForTimeout(500)
    }

    // Get all sessions
    const sessions = page.locator('.session-item')
    await page.waitForTimeout(500)
    const totalSessions = await sessions.count()
    
    // Verify we have multiple sessions (at least 2)
    expect(totalSessions).toBeGreaterThanOrEqual(2)

    // Rapidly switch between all available sessions
    for (let i = 0; i < totalSessions; i++) {
      await sessions.nth(i).click()
      await page.waitForTimeout(100)
      
      // Verify the correct session is active
      const activeSession = page.locator('.session-item.active')
      await expect(activeSession).toBeVisible({ timeout: 2_000 })
    }

    // Switch back and forth rapidly
    for (let i = 0; i < 3; i++) {
      await sessions.nth(0).click()
      await page.waitForTimeout(50)
      await sessions.nth(totalSessions - 1).click()
      await page.waitForTimeout(50)
    }

    // Verify app is still responsive after rapid switching
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })

    // Send a message to verify functionality
    mockProvider.setResponse('Session switch test passed')
    await sendChatMessage(page, 'Test after rapid switching')

    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(assistantMessage).toContainText('Session switch test passed', { timeout: 10_000 })

    mockProvider.clearResponse()
  })

  test('handles code blocks with syntax highlighting', async ({ page }) => {
    await setupSession(page)

    const codeContent = `
Here's a TypeScript example:

\`\`\`typescript
interface User {
  id: number
  name: string
  email: string
}

function greetUser(user: User): string {
  return \`Hello, \${user.name}!\`
}

const user: User = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
}

console.log(greetUser(user))
\`\`\`

And a Python example:

\`\`\`python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(factorial(5))  # Output: 120
\`\`\`
`
    mockProvider.setResponse(codeContent)

    await sendChatMessage(page, 'Show code examples')

    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Verify code blocks are rendered
    // Different markdown renderers may use different class names
    const codeBlocks = assistantMessage.locator('pre, code, .code-block, [class*="code"]')
    const codeBlockCount = await codeBlocks.count()
    expect(codeBlockCount).toBeGreaterThan(0)

    // Verify content includes code snippets
    await expect(assistantMessage).toContainText('interface User')
    await expect(assistantMessage).toContainText('def factorial')
    await expect(assistantMessage).toContainText('TypeScript')
    await expect(assistantMessage).toContainText('Python')

    mockProvider.clearResponse()
  })

  test('handles markdown formatting', async ({ page }) => {
    await setupSession(page)

    const markdownContent = `
# Heading 1
## Heading 2
### Heading 3

**Bold text** and *italic text* and ***bold italic***.

- Unordered list item 1
- Unordered list item 2
  - Nested item 2.1
  - Nested item 2.2
- Unordered list item 3

1. Ordered list item 1
2. Ordered list item 2
3. Ordered list item 3

[Link to example](https://example.com)

> This is a blockquote
> with multiple lines

Inline code: \`console.log('hello')\`

---

Table:

| Name  | Age | City     |
|-------|-----|----------|
| Alice | 30  | New York |
| Bob   | 25  | London   |
| Carol | 28  | Tokyo    |

~~Strikethrough text~~
`
    mockProvider.setResponse(markdownContent)

    await sendChatMessage(page, 'Show markdown examples')

    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })

    // Verify various markdown elements are rendered
    await expect(assistantMessage).toContainText('Heading 1')
    await expect(assistantMessage).toContainText('Bold text')
    await expect(assistantMessage).toContainText('italic text')
    await expect(assistantMessage).toContainText('Unordered list item 1')
    await expect(assistantMessage).toContainText('Ordered list item 1')
    await expect(assistantMessage).toContainText('Link to example')
    await expect(assistantMessage).toContainText('blockquote')
    await expect(assistantMessage).toContainText('Alice')
    await expect(assistantMessage).toContainText('Strikethrough')

    // Check for rendered HTML elements (depends on markdown renderer)
    const hasHeading = await assistantMessage.locator('h1, h2, h3, [class*="heading"]').count()
    expect(hasHeading).toBeGreaterThan(0)

    const hasList = await assistantMessage.locator('ul, ol, li, [class*="list"]').count()
    expect(hasList).toBeGreaterThan(0)

    mockProvider.clearResponse()
  })

  test('handles empty and whitespace-only messages gracefully', async ({ page }) => {
    await setupSession(page)

    // Try to send empty message (should be prevented)
    const input = page.locator('textarea.composer-input')
    await input.click()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Verify no message was sent
    const userMessages = page.locator('.message.user')
    const initialCount = await userMessages.count()

    // Try to send whitespace-only message
    await input.click()
    await input.pressSequentially('   ', { delay: 20 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Verify no additional message was sent
    const newCount = await userMessages.count()
    expect(newCount).toBe(initialCount)
  })

  test('handles very long single line without breaking layout', async ({ page }) => {
    await setupSession(page)

    // Create a very long line without spaces
    const longLine = 'A'.repeat(1000) + 'B'.repeat(1000) + 'C'.repeat(1000)
    mockProvider.setResponse(longLine)

    await sendChatMessage(page, 'Send long line')

    const assistantMessage = page.locator('.message.assistant').first()
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 15_000 })

    // Verify message is visible and rendered
    const messageText = await assistantMessage.textContent()
    expect(messageText).toBeTruthy()
    expect(messageText!.length).toBeGreaterThan(2000)

    // Verify the message doesn't break the layout
    // The message container should have a reasonable width
    const messageBox = await assistantMessage.boundingBox()
    expect(messageBox).toBeTruthy()
    
    // Message width should be constrained (not extend infinitely)
    const pageWidth = page.viewportSize()?.width ?? 1200
    expect(messageBox!.width).toBeLessThan(pageWidth)

    mockProvider.clearResponse()
  })
})
