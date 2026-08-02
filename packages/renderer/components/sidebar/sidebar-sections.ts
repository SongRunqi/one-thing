/**
 * 左栏分区的纯逻辑(方案三「图标 rail + 单类面板」,
 * 样板 docs/design/im-redesign/sidebar-4.html 第三格)。
 *
 * 与 DOM 无关的三件事全部关在这里,以便单测直接钉住:
 *  1. **rail 上有哪几类**(可见性:web 端没有 rooms 协调器,只剩「会话」);
 *  2. **当前类别怎么读/怎么写**(一个 localStorage 键,一个字符串 —— 沿用 R4
 *     那套本机视图偏好的落法,不进 settings、不为每类各起一个键);
 *  3. **徽标落在哪一枚图标上**。
 *
 * 「分区折叠」(R4 的四区各自可收起 + `onething:sidebar-sections-collapsed`)
 * 在方案三下由**类别切换**替代,整套已删 —— 见 §6 报告。
 */

// ── 类别定义 ────────────────────────────────────────────────────────────────

/**
 * rail 上的四类。顺序即 rail 自上而下的顺序。
 *
 * 2026-08-01 改口径:四格从**按类型分列**(群聊 / 联系人 / 会话)改成**按意图
 * 分列**。用户原话是「sidebar 的 tab 要显示最近的聊天;不要把入口放在联系人、
 * 群聊上,这样和正常的 IM 不太一致」——
 *
 *  - `recent`「消息」:回到某段对话。私聊 / 群聊 / 直聊**混排**,按时间倒序。
 *    这是 IM 的主列表,也是默认停靠的一类。
 *  - `active`「进行中」:回到某件活(本产品特有,原样保留)。
 *  - `contacts`「通讯录」:**发起**一段对话 —— 同事 + 群,含从没聊过的。
 *    旧的 `rooms` 类并进这里(见 `migrateRailCategory`)。
 *  - `sessions`「会话」:按项目找旧直聊(归档面,仍是既有 SessionList)。
 */
export type SidebarRailCategoryId = 'recent' | 'active' | 'contacts' | 'sessions'

export interface SidebarRailCategory {
  id: SidebarRailCategoryId
  /** 面板头上的类别名(样板 `.ph b`)。 */
  label: string
}

export const SIDEBAR_RAIL_CATEGORIES: readonly SidebarRailCategory[] = [
  { id: 'recent', label: '消息' },
  { id: 'active', label: '进行中' },
  { id: 'contacts', label: '通讯录' },
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
}

/**
 * rail 上真正画出来的类别。
 *
 * **web 降级**:没有 rooms 能力时,消息/进行中/通讯录三类全都无源可吃
 * (私聊与群聊都是房,活卡片是房的附属)—— 留在 rail 上就是三枚点不出东西的
 * 死图标,所以只留「会话」。
 *
 * 桌面端四类**恒在**。R4 那条「没有活就整区不显示」是给*列表里的分区*定的:
 * 空分区白占左栏最贵的纵向空间。到了 rail 上它不成立 —— 图标不占列表空间,
 * 藏掉却有两个坏处:活一起一停 rail 就上下跳(肌肉记忆没了);没活时点不进去看
 * 「已交付」。空态由面板内部说话,不由 rail 决定去留。
 */
export function resolveRailCategories(
  input: SidebarRailAvailabilityInput,
): SidebarRailCategoryId[] {
  if (!input.roomsEnabled) return ['sessions']
  return ['recent', 'active', 'contacts', 'sessions']
}

/**
 * 旧存档的搬迁。`rooms`(群聊)这一类并进了「通讯录」—— 停在群聊的人下次开 app
 * 该落在通讯录,而不是被当成读不懂的值退回第一类。
 */
export function migrateRailCategory(stored: string | null | undefined): string | null {
  if (!stored) return null
  return stored === 'rooms' ? 'contacts' : stored
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
  const migrated = migrateRailCategory(stored)
  if (!migrated) return fallback
  return (available as readonly string[]).includes(migrated)
    ? migrated as SidebarRailCategoryId
    : fallback
}

// ── 徽标 ────────────────────────────────────────────────────────────────────

export interface SidebarRailBadgeInput {
  /** rail 上此刻画着哪几类(徽标要落在真实存在的图标上)。 */
  available: readonly SidebarRailCategoryId[]
  /** 对话有未读:群 / 私聊 / 私下 —— 「消息」那一类装的东西。 */
  unreadConversations: boolean
  /** 直聊会话有未读 —— 「会话」那一类装的东西。 */
  unreadChatSessions: boolean
  /** 有活在跑,或有活在等你(delivered 不算 —— 交付了就不催人)。 */
  activeWork: boolean
}

export type SidebarRailBadges = Record<SidebarRailCategoryId, boolean>

/**
 * 右上角那枚 5px 点。**一条未读只催一次**。
 *
 * 「消息」装房、「会话」装直聊,两堆不重叠,所以各自亮各自的不会重复报数。
 * **通讯录恒不亮**:它的每一行要么已经在消息流里(聊过的),要么根本没聊过 ——
 * 替消息流再报一次就是同一条未读在 rail 上被数两遍,而徽标一旦学会重复报数
 * 就没人再信它。
 *
 * web 降级下 rail 上没有「消息」(私聊与群都是房),两路未读一起落到「会话」——
 * 那时它是唯一的列表,总不能让未读无处可报。
 *
 * 判定本身全在调用方的既有账上(`isUnreadSession` / `CollabTask` 的状态标),
 * 这里只做归一 —— 一枚点不摆数字:系统只知道"有没有",不知道"几条"。
 */
export function resolveRailBadges(input: SidebarRailBadgeInput): SidebarRailBadges {
  const hasRecent = input.available.includes('recent')
  return {
    recent: hasRecent && input.unreadConversations === true,
    active: input.activeWork === true,
    contacts: false,
    sessions: input.unreadChatSessions === true
      || (!hasRecent && input.unreadConversations === true),
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
