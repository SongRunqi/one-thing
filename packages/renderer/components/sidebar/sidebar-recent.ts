/**
 * 左栏「消息」类的纯逻辑 —— **一条时间序的对话流**。
 *
 * 2026-08-01 用户拍板:「sidebar 的 tab 要显示最近的聊天;不要把入口放在联系人、
 * 群聊上,这样和正常的 IM 不太一致」。IM 的主列表从来不按对象类型分列 ——
 * 群聊与私聊是同一根时间轴上的行,谁刚说过话谁在上面。按类型分列是**通讯录**
 * 的活,那一面回答的是"去找谁",不是"回哪一段"。
 *
 * **装什么,只有两种**(同日用户第二次划线:「要么是群聊,要么是和某个 Agent 的
 * 聊天,它不是所有的」):
 *  - 和某位同事的私聊房;
 *  - 群聊房。
 *
 * **不装**直聊会话(`kind='chat'`)—— 那是一条工作会话,不是"和谁的一段对话",
 * 它的家在「会话」那一类(项目分组、折叠、改名都在那儿)。把它混进来,消息流就
 * 变成了"全部东西的时间序",IM 的那一格也就没了意义。agent ⇄ agent 的「私下」房
 * 同样不装:那是旁听面,不是我参与的对话,它留在通讯录的群聊段里折叠着。
 *
 * 这里只做归一与排序,一份账都不新起:
 *  - 哪些房算私聊 / 群,由 sessions store 的两个 selector 回答;
 *  - 未读由 `isUnreadSession` 回答(组件里贴);
 *  - 名字与头像由名册回答(组件里贴 —— 纯函数不碰 store)。
 */

/** 行的两种来源。视觉上只差一枚章:私聊是圆章头像,群是方章。 */
export type SidebarRecentKind = 'dm' | 'group'

/** 入参:会话表里那几个字段,多的一概不要(纯函数不该认识 SessionDetails)。 */
export interface SidebarRecentSource {
  id: string
  name?: string
  updatedAt?: number
  isPinned?: boolean
  room?: { memberAgentIds?: string[] } | null
}

export interface SidebarRecentEntry {
  /** 会话 id —— 点它就是 `openSession(id)`,两种行同一条链路。 */
  id: string
  kind: SidebarRecentKind
  /** 兜底名。私聊行的显示名由组件用名册覆盖(同事改名要立刻跟上)。 */
  name: string
  /** 头像取谁:私聊 = 对面那个人;群不取人。 */
  agentId: string
  updatedAt: number
  isPinned: boolean
}

export interface SidebarRecentInput {
  /** 单成员 dm 房(`userDmRoomSessions`)。 */
  dmRooms?: readonly SidebarRecentSource[]
  /** 普通群(`groupRoomSessions`)。 */
  groupRooms?: readonly SidebarRecentSource[]
}

function toEntry(
  source: SidebarRecentSource,
  kind: SidebarRecentKind,
): SidebarRecentEntry {
  return {
    id: source.id,
    kind,
    name: (source.name || '').trim(),
    // dm 房的对面是名册里的那一个人 —— 房的成员表就是它的身份来源
    // (`isUserDmRoom` 已经保证只有一个成员,这里不再判一次形态)。
    agentId: kind === 'dm' ? (source.room?.memberAgentIds?.[0] || '') : '',
    updatedAt: source.updatedAt || 0,
    isPinned: source.isPinned === true,
  }
}

/**
 * 合并 + 排序。**不截断** —— 房是手工建出来的,天然是几十条量级;而消息流是它们
 * 唯一的时间序入口,砍掉尾巴就等于让一间房凭空消失。
 *
 * 排序:**置顶在前,其余按时间倒序**。未读不参与排序 —— IM 里未读是一枚点,
 * 不是插队的理由;把未读顶上去会让列表在别人说话时自己跳动,而"刚才那行在哪"
 * 是列表唯一要守住的东西。
 *
 * 同 id 只留第一份(理论上两路互斥,这里只是不让一次形态判定的失误变成两行)。
 */
export function buildRecentEntries(input: SidebarRecentInput): SidebarRecentEntry[] {
  const merged: SidebarRecentEntry[] = [
    ...(input.dmRooms ?? []).map(source => toEntry(source, 'dm')),
    ...(input.groupRooms ?? []).map(source => toEntry(source, 'group')),
  ]

  const seen = new Set<string>()
  const unique = merged.filter(entry => {
    if (!entry.id || seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })

  unique.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
    // 时间戳打平(存量数据里成批出现)时按 id 定序,免得每次重算都换一个顺序。
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return unique
}

/**
 * 群行那枚方章里画什么:群名的第一个字。
 *
 * 用 `Array.from` 拆而不是 `name[0]` —— emoji 群名(「🚀 发射组」)取 `[0]`
 * 会拿到半个代理对,渲染成一个替换字符。
 */
export function roomInitial(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '#'
  return Array.from(trimmed)[0] ?? '#'
}
