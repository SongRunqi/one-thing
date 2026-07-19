import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MUSIC_PROVIDER_ID,
  builtinMusicProviders,
  getMusicProvider,
  listMusicProviderDescriptors,
  ncmMusicProvider,
} from '../providers/index.js'

describe('music provider registry', () => {
  it('unknown or absent ids fall back to ncm (matches the settings normalizer)', () => {
    expect(getMusicProvider('ncm-cli')).toBe(ncmMusicProvider)
    expect(getMusicProvider('spotify-cli')).toBe(ncmMusicProvider)
    expect(getMusicProvider(undefined)).toBe(ncmMusicProvider)
    expect(DEFAULT_MUSIC_PROVIDER_ID).toBe('ncm-cli')
  })

  it('descriptors are JSON-serializable (they cross IPC to drive the wizard)', () => {
    for (const descriptor of listMusicProviderDescriptors()) {
      const roundTripped = JSON.parse(JSON.stringify(descriptor)) as unknown
      expect(roundTripped).toEqual(descriptor)
    }
  })

  it('every provider carries a complete contract', () => {
    for (const provider of builtinMusicProviders) {
      expect(provider.descriptor.binary).toBeTruthy()
      expect(provider.bashPolicy.binary).toBe(provider.descriptor.binary)
      expect(provider.cli.build.state()).toBeInstanceOf(Array)
      expect(provider.cli.parse.envelope('')).toHaveProperty('ok')
      expect(provider.ids.validateSpinId('')).toBe(false)
      expect(['state', 'prefs-file']).toContain(provider.reliability.volumeSource)
    }
  })

  it('the ncm start command carries the measured legacy-play law', () => {
    const started = ncmMusicProvider.cli.build.start({
      encryptedId: 'D71F6E90EA704F1C44183933E7E0F197',
      originalId: '1',
      title: 'x',
    })
    expect(started.env?.NCM_LEGACY_PLAY).toBe('1')
    expect(started.args[0]).toBe('play')
  })
})
