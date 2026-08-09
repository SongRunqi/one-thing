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
  /**
   * 抽屉块(F 期)。**裁决已在投影层做完**(core 的 `isEffectiveUiDrawerSlot`:
   * 锚点开了抽屉能力 + 这条声明了 drawer),renderer 只消费,不再判第二遍。
   */
  drawer?: boolean
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
  // 拆除面(F 期):插件禁用/卸载 = 它的块从这份清单里消失,抽屉档随之清掉
  // (含 localStorage)。留着 = 用户装回来时莫名其妙地是全收态。
  pruneDrawerStates(pluginUiSlots.value)
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
  // F 期:composer.above 是**唯一**开抽屉能力的锚点。maxHeight 说的是半收档
  // (老形态),expandedMaxHeight 是展开档的高度预算(超出块内滚动)。
  'composer.above': { kind: 'block', maxBlocks: 3, maxHeight: 32, drawer: true, expandedMaxHeight: 240 },
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
  /** 该锚点开不开抽屉能力(F 期;不是 kind,是 block 的能力扩展)。 */
  drawer?: boolean
  /** 抽屉展开档的高度预算(px)。 */
  expandedMaxHeight?: number
}

// ── 抽屉三态(F 期) ─────────────────────────

/**
 * 抽屉的三态 —— **宿主持有,插件零感知**(唯一例外是 render ctx 上的
 * `drawerState`,插件据此返回不同的树,见 anchors §9.6)。
 *
 *  - `expanded`:整块内容,高度预算 `expandedMaxHeight`,块内滚动;
 *  - `peek`(默认):单行摘要 —— 就是 F 期之前的老形态;
 *  - `collapsed`:完全离场,退位成 S 状态带上的一枚 chip(入口仍在)。
 *
 * 状态住在**这里**而不是两个组件里各存一份:抽屉壳(composer.above 挂点)
 * 与全收 chip(S 带的 chipShell 挂点)是两个组件,同一份档必须只有一个出处。
 */
export type UiDrawerState = 'expanded' | 'peek' | 'collapsed'

/** 会拉 render 的两档(全收不渲染,自然不拉)。 */
export type UiDrawerRenderState = Exclude<UiDrawerState, 'collapsed'>

/** 默认档:半收 = 老形态。用户没动过的抽屉与 F 期之前长得一模一样。 */
export const UI_DRAWER_DEFAULT_STATE: UiDrawerState = 'peek'

/** localStorage 键前缀 —— 三态按 (pluginId, anchor, id) 持久,多窗口各记各的(v1 不同步)。 */
export const DRAWER_STATE_STORAGE_PREFIX = 'onething:drawer-state:'

interface DrawerMemory {
  state: UiDrawerState
  /** 全收之前那一档 —— 点 chip 回到的就是它(§F 规格第 5 条"记忆里存上一档")。 */
  restore: UiDrawerRenderState
}

const drawerStates: Ref<Record<string, DrawerMemory>> = ref({})

/** 抽屉档的唯一键。anchor 在前:同一插件同一 id 出现在两个锚点上也不串。 */
export function drawerStateKey(pluginId: string, anchor: string, slotId: string): string {
  return `${anchor}:${pluginId}:${slotId}`
}

function storageKey(key: string): string {
  return `${DRAWER_STATE_STORAGE_PREFIX}${key}`
}

/**
 * localStorage 在测试/无浏览器环境可能缺席 —— 存不下不是错误,只是不持久。
 *
 * 判据卡在**方法在不在**而不是"全局有没有":Node 22 起 globalThis 上有一个
 * 没开 `--localstorage-file` 的空壳 localStorage(属性齐、方法全 undefined),
 * 只看 typeof 会把它当成能用的存储。
 */
function safeStorage(): Storage | null {
  try {
    const storage = typeof localStorage === 'undefined' ? null : localStorage
    return typeof storage?.getItem === 'function' ? storage : null
  } catch {
    return null
  }
}

function isDrawerState(value: unknown): value is UiDrawerState {
  return value === 'expanded' || value === 'peek' || value === 'collapsed'
}

/**
 * 从 localStorage 装载一次(模块加载时)。
 *
 * 刻意**不做惰性按需装载**:惰性读会发生在 computed 求值里,而那正是不许有
 * 副作用的地方(读一次写一次响应式 map = 自触发重算)。一次性扫前缀,键少得可数。
 */
function hydrateDrawerStates(): void {
  const storage = safeStorage()
  if (!storage) return
  const next: Record<string, DrawerMemory> = {}
  for (let index = 0; index < storage.length; index += 1) {
    const raw = storage.key(index)
    if (!raw || !raw.startsWith(DRAWER_STATE_STORAGE_PREFIX)) continue
    try {
      const parsed = JSON.parse(storage.getItem(raw) || '') as Partial<DrawerMemory>
      if (!isDrawerState(parsed?.state)) continue
      next[raw.slice(DRAWER_STATE_STORAGE_PREFIX.length)] = {
        state: parsed.state,
        restore: parsed.restore === 'expanded' ? 'expanded' : 'peek',
      }
    } catch {
      // 坏记录 = 当它不存在(与消息态的损坏隔离同规:坏数据不该让 UI 起不来)。
    }
  }
  drawerStates.value = next
}

hydrateDrawerStates()

function writeDrawerMemory(key: string, memory: DrawerMemory): void {
  drawerStates.value = { ...drawerStates.value, [key]: memory }
  try {
    safeStorage()?.setItem(storageKey(key), JSON.stringify(memory))
  } catch {
    // 配额/隐私模式:内存里的档照常生效,只是重启不记得。
  }
}

/** 某个抽屉块当前的档(没记过 = 默认半收)。 */
export function drawerStateOf(pluginId: string, anchor: string, slotId: string): UiDrawerState {
  return drawerStates.value[drawerStateKey(pluginId, anchor, slotId)]?.state ?? UI_DRAWER_DEFAULT_STATE
}

/**
 * 切档。切到 `collapsed` 时把**当前**这一档记成 restore —— 点 S 带的 chip
 * 回来时回到的正是收起前那档,而不是无脑回默认。
 */
export function setDrawerState(
  pluginId: string,
  anchor: string,
  slotId: string,
  state: UiDrawerState,
): void {
  const key = drawerStateKey(pluginId, anchor, slotId)
  const current = drawerStates.value[key]
  const currentState = current?.state ?? UI_DRAWER_DEFAULT_STATE
  const restore: UiDrawerRenderState = state === 'collapsed'
    ? (currentState === 'collapsed' ? (current?.restore ?? 'peek') : currentState)
    : state
  writeDrawerMemory(key, { state, restore })
}

/** 从全收恢复到收起前的那档(没有记忆则回默认的半收)。 */
export function restoreDrawer(pluginId: string, anchor: string, slotId: string): void {
  const key = drawerStateKey(pluginId, anchor, slotId)
  const restore = drawerStates.value[key]?.restore ?? 'peek'
  setDrawerState(pluginId, anchor, slotId, restore)
}

/** 拆除:清掉不在清单里的抽屉档(内存 + localStorage)。 */
export function pruneDrawerStates(slots: PluginContributedUiSlot[]): void {
  const alive = new Set(slots.map(slot => drawerStateKey(slot.pluginId, slot.anchor, slot.slotId)))
  const stale = Object.keys(drawerStates.value).filter(key => !alive.has(key))
  if (!stale.length) return
  const next = { ...drawerStates.value }
  const storage = safeStorage()
  for (const key of stale) {
    delete next[key]
    try {
      storage?.removeItem(storageKey(key))
    } catch {
      // 同上:清不掉也不该让刷新链路炸。
    }
  }
  drawerStates.value = next
}

/** 这一条块是不是抽屉(裁决在投影层做完,这里只读)。 */
export function isDrawerSlot(slot: PluginContributedUiSlot): boolean {
  return slot.drawer === true && UI_ANCHOR_CAPACITY_MIRROR[slot.anchor]?.drawer === true
}

/** 抽屉块在某一档下的高度预算。非抽屉块永远是锚点的 maxHeight。 */
export function drawerMaxHeight(anchor: string, state: UiDrawerState): number {
  const capacity = UI_ANCHOR_CAPACITY_MIRROR[anchor]
  const peekHeight = capacity?.maxHeight ?? 32
  if (state !== 'expanded') return peekHeight
  return capacity?.expandedMaxHeight ?? peekHeight
}

/**
 * 全收的抽屉块 —— S 状态带据此画 chip(拼图图标 + label)。
 *
 * 只出**健康且宿主认识**的块:一个加载失败的块不该在 S 带上留一枚点不出
 * 东西的 chip。(全收块不占容量,因此永远不会落进 truncated。)
 */
export function useCollapsedDrawerSlots(): ComputedRef<PluginContributedUiSlot[]> {
  return computed(() =>
    pluginUiSlots.value.filter(slot =>
      !slot.unsupported
      && slot.loaded
      && isDrawerSlot(slot)
      && drawerStateOf(slot.pluginId, slot.anchor, slot.slotId) === 'collapsed'),
  )
}

export interface AnchorOverflowInfo {
  /** 因容量截断而未渲染的块。 */
  truncated: PluginContributedUiSlot[]
  /** 加载失败的块(不占容量,折叠呈现)。 */
  failed: PluginContributedUiSlot[]
}

/**
 * 全收的抽屉块**不占容量**(F 期规格第 6 条):它已经退位到 S 带,再占着
 * composer.above 的一个席位就是白占 —— 第 4 块该顶上来。
 */
function occupiesCapacity(slot: PluginContributedUiSlot): boolean {
  return !(isDrawerSlot(slot) && drawerStateOf(slot.pluginId, slot.anchor, slot.slotId) === 'collapsed')
}

/**
 * 某个锚点的容量裁决:
 *  - **加载失败的块不计入 maxBlocks**(否则 3 个坏插件能永久占满整条锚点带);
 *  - **全收的抽屉块同样不计入**(它不在这条带上了);
 *  - 健康的块按注册表顺序(全局规范顺序)取前 maxBlocks 个,其余进 truncated。
 */
export function computeAnchorOverflow(anchor: string): AnchorOverflowInfo {
  const slots = pluginUiSlots.value.filter(slot => slot.anchor === anchor && !slot.unsupported)
  const failed = slots.filter(slot => !slot.loaded)
  const healthy = slots.filter(slot => slot.loaded && occupiesCapacity(slot))
  const capacity = UI_ANCHOR_CAPACITY_MIRROR[anchor]
  const truncated = capacity ? healthy.slice(capacity.maxBlocks) : []
  return { truncated, failed }
}

/** 某个锚点上**实际要渲染**的块(健康 & 未全收 & 未截断)。 */
export function useVisibleAnchorUiSlots(anchor: string): ComputedRef<PluginContributedUiSlot[]> {
  return computed(() => {
    const capacity = UI_ANCHOR_CAPACITY_MIRROR[anchor]
    const healthy = useAnchorUiSlots(anchor).value.filter(slot => slot.loaded && occupiesCapacity(slot))
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
