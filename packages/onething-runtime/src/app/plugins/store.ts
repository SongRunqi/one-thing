import fs from 'fs'
import path from 'path'
import {
  CorePluginStore,
  createCorePluginStorage,
  type CorePluginStorage,
} from '@onething/core/plugins'
import { getPluginDataDir } from '../stores/paths.js'
import { getPluginsDir } from './loader.js'

/**
 * 家目录根(P1):npm 形态与内置插件 = `plugins/`(数据住 `plugins/<id>/`);
 * legacy 代码目录(`plugins/<id>/plugin.json` 在场)= **不给根**,数据留
 * plugin-data,直到重装为 npm 形态(§5.4 的判别顺序,与配置同一把尺)。
 */
function pluginHomeRoot(pluginId: string): string | undefined {
  const pluginsDir = getPluginsDir()
  return fs.existsSync(path.join(pluginsDir, pluginId, 'plugin.json')) ? undefined : pluginsDir
}

export class PluginStore extends CorePluginStore {
  constructor(pluginId: string, options: { isDisposing?(): boolean } = {}) {
    super(pluginId, {
      dataDir: getPluginDataDir(),
      homeRoot: pluginHomeRoot(pluginId),
      isDisposing: options.isDisposing,
    })
  }
}

/** api.storage 的宿主实现 —— 与 KV 同一个判别(legacy 留旧根,其余住家目录)。 */
export function createPluginStorage(
  pluginId: string,
  options: { isDisposed?: () => boolean } = {},
): CorePluginStorage {
  return createCorePluginStorage({
    pluginId,
    dataRoot: getPluginDataDir(),
    homeRoot: pluginHomeRoot(pluginId),
    isDisposed: options.isDisposed,
  })
}
