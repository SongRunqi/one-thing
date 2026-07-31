/**
 * 左栏分区的纯逻辑(方案三「图标 rail + 单类面板」,
 * 样板 docs/design/im-redesign/sidebar-4.html 第三格)。
 *
 * 与 DOM 无关的三件事全部关在这里,以便单测直接钉住:
 *  1. **rail 上有哪几类**(可见性:web 端没有 rooms 协调器,三类不可用;
 *     「进行中」没有活时这一类整个不出现 —— 2026-07-31 用户拍板的那条规矩,
 *     在方案三里的等价物就是"这一类不在 rail 上");
 *  2. **当前类别怎么读/怎么写**(一个 localStorage 键,一个字符串 —— 沿用 R4
 *     那套本机视图偏好的落法,不进 settings、不为每类各起一个键);
 *  3. **徽标怎么判**(该类有未读或在跑),以及群聊行成员头像堆截到几枚。
 *
 * 「分区折叠」(R4 的四区各自可收起 + `onething:sidebar-sections-collapsed`)
 * 在方案三下由**类别切换**替代,整套已删 —— 见 §6 报告。
 */

// ── 类别定义 ────────────────────────────────────────────────────────────────

/** rail 上的四类。顺序即 rail 自上而下的顺序。 */
export type SidebarRailCategoryId = 'active' | 'rooms' | 'contacts' | 'sessions'

export interface SidebarRailCategory {
  id: SidebarRailCategoryId
  /** 面板头上的类别名(样板 `.ph b`)。 */
  label: string
}

export const SIDEBAR_RAIL_CATEGORIES: readonly SidebarRailCategory[] = [
  { id: 'active', label: '进行中' },
  { id: 'rooms', label: '群聊' },
  { id: 'contacts', label: '联系人' },
  { id: 'sessions', label: '会话' },
]

/**
 * 当前类别的落点。沿用 R4 的机制(渲染层的本机视图偏好一律 localStorage,
 * 不进 settings —— 「我停在哪一类」不该跨端同步),只是换了一个键:上一版那个
 * 键里装的是折叠态数组,形状不同,复用会把两种存档搅在一起。
 */
export const SIDEBAR_RAIL_STORAGE_KEY = 'onething:sidebar-rail-category'

export interface SidebarRailAvailabilityInput {
  /** `platformApi.capabilities.collabRooms` —— web 端为 false。 */
  roomsEnabled: boolean
  /** 此刻在跑的活有几张(`useActiveWork` 的 cards 长度)。 */
  activeWorkCount: number
}

/**
 * rail 上真正画出来的类别。
 *
 * - **web 降级**:没有 rooms 能力时,进行中/群聊/联系人三类全都无源可吃 ——
 *   留在 rail 上就是三枚点不出东西的死图标,所以只留「会话」。
 * - **「进行中」空态**:没有在跑的活时这一类不出现(2026-07-31 用户拍板的
 *   「整区不显示」在方案三里的等价物)。选中它时活干完了,`resolveRailCategory`
 *   会把当前类退到下一个可用的。
 */
export function resolveRailCategories(
  input: SidebarRailAvailabilityInput,
): SidebarRailCategoryId[] {
  if (!input.roomsEnabled) return ['sessions']
  // 四类**恒在**。R4 那条「没有活就整区不显示」是给*列表里的分区*定的:空分区
  // 白占左栏最贵的纵向空间。到了 rail 上它不成立 —— 图标不占列表空间,藏掉却有
  // 两个坏处:活一起一停 rail 就上下跳(肌肉记忆没了);没活时点不进去看「已交付」。
  // 空态由面板内部说话,不由 rail 决定去留。
  return ['active', 'rooms', 'contacts', 'sessions']
}

/**
 * 当前类别 = 存下来的那个,前提是它还在 rail 上;否则退到第一个可用的。
 *
 * 读不懂的存档(旧版本的折叠态数组、手改坏的值)一律当作"没存过" —— 一个读不懂
 * 的偏好不该让左栏空着。
 */
export function resolveRailCategory(
  stored: string | null | undefined,
  available: readonly SidebarRailCategoryId[],
): SidebarRailCategoryId {
  const fallback = available[0] ?? 'sessions'
  if (!stored) return fallback
  return (available as readonly string[]).includes(stored)
    ? stored as SidebarRailCategoryId
    : fallback
}

// ── 徽标 ────────────────────────────────────────────────────────────────────

export interface SidebarRailBadgeInput {
  /** 进行中:有活在跑,或有活在等你(delivered 不算 —— 交付了就不催人)。 */
  active: boolean
  /** 群聊:任意一间群/私下房有未读。 */
  rooms: boolean
  /** 联系人:任意一位同事的私聊房有未读。 */
  contacts: boolean
  /** 会话:任意一条直聊有未读。 */
  sessions: boolean
}

export type SidebarRailBadges = Record<SidebarRailCategoryId, boolean>

/**
 * 右上角那枚 5px 点:**该类有未读或在跑**。
 *
 * 判定本身全在调用方的既有账上(`isUnreadSession` / `CollabTask` 的状态标),
 * 这里只做归一 —— 一枚点不摆数字:系统只知道"有没有",不知道"几条"。
 */
export function resolveRailBadges(input: SidebarRailBadgeInput): SidebarRailBadges {
  return {
    active: input.active === true,
    rooms: input.rooms === true,
    contacts: input.contacts === true,
    sessions: input.sessions === true,
  }
}

/**
 * 「进行中」这一类还在不在(2026-07-31 用户真机后拍板)。
 *
 * 旧结论是"塌陷成一行「没有在跑的活」"(§7 开放问题),真机走查后被推翻:
 * 一行永远在那儿的说明文字既不提供信息也占着左栏最贵的那段视线。方案三下它的
 * 等价物是「这一类不上 rail」—— 否则点进去是一块空面板。
 *
 * 注意这个判定**不含**外壳形态门与 rooms 能力门 —— 那两道是"取不取数"的门
 * (取数是一次 IPC,CSS 与内层 v-if 关不住),写在 `Sidebar.vue` 上。
 */
export function shouldShowActiveWorkSection(input: { cardCount: number }): boolean {
  return input.cardCount > 0
}

// ── 群聊行的成员头像堆 ──────────────────────────────────────────────────────

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
