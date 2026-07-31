<template>
  <div
    v-if="entries.length > 0 || addableAgents.length > 0"
    class="room-members"
    :class="{ 'is-pair-dm': isPairDm, 'is-space-target': openSpaceOnClick }"
  >
    <button
      v-for="entry in entries"
      :key="entry.id"
      type="button"
      class="member-chip"
      :class="{ 'is-pm': entry.isPm, 'is-retired': entry.isRetired }"
      :title="tooltip(entry)"
      :aria-label="tooltip(entry)"
      @click.stop="handleChipClick(entry, $event)"
      @contextmenu.prevent.stop="openMemberMenu(entry, $event)"
    >
      <!-- The chip button IS the hairline ring, so the mark sits inside it at
           22px — a 24px picture would hide the ring it is framed by. -->
      <AgentAvatar
        class="member-mark"
        :avatar="entry.avatar"
        :avatar-image="entry.avatarImage"
        :size="22"
      />
    </button>

    <!-- dm 房没有 ＋:形态即身份,加个人就把私聊变成群了(P1b 遗留发现 4)。 -->
    <button
      v-if="addableAgents.length > 0 && !isPairDm"
      type="button"
      class="member-chip member-add"
      title="拉人进群"
      aria-label="拉人进群"
      @click.stop="openAddMenu"
    >
      ＋
    </button>

    <span
      v-if="error"
      class="member-error"
      :title="error"
    >{{ error }}</span>

    <ContextMenu
      :show="menu !== null"
      :x="menu?.x ?? 0"
      :y="menu?.y ?? 0"
      :items="menu?.items ?? []"
      @select="onMenuSelect"
      @close="menu = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Room header member strip (W7, docs/design/multi-agent-collab-im.md §3.5 C).
 *
 * The IM-side entry to membership, sitting where a group chat puts it — in the
 * room's header, next to 看板/⚙. Chips are 24px emoji stamps on a hairline,
 * overlapped so the row reads as one group rather than a toolbar; the trailing
 * ＋ pulls somebody in; a click (or right-click) on a chip offers 移出群聊 /
 * 设为负责人.
 *
 * Every write goes through W6's existing COLLAB_ROOM_UPDATE — the settings
 * dialog and this strip are two doors into one channel, not two channels. The
 * app layer validates atomically and posts the 群公告 lines; a refusal
 * (the last member, a vanished agent) comes back as text and lands here as one
 * line of ink, never as a silent no-op.
 */
import { computed, ref, watch } from 'vue'
import { isAgentPairDmRoom } from '@onething/runtime/collab'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import type { ContextMenuItem } from '@/components/common/context-menu'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'
import { platformApi } from '@/platform'
import { useAgentsStore } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import {
  buildAddableRoomAgents,
  buildRoomMemberEntries,
  formatRoomMemberTooltip,
  planRoomMemberAdd,
  planRoomMemberRemoval,
  type RoomMemberEntry,
} from './room-member-strip'
import { OPEN_MEMBERS_EVENT, type OpenMembersDetail } from '@/components/workbench/room-members'

const props = defineProps<{
  sessionId: string
  /**
   * 新房面(R2)的成员堆:左键 = 在右栏打开这个人的**空间页**(样板「点成员
   * 下钻」),名册管理(移出 / 设为负责人)退到右键。
   *
   * 默认 false —— 旧壳的 `TabBar` 用的是同一个组件,classic 逐像素回滚要求它
   * 的左键行为一个字节都不变(仍然是名册菜单)。
   */
  openSpaceOnClick?: boolean
}>()

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()

const ADD_PREFIX = 'add:'
const REMOVE_ID = 'remove'
const PROMOTE_ID = 'promote'
const ERROR_LINGER_MS = 4000

const error = ref('')
const saving = ref(false)
const menu = ref<{ x: number; y: number; items: ContextMenuItem[]; agentId?: string } | null>(null)
let errorTimer: ReturnType<typeof setTimeout> | null = null

const room = computed(() => sessionsStore.sessions.find(item => item.id === props.sessionId)?.room)
const memberAgentIds = computed<string[]>(() => room.value?.memberAgentIds ?? [])
const pmAgentId = computed(() => room.value?.pmAgentId)

/**
 * 双成员 dm 房(agent-im-dm.md §4.3):同一条成员条的紧凑形态 —— 两枚头像贴得
 * 更紧、不叠压(两个人不需要"这是一群人"的叠印),没有 ＋、没有成员菜单。
 *
 * 名册在这里**只读**:形态即身份(人数决定这间房是什么),加一个人就把一场私聊
 * 变成了群,而这间房的 id、房名、免判激活、链长闸默认值全部建立在"两个人"之上。
 * 要三个人就去开一个群 —— 那是另一个动作,不该藏在成员条的一次点击里。
 */
const isPairDm = computed(() => isAgentPairDmRoom(room.value))

const entries = computed(() => buildRoomMemberEntries({
  memberAgentIds: memberAgentIds.value,
  agents: agentsStore.agents,
  pmAgentId: pmAgentId.value,
}))

const addableAgents = computed(() => buildAddableRoomAgents({
  memberAgentIds: memberAgentIds.value,
  agents: agentsStore.agents,
}))

// The roster is names and emoji; without it every chip would be a bare id.
// The store self-guards against duplicate loads, so this is one fetch app-wide.
watch(() => props.sessionId, () => {
  menu.value = null
  showError('')
  if (!agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
}, { immediate: true })

function tooltip(entry: RoomMemberEntry): string {
  return formatRoomMemberTooltip(entry)
}

function showError(message: string): void {
  error.value = message
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = null
  if (!message) return
  errorTimer = setTimeout(() => { error.value = '' }, ERROR_LINGER_MS)
}

function anchorFor(event: MouseEvent): { x: number; y: number } {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  return rect ? { x: rect.left, y: rect.bottom + 4 } : { x: event.clientX, y: event.clientY }
}

/**
 * 左键:新房面下钻空间页,旧壳照旧开名册菜单。
 *
 * 下钻不新开 tab —— 右栏那个「成员」页签自己有两层,派事件时带上 agentId 就是
 * 直接落在下钻层(契约见 `workbench/room-members.ts`)。
 */
function handleChipClick(entry: RoomMemberEntry, event: MouseEvent): void {
  if (!props.openSpaceOnClick) {
    openMemberMenu(entry, event)
    return
  }
  showError('')
  window.dispatchEvent(new CustomEvent<OpenMembersDetail>(OPEN_MEMBERS_EVENT, {
    detail: { sessionId: props.sessionId, agentId: entry.id },
  }))
}

function openMemberMenu(entry: RoomMemberEntry, event: MouseEvent): void {
  showError('')
  // dm 房的名册只读:没有「移出群聊」(移走一个就没有房了),也没有「设为负责人」
  // (两个人的房间没有负责人这件事)。菜单整个不开,而不是开一个空菜单。
  if (isPairDm.value) return
  const items: ContextMenuItem[] = []
  // 墓碑(已退休 / 查无此人)不能被设为负责人 —— 只留「移出群聊」。
  if (!entry.isPm && !entry.isRetired) {
    items.push({ id: PROMOTE_ID, label: '设为负责人' })
  }
  items.push({
    id: REMOVE_ID,
    label: '移出群聊',
    danger: true,
    separatorBefore: items.length > 0,
  })
  menu.value = { ...anchorFor(event), items, agentId: entry.id }
}

function openAddMenu(event: MouseEvent): void {
  showError('')
  menu.value = {
    ...anchorFor(event),
    // A menu label is plain text, so it keeps the emoji even for an agent that
    // has a picture — a ContextMenuItem has nowhere to put an <img>.
    items: addableAgents.value.map(agent => ({
      id: `${ADD_PREFIX}${agent.id}`,
      label: agent.title
        ? `${agent.avatar || AGENT_AVATAR_FALLBACK} ${agent.name} · ${agent.title}`
        : `${agent.avatar || AGENT_AVATAR_FALLBACK} ${agent.name}`,
    })),
  }
}

function onMenuSelect(id: string): void {
  const agentId = menu.value?.agentId
  if (id.startsWith(ADD_PREFIX)) {
    void addMember(id.slice(ADD_PREFIX.length))
    return
  }
  if (!agentId) return
  if (id === REMOVE_ID) void removeMember(agentId)
  else if (id === PROMOTE_ID) void promoteMember(agentId)
}

async function addMember(agentId: string): Promise<void> {
  const next = planRoomMemberAdd(memberAgentIds.value, agentId)
  if (!next) return
  await commit({ memberAgentIds: next })
}

async function removeMember(agentId: string): Promise<void> {
  const outcome = planRoomMemberRemoval({
    memberAgentIds: memberAgentIds.value,
    pmAgentId: pmAgentId.value,
    agentId,
  })
  if ('error' in outcome) {
    showError(outcome.error)
    return
  }
  await commit(outcome.plan)
}

async function promoteMember(agentId: string): Promise<void> {
  await commit({ pmAgentId: agentId })
}

async function commit(update: {
  memberAgentIds?: string[]
  pmAgentId?: string | null
}): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const response = await platformApi.updateCollabRoom(props.sessionId, update)
    if (!response?.success) {
      showError(response?.error || '保存失败')
      return
    }
    await sessionsStore.loadSessions()
  } catch (cause) {
    showError(cause instanceof Error ? cause.message : String(cause))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.room-members {
  display: flex;
  align-items: center;
  min-width: 0;
  -webkit-app-region: no-drag;
}

/* 24px stamps on a hairline, overlapped so the row reads as one group.
   No fill, no shadow — the emoji is the identity, the ring is the frame. */
.member-chip {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 35%, transparent);
  border-radius: 50%;
  background: var(--ui-tab-bar-surface-bg, var(--ui-surface-app-bg, var(--bg)));
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.12s ease;
}

/* Picture avatars only: the emoji inherits the chip's own 13px and needs no
   rule of its own (that is the point of AgentAvatar not styling the emoji). */
.member-mark.agent-avatar-image {
  border-radius: 50%;
}

.member-chip + .member-chip {
  margin-left: -6px;
}

/* 双人紧凑形态(§4.3):不叠压。叠印是"一群人"的记号 —— 两个人并排站着就够了,
   而且中间那条 2px 的缝把「这是一对」说得比重叠更清楚。 */
.room-members.is-pair-dm .member-chip + .member-chip {
  margin-left: 2px;
}

/* 名册只读:去掉指针与 hover 提亮,免得看起来像个点得动的按钮。 */
.room-members.is-pair-dm .member-chip {
  cursor: default;
}

.room-members.is-pair-dm .member-chip:hover {
  border-color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 35%, transparent);
}

.member-chip:hover {
  border-color: var(--ui-text-primary-fg, var(--text));
  /* Lift by stacking order, not by size: §3.6 bans hover scaling. */
  z-index: 1;
}

/* 左键=下钻到这个人的空间时,hover 用 accent 环 —— 与私聊房头、消息署名头像
   同一句法(agent-space-workbench.md P3)。只在真会下钻的形态上给,
   旧壳里那颗只开名册菜单的成员堆保持原样,免得承诺一件不会发生的事。 */
.room-members.is-space-target .member-chip:hover {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.member-chip:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 1px;
}

/* The lead wears a firmer ring — the same "thicken the mark" register the
   member tick uses in the settings dialog. */
.member-chip.is-pm {
  border-color: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 70%, transparent);
}

/* 墓碑:已退休,或者花名册上一个查无此人的 id。照旧显示(才移得走),但虚描 +
   压暗 —— 它不会再说话了。 */
.member-chip.is-retired {
  border-style: dashed;
  opacity: 0.7;
}

/* The ＋ is not part of the overlap run — it is the affordance after it. This
   rule follows the `+` sibling rule deliberately: same specificity, later wins. */
.room-members .member-add {
  margin-left: 12px;
  border-style: dashed;
  border-color: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 35%, transparent);
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.member-add:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.member-error {
  max-width: 180px;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}
</style>
