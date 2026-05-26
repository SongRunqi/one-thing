// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { configureSileroOrt, voiceAssetUrl } from '../vad-assets'

describe('voice VAD assets', () => {
  it('points public VAD assets at the renderer asset directory', () => {
    expect(voiceAssetUrl('silero_vad_v5.onnx', 'http://127.0.0.1:5173/#/voice-runtime')).toBe(
      'http://127.0.0.1:5173/voice/vad/silero_vad_v5.onnx',
    )
  })

  it('overrides only the ORT wasm file so Vite does not import public mjs files', () => {
    const ort: Parameters<typeof configureSileroOrt>[0] = {
      env: {
        wasm: {},
      },
    }

    configureSileroOrt(ort)

    expect(ort.env.logLevel).toBe('error')
    expect(ort.env.wasm.numThreads).toBe(1)
    const wasmPaths = ort.env.wasm.wasmPaths
    expect(wasmPaths).toEqual({
      wasm: expect.stringContaining('/voice/vad/ort-wasm-simd-threaded.wasm'),
    })
    expect(Object.keys(wasmPaths as Record<string, unknown>)).not.toContain('mjs')
  })
})
