import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Dismiss update notification if present
 */
export async function dismissUpdateNotification(page: Page) {
  const dismissBtn = page.locator('button', { hasText: '忽略此版本' })
  if (await dismissBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await dismissBtn.click()
    await dismissBtn.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {})
  }
}

/**
 * Setup a new chat session - wait for sidebar, dismiss notifications, create new chat
 */
export async function setupSession(page: Page) {
  await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
  await dismissUpdateNotification(page)
  await page.locator('.new-chat-item').click()
  await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 5_000 })
}

/**
 * Send a chat message and wait briefly for it to be processed
 */
export async function sendChatMessage(page: Page, text: string) {
  const input = page.locator('textarea.composer-input')
  await input.click()
  await input.pressSequentially(text, { delay: 20 })
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
}

/**
 * Wait for the assistant message to appear and complete streaming
 */
export async function waitForAssistantReply(page: Page, nth: number = 0) {
  const assistantMessage = page.locator('.message.assistant').nth(nth)
  await expect(assistantMessage).toBeVisible({ timeout: 15_000 })
  // Wait for send button to return to normal state (not in "stop" mode)
  await expect(page.locator('.send-btn:not(.stop-btn)')).toBeVisible({ timeout: 10_000 })
  return assistantMessage
}

/**
 * Open settings modal
 */
export async function openSettings(page: Page) {
  // Click settings button in sidebar
  await page.locator('[data-test="settings-btn"], .settings-btn, button[aria-label*="设置"]').first().click()
  await expect(page.locator('.settings-modal, [data-test="settings-modal"]')).toBeVisible({ timeout: 5_000 })
}

/**
 * Configure OpenAI-compatible provider in settings
 */
export async function configureProvider(page: Page, providerUrl: string) {
  // Navigate to AI settings
  const aiTab = page.locator('button, a', { hasText: /AI|Provider/ }).first()
  if (await aiTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await aiTab.click()
  }

  // Fill in provider details (adapt selectors based on actual UI)
  const baseUrlInput = page.locator('input[name="baseUrl"], input[placeholder*="URL"], input[label*="URL"]').first()
  await baseUrlInput.fill(providerUrl)

  const apiKeyInput = page.locator('input[name="apiKey"], input[type="password"], input[placeholder*="API"]').first()
  await apiKeyInput.fill('test-key')

  // Save settings
  const saveBtn = page.locator('button', { hasText: /保存|Save|确定|OK/ }).first()
  await saveBtn.click()
  
  // Wait for settings to close or success indicator
  await page.waitForTimeout(1000)
}
