/**
 * 内置 memory 插件(id `memory-wiki`)的插座。
 *
 * 这一层薄得几乎不存在,而那正是结论:v1 的 memory 插件**没有任何宿主专属依赖**
 * —— 它只用 `api.storage.files`(受管文件树)、`api.registerTool`、
 * `api.registerPromptContextProvider` 与 `api.settings.onChange`,四样都在
 * 插件契约里。于是产品实现整个住在 `@onething/runtime/plugins`,这里只做接线。
 *
 * (对比 log-monitor 要 `getLogDir`、note-skills 要变量库与设置 —— 那两个才需要
 * 真正的插座。)
 */

import {
  ONETHING_MEMORY_MANIFEST,
  registerOnethingMemoryPlugin,
} from '@onething/runtime/plugins'
import type { PluginAPI } from '../types.js'

export const memoryManifest = ONETHING_MEMORY_MANIFEST

export default function memoryPlugin(api: PluginAPI): void {
  registerOnethingMemoryPlugin(api)
}
