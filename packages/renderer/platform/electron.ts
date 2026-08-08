// 叶子路径,不走桶:@onething/core/plugins 的 index 会把 loader(node:url 的
// pathToFileURL)整只拽进浏览器包,Vite externalize 之后运行即炸。
// request-channel.ts 零依赖、纯逻辑,是 renderer 可以吃的最小单元。
import { describeNonSerializable } from '@onething/core/plugins/request-channel'
import type { ElectronAPI } from '@/types'
import type { PlatformApi, PlatformCapabilities } from './types'

const electronCapabilities: PlatformCapabilities = {
  localFileSystem: true,
  workspaceFileSystem: true,
  nativeWindowControls: true,
  shellTools: true,
  terminal: true,
  embeddedBrowser: true,
  collabRooms: true,
  clipboardWrite: true,
  desktopWindows: true,
  globalMenuEvents: true,
}

export function createElectronPlatformApi(electronAPI: ElectronAPI): PlatformApi {
  const extras = {
    environment: 'electron' as const,
    capabilities: electronCapabilities,
    getCapabilities: async () => electronCapabilities,

    /**
     * 过线前先自检,失败时抛**我们自己的**错。
     *
     * R2 的 `assertPluginPayloadSerializable` 只在插件那一侧跑;渲染侧发出去之前
     * 什么也不查,于是一个不可克隆的 payload 得到的是 Electron 原生的
     * "An object could not be cloned" —— 没有 pluginId、没有 action、没有字段路径。
     * 插件作者拿着这句话无从下手(真机走查实证)。
     *
     * 这里**只查不修**:修在源头(渲染层把自己包的 Vue Proxy 拆掉,见
     * PluginPanelHost.toPlainPayload)。边界上静默修复会把"有人在往线上塞不可
     * 序列化的东西"这件事藏起来,而那正是 R2 要立的规矩。
     */
    pluginRequest: (request: Parameters<ElectronAPI['pluginRequest']>[0]) => {
      const problem = describeNonSerializable(request.payload, 'payload')
      if (problem) {
        return Promise.reject(new Error(
          `Plugin request "${request.pluginId}/${request.action}" carries a payload that cannot cross `
          + `the process boundary: ${problem}. Everything that crosses the line must be JSON-serializable.`,
        ))
      }
      return electronAPI.pluginRequest(request)
    },
  }
  // Forward per-access instead of snapshotting: tests (and the preload bridge
  // on reload) replace individual methods on window.electronAPI after this
  // wrapper is created, and those replacements must stay visible.
  return new Proxy(extras as PlatformApi, {
    get: (target, prop, receiver) =>
      prop in extras ? Reflect.get(target, prop, receiver) : Reflect.get(electronAPI, prop),
    has: (target, prop) => prop in extras || prop in electronAPI,
  })
}
