<template>
  <section class="members-workbench">
    <!-- 下钻层:空间页。**不新开 tab**(样板注明:空间页不占 tab 位),
         所以它就画在同一个面板里,靠一颗「返回成员」回到列表。
         四面(配置/会话/文件/搜索)由共享的 AgentSpace 就地渲染 —— 深面不再
         跳去 Agents 管理页(agent-space-workbench.md P2)。 -->
    <AgentSpace
      v-if="activeAgentId"
      :agent-id="activeAgentId"
      :show-back="canGoBack"
      :back-label="`返回成员(${memberCount})`"
      :initial-tab="initialTab"
      :work="activeWork"
      @back="closeSpace"
      @open-session="(id: string) => emit('open-session', id)"
      @open-file="(path: string) => emit('open-file', path)"
      @open-thread="(id: string, title: string) => emit('open-thread', id, title)"
    />

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
          <span class="member-mark-wrap agent-open-target">
            <AgentAvatar
              class="member-mark"
              :avatar="member.avatar"
              :avatar-image="member.avatarImage"
              :size="36"
            />
            <!-- 在场点。`is-busy` 保留(样板的空/实两态),`is-<presence>`
                 再给三色 —— 三件不同的事在 D8 之前是同一个"在忙"。 -->
            <i
              class="member-dot"
              :class="[{ 'is-busy': member.busy }, `is-${member.presence}`]"
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
 *  - **在场** = `resolveRoomMemberPresence`(房头四态徽标同一份,D8 §4.4)——
 *    读 collabBoard 的 agents 账,不再从看板 doing 卡现算;
 *  - **在做哪张卡** = `findAgentDoingTask`(左栏活卡片同一份,W7)。
 *    这两件事在 D8 之前是同一个判据,而它在两个方向上都会撒谎(见
 *    `chat/agent-activity.ts` 的文件头)。
 *
 * 下钻层本身是共享的 `AgentSpace`(agent-space-workbench.md P2):配置/会话/
 * 文件/搜索/大脑五面**就地渲染**,不再 `openAgentSpace` 跳去 Agents 管理页。行的
 * 落点由这个组件转给右栏宿主 —— 会话去主区页签,文件去右栏文件页签。
 */
import { computed, ref, watch } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { useAgentsStore, type AgentDetailTab } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabBoardStore } from '@/stores/collabBoard'
import {
  buildRoomMemberEntries,
  resolveRoomMemberPresence,
} from '@/components/chat/room-member-strip'
import { findAgentDoingTask } from '@/components/chat/agent-activity'
import AgentSpace from '@/components/agents/AgentSpace.vue'
import {
  buildRoomPresenceGroups,
  countRoomPresenceMembers,
} from './room-members'

const props = defineProps<{
  /** 房间会话 id —— 花名册与看板都挂在它身上。 */
  sessionId: string
  /** 直接下钻到这个人的空间页('' = 停在列表)。 */
  focusAgentId?: string
  /** 下钻后先停在哪一面(不给就是「配置」)。 */
  focusTab?: AgentDetailTab | null
}>()

const emit = defineEmits<{
  /** 下钻/返回时回报给 tab,让 tab 的记忆与面板里看到的一致。 */
  focus: [agentId: string]
  /** 空间页里的行:会话去主区页签,文件/线程去右栏 —— 都由宿主落地。 */
  'open-session': [sessionId: string]
  'open-file': [filePath: string]
  'open-thread': [workSessionId: string, title: string]
}>()

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()
const collabBoardStore = useCollabBoardStore()
collabBoardStore.ensureSubscribed()

const activeAgentId = ref(props.focusAgentId || '')

watch(() => props.focusAgentId, id => {
  activeAgentId.value = id || ''
})

const initialTab = computed<AgentDetailTab | null>(() => props.focusTab ?? null)

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

const board = computed(() => (props.sessionId ? collabBoardStore.boardFor(props.sessionId) : null))

/**
 * 在场判定读 collabBoard 的 agents 账(D8 §4.4)—— 不再从看板 doing 卡现算。
 * 补水每人一次,之后跟着 `collab:agent-changed` 走。
 */
watch(() => entries.value.map(entry => entry.id).join(','), () => {
  const agentIds = entries.value.filter(entry => !entry.isRetired).map(entry => entry.id)
  if (agentIds.length > 0) collabBoardStore.ensureAgentActivity(agentIds)
}, { immediate: true })

const groups = computed(() => buildRoomPresenceGroups({
  entries: entries.value,
  board: board.value,
  presence: agentId => resolveRoomMemberPresence(collabBoardStore.agentActivityFor(agentId)),
}))

const memberCount = computed(() => countRoomPresenceMembers(groups.value))

/** 私聊房只有一个人,「返回成员」返回的是一张只有 TA 的表 —— 那颗键没有意义。 */
const canGoBack = computed(() => memberCount.value > 1)

/** 下钻的这个人正在干的活(W7 同一份判定):副标题的「在忙」与「看线程」都靠它。 */
const activeWork = computed(() => {
  const agentId = activeAgentId.value
  if (!agentId) return null
  return findAgentDoingTask(board.value, agentId)
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

/* 三色分别是三件不同的事(D8 §4.4):真在写字 / 拿着牌还没开始 / 在干一张卡的活。
   顺序在 is-busy 之后,同特异性后来居上。 */
.member-dot.is-holding {
  border-color: var(--ui-status-warning-fg, var(--color-warning, #b3711f));
}

.member-dot.is-working {
  border-color: var(--ui-accent-primary-fg, var(--accent));
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

/* 下钻层的样式在 components/agents/AgentSpace.vue —— 那一层现在是共享件。 */

/* 头像的「可点」提示(agent-space-workbench.md P3):静止态与今天完全一致,
   hover 只垫一层软阴影的立体感 —— 不描色、不缩放(§3.6)。
   四处头像共用同一句法。 */
.member-mark-wrap.agent-open-target {
  border-radius: 50%;
  transition: box-shadow 0.16s ease;
}

.member-row:hover .member-mark-wrap.agent-open-target {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 22%, transparent);
}
</style>
