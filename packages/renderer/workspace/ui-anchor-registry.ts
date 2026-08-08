/**
 * 插件锚点块注册表(R5.x-a)—— renderer 侧的单一事实源。
 *
 * 与 panel-registry 同规:静态存在感来自 manifest 的 `contributes.uiSlots`,
 * 这份清单可以在**不执行一行插件代码**的前提下装满;启用但加载失败的插件
 * 块位保留(能把失败说出来);停用的插件不进清单。
 *
 * 锚点清单本身(`UI_ANCHORS`)在 core —— renderer 不能吃 core,所以这里
 * 只存数据;容量语义(maxBlocks/maxHeight)在挂点组件(R5.x-c)侧镜像,
 * 形状漂移由测试钉住。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'

export interface PluginContributedUiSlot {
  pluginId: string
  pluginName: string
  /** 锚点 id(如 `composer.above`)。 */
  anchor: string
  /** manifest 里声明的块 id。 */
  slotId: string
  label: string
  /** 插件是否真的活着;停用的插件不进清单。 */
  loaded: boolean
  /** 锚点不在宿主清单里(前向兼容)—— 不渲染,只供设置页呈现。 */
  unsupported: boolean
}

const pluginUiSlots: Ref<PluginContributedUiSlot[]> = ref([])

/**
 * 全局规范顺序:**跨插件按 pluginId 字典序,插件内保持 manifest 声明顺序**
 * (排序是稳定排序,声明顺序自然保留)。
 *
 * 锚点块的排列、超容量截断、以及二期主题覆盖冲突的"后者胜"都引用这同一
 * 份顺序 —— 它必须有唯一出处,否则三个地方会排出三种结果(目录发现序在
 * 不同机器上不稳定,不能当 UI 语义用)。
 */
export function setPluginUiSlots(slots: PluginContributedUiSlot[]): void {
  pluginUiSlots.value = [...slots].sort((a, b) => a.pluginId.localeCompare(b.pluginId))
}

export function usePluginUiSlots(): Ref<PluginContributedUiSlot[]> {
  return pluginUiSlots
}

/**
 * 某个锚点上**可渲染**的块清单(未知锚点的块不进 —— 它连挂点都不存在,
 * 渲染出来就是一块永远错误的占位)。
 */
export function useAnchorUiSlots(anchor: string): ComputedRef<PluginContributedUiSlot[]> {
  return computed(() =>
    pluginUiSlots.value.filter(slot => slot.anchor === anchor && !slot.unsupported),
  )
}

/** 块在请求通道与通知轨上的地址:`ui:<anchor>:<id>`(与 core 的 uiSlotSurfaceId 一致)。 */
export function uiSlotSurface(anchor: string, slotId: string): string {
  return `ui:${anchor}:${slotId}`
}
