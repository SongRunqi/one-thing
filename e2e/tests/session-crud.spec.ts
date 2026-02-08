import { test, expect } from '../fixtures/app'

test.describe('Session CRUD', () => {
  test('create new session', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })
  })

  test('session appears in sidebar', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.sessions-list .session-item').first()).toBeVisible({ timeout: 5_000 })
  })

  test('switch between sessions', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create two sessions via IPC (with a message so they're not "empty")
    await page.evaluate(async () => {
      const api = (window as any).electronAPI
      const resA = await api.createSession('Session A')
      if (resA.session) {
        await api.addMessage?.(resA.session.id, { role: 'user', content: 'msg A' })
      }
      const resB = await api.createSession('Session B')
      if (resB.session) {
        await api.addMessage?.(resB.session.id, { role: 'user', content: 'msg B' })
      }
    })

    // Reload page to pick up IPC-created sessions
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const sessionItems = page.locator('.sessions-list .session-item:not(.new-chat-item)')
    await expect(sessionItems.first()).toBeVisible({ timeout: 5_000 })
    const count = await sessionItems.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // Click the first session
    await sessionItems.first().click()
    await expect(sessionItems.first()).toHaveClass(/active/, { timeout: 3_000 })

    // Click the second session
    await sessionItems.nth(1).click()
    await expect(sessionItems.nth(1)).toHaveClass(/active/, { timeout: 3_000 })
  })

  test('delete a session', async ({ page }) => {
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })

    // Create a session
    await page.locator('.new-chat-item').click()
    await expect(page.locator('.session-item.active')).toBeVisible({ timeout: 5_000 })

    const sessionItems = page.locator('.sessions-list .session-item:not(.new-chat-item)')
    const initialCount = await sessionItems.count()

    // Hover to reveal actions, then delete
    const activeSession = page.locator('.session-item.active')
    await activeSession.hover()
    const deleteBtn = activeSession.locator('button.action-btn.danger')
    await deleteBtn.click() // first click: pending
    await deleteBtn.click() // second click: confirm

    await page.waitForTimeout(500)
    const newCount = await sessionItems.count()
    expect(newCount).toBeLessThan(initialCount)
  })
})
