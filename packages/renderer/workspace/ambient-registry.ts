/**
 * 插件氛围层注册表(G2 —— 全窗动画覆盖)—— renderer 侧的单一事实源。
 *
 * 与 background-registry 逐字同构,**只有一格**:氛围是全窗唯一的一层,谁压谁的
 * 裁决已经在主进程的清单投影里做完了(它要看全体插件,renderer 只拿得到自己那
 * 一份的话根本判不出来)。这里收的是**结论**,不是材料 —— renderer 不认识
 * `contributes.ambient`,也不认识 canonical order。
 *
 * 数据来源与面板/锚点块/背景是**同一次拉取**(`getPlugins()` 的响应里多了一个
 * `ambient` 字段),同一条 `onething:plugins-changed` 触发重拉,于是启用/停用/
 * 卸载全都走一条既有路径。
 *
 * **用户主权不在这里。** 总闸(`settings.plugins.ambientEnabled`)与每插件静音
 * (`ambientMutedPluginIds`)是响应式的 app settings,由 App.vue 在渲染那一刻
 * 叠加 —— 关总闸要**当场**撤层,不必等一次清单重拉。所以这个注册表只管"当前
 * 该出现哪一层氛围",画不画由消费方按 preference 决定。
 */
import { ref, type Ref } from 'vue'

/** 与主进程 `PluginAmbientDescriptor` 同形(过线只走 JSON)。 */
export interface PluginAmbientLayer {
  pluginId: string
  /** `onething-plugin://<id>/<entry>` —— 已启用插件的包内静态 HTML 入口。 */
  entryUrl: string
}

const pluginAmbient: Ref<PluginAmbientLayer | null> = ref(null)

/**
 * 装上/换掉/撤掉氛围层。
 *
 * `null` 就是**拆除**:停用、卸载、或者赢家自己被更后者顶掉之后,下一次投影
 * 里就没有 active 的声明了,这里随之归零 —— 不需要任何"撤除"动作。
 */
export function setPluginAmbient(layer: PluginAmbientLayer | null): void {
  pluginAmbient.value = layer
}

export function usePluginAmbient(): Ref<PluginAmbientLayer | null> {
  return pluginAmbient
}
