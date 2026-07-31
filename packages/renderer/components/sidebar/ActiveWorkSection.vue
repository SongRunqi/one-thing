<template>
  <!-- 没有在跑的活 = 整区不显示(2026-07-31 真机后用户拍板,推翻 §7 开放问题里
       「塌陷成一行」的旧倾向)。判定在 `sidebar-sections.ts`,这里只听结果。 -->
  <div
    v-if="visible"
    class="sidebar-active-work"
  >
    <button
      type="button"
      class="active-work-header sidebar-section-toggle"
      :aria-expanded="!collapsed"
      @click="$emit('toggle')"
    >
      <span
        class="sidebar-section-caret"
        :class="{ open: !collapsed }"
        aria-hidden="true"
      >›</span>
      <span class="active-work-label">进行中</span>
      <span class="active-work-count">{{ cards.length }}</span>
    </button>

    <template v-if="!collapsed">
      <ActiveWorkCard
        v-for="card in cards"
        :key="card.taskId"
        :card="card"
        :busy="isRoomBusy(card.roomSessionId)"
        :unread="isRoomUnread(card.roomSessionId)"
        :active="card.roomSessionId === openedSessionId"
        @open="$emit('open', $event)"
      />
    </template>
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
import { shouldShowActiveWorkSection } from './sidebar-sections'
import type { ActiveWorkCardModel } from './active-work'

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false })

defineEmits<{ open: [card: ActiveWorkCardModel]; toggle: [] }>()

const sessionsStore = useSessionsStore()
const { cards, isRoomBusy, isRoomUnread } = useActiveWork()

/* 挂载与否是 `Sidebar.vue` 的门(带着一次看板取数,CSS 关不住 IPC);
   露不露面是这一句。 */
const visible = computed(() => shouldShowActiveWorkSection({ cardCount: cards.value.length }))

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

/* 分区头即折叠钮。画线风里"可折叠"由一枚发丝 caret 说,不加边框不加填充 ——
   与群聊/联系人两区共用同一句法(`.sidebar-section-toggle`,那份写在
   Sidebar.vue;scoped CSS 够不到子组件内部,所以这里自带一份)。 */
.active-work-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 4px 4px 0;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.sidebar-section-caret {
  display: inline-block;
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 1;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg, var(--text-muted)));
  transition: transform 0.12s ease;
}

.sidebar-section-caret.open {
  transform: rotate(90deg);
}

.active-work-header:hover .active-work-label,
.active-work-header:hover .sidebar-section-caret {
  color: var(--ui-text-primary-fg, var(--text-primary, var(--text)));
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

/* 空态那一行(`.active-work-empty`)已随「没有活就整区不显示」一同撤除。 */
</style>
