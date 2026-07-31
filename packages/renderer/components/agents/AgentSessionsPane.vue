<template>
  <div class="editor-scroll">
    <div class="editor-body agent-history">
      <section
        v-for="column in historyColumns"
        :key="column.key"
        class="agent-field history-column"
      >
        <div class="prompt-header">
          <span class="field-label">{{ column.label }}</span>
          <span
            v-if="column.rows.length > 0"
            class="prompt-counter"
          >{{ column.rows.length }}</span>
        </div>

        <template v-if="column.rows.length === 0">
          <p class="field-hint">
            {{ column.empty }}
          </p>
          <button
            v-if="column.key === 'conversations'"
            class="text-action"
            type="button"
            :disabled="openingDm"
            @click="startDm"
          >
            {{ openingDm ? '打开中…' : '发起对话' }}
          </button>
        </template>

        <ol
          v-else
          class="history-rows"
        >
          <li
            v-for="row in column.rows"
            :key="row.sessionId"
          >
            <button
              class="history-line"
              type="button"
              :title="historyRowTitle(row)"
              @click="emit('open-session', row.sessionId)"
            >
              <span class="history-name">{{ row.label }}</span>
              <span
                v-if="row.note"
                class="history-note"
              >{{ row.note }}</span>
              <span
                v-if="row.updatedAt > 0"
                class="history-meta"
              >{{ formatUpdated(row.updatedAt) }}</span>
              <span
                v-if="row.messageCount > 0"
                class="history-meta history-count"
              >{{ row.messageCount }} 条</span>
            </button>
          </li>
        </ol>
      </section>

      <!-- 干过的活:按卡分组。卡状态不入这份快照(Q4 纪律,状态一律现查),
           标题查不到就退到短号 —— 宁可少说,不能说错。 -->
      <section class="agent-field history-column">
        <div class="prompt-header">
          <span class="field-label">干过的活</span>
          <span
            v-if="history.work.length > 0"
            class="prompt-counter"
          >{{ history.work.length }}</span>
        </div>
        <p
          v-if="history.work.length === 0"
          class="field-hint"
        >
          还没有开过工作台。
        </p>
        <template v-else>
          <div
            v-for="group in history.work"
            :key="group.taskId || group.rows[0]?.sessionId"
            class="history-group"
          >
            <span class="history-group-title">{{ group.title }}</span>
            <ol class="history-rows">
              <li
                v-for="row in group.rows"
                :key="row.sessionId"
              >
                <button
                  class="history-line"
                  type="button"
                  :title="historyRowTitle(row)"
                  @click="emit('open-session', row.sessionId)"
                >
                  <span class="history-name">{{ row.label }}</span>
                  <span
                    v-if="row.updatedAt > 0"
                    class="history-meta"
                  >{{ formatUpdated(row.updatedAt) }}</span>
                  <span
                    v-if="row.messageCount > 0"
                    class="history-meta history-count"
                  >{{ row.messageCount }} 条</span>
                </button>
              </li>
            </ol>
          </div>
        </template>
      </section>

      <p
        v-if="dmError"
        class="field-hint"
      >
        {{ dmError }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 「会话」面(agent-im-dm.md §4.2)。四栏全部 renderer 端现算,归类口径在
 * `useAgentHistory`,这里只画。退休的 agent 照常可读 —— 历史正是保留身份面的
 * 全部意义。
 *
 * 管理页与右栏空间页挂的是同一个组件(agent-space-workbench.md P0):行去哪
 * 由宿主决定(`open-session`),所以右栏点一行是"主区开页签、右栏原地不动",
 * 管理页点一行是"开会话并合上自己"。
 */
import { computed, toRef, watch } from 'vue'
import { useAgentHistory, historyRowTitle, formatUpdated } from './use-agent-history'
import { useAgentDmOpener } from './use-agent-dm'
import '@/styles/agent-space.css'

const props = defineProps<{
  agentId: string
  /** 空态文案里的称呼;缺省用「TA」。 */
  agentName?: string
}>()

const emit = defineEmits<{
  'open-session': [sessionId: string]
}>()

const { history, ensureBoardData } = useAgentHistory(toRef(props, 'agentId'))
const { openingDm, dmError, openDmRoom } = useAgentDmOpener()

watch(() => props.agentId, ensureBoardData, { immediate: true })

const historyColumns = computed(() => [
  {
    key: 'conversations',
    label: '与你的对话',
    rows: history.value.conversations,
    empty: `还没和${props.agentName || 'TA'}聊过`,
  },
  {
    key: 'rooms',
    label: '群聊',
    rows: history.value.rooms,
    empty: '还没有在任何群里跑过回合。',
  },
  {
    key: 'pairDms',
    label: '私下',
    rows: history.value.pairDms,
    empty: '还没有和别的同事私下聊过。',
  },
])

async function startDm(): Promise<void> {
  const sessionId = await openDmRoom(props.agentId)
  if (sessionId) emit('open-session', sessionId)
}
</script>
