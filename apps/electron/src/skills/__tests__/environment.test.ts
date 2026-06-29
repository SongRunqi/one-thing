import { describe, expect, it } from 'vitest'
import { resolveElectronAppIsPackaged } from '../environment.js'

describe('electron skills environment', () => {
  it('detects packaged Electron apps', () => {
    expect(resolveElectronAppIsPackaged({ app: { isPackaged: true } })).toBe(true)
    expect(resolveElectronAppIsPackaged({ app: { isPackaged: false } })).toBe(false)
  })

  it('treats missing Electron app metadata as unpackaged', () => {
    expect(resolveElectronAppIsPackaged(null)).toBe(false)
    expect(resolveElectronAppIsPackaged({})).toBe(false)
    expect(resolveElectronAppIsPackaged({ app: {} })).toBe(false)
  })
})
