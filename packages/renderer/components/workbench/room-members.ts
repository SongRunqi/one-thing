/**
 * 右栏「成员」tab 的**纯逻辑** —— 去复用重构 R2
 * (样板 `docs/design/im-redesign/final.html` 二 · 右栏三态,图 2)。
 *
 * 成员列表按在场分三段:**在忙 / 空闲 / 已注销**,每行一句「在忙什么」。
 *
 * 纪律(W7,`docs/design/im-workbench-layout.md` §3):在场与「在忙什么」一律从
 * **既有的口径**现算,不新起一套 ——
 *  - 花名册:`chat/room-member-strip.ts` 的 `buildRoomMemberEntries`(房头成员堆
 *    用的就是它,含墓碑三态);
 *  - 在场:同一个文件的 `resolveRoomMemberPresence`(房头四态徽标读的那一份),
 *    它自己又只是 collabBoard `agents` 账的一次派生。
 *
 * ## 「在忙」的口径换过一次(D8 观测体系 §4.4)
 *
 * 从前这一格是从**看板的 doing 卡**现算的:一张卡躺在「在做」列里,这个人就被
 * 画成在忙。那是 C4 审查里「四口径」问题的最后一块,而它会在两个方向上都撒谎 ——
 * 一张忘了收的 doing 卡让一个闲了三天的人一直亮着;一个正在群里写长回复、名下
 * 却没有卡的人则显示空闲。
 *
 * 现在在场判定只有一本账。看板仍然回答另一个问题:**「TA 在做哪张卡」** ——
 * 那是行上那句副文案与「点得开线程」的靶子,而它本来就该由看板回答。两件事分开
 * 之后,`findAgentDoingTask` 不再是"在忙判据",它只是一次卡片查询。
 */
import type { CollabBoard } from '@shared/ipc'
import { agentTombstoneLabel } from '@onething/runtime/agents/model'
import { findAgentDoingTask, type AgentDoingTask } from '@/components/chat/agent-activity'
import type {
  RoomMemberEntry,
  RoomMemberPresence,
} from '@/components/chat/room-member-strip'

/**
 * 「在右栏打开成员 / 空间页」的契约 —— 与 `onething:open-thread` 同一条 window
 * 事件解耦线路(派事件的房头、say 署名、房面离右栏都隔着好几层,不该为了开一个
 * tab 一路透传 ref)。名字与形状写在这里,派与收两端都 import 这一个常量。
 */
export const OPEN_MEMBERS_EVENT = 'onething:open-members'

export interface OpenMembersDetail {
  /** 房间会话 id —— 花名册挂在它身上,没有它这个 tab 无从谈起。 */
  sessionId: string
  /** 非空 = 直接下钻到这个人的空间页。 */
  agentId?: string
  /** 页签名;私聊态传「空间」(那间房没有"成员"这回事)。 */
  title?: string
}

export type RoomPresenceGroupKey = 'busy' | 'idle' | 'retired'

/** 墓碑行的副文案:名字还挂在花名册上,历史照旧读得出来。文案属主见 model.ts。 */
export const ROOM_MEMBER_RETIRED_DETAIL = `${agentTombstoneLabel('ui')} · 历史可读`

export interface RoomPresenceMember extends RoomMemberEntry {
  /**
   * 在场态(D8 §4.4):生成中 / 持牌等大脑 / 干活中 / 空闲。
   * 已注销恒 `idle`(墓碑不参与在场判定)。
   */
  presence: RoomMemberPresence
  /** `presence !== 'idle'`。分段用它,行上的三色徽标用上面那一格。 */
  busy: boolean
  /**
   * 一行副文案。**在场的说法优先于卡片**:一个正在写字的人,行上该写「生成中」
   * 而不是一张三天前领的卡的标题。有卡时把卡名接在后面。
   * 已注销 → 墓碑那句;什么都没有 → 职务。'' = 不画。
   */
  detail: string
  /** TA 名下那张 doing 卡;带 `sessionId` 才点得开线程,拿不到就只是一句话。 */
  work: AgentDoingTask | null
}

export interface RoomPresenceGroup {
  key: RoomPresenceGroupKey
  /** 段头文案(不含计数,计数由呈现层拼「在忙 — 2」)。 */
  label: string
  members: RoomPresenceMember[]
}

const GROUP_LABEL: Record<RoomPresenceGroupKey, string> = {
  busy: '在忙',
  idle: '空闲',
  retired: agentTombstoneLabel('ui'),
}

const GROUP_ORDER: readonly RoomPresenceGroupKey[] = ['busy', 'idle', 'retired']

/** 在场态 → 行上那三个字。空闲不出词(它由"没有词"表达)。 */
const PRESENCE_DETAIL: Readonly<Record<RoomMemberPresence, string>> = {
  generating: '生成中',
  holding: '持牌等大脑',
  working: '在干活',
  idle: '',
}

/**
 * 花名册 + agents 账 + 看板 → 三段在场。
 *
 * 空段整段不画(样板里没有「空闲 — 0」这种行),但**已注销的人绝不丢弃**:
 * 名字还挂在房间上就照旧出一行,只是灰显 —— 藏起来等于藏掉了"把这个陈旧成员
 * 踢出去"的入口(与成员条同一条理由)。
 *
 * `presence` 由调用方从 collabBoard 的 agents 账注入(与状态条注入 `resolveMind`
 * 同一条:纯层不认识 store)。**不给 = 全体空闲** —— 这是刻意的:一个没接上账
 * 的宿主该显示"不知道",而不是回落到看板那个会撒谎的旧口径。
 */
export function buildRoomPresenceGroups(options: {
  entries: readonly RoomMemberEntry[]
  board: CollabBoard | null | undefined
  presence?: (agentId: string) => RoomMemberPresence
}): RoomPresenceGroup[] {
  const buckets: Record<RoomPresenceGroupKey, RoomPresenceMember[]> = {
    busy: [],
    idle: [],
    retired: [],
  }

  for (const entry of options.entries) {
    // 墓碑不参与在场判定,也不去查卡:那个人不会再动了。
    const presence: RoomMemberPresence = entry.isRetired
      ? 'idle'
      : (options.presence?.(entry.id) ?? 'idle')
    const work = entry.isRetired ? null : findAgentDoingTask(options.board, entry.id)
    const busy = presence !== 'idle'
    const presenceText = PRESENCE_DETAIL[presence]
    const member: RoomPresenceMember = {
      ...entry,
      presence,
      busy,
      work,
      detail: entry.isRetired
        ? ROOM_MEMBER_RETIRED_DETAIL
        // 在场的说法优先:一个正在写字的人,行上该写「生成中」而不是一张三天前
        // 领的卡的标题。两样都有就都说。
        : presenceText
          ? (work ? `${presenceText} · ${work.title}` : presenceText)
          : (work ? work.title : (entry.title || '')),
    }
    buckets[entry.isRetired ? 'retired' : busy ? 'busy' : 'idle'].push(member)
  }

  return GROUP_ORDER
    .map(key => ({ key, label: GROUP_LABEL[key], members: buckets[key] }))
    .filter(group => group.members.length > 0)
}

/** 三段里一共几个人 —— 「这间房只有一个人」= 私聊,不画「返回成员」。 */
export function countRoomPresenceMembers(groups: readonly RoomPresenceGroup[]): number {
  return groups.reduce((total, group) => total + group.members.length, 0)
}
