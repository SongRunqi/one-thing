import { CorePluginStore } from '@onething/core/plugins'
import { getPluginDataDir } from '../stores/paths.js'

export class PluginStore extends CorePluginStore {
  constructor(pluginId: string) {
    super(pluginId, { dataDir: getPluginDataDir() })
  }
}
