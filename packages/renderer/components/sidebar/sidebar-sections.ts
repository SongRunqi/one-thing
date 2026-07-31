/**
 * 左栏分区的纯逻辑(R4,docs/design/im-workbench-layout.md §3 W1)。
 *
 * 三件与 DOM 无关的事,全部关在这里,以便单测直接钉住:
 *  1. **哪几区可以收起来**,以及收起态怎么读/怎么写(一个 localStorage 键,
 *     一份 JSON —— 不为每一区各起一个键,那样迟早长歪成四套);
 *  2. **「进行中」什么时候整区不显示**(2026-07-31 真机后用户拍板:没有在跑的
 *     活就整区消失,不再塌陷成一行。这条推翻了 §7 开放问题里的旧倾向);
 *  3. **群聊行成员头像堆截到几枚**(样板的 `.faces`)。名册→成员的翻译不在
 *     这里重写:那是 `chat/room-member-strip.ts` 的 `buildRoomMemberEntries`,
 *     与房头成员条同一口径,这里只负责"截断 + 数余量"。
 */

/** 可折叠的四区。顺序即左栏自上而下的顺序(workbench 下)。 */
export type SidebarSectionId = 'active-work' | 'rooms' | 'contacts' | 'sessions'

export const SIDEBAR_SECTION_IDS: readonly SidebarSectionId[] = [
  'active-work',
  'rooms',
  'contacts',
  'sessions',
]

/**
 * 折叠态落点。沿用渲染层既有的持久化方式(ChatContainer 的侧栏折叠、
 * TodoPlanPanel 的分区折叠都在 localStorage),不新起一套存储、不进 settings ——
 * 「这一区我收起来了」是本机视图偏好,不是要跨端同步的产品设置。
 */
export const SIDEBAR_SECTIONS_STORAGE_KEY = 'onething:sidebar-sections-collapsed'

function isSectionId(value: unknown): value is SidebarSectionId {
  return typeof value === 'string' && (SIDEBAR_SECTION_IDS as readonly string[]).includes(value)
}

/**
 * 读一次存下来的折叠态。坏数据(不是数组、混进未知 id、根本不是 JSON)一律
 * 当作"什么都没收起来" —— 一个读不懂的偏好不该让左栏整片消失。
 */
export function parseCollapsedSections(raw: string | null | undefined): Set<SidebarSectionId> {
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter(isSectionId))
  } catch {
    return new Set()
  }
}

/** 写回去的形状:一个 id 数组,按 `SIDEBAR_SECTION_IDS` 定序(存档可读、可 diff)。 */
export function serializeCollapsedSections(collapsed: ReadonlySet<SidebarSectionId>): string {
  return JSON.stringify(SIDEBAR_SECTION_IDS.filter(id => collapsed.has(id)))
}

/** 折叠开关。返回新 Set(Vue 的响应式靠换引用,不靠原地改 Set)。 */
export function toggleCollapsedSection(
  collapsed: ReadonlySet<SidebarSectionId>,
  id: SidebarSectionId,
): Set<SidebarSectionId> {
  const next = new Set(collapsed)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * 「进行中」整区的显隐(2026-07-31 用户真机后拍板)。
 *
 * 旧结论是"塌陷成一行「没有在跑的活」"(§7 开放问题),真机走查后被推翻:
 * 一行永远在那儿的说明文字既不提供信息也占着左栏最贵的那一段视线,**没有活
 * 就整区不显示**。
 *
 * 注意这个判定**不含**外壳形态门与 rooms 能力门 —— 那两道是"挂不挂载"的门
 * (挂载会带一次看板取数,CSS/内层 v-if 关不住一次 IPC),写在 `Sidebar.vue` 的
 * `v-if` 上;这里只回答"挂上了之后,这一区该不该露面"。
 */
export function shouldShowActiveWorkSection(input: { cardCount: number }): boolean {
  return input.cardCount > 0
}

/** 群聊行头像堆最多几枚 —— 样板画三枚,余量交给 `+N`。 */
export const SIDEBAR_ROOM_FACE_LIMIT = 3

export interface SidebarRoomFaces<T> {
  /** 前 `limit` 枚,按名册顺序。 */
  faces: T[]
  /** 被截掉的枚数;0 表示不画 `+N`。 */
  overflow: number
}

/**
 * 截断成员堆。入参已经是 `buildRoomMemberEntries` 的产物 —— 谁是墓碑、谁是
 * 负责人在那一处判完了,这里不做第二份判定,只管"画几枚、余几个"。
 */
export function takeRoomFaces<T>(
  entries: readonly T[],
  limit: number = SIDEBAR_ROOM_FACE_LIMIT,
): SidebarRoomFaces<T> {
  if (limit <= 0) return { faces: [], overflow: entries.length }
  return {
    faces: entries.slice(0, limit),
    overflow: Math.max(0, entries.length - limit),
  }
}
