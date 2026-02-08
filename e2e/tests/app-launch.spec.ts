import { test, expect } from '../fixtures/app'

test.describe('App Launch', () => {
  test('app launches and window is visible', async ({ app, page }) => {
    const isVisible = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win?.isVisible() ?? false
    })
    expect(isVisible).toBe(true)
    expect(page).toBeTruthy()
  })

  test('main UI elements are present', async ({ page }) => {
    // Sidebar
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Chat area (wrapper is always present)
    await expect(page.locator('.chat-container-wrapper').first()).toBeVisible({ timeout: 10_000 })

    // Create a session so the input box appears
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })

    // Input box
    await expect(page.locator('textarea.composer-input')).toBeVisible({ timeout: 10_000 })
  })

  test('window title is correct', async ({ page }) => {
    const title = await page.title()
    expect(title).toContain('AI Chat')
  })
})
