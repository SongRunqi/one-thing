type OrtRuntime = {
  env: {
    logLevel?: string
    wasm: {
      numThreads?: number
      wasmPaths?: string | { wasm?: string | URL; mjs?: string | URL }
    }
  }
}

export const VAD_ASSET_BASE_PATH = import.meta.env.DEV ? '/voice/vad/' : './voice/vad/'
export const VAD_WASM_FILE = 'ort-wasm-simd-threaded.wasm'

export function voiceAssetUrl(fileName: string, baseHref = globalThis.window?.location?.href) {
  if (!baseHref) {
    return `${VAD_ASSET_BASE_PATH}${fileName}`
  }
  return new URL(`${VAD_ASSET_BASE_PATH}${fileName}`, baseHref).href
}

export function configureSileroOrt(ort: OrtRuntime) {
  ort.env.logLevel = 'error'
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = {
    wasm: voiceAssetUrl(VAD_WASM_FILE),
  }
}
