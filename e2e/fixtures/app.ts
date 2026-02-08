import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'

type AppFixtures = {
  app: ElectronApplication
  page: Page
}

export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-e2e-'))

    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_USER_DATA: tmpDir,
      },
    })

    await use(app)

    await app.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export { expect } from '@playwright/test'
