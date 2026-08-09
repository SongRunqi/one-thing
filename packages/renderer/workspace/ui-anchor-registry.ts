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

/**
 * 锚点容量语义的 renderer 镜像。
 *
 * 事实源在 core 的 `UI_ANCHOR_CAPACITY`(packages/core/plugins/ui-anchor.ts)——
 * renderer 不能吃 core,所以这里镜像一份;两份的一致性由
 * `__tests__/ui-anchor-registry.test.ts` 直接读 core 源文件比对钉住,
 * 与 plugin-panel-types.ts 的镜像先例同规。
 *
 * `kind` 是 D 期加的形态轴(§9.1):`block` = 常显块,`trigger` = 触发式
 * (宿主画入口,点击才拉树进弹层)。挂点组件据此选壳,插件永远不声明它。
 */
export const UI_ANCHOR_CAPACITY_MIRROR: Record<string, UiAnchorCapacityMirror> = {
  'composer.above': { kind: 'block', maxBlocks: 3, maxHeight: 32 },
  'chat.status-bar': { kind: 'block', maxBlocks: 8, maxHeight: 24 },
  'message.footer': { kind: 'block', maxBlocks: 6, maxHeight: 24 },
  // D 期两个触发式锚点:入口由宿主画(菜单项 / 图标钮),maxHeight 说的是
  // **弹层内容**的最大高度 —— 入口是宿主原语,本身没有高度可言。
  'message.actions': { kind: 'trigger', maxBlocks: 3, maxHeight: 320 },
  'composer.actions': { kind: 'trigger', maxBlocks: 3, maxHeight: 320 },
}

export interface UiAnchorCapacityMirror {
  /** 常显块 / 触发式(core UiAnchorKind 的镜像)。 */
  kind: 'block' | 'trigger'
  maxBlocks: number
  maxHeight: number
}

export interface AnchorOverflowInfo {
  /** 因容量截断而未渲染的块。 */
  truncated: PluginContributedUiSlot[]
  /** 加载失败的块(不占容量,折叠呈现)。 */
  failed: PluginContributedUiSlot[]
}

/**
 * 某个锚点的容量裁决:
 *  - **加载失败的块不计入 maxBlocks**(否则 3 个坏插件能永久占满整条锚点带);
 *  - 健康的块按注册表顺序(全局规范顺序)取前 maxBlocks 个,其余进 truncated。
 */
export function computeAnchorOverflow(anchor: string): AnchorOverflowInfo {
  const slots = pluginUiSlots.value.filter(slot => slot.anchor === anchor && !slot.unsupported)
  const failed = slots.filter(slot => !slot.loaded)
  const healthy = slots.filter(slot => slot.loaded)
  const capacity = UI_ANCHOR_CAPACITY_MIRROR[anchor]
  const truncated = capacity ? healthy.slice(capacity.maxBlocks) : []
  return { truncated, failed }
}

/** 某个锚点上**实际要渲染**的块(健康 & 未截断)。 */
export function useVisibleAnchorUiSlots(anchor: string): ComputedRef<PluginContributedUiSlot[]> {
  return computed(() => {
    const capacity = UI_ANCHOR_CAPACITY_MIRROR[anchor]
    const healthy = useAnchorUiSlots(anchor).value.filter(slot => slot.loaded)
    return capacity ? healthy.slice(0, capacity.maxBlocks) : healthy
  })
}

/**
 * 某个块是否因容量被截断(设置页"锚点已满"的依据)。
 * 截断集合来自 computeAnchorOverflow —— 同一份裁决:UiSlotHost 不画它,
 * 设置页解释它。
 */
export function isUiSlotTruncated(pluginId: string, anchor: string, slotId: string): boolean {
  return computeAnchorOverflow(anchor).truncated
    .some(slot => slot.pluginId === pluginId && slot.slotId === slotId)
}
