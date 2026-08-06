/**
 * 产品形态(docs/design/product-two-forms-chatgpt-shell.md D1/D6)。
 *
 * 一个产品,两种形态 —— 参考 ChatGPT 左栏顶部那枚 `ChatGPT ▾ / Codex` 下拉:
 *
 *  - `chat`「对话」= 老模式的直聊。左栏是按项目分组的会话表。
 *  - `collab`「协作」= 群聊 + 私聊。左栏是既有的 rail + 单类面板(消息 / 进行中 /
 *    通讯录),**原样保留**,只是「会话」那一格搬去了对话形态。
 *
 * ## 铁律:形态是**列表过滤器**,不是**呈现开关**
 *
 * 形态只决定两件事 —— 左栏装什么、「＋」建什么。**主区画什么永远由
 * `session.kind` 推**(`kind === 'room'` → RoomSurface,否则 ChatPanel)。
 * 所以在对话形态下点开一条群聊,画出来的仍是完整的群聊面。
 *
 * 两条不这么切的理由:
 *  1. 若形态决定呈现,从对话形态搜到一条老直聊、点开就会画错;
 *  2. 这样**不需要给 session 加字段** —— 而 `packages/core/session/store-helpers.ts`
 *     的会话列表索引是逐字段白名单,新字段能落盘、activate 后能读到,唯独在
 *     列表里是空的且不报错(§6.1)。不加字段天然踩不到。
 *
 * 与 `sidebar-sections.ts` 的分工:那边管**协作形态内部**的三格;这边管形态
 * 本身。两个落点都在 localStorage(渲染层的本机视图偏好一律不进 settings ——
 * 「我停在哪儿」不该跨端同步),但是两个键、两种形状,不复用。
 */

export type SidebarFormMode = 'chat' | 'collab'

export interface SidebarFormModeDescriptor {
  id: SidebarFormMode
  label: string
  /** 下拉里的副文,说这一形态是干什么的(样板 `ChatGPT / Create, learn, and explore`)。 */
  hint: string
}

/** 下拉里的顺序即这里的顺序。 */
export const SIDEBAR_FORM_MODES: readonly SidebarFormModeDescriptor[] = [
  { id: 'chat', label: '对话', hint: '和助理单独聊,按项目归档' },
  { id: 'collab', label: '协作', hint: '群聊与私聊,盯着一堆活' },
]

/** 当前形态的落点。与 rail 类别是**两个键**:形状不同,复用会把两种存档搅在一起。 */
export const SIDEBAR_FORM_MODE_STORAGE_KEY = 'onething:sidebar-form-mode'

export interface SidebarFormModeAvailabilityInput {
  /** `platformApi.capabilities.collabRooms` —— web 端为 false。 */
  roomsEnabled: boolean
}

/**
 * 真正可选的形态。
 *
 * **web 降级**:没有 rooms 能力时协作形态整个不存在,只剩「对话」一项 ——
 * 调用方据此**不画切换器**(单项下拉是个点不出东西的死控件)。
 */
export function resolveFormModes(
  input: SidebarFormModeAvailabilityInput,
): SidebarFormMode[] {
  return input.roomsEnabled ? ['chat', 'collab'] : ['chat']
}

/**
 * 当前形态 = 存下来的那个,前提是它还可选;否则退到默认。
 *
 * **老用户的搬迁**:U3 之前没有形态这个概念,只有 rail 的四格,落点在
 * `onething:sidebar-rail-category`。停在「会话」的人本来看的就是直聊列表 →
 * 落到对话形态;停在其余三格的人看的是房 → 落到协作形态。
 *
 * 没有任何存档时默认落**协作**(桌面端),因为 U3 之前 rail 的默认就是「消息」——
 * 换了形态的说法,不该顺手换掉用户一进来看见的东西。web 端只有对话形态。
 */
export function resolveFormMode(
  stored: string | null | undefined,
  storedRailCategory: string | null | undefined,
  available: readonly SidebarFormMode[],
): SidebarFormMode {
  const fallback: SidebarFormMode = available.includes('collab') ? 'collab' : 'chat'

  if (stored === 'chat' || stored === 'collab') {
    return available.includes(stored) ? stored : fallback
  }
  // 没有形态存档 → 看看老的 rail 停在哪一格。
  if (storedRailCategory === 'sessions') return 'chat'
  return fallback
}

/**
 * 点开一条会话时形态该跟着换到哪 —— 左栏永远反映"你在哪儿"。
 *
 * 房(群聊 / 私聊)→ 协作;其余(直聊 / 执行会话 / agent 常驻会话)→ 对话。
 * 拿不到 kind 时返回 null =「别动」:一次读不到会话的抖动不该把左栏整棵换掉。
 */
export function formModeForSessionKind(
  kind: string | null | undefined,
  available: readonly SidebarFormMode[],
): SidebarFormMode | null {
  if (!kind) return null
  const wanted: SidebarFormMode = kind === 'room' ? 'collab' : 'chat'
  return available.includes(wanted) ? wanted : null
}
