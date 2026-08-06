/**
 * 配置读写的 IPC 适配面 —— 把 config.ts 的三件事收成一个对象给宿主转发面用。
 *
 * 单独一个文件是为了让 @main 只 import 一个工厂,而不必认识 describe/get/set
 * 三个自由函数以及它们的顺序约定(@main 只做薄接线)。
 */
import {
  describePluginConfig,
  getEffectivePluginConfig,
  setPluginConfig,
} from './config.js'

export interface PluginConfigAccess {
  describe(pluginId: string): {
    declared: boolean
    supported: boolean
    title?: string
    fields: Array<{
      key: string
      control: 'switch' | 'text' | 'number' | 'select' | 'string-list'
      label: string
      hint?: string
      required: boolean
      options?: string[]
      minimum?: number
      maximum?: number
      integer?: boolean
      defaultValue: unknown
    }>
    unsupportedReasons: string[]
  }
  read(pluginId: string): Record<string, unknown>
  write(pluginId: string, config: unknown): {
    success: boolean
    config?: Record<string, unknown>
    errors?: string[]
  }
}

export function createPluginConfigAccess(): PluginConfigAccess {
  return {
    describe(pluginId) {
      const described = describePluginConfig(pluginId)
      if (!described) {
        return { declared: false, supported: false, fields: [], unsupportedReasons: [] }
      }
      if (!described.supported) {
        return { declared: true, supported: false, fields: [], unsupportedReasons: described.reasons }
      }
      return {
        declared: true,
        supported: true,
        title: described.title,
        fields: described.fields,
        unsupportedReasons: [],
      }
    },
    read: getEffectivePluginConfig,
    write: (pluginId, config) => setPluginConfig(pluginId, config),
  }
}
