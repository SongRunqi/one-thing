<template>
  <section class="members-workbench">
    <!-- 下钻层:空间页。**不新开 tab**(样板注明:空间页不占 tab 位),
         所以它就画在同一个面板里,靠一颗「返回成员」回到列表。 -->
    <div
      v-if="space"
      class="member-space"
    >
      <button
        v-if="canGoBack"
        type="button"
        class="space-back"
        @click="closeSpace"
      >
        <ChevronLeft
          :size="13"
          :stroke-width="2"
          aria-hidden="true"
        />
        返回成员
      </button>

      <div class="space-hero">
        <AgentAvatar
          class="space-avatar"
          :avatar="space.avatar"
          :avatar-image="space.avatarImage"
          :size="80"
        />
        <b class="space-name">{{ space.name }}</b>
        <i class="space-subtitle">{{ space.subtitle }}</i>
        <p
          v-if="space.description"
          class="space-desc"
        >
          {{ space.description }}
        </p>
      </div>

      <!-- 三档:「会话」就画在这儿(计数行),「文件 / 配置」是深面 ——
           它们已经在既有的 Agent 空间页里,点一下过去,不在右栏重做一遍。 -->
      <div class="space-tabs">
        <button
          v-for="face in SPACE_FACES"
          :key="face.key"
          type="button"
          class="space-tab"
          :class="{ 'is-on': face.key === 'sessions' }"
          @click="openDeepFace(face.key)"
        >
          {{ face.label }}
        </button>
      </div>

      <div class="space-rows">
        <button
          v-for="row in space.counts"
          :key="row.key"
          type="button"
          class="space-row"
          :title="`${row.label} · ${row.count}`"
          @click="openDeepFace('sessions')"
        >
          <component
            :is="COUNT_ICON[row.key]"
            class="space-row-icon"
            :size="14"
            :stroke-width="2"
            aria-hidden="true"
          />
          <span class="space-row-label">{{ row.label }}</span>
          <span class="space-row-count">{{ row.count }}</span>
        </button>
      </div>
    </div>

    <!-- 列表层:按在场分三段(在忙 / 空闲 / 已注销)。 -->
    <div
      v-else-if="groups.length"
      class="member-list"
    >
      <template
        v-for="group in groups"
        :key="group.key"
      >
        <div class="member-group-head">
          {{ group.label }} — {{ group.members.length }}
        </div>
        <button
          v-for="member in group.members"
          :key="member.id"
          type="button"
          class="member-row"
          :class="{ 'is-off': member.isRetired }"
          :title="`${member.name} · 打开空间`"
          @click="openSpace(member.id)"
        >
          <span class="member-mark-wrap">
            <AgentAvatar
              class="member-mark"
              :avatar="member.avatar"
              :avatar-image="member.avatarImage"
              :size="36"
            />
            <i
              class="member-dot"
              :class="{ 'is-busy': member.busy }"
              aria-hidden="true"
            />
          </span>
          <span class="member-text">
            <b class="member-name">{{ member.name }}</b>
            <i
              v-if="member.detail"
              class="member-detail"
            >{{ member.detail }}</i>
          </span>
        </button>
      </template>
    </div>

    <div
      v-else
      class="members-empty"
    >
      这间房还没有成员。
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 右栏「成员」tab —— 去复用重构 R2(样板 `docs/design/im-redesign/final.html`
 * 二 · 右栏三态)。
 *
 * 一个 tab 两层:**成员列表**(在忙/空闲/已注销)与它的**下钻层空间页**。
 * 下钻不新开 tab —— 样板写死了「空间页不占 tab 位」,所以它是这个组件内部的
 * 一个视图切换,返回键就在左上角。
 *
 * 数据一律复用既有口径,本组件不新增任何一份账:
 *  - 花名册 = `buildRoomMemberEntries`(房头成员堆同一份,含墓碑三态);
 *  - 在忙什么 = `findAgentDoingTask`(左栏活卡片同一份,W7);
 *  - 空间页计数 = `buildAgentHistory`(履历页同一份归类)。
 *
 * 深面(文件 / 配置)不在这里重做:它们已经是既有 Agent 空间页的两面,
 * 点一下走 `agentsStore.openAgentSpace` 过去。右栏给的是"这个人是谁 + 有多少
 * 账",不是第二个管理页。
 */
import { computed, ref, watch } from 'vue'
import { ChevronLeft, MessageSquare, PenLine, Terminal, Users } from 'lucide-vue-next'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { useAgentsStore, type AgentDetailTab } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { buildRoomMemberEntries } from '@/components/chat/room-member-strip'
import { buildAgentHistory } from '@/utils/agent-sessions'
import {
  buildRoomPresenceGroups,
  countRoomPresenceMembers,
} from './room-members'
import { buildAgentSpaceCounts, buildAgentSpaceSubtitle } from './agent-space'

const props = defineProps<{
  /** 房间会话 id —— 花名册与看板都挂在它身上。 */
  sessionId: string
  /** 直接下钻到这个人的空间页('' = 停在列表)。 */
  focusAgentId?: string
}>()

const emit = defineEmits<{
  /** 下钻/返回时回报给 tab,让 tab 的记忆与面板里看到的一致。 */
  focus: [agentId: string]
}>()

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()
const collabBoardStore = useCollabBoardStore()
collabBoardStore.ensureSubscribed()

const SPACE_FACES: ReadonlyArray<{ key: AgentDetailTab; label: string }> = [
  { key: 'sessions', label: '会话' },
  { key: 'files', label: '文件' },
  { key: 'config', label: '配置' },
]

const COUNT_ICON = {
  conversations: MessageSquare,
  rooms: Users,
  work: Terminal,
  pairDms: PenLine,
} as const

const activeAgentId = ref(props.focusAgentId || '')

watch(() => props.focusAgentId, id => {
  activeAgentId.value = id || ''
})

// 花名册是名字与头像的来源;看板是"在忙什么"的来源。两者都自带去重/自守,
// 冷启动时补一次就够。
watch(() => props.sessionId, sessionId => {
  if (!agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
  if (sessionId) void collabBoardStore.load(sessionId)
}, { immediate: true })

const room = computed(() => sessionsStore.sessions.find(item => item.id === props.sessionId)?.room)

const entries = computed(() => buildRoomMemberEntries({
  memberAgentIds: room.value?.memberAgentIds ?? [],
  agents: agentsStore.agents,
  pmAgentId: room.value?.pmAgentId,
}))

const groups = computed(() => buildRoomPresenceGroups({
  entries: entries.value,
  board: props.sessionId ? collabBoardStore.boardFor(props.sessionId) : null,
}))

/** 私聊房只有一个人,「返回成员」返回的是一张只有 TA 的表 —— 那颗键没有意义。 */
const canGoBack = computed(() => countRoomPresenceMembers(groups.value) > 1)

const space = computed(() => {
  const agentId = activeAgentId.value
  if (!agentId) return null
  const identity = agentsStore.displayAgent(agentId)
  const history = buildAgentHistory({
    presence: sessionsStore.agentPresence(agentId),
    directChats: sessionsStore.agentDirectChatSessions(agentId),
    sessions: sessionsStore.sessions,
  })
  return {
    id: agentId,
    name: identity.name,
    avatar: identity.avatar,
    avatarImage: identity.avatarImage,
    subtitle: buildAgentSpaceSubtitle(identity),
    description: (identity.description || '').trim(),
    counts: buildAgentSpaceCounts(history),
  }
})

function openSpace(agentId: string): void {
  if (!agentId) return
  activeAgentId.value = agentId
  emit('focus', agentId)
}

function closeSpace(): void {
  activeAgentId.value = ''
  emit('focus', '')
}

/** 深面(会话/文件/配置)= 既有 Agent 空间页,不在右栏重做。 */
function openDeepFace(tab: AgentDetailTab): void {
  const agentId = activeAgentId.value
  if (agentId) agentsStore.openAgentSpace(agentId, tab)
}
</script>

<style scoped>
.members-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

/* ── 列表层 ── */
.member-group-head {
  padding: 14px 18px 6px;
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 7px 18px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.member-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
}

.member-row.is-off {
  opacity: 0.5;
}

.member-mark-wrap {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
}

.member-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  border: 2px solid var(--ui-surface-panel-bg, var(--bg-panel));
}

.member-dot.is-busy {
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border-color: var(--ui-status-success-fg, var(--text-success));
}

.member-text {
  min-width: 0;
  line-height: 1.35;
}

.member-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-detail {
  display: block;
  font-style: normal;
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.members-empty {
  padding: 24px 18px;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

/* ── 下钻层:空间页 ── */
.space-back {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 11px 16px;
  border: 0;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  background: transparent;
  cursor: pointer;
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  text-align: left;
}

.space-back:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.space-hero {
  padding: 22px 18px 16px;
  text-align: center;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.space-avatar {
  margin: 0 auto 12px;
}

.space-name {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
}

.space-subtitle {
  display: block;
  margin-top: 3px;
  font-style: normal;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.space-desc {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ui-text-secondary-fg, var(--text));
  text-align: left;
}

.space-tabs {
  display: flex;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.space-tab {
  flex: 1;
  padding: 11px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.space-tab.is-on {
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  box-shadow: inset 0 -2px 0 var(--ui-text-primary-fg, var(--text));
}

.space-tab:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.space-rows {
  padding: 6px 0;
}

.space-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 18px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--ui-text-secondary-fg, var(--text));
  text-align: left;
}

.space-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.space-row-icon {
  flex-shrink: 0;
  color: var(--ui-text-muted-fg, var(--muted));
}

.space-row-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-row-count {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg, var(--muted));
}
</style>
