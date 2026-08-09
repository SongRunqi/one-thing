/**
 * 插件背景层注册表(G 期,L2.5)—— renderer 侧的单一事实源。
 *
 * 与 panel-registry / ui-anchor-registry 同规,但**只有一格**:背景是全局唯一的
 * 一块,谁压谁的裁决已经在主进程的清单投影里做完了(它要看全体插件,renderer
 * 只拿得到自己那一份的话根本判不出来)。这里收的是**结论**,不是材料 ——
 * renderer 不认识 `contributes.theme.background`,也不认识 canonical order。
 *
 * 数据来源与面板/锚点块是**同一次拉取**(`platformApi.getPlugins()` 的响应里
 * 多了一个 `background` 字段),同一条 `onething:plugins-changed` 触发重拉,
 * 于是启用/停用/卸载/`api.theme.updateBackground` 全都走一条既有路径。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'

/** 与主进程 `PluginBackgroundDescriptor` 同形(过线只走 JSON)。 */
export interface PluginBackgroundLayer {
  pluginId: string
  /** `onething-plugin://<id>/<path>` —— 已启用插件的包内静态资产。 */
  imageUrl: string
  /** 深色图;插件没声明 darkImage 时主进程已经回填成 imageUrl。 */
  darkImageUrl: string
  /** 0–1,已钳制。 */
  opacity: number
  /** 0–40(px),已钳制。0 = 不加 filter。 */
  blur: number
  fit: 'cover' | 'contain' | 'tile'
}

const pluginBackground: Ref<PluginBackgroundLayer | null> = ref(null)

/**
 * 装上/换掉/撤掉背景层。
 *
 * `null` 就是**拆除**:停用、卸载、或者赢家自己被更后者顶掉之后,下一次投影
 * 里就没有 active 的声明了,这里随之归零 —— 不需要任何"撤除"动作。
 */
export function setPluginBackground(layer: PluginBackgroundLayer | null): void {
  pluginBackground.value = layer
}

export function usePluginBackground(): Ref<PluginBackgroundLayer | null> {
  return pluginBackground
}

/** 背景层此刻是否该画。opacity 为 0 等于没有 —— 不必为它挂一个空层。 */
export function usePluginBackgroundActive(): ComputedRef<boolean> {
  return computed(() => Boolean(pluginBackground.value && pluginBackground.value.opacity > 0))
}
