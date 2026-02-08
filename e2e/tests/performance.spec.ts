import { test, expect } from '../fixtures/app'

test.describe('Performance', () => {
  test('app starts within acceptable time', async ({ app, page }) => {
    const startTime = Date.now()
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 10_000 })
    const loadTime = Date.now() - startTime
    console.log(`[Perf] App visible in ${loadTime}ms`)
    // Generous limit for CI — actual goal is < 1.5s
    expect(loadTime).toBeLessThan(5000)
  })
})
