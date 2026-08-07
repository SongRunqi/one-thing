import {
  CorePluginStore,
  createCorePluginStorage,
  type CorePluginStorage,
} from '@onething/core/plugins'
import { getPluginDataDir } from '../stores/paths.js'

export class PluginStore extends CorePluginStore {
  constructor(pluginId: string, options: { isDisposing?(): boolean } = {}) {
    super(pluginId, { dataDir: getPluginDataDir(), isDisposing: options.isDisposing })
  }
}

/** api.storage 的宿主实现 —— 与 KV 同一个数据根(R4:一个插件一个目录)。 */
export function createPluginStorage(pluginId: string): CorePluginStorage {
  return createCorePluginStorage({ pluginId, dataRoot: getPluginDataDir() })
}
