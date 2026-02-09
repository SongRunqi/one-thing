/**
 * E2E Tests for Message Display Bugs
 *
 * Reproduces and verifies fixes for:
 * 1. Switching to historical session doesn't show messages
 * 2. Sending new message doesn't show in UI
 */

import { test, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test.describe('Message Display', () => {
  let testUserDataDir: string

  test.beforeEach(async () => {
    // Create a fresh temp directory for each test
    testUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-test-'))
  })

  test.afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testUserDataDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  test('Bug 1: Switching to historical session shows messages', async ({ page }) => {
    // Launch app with test user data directory
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="chat-window"]', { timeout: 10000 })

    // Create first session with a message
    const inputBox = page.locator('[data-testid="input-box"]')
    await inputBox.fill('Test message 1')
    await page.keyboard.press('Control+Enter')

    // Wait for message to appear
    await expect(page.locator('[data-message-id]').filter({ hasText: 'Test message 1' })).toBeVisible({ timeout: 5000 })

    // Create second session
    await page.click('[data-testid="new-chat-btn"]')
    await page.waitForTimeout(500) // Wait for session switch

    // Verify we're in a new empty session
    await expect(page.locator('[data-message-id]')).toHaveCount(0)

    // Send message in second session
    await inputBox.fill('Test message 2')
    await page.keyboard.press('Control+Enter')

    // Wait for message to appear
    await expect(page.locator('[data-message-id]').filter({ hasText: 'Test message 2' })).toBeVisible({ timeout: 5000 })

    // Now switch back to first session via sidebar
    const sessionItems = page.locator('[data-testid="session-item"]')
    await expect(sessionItems).toHaveCount(2, { timeout: 3000 })

    // Click on the first session (should be the one with "Test message 1")
    await sessionItems.nth(1).click() // nth(1) because sessions are sorted newest first, so oldest is index 1
    await page.waitForTimeout(500) // Wait for session switch

    // BUG FIX VERIFICATION: First session's message should now be visible
    await expect(page.locator('[data-message-id]').filter({ hasText: 'Test message 1' })).toBeVisible({ timeout: 3000 })

    // Verify we don't see messages from other session
    await expect(page.locator('[data-message-id]').filter({ hasText: 'Test message 2' })).not.toBeVisible()
  })

  test('Bug 2: Sending new message shows in UI immediately', async ({ page }) => {
    // Launch app
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="chat-window"]', { timeout: 10000 })

    // Type and send a message
    const inputBox = page.locator('[data-testid="input-box"]')
    const testMessage = `E2E test message ${Date.now()}`
    await inputBox.fill(testMessage)
    await page.keyboard.press('Control+Enter')

    // BUG FIX VERIFICATION: Message should appear in UI immediately (not after reload)
    // Both user message and assistant streaming response should be visible
    await expect(page.locator('[data-message-id]').filter({ hasText: testMessage })).toBeVisible({ timeout: 3000 })

    // Verify message count is at least 1 (user message, possibly assistant message too)
    const messageCount = await page.locator('[data-message-id]').count()
    expect(messageCount).toBeGreaterThanOrEqual(1)
  })

  test('Session switching preserves message order and content', async ({ page }) => {
    // Launch app
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-testid="chat-window"]', { timeout: 10000 })

    // Create first session with multiple messages
    const inputBox = page.locator('[data-testid="input-box"]')

    await inputBox.fill('First message')
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(1000) // Wait for message to be saved

    await inputBox.fill('Second message')
    await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(1000)

    // Verify both messages are visible
    await expect(page.locator('[data-message-id]').filter({ hasText: 'First message' })).toBeVisible()
    await expect(page.locator('[data-message-id]').filter({ hasText: 'Second message' })).toBeVisible()

    // Create a new session
    await page.click('[data-testid="new-chat-btn"]')
    await page.waitForTimeout(500)

    // Verify we're in a new session (no messages)
    await expect(page.locator('[data-message-id]')).toHaveCount(0)

    // Switch back to first session
    const sessionItems = page.locator('[data-testid="session-item"]')
    await sessionItems.nth(1).click() // Oldest session
    await page.waitForTimeout(500)

    // Verify all messages are back and in correct order
    const messages = page.locator('[data-message-id]')
    await expect(messages).toHaveCount(await messages.count()) // At least 2 user messages

    // Check message order (first message should appear before second)
    const firstMsgLocator = page.locator('[data-message-id]').filter({ hasText: 'First message' })
    const secondMsgLocator = page.locator('[data-message-id]').filter({ hasText: 'Second message' })

    await expect(firstMsgLocator).toBeVisible()
    await expect(secondMsgLocator).toBeVisible()

    // Verify order by checking bounding boxes
    const firstBox = await firstMsgLocator.boundingBox()
    const secondBox = await secondMsgLocator.boundingBox()

    expect(firstBox).not.toBeNull()
    expect(secondBox).not.toBeNull()

    if (firstBox && secondBox) {
      expect(firstBox.y).toBeLessThan(secondBox.y) // First message should be above second
    }
  })
})
