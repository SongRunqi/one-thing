import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('electron', () => ({
  protocol: { handle: mocks.handle },
  net: { fetch: mocks.fetch },
}))

describe('electron media protocol', () => {
  it('registers media scheme and resolves files from the injected media dir', async () => {
    const { registerElectronMediaProtocol } = await import('../protocol.js')
    const response = new Response('ok')
    const fetch = vi.fn().mockResolvedValue(response)
    const handle = vi.fn()

    registerElectronMediaProtocol({
      getMediaImagesDir: () => '/tmp/onething media',
      handle: handle as any,
      fetch: fetch as any,
    })

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0][0]).toBe('media')

    await expect(handle.mock.calls[0][1]({
      url: 'media://folder%20one/image.png',
    })).resolves.toBe(response)
    expect(fetch.mock.calls[0][0]).toBe('file:///tmp/onething%20media/folder%20one/image.png')
  })

  it('defaults to Electron protocol and net adapters', async () => {
    const { registerElectronMediaProtocol } = await import('../protocol.js')

    registerElectronMediaProtocol({
      getMediaImagesDir: () => '/tmp/media',
    })

    expect(mocks.handle).toHaveBeenCalledWith('media', expect.any(Function))
  })
})
