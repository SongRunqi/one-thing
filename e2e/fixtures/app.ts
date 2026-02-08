import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'

type AppFixtures = {
  app: ElectronApplication
  page: Page
}

/**
 * Pre-seed settings with mock provider configuration.
 * Settings file: <userData>/data/settings.json
 */
function seedMockProviderSettings(tmpDir: string, mockProviderUrl: string) {
  const dataDir = path.join(tmpDir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  const settings = {
    ai: {
      provider: 'openai',
      temperature: 0.7,
      providers: {
        openai: {
          apiKey: 'test-key',
          baseUrl: mockProviderUrl,
          model: 'mock-model',
          selectedModels: ['mock-model'],
          enabled: true,
        },
      },
    },
  }
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

/** Basic test fixture — clean app with no pre-configured providers */
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

/** Chat test fixture — app pre-configured with mock provider */
export function createChatTest(mockProviderUrl: string) {
  return base.extend<AppFixtures>({
    // eslint-disable-next-line no-empty-pattern
    app: async ({}, use) => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-e2e-'))
      seedMockProviderSettings(tmpDir, mockProviderUrl)

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
}

export { expect } from '@playwright/test'
