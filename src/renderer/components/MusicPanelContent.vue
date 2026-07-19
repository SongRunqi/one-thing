<template>
  <div class="music-workspace">
    <!-- The station's vitals, drawn as a ledger block. -->
    <section class="music-station">
      <span class="station-frame-label">RADIO</span>
      <div class="station-row">
        <span class="station-key">状态</span>
        <span class="station-value">{{ stationStatus }}</span>
      </div>
      <div
        v-if="radio.intent"
        class="station-row"
      >
        <span class="station-key">本台</span>
        <span
          class="station-value"
          :title="radio.intent"
        >{{ radio.intent }}</span>
      </div>
      <div class="station-row">
        <span class="station-key">节目单</span>
        <span class="station-value">剩 {{ radio.programmeLength }} 首<template v-if="radio.upNext"> · 接下来:{{ radio.upNext }}</template></span>
      </div>
      <div
        v-if="radio.lastError"
        class="station-row station-error"
      >
        <span class="station-key">⚠</span>
        <span class="station-value">{{ radio.lastError }}</span>
      </div>
    </section>

    <!-- The programme, visible and editable: ✕ is the strongest taste signal
         (recorded as skipped — the DJ steers away next batch); ⏫ makes it the
         next song; rows drag to reorder. -->
    <section class="music-programme">
      <div class="music-sessions-title">
        节目单
      </div>

      <!-- 点歌:搜索 → 点一首可播的 → 插队为下一首。 -->
      <div
        v-if="radio.active"
        class="request-box"
      >
        <input
          v-model="requestQuery"
          class="request-input"
          type="text"
          spellcheck="false"
          placeholder="点歌:歌名 歌手,回车搜索"
          @keydown.enter.prevent="doSearch"
        >
        <p
          v-if="requestFeedback"
          class="request-feedback"
        >
          {{ requestFeedback }}
        </p>
        <div
          v-if="searchResults.length > 0"
          class="request-results"
        >
          <button
            v-for="(record, index) in searchResults"
            :key="index"
            type="button"
            class="request-result"
            :class="{ 'is-grey': record.playFlag === false }"
            :disabled="record.playFlag === false || requesting"
            :title="record.playFlag === false ? '无播放版权' : '插队为下一首'"
            @click="pick(record)"
          >
            <span class="request-result-title">{{ record.title }}<template v-if="record.artist"> - {{ record.artist }}</template></span>
            <span
              v-if="record.playFlag === false"
              class="programme-grey-badge"
            >版权受限</span>
          </button>
        </div>
      </div>

      <p
        v-if="programme.length === 0"
        class="music-sessions-empty"
      >
        节目单空着——DJ 会在低水位时自动补歌。
      </p>
      <div
        v-for="(entry, index) in programme"
        :key="entry.encryptedId"
        class="programme-row"
        :class="{ 'is-grey': entry.playFlag === false, 'is-drop-target': dropIndex === index }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent="dropIndex = index"
        @dragleave="dropIndex === index && (dropIndex = null)"
        @drop.prevent="onDrop(index)"
        @dragend="onDragEnd"
      >
        <span class="programme-index">{{ index + 1 }}</span>
        <span class="programme-main">
          <span
            class="programme-title"
            :title="entry.title"
          >{{ entry.title }}<span
            v-if="entry.note"
            class="programme-note"
          > · {{ entry.note }}</span><span
            v-if="entry.playFlag === false"
            class="programme-grey-badge"
          >版权受限</span></span>
          <span
            v-if="entry.say"
            class="programme-say"
            :title="entry.say"
          >◈ {{ entry.say }}</span>
        </span>
        <span class="programme-actions">
          <button
            type="button"
            class="programme-btn"
            title="下一首就放"
            :disabled="index === 0"
            @click="act({ kind: 'promote', encryptedId: entry.encryptedId })"
          >⏫</button>
          <button
            type="button"
            class="programme-btn"
            title="不想听(DJ 会避开这类)"
            @click="act({ kind: 'remove', encryptedId: entry.encryptedId })"
          >✕</button>
        </span>
      </div>
    </section>

    <!-- The DJ's working sessions — curation logs, hidden from the public
         session list. Clicking one opens it in the main chat view: the whole
         point is reusing the chat UI, not rebuilding it. -->
    <section class="music-sessions">
      <div class="music-sessions-title">
        编排记录
      </div>
      <p
        v-if="radioSessions.length === 0"
        class="music-sessions-empty"
      >
        还没有电台会话——在对话里说「放点歌,一直放着」就会开台。
      </p>
      <button
        v-for="session in radioSessions"
        :key="session.id"
        type="button"
        class="music-session-row"
        :class="{ 'is-current': session.id === sessionsStore.currentSessionId }"
        @click="openSession(session.id)"
      >
        <span class="music-session-name">{{ session.name || '电台' }}</span>
        <span class="music-session-time">{{ sessionClock(session.updatedAt) }}</span>
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { MusicProgrammeActionRequest, MusicSearchRecordDTO } from '@/types'
import { useMusicStore } from '@/stores/music'
import { useSessionsStore } from '@/stores/sessions'

const musicStore = useMusicStore()
const sessionsStore = useSessionsStore()

const radio = computed(() => musicStore.radio)
const programme = computed(() => musicStore.programme)
const radioSessions = computed(() => sessionsStore.radioSessions)

onMounted(() => {
  void musicStore.refreshProgramme()
})

function act(action: MusicProgrammeActionRequest['action']) {
  void musicStore.programmeAction(action)
}

// --- 点歌 ------------------------------------------------------------------
const requestQuery = ref('')
const searchResults = ref<MusicSearchRecordDTO[]>([])
const requestFeedback = ref('')
const requesting = ref(false)

async function doSearch() {
  const query = requestQuery.value.trim()
  if (!query) return
  requestFeedback.value = '搜索中…'
  searchResults.value = []
  const response = await musicStore.searchSongs(query)
  if (!response.success) {
    requestFeedback.value = response.error ?? '搜索失败'
    return
  }
  searchResults.value = response.records ?? []
  requestFeedback.value = searchResults.value.length === 0 ? `没搜到「${query}」` : ''
}

async function pick(record: MusicSearchRecordDTO) {
  requesting.value = true
  try {
    const query = record.artist ? `${record.title} ${record.artist}` : record.title
    const response = await musicStore.requestSongNext(query)
    if (response.success) {
      requestFeedback.value = `「${response.title ?? query}」将在下一首播出`
      searchResults.value = []
      requestQuery.value = ''
    } else {
      requestFeedback.value = response.error ?? '点歌失败'
    }
  } finally {
    requesting.value = false
  }
}

// --- drag to reorder -------------------------------------------------------
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(index: number) {
  const from = dragIndex.value
  dropIndex.value = null
  dragIndex.value = null
  if (from === null || from === index) return
  const entry = programme.value[from]
  if (!entry) return
  // The main-side move re-inserts AFTER removing, so dropping below the
  // origin needs no off-by-one correction: toIndex is the final position.
  act({ kind: 'move', encryptedId: entry.encryptedId, toIndex: index })
}

function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

const stationStatus = computed(() => {
  const nowPlaying = musicStore.nowPlaying
  if (nowPlaying?.status === 'playing') return `播放中「${nowPlaying.title ?? '未知曲目'}」`
  if (nowPlaying?.status === 'paused') return `已暂停「${nowPlaying.title ?? '未知曲目'}」`
  if (radio.value.active) return radio.value.canResume ? '待命(可从状态栏继续)' : '待命(等 DJ 编排)'
  return '关台'
})

function sessionClock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function openSession(sessionId: string) {
  void sessionsStore.switchSession(sessionId)
}
</script>

<style scoped>
.music-workspace {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Ledger block, same vocabulary as the composer's music bar. */
.music-station {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);
  border-radius: 3px;
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.station-frame-label {
  position: absolute;
  top: -7px;
  left: 12px;
  padding: 0 6px;
  background: var(--ui-surface-chat-bg, var(--bg-chat, var(--bg)));
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  user-select: none;
}

.station-row {
  display: flex;
  gap: 10px;
  min-width: 0;
  font-size: 12.5px;
}

.station-key {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  padding-top: 1px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.station-value {
  min-width: 0;
  color: var(--ui-text-strong-fg, var(--text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.station-error .station-value {
  color: var(--ui-text-muted-fg, var(--muted));
  white-space: normal;
}

.music-programme {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}

.request-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.request-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 40%, transparent);
  border-radius: 3px;
  background: transparent;
  color: var(--ui-text-strong-fg, var(--text));
  font-size: 12.5px;
  padding: 6px 8px;
  outline: none;
}

.request-input:focus {
  border-color: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 70%, transparent);
}

.request-feedback {
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  margin: 0;
}

.request-results {
  display: flex;
  flex-direction: column;
  border: 1px dashed color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 30%, transparent);
  border-radius: 3px;
  max-height: 180px;
  overflow-y: auto;
}

.request-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  color: var(--ui-text-strong-fg, var(--text));
  min-width: 0;
  flex-shrink: 0;
}

.request-result:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 12%, transparent);
}

.request-result.is-grey,
.request-result:disabled {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  cursor: default;
}

.request-result-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.programme-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 8px;
  border-bottom: 1px dashed color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 18%, transparent);
  border-radius: 3px;
  min-width: 0;
  cursor: grab;
  flex-shrink: 0;
}

.programme-row:active {
  cursor: grabbing;
}

.programme-row.is-drop-target {
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 14%, transparent);
}

.programme-row.is-grey .programme-title {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  text-decoration: line-through;
}

.programme-index {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  padding-top: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-variant-numeric: tabular-nums;
  min-width: 14px;
  text-align: right;
}

.programme-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.programme-title {
  font-size: 12.5px;
  color: var(--ui-text-strong-fg, var(--text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.programme-note {
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-size: 11px;
}

.programme-grey-badge {
  margin-left: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 40%, transparent);
  border-radius: 2px;
  padding: 0 4px;
}

.programme-say {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.programme-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.programme-row:hover .programme-actions {
  opacity: 1;
}

.programme-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 3px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.programme-btn:hover:not(:disabled) {
  color: var(--ui-text-strong-fg, var(--text));
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 16%, transparent);
}

.programme-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.music-sessions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}

.music-sessions-title {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  padding-bottom: 6px;
  border-bottom: 1px dashed color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 24%, transparent);
  margin-bottom: 6px;
}

.music-sessions-empty {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.music-session-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 8px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: 3px;
  min-width: 0;
}

.music-session-row:hover {
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 12%, transparent);
}

.music-session-row.is-current .music-session-name {
  color: var(--ui-text-strong-fg, var(--text));
}

.music-session-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-session-time {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  font-variant-numeric: tabular-nums;
}
</style>
