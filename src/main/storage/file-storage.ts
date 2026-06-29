import { CoreFileStorageProvider } from '@onething/core/storage'
import { ensureStoreDirs } from '../stores/paths.js'

export class FileStorageProvider extends CoreFileStorageProvider {
  async initialize(): Promise<void> {
    ensureStoreDirs()
    await super.initialize()
  }
}
