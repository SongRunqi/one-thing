import { describe, expect, it } from 'vitest'
import { OnethingThemeRuntime } from '../theme-runtime.js'

describe('OnethingThemeRuntime', () => {
  it('wraps theme list, lookup, and application responses', async () => {
    const runtime = new OnethingThemeRuntime()

    await expect(runtime.listThemes()).resolves.toMatchObject({
      success: true,
      themes: expect.arrayContaining([
        expect.objectContaining({ id: 'flexoki', source: 'builtin' }),
      ]),
    })

    await expect(runtime.getTheme('missing-theme')).resolves.toEqual({
      success: false,
      error: 'Theme not found: missing-theme',
    })

    const applied = await runtime.applyTheme('flexoki', 'dark')
    expect(applied.success).toBe(true)
    expect(applied.cssVariables).toEqual(expect.objectContaining({
      '--bg-app': expect.any(String),
    }))
  })

  it('opens the themes folder through a host adapter', async () => {
    const runtime = new OnethingThemeRuntime()
    const openedPaths: string[] = []

    await expect(runtime.openThemesFolder(async themesPath => {
      openedPaths.push(themesPath)
      return ''
    })).resolves.toEqual({ success: true })

    expect(openedPaths[0]).toContain('.onething')
    expect(openedPaths[0]).toContain('themes')
  })

  it('normalizes themes folder open failures', async () => {
    const runtime = new OnethingThemeRuntime()

    await expect(runtime.openThemesFolder(() => 'Native open failed')).resolves.toEqual({
      success: false,
      error: 'Native open failed',
    })

    await expect(runtime.openThemesFolder(() => {
      throw new Error('Adapter crashed')
    })).resolves.toEqual({
      success: false,
      error: 'Adapter crashed',
    })
  })
})
