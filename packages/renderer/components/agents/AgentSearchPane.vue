<template>
  <div class="editor-scroll">
    <div class="editor-body agent-search">
      <div class="agent-field">
        <input
          v-model="searchQuery"
          class="ledger-input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          :placeholder="`在与${agentName || 'TA'}的会话里找…`"
        >
        <p class="field-hint">
          只匹配会话名、群名与卡标题。消息全文搜索是后续能力。
        </p>
      </div>

      <section class="agent-field">
        <div class="prompt-header">
          <span class="field-label">结果</span>
          <span
            v-if="searchResults.length > 0"
            class="prompt-counter"
          >{{ searchResults.length }}</span>
        </div>

        <p
          v-if="!searchQuery.trim()"
          class="field-hint"
        >
          输入关键词开始查找。
        </p>
        <p
          v-else-if="searchResults.length === 0"
          class="field-hint"
        >
          没有匹配的会话。
        </p>
        <ol
          v-else
          class="history-rows"
        >
          <li
            v-for="row in searchResults"
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
            </button>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 「搜索」面(agent-im-chat-ui.md §3.2)= **本地过滤**:范围与「会话」面同一
 * 口径(presence ∪ 直聊),匹配会话名 / 群名 / 卡标题 —— 会话元数据本来就在
 * 手里,不加载一条消息正文。消息全文检索是后续能力,所以这里明说,不做假全文。
 */
import { computed, ref, toRef, watch } from 'vue'
import { useAgentHistory, historyRowTitle, formatUpdated } from './use-agent-history'
import '@/styles/agent-space.css'

const props = defineProps<{
  agentId: string
  agentName?: string
}>()

const emit = defineEmits<{
  'open-session': [sessionId: string]
}>()

const { history, ensureBoardData } = useAgentHistory(toRef(props, 'agentId'))

const searchQuery = ref('')

watch(() => props.agentId, () => {
  ensureBoardData()
  /* 换人就清掉上一次的搜索词 —— 结果集换了,词留着会读成"这个人也搜过这个"。 */
  searchQuery.value = ''
}, { immediate: true })

const searchableRows = computed(() => {
  const value = history.value
  const rows = [
    ...value.conversations.map(row => ({ row, extra: '' })),
    ...value.rooms.map(row => ({ row, extra: '' })),
    ...value.pairDms.map(row => ({ row, extra: '' })),
    ...value.work.flatMap(group => group.rows.map(row => ({ row, extra: group.title }))),
  ]
  const seen = new Set<string>()
  return rows
    .filter(({ row }) => {
      if (seen.has(row.sessionId)) return false
      seen.add(row.sessionId)
      return true
    })
    .map(({ row, extra }) => ({
      ...row,
      note: extra || row.note,
      haystack: `${row.label} ${row.note} ${extra}`.toLowerCase(),
    }))
})

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return searchableRows.value
    .filter(row => row.haystack.includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt)
})
</script>
