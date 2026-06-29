import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'

type ProtocolHandle = typeof protocol.handle
type ElectronFetch = typeof net.fetch

export interface ElectronMediaProtocolOptions {
  getMediaImagesDir(): string
  scheme?: string
  handle?: ProtocolHandle
  fetch?: ElectronFetch
}

export function registerElectronMediaProtocol(options: ElectronMediaProtocolOptions): void {
  const scheme = options.scheme ?? 'media'
  const handle = options.handle ?? protocol.handle.bind(protocol)
  const fetch = options.fetch ?? net.fetch

  handle(scheme, (request) => {
    const prefix = `${scheme}://`
    const filename = decodeURIComponent(request.url.slice(prefix.length))
    const filePath = path.join(options.getMediaImagesDir(), filename)
    return fetch(pathToFileURL(filePath).toString())
  })
}
