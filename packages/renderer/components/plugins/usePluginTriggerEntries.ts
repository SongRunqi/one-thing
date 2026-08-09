/**
 * 触发式锚点(kind: 'trigger')的挂点内核 —— D 期。
 *
 * 与常显块(UiSlotHost)共用**同一份**清单投影与容量裁决
 * (ui-anchor-registry:全局规范顺序、unsupported 过滤、maxBlocks 截断、
 * 失败块不占容量),差别只在时序:
 *
 *  - block:挂上即渲染,常驻;
 *  - trigger:平时只有宿主画的入口(菜单项 / 图标钮),**点击才拉树**,
 *    关弹层即销毁(无常驻实例)。
 *
 * 协议零新增:入口按下后走的仍是 `ui:render:<anchor>:<id>` /
 * `ui:action:<anchor>:<id>`,降级仍折叠为 `ui:<anchor>:<id>` —— 这里不认识
 * 任何新通道,只管"哪些入口、开着哪个、哪个已暂停"。
 *
 * 设计文档:docs/design/plugin-ui/plugin-ui-anchors-2026-08.md §9.3。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import {
  UI_ANCHOR_CAPACITY_MIRROR,
  computeAnchorOverflow,
  useVisibleAnchorUiSlots,
  type PluginContributedUiSlot,
} from '@/workspace/ui-anchor-registry'

export interface PluginTriggerEntries {
  /** 该锚点上要画入口的条目(健康 & 未被容量截断)。 */
  entries: ComputedRef<PluginContributedUiSlot[]>
  /** 因容量被截断、折叠掉的条目(菜单/工具条只报个数,详情在设置页)。 */
  truncated: ComputedRef<PluginContributedUiSlot[]>
  /** 折叠提示的悬浮文案(插件名: 标签,一行一个)。 */
  truncatedTitles: ComputedRef<string>
  /** 当前打开的条目;null = 没有弹层。 */
  openEntry: Ref<PluginContributedUiSlot | null>
  /** 弹层锚定的 DOM 元素(入口本身,或调用方指定的宿主元素)。 */
  openAnchorEl: Ref<HTMLElement | null>
  /** 弹层内容的最大高度(锚点容量给的)。 */
  maxHeight: number
  entryKey(entry: PluginContributedUiSlot): string
  isOpen(entry: PluginContributedUiSlot): boolean
  /** render 连败降级过的条目 —— 入口置灰**不消失**(§9.3 第 4 条)。 */
  isPaused(entry: PluginContributedUiSlot): boolean
  /** 入口点击:同一条再点一次即关闭(与宿主既有菜单同款开合)。 */
  toggle(entry: PluginContributedUiSlot, anchorEl: HTMLElement | null): boolean
  close(): void
  /** 弹层里的块汇报四态 —— 只有"降级"会留在入口上。 */
  noteState(entry: PluginContributedUiSlot, state: { degraded: boolean }): void
}

export function usePluginTriggerEntries(anchor: string): PluginTriggerEntries {
  const entries = useVisibleAnchorUiSlots(anchor)
  const truncated = computed(() => computeAnchorOverflow(anchor).truncated)
  const truncatedTitles = computed(() =>
    truncated.value.map(slot => `${slot.pluginName}: ${slot.label}`).join('\n'),
  )
  const maxHeight = UI_ANCHOR_CAPACITY_MIRROR[anchor]?.maxHeight ?? 320

  const openEntry = ref<PluginContributedUiSlot | null>(null)
  const openAnchorEl = ref<HTMLElement | null>(null)
  /** 置灰记忆按 surface 键存 —— 弹层关掉后组件就没了,状态必须活在挂点上。 */
  const paused = ref<Set<string>>(new Set())

  function entryKey(entry: PluginContributedUiSlot): string {
    return `${entry.pluginId}:${entry.slotId}`
  }

  function isOpen(entry: PluginContributedUiSlot): boolean {
    return !!openEntry.value && entryKey(openEntry.value) === entryKey(entry)
  }

  function close(): void {
    openEntry.value = null
    openAnchorEl.value = null
  }

  function toggle(entry: PluginContributedUiSlot, anchorEl: HTMLElement | null): boolean {
    if (isOpen(entry)) {
      close()
      return false
    }
    openEntry.value = entry
    openAnchorEl.value = anchorEl
    return true
  }

  function noteState(entry: PluginContributedUiSlot, state: { degraded: boolean }): void {
    const key = entryKey(entry)
    if (paused.value.has(key) === state.degraded) return
    // Set 是引用类型,原地改不触发依赖 —— 换一只新的。
    const next = new Set(paused.value)
    if (state.degraded) next.add(key)
    else next.delete(key)
    paused.value = next
  }

  function isPaused(entry: PluginContributedUiSlot): boolean {
    return paused.value.has(entryKey(entry))
  }

  /**
   * 拆除面:插件被停用/卸载后清单里就没有它了 —— 入口消失是投影自己的事,
   * 但**开着的弹层**必须跟着关掉,否则会留下一块指着死插件的浮层
   * (它的 render 还会继续打请求通道)。
   */
  watch(entries, list => {
    const open = openEntry.value
    if (!open) return
    if (!list.some(item => entryKey(item) === entryKey(open))) close()
  })

  return {
    entries,
    truncated,
    truncatedTitles,
    openEntry,
    openAnchorEl,
    maxHeight,
    entryKey,
    isOpen,
    isPaused,
    toggle,
    close,
    noteState,
  }
}
