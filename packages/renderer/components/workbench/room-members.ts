/**
 * 右栏「成员」tab 的**纯逻辑** —— 去复用重构 R2
 * (样板 `docs/design/im-redesign/final.html` 二 · 右栏三态,图 2)。
 *
 * 成员列表按在场分三段:**在忙 / 空闲 / 已注销**,每行一句「在忙什么」。
 *
 * 纪律(W7,`docs/design/im-workbench-layout.md` §3):在场与「在忙什么」一律从
 * **既有的两份口径**现算,不新起第四套 ——
 *  - 花名册:`chat/room-member-strip.ts` 的 `buildRoomMemberEntries`(房头成员堆
 *    用的就是它,含墓碑三态);
 *  - 在忙:`chat/agent-activity.ts` 的 `findAgentDoingTask`(左栏活卡片、私聊房头
 *    的工作徽标共用的那一份)。
 *
 * 这里**不带 `requireWorkSession`** —— 与左栏活卡片同一档(见 agent-activity.ts
 * 的文件头):没开过工作台的 doing 卡照样算「这个人在忙」。带了那个选项的是
 * 「点得开线程」的场合(私聊房头徽标),两者的差别收在那一个选项里。
 */
import type { CollabBoard } from '@shared/ipc'
import { findAgentDoingTask, type AgentDoingTask } from '@/components/chat/agent-activity'
import type { RoomMemberEntry } from '@/components/chat/room-member-strip'

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

/** 墓碑行的副文案:名字还挂在花名册上,历史照旧读得出来。 */
export const ROOM_MEMBER_RETIRED_DETAIL = '已注销 · 历史可读'

export interface RoomPresenceMember extends RoomMemberEntry {
  /** 名下有 doing 卡 = 在忙。已注销恒 false(墓碑不参与在场判定)。 */
  busy: boolean
  /** 一行副文案:在忙 → 卡标题;空闲 → 职务;已注销 → 墓碑那句。'' = 不画。 */
  detail: string
  /** 在忙时那张卡;带 `sessionId` 才点得开线程,拿不到就只是一句话。 */
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
  retired: '已注销',
}

const GROUP_ORDER: readonly RoomPresenceGroupKey[] = ['busy', 'idle', 'retired']

/**
 * 花名册 + 看板 → 三段在场。
 *
 * 空段整段不画(样板里没有「空闲 — 0」这种行),但**已注销的人绝不丢弃**:
 * 名字还挂在房间上就照旧出一行,只是灰显 —— 藏起来等于藏掉了"把这个陈旧成员
 * 踢出去"的入口(与成员条同一条理由)。
 */
export function buildRoomPresenceGroups(options: {
  entries: readonly RoomMemberEntry[]
  board: CollabBoard | null | undefined
}): RoomPresenceGroup[] {
  const buckets: Record<RoomPresenceGroupKey, RoomPresenceMember[]> = {
    busy: [],
    idle: [],
    retired: [],
  }

  for (const entry of options.entries) {
    const work = entry.isRetired ? null : findAgentDoingTask(options.board, entry.id)
    const busy = Boolean(work)
    const member: RoomPresenceMember = {
      ...entry,
      busy,
      work,
      detail: entry.isRetired
        ? ROOM_MEMBER_RETIRED_DETAIL
        : work
          ? work.title
          : (entry.title || ''),
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
