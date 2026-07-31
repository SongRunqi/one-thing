<template>
  <div class="sidebar-active-work">
    <div class="active-work-header">
      <span class="active-work-label">进行中</span>
      <span
        v-if="cards.length > 0"
        class="active-work-count"
      >{{ cards.length }}</span>
      <!-- 空态塌陷成一行(§7 开放问题的取舍):没有在跑的活时整区只剩这一行,
           既不留一块空白,也不整段消失 —— 第一区是外壳的骨架,不该随数据来去。 -->
      <span
        v-else
        class="active-work-empty"
      >没有在跑的活</span>
    </div>

    <ActiveWorkCard
      v-for="card in cards"
      :key="card.taskId"
      :card="card"
      :busy="isRoomBusy(card.roomSessionId)"
      :unread="isRoomUnread(card.roomSessionId)"
      :active="card.roomSessionId === openedSessionId"
      @open="$emit('open', $event)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 左栏第一区「进行中」(C1,docs/design/im-workbench-layout.md §3 W1)。
 *
 * 顺序即优先级:这一区排在群聊/同事/直聊之前 —— 跟一群 agent 说话,本质是在盯
 * 一堆活,所以先看活,再看话。
 *
 * 这一层只做编排:清单与在场信号全部来自 `useActiveWork`(取数)与
 * `active-work.ts`(判定),卡片的三种状态由 `ActiveWorkCard` 一份模板画完。
 */
import { computed } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import ActiveWorkCard from './ActiveWorkCard.vue'
import { useActiveWork } from './useActiveWork'
import type { ActiveWorkCardModel } from './active-work'

defineEmits<{ open: [card: ActiveWorkCardModel] }>()

const sessionsStore = useSessionsStore()
const { cards, isRoomBusy, isRoomUnread } = useActiveWork()

/* 只读。变量名刻意不叫 `currentSessionId` —— 那个名字的赋值是
   stores/sessions.ts 的专属(workspace-ownership.test.ts 那道围栏)。 */
const openedSessionId = computed(() => sessionsStore.currentSessionId)
</script>

<style scoped>
/* 分区容器与联系人/群聊两区同一套画线风(Sidebar.vue 的 `.sidebar-rooms`)。
   这里自带一份是因为 scoped CSS 只够到子组件的根节点,够不到它的内部。 */
.sidebar-active-work {
  flex-shrink: 0;
  padding: 2px 12px 6px 24px;
  display: flex;
  flex-direction: column;
}

.active-work-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 0;
}

.active-work-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  user-select: none;
}

.active-work-count {
  font-size: 10px;
  opacity: 0.7;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  user-select: none;
}

/* 空态那一行:比分区标签再淡一档,它是个说明不是个标题。 */
.active-work-empty {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  opacity: 0.55;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  user-select: none;
}
</style>
