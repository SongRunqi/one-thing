/**
 * webview 静态根的解析(C 期,装配层)。
 *
 * 自定义协议 `onething-plugin://<pluginId>/<path>` 的**唯一供给线**:宿主
 * (apps/electron)把这个函数注入协议 handler,handler 自己不认识插件系统。
 *
 * **静态根是代码区,不是家目录**(rollout §6.2 第 1 条的勘误):
 * `plugins/<id>/` 是数据区(config.json / kv.json / storage/),随包分发的静态
 * 资产住插件的 `dirPath` —— npm 形态即 `plugins/node_modules/<pkg>/`,内置插件
 * 即它在构建产物里的目录。根 = `dirPath` + `contributes.webviewRoot`(缺省
 * `webview`)。
 */
import path from 'path'
import {
  describePluginBackgroundProblem,
  describePluginWebviewPanelProblem,
  isPluginWebviewPanel,
  resolvePluginWebviewRoot,
} from '@onething/core/plugins'
import { getPluginManager } from './manager.js'

export interface PluginWebviewStaticRoot {
  pluginId: string
  /** 绝对路径。协议 handler 在它下面做 join + realpath 复核。 */
  root: string
}

/**
 * 一个插件的 webview 静态根。null = 这个 id 不该被服务。
 *
 * 四道闸,任一不过都是 null(协议 handler 一律回 404 —— **不区分原因**:
 * "插件不存在"与"插件停用了"对一个可能不怀好意的调用方是同一句话):
 *  1. 插件系统已装配(未装配 = 桌面还没起插件,或者根本没有插件系统);
 *  2. 该 id 存在于清单;
 *  3. **enabled**(停用即刻停服 —— 这是拆除快照的判据之一);
 *  4. 至少有一条**合法的**静态资产声明 —— webview 面板(C 期)**或**背景图
 *     (G 期,L2.5)。两者服务的是同一个根、同一批闸,区别只在"谁要用它":
 *     背景图插件可以一个面板都没有(ink-brand 就是),把闸门写死在面板上
 *     会让它的图 404,而"没有静态资源面"这句话对它并不成立。
 */
export function resolvePluginWebviewStaticRoot(pluginId: string): PluginWebviewStaticRoot | null {
  if (!pluginId) return null
  const manager = getPluginManager()
  if (!manager) return null
  const plugin = manager.getPlugins().find(item => item.definition.id === pluginId)
  if (!plugin || !plugin.definition.enabled) return null
  const contributes = plugin.definition.manifest.contributes
  const hasWebviewPanel = (contributes?.panels ?? []).some(panel =>
    isPluginWebviewPanel(panel) && !describePluginWebviewPanelProblem(panel, contributes?.webviewRoot))
  // 背景图同样要**合法**才开根:一条被丢弃的背景声明画不出层,也就没有理由
  // 把这个插件的包目录端上一个 origin。
  const hasBackground = contributes?.theme?.background !== undefined
    && !describePluginBackgroundProblem(contributes.theme?.background)
  if (!hasWebviewPanel && !hasBackground) return null
  const dirPath = plugin.definition.dirPath
  if (!dirPath) return null
  return {
    pluginId,
    root: path.resolve(dirPath, resolvePluginWebviewRoot(contributes?.webviewRoot)),
  }
}
