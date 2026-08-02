<template>
  <section class="room-board-workbench">
    <div
      v-if="groups.length"
      class="board-rows"
    >
      <template
        v-for="group in groups"
        :key="group.key"
      >
        <div class="board-group-head">
          {{ group.label }} — {{ group.rows.length }}
        </div>
        <button
          v-for="row in group.rows"
          :key="row.taskId"
          type="button"
          class="board-row"
          :class="{ 'is-off': row.isRetired, 'is-idle': !row.workSessionId }"
          :disabled="!row.workSessionId"
          :title="rowTitle(row)"
          @click="openRow(row)"
        >
          <AgentAvatar
            class="board-row-mark"
            :avatar="row.avatar"
            :avatar-image="row.avatarImage"
            :size="28"
          />
          <span class="board-row-text">
            <b class="board-row-title">{{ row.title }}</b>
            <i
              v-if="row.detail"
              class="board-row-sub"
            >{{ row.detail }}</i>
          </span>
          <span class="board-row-meta">
            <i
              v-if="row.running"
              class="board-row-dot"
              aria-hidden="true"
            />
            <time v-if="row.meta">{{ row.meta }}</time>
          </span>
        </button>
      </template>
    </div>

    <div
      v-else
      class="board-empty"
    >
      <p class="board-empty-title">
        {{ ROOM_BACKSTAGE_EMPTY.boardTitle }}
      </p>
      <p class="board-empty-hint">
        {{ ROOM_BACKSTAGE_EMPTY.boardHint }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 房间背台的「看板」格 —— **窄栏行式**(样板 right-panel.html 一 · 看板)。
 *
 * 既有的 `CollabBoardPanel.vue` 是三列卡片,250px 的右栏里塞不下;这里换成
 * 分组 + 单行,**同一份数据**(`CollabTask`),`CollabBoardPanel.vue` 不动
 * ——它还服务直聊/工程面下的「看板」页签。
 *
 * 本组件不新增任何一份账(纯逻辑在 `room-board.ts`):
 *  - 卡 = `collabBoard` store 的 `boardFor(roomSessionId)`;
 *  - 待你 = `hasPendingAsk` + `CollabTask.status`(`resolveActiveWorkTag` 一处判定);
 *  - 署名 = `agentsStore.displayAgent`(墓碑三态在它里面);
 *  - 在跑 = chat store 的 `isSessionGenerating`。
 *
 * 点一行 = 打开这张卡最新那次执行(右栏切到「线程」格并下钻)。没开过工作台的卡
 * 点不动 —— 那一行没有可以打开的现场,给它一个假入口比禁用更糟。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { buildRoomBoardGroups, type RoomBoardRow } from './room-board'
import { ROOM_BACKSTAGE_EMPTY } from './room-backstage'

const props = defineProps<{
  /** 这间房。空串 = 无从谈起,画空态。 */
  roomSessionId: string
}>()

const emit = defineEmits<{
  /** 打开这张卡最新那次执行(宿主把分段器切到「线程」格并下钻)。 */
  openThread: [workSessionId: string]
}>()

const agentsStore = useAgentsStore()
const chatStore = useChatStore()
const collabBoardStore = useCollabBoardStore()
collabBoardStore.ensureSubscribed()

watch(() => props.roomSessionId, sessionId => {
  if (!agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
  if (sessionId) void collabBoardStore.load(sessionId)
}, { immediate: true })

/** 一处计时:整块板一个定时器,不是每行各起一个(与线程列表同一手法)。 */
const NOW_TICK_MS = 60_000
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, NOW_TICK_MS)
onUnmounted(() => clearInterval(timer))

const board = computed(() => (props.roomSessionId ? collabBoardStore.boardFor(props.roomSessionId) : null))

const groups = computed(() => buildRoomBoardGroups({
  tasks: board.value?.tasks ?? [],
  identity: agentId => agentsStore.displayAgent(agentId),
  awaitingPermission: workSessionId => collabBoardStore.hasPendingAsk(workSessionId),
  isRunning: workSessionId => chatStore.isSessionGenerating(workSessionId),
  now: now.value,
}))

defineExpose({ groups })

function rowTitle(row: RoomBoardRow): string {
  const who = row.name ? ` · ${row.name}` : ''
  return row.workSessionId ? `${row.title}${who} —— 打开线程` : `${row.title}${who}`
}

function openRow(row: RoomBoardRow): void {
  if (!row.workSessionId) return
  emit('openThread', row.workSessionId)
}
</script>

<style scoped>
.room-board-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.board-rows {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden auto;
  padding: 4px 0 10px;
}

.board-group-head {
  padding: 12px 12px 3px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
}

/* 行三栏:头像(定宽)/ 文字(可缩,截断)/ 右端(定宽,不换行)。
   250px 下必须成立 —— 两侧 `flex: 0 0 auto`,中间 `min-width: 0`,
   否则右端会把名字挤没(上一次页签事故的同一个根因)。 */
.board-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 7px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.board-row:hover:not(:disabled) {
  background: var(--ui-state-hover-bg, var(--hover));
}

.board-row:disabled {
  cursor: default;
}

.board-row.is-off {
  opacity: 0.5;
}

.board-row-mark {
  flex: 0 0 auto;
}

.board-row-text {
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.35;
}

.board-row-title {
  display: block;
  overflow: hidden;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-row-sub {
  display: block;
  overflow: hidden;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-row-meta {
  flex: 0 0 auto;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.board-row-dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ui-status-success-fg, var(--color-success, #4d6108));
}

.board-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  text-align: center;
}

.board-empty-title {
  color: var(--ui-text-secondary-fg, var(--text));
  font-size: 12.5px;
}

.board-empty-hint {
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  line-height: 1.7;
}
</style>
