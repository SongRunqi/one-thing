<template>
  <div class="practice-panel">
    <!-- 参数:菜单只放动词,所有设置住在这里(菜单「参数与账页 ›」直达) -->
    <section class="params">
      <h4>参数</h4>
      <div class="param-row">
        <span class="param-name">凯格尔</span>
        <span class="param-body">
          收 <input
            class="num"
            :value="kegelConfig.holdSec"
            @change="onKegelParam('holdSec', $event)"
          >″
          · 放 <input
            class="num"
            :value="kegelConfig.relaxSec"
            @change="onKegelParam('relaxSec', $event)"
          >″
          · 每组 <input
            class="num"
            :value="kegelConfig.reps"
            @change="onKegelParam('reps', $event)"
          > 次
          · <input
            class="num"
            :value="kegelConfig.sets"
            @change="onKegelParam('sets', $event)"
          > 组
          · 组间息 <input
            class="num num-wide"
            :value="kegelConfig.setRestSec"
            @change="onKegelParam('setRestSec', $event)"
          >″
        </span>
      </div>
      <div class="param-note">
        数字点击就地修改,立即生效;下次从菜单开始即按新参数
      </div>
      <div class="param-row">
        <span class="param-name">番茄</span>
        <span class="param-body">
          时长 <input
            class="num"
            :value="pomodoroConfig.minutes"
            @change="onPomodoroMinutes($event)"
          >′
          · 分类
          <span
            v-for="cat in pomodoroConfig.categories"
            :key="cat"
            class="cat-chip"
          >
            {{ cat }}
            <span
              v-if="pomodoroConfig.categories.length > 1"
              class="cat-remove"
              @click="removeCategory(cat)"
            >×</span>
          </span>
          <input
            v-model="newCategory"
            class="cat-add"
            placeholder="+ 新分类"
            spellcheck="false"
            @keydown.enter.prevent="addCategory"
            @blur="addCategory"
          >
        </span>
      </div>
      <div class="param-row">
        <span class="param-name">音效</span>
        <span class="param-body">
          <span
            class="sound-toggle"
            :class="{ off: !soundEnabled }"
            @click="toggleSound"
          >♪ {{ soundEnabled ? '开' : '关' }}</span>
          <span class="param-dim">相位提示音(与菜单里的开关同一个)</span>
        </span>
      </div>
    </section>

    <header class="panel-head">
      <h3>练习账页</h3>
      <div class="gran-switch">
        <span
          v-for="option in granularityOptions"
          :key="option.id"
          class="gran"
          :class="{ on: option.id === granularity }"
          @click="granularity = option.id"
        >{{ option.label }}</span>
      </div>
    </header>

    <div class="ledger-scroll">
      <table class="ledger">
        <thead>
          <tr>
            <th class="date">
              {{ granularity === 'day' ? '日期' : granularity === 'week' ? '周' : '月份' }}
            </th>
            <th>凯格尔</th>
            <th>番茄</th>
            <th>锻炼</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.key"
            :class="{ empty: row.empty }"
          >
            <td class="date">
              {{ row.key }}
            </td>
            <td>{{ row.kegel }}</td>
            <td>{{ row.pomodoro }}</td>
            <td>{{ row.exercise }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <section
      v-if="recentLines.length > 0"
      class="recent"
    >
      <h4>最近条目</h4>
      <ul>
        <li
          v-for="line in recentLines"
          :key="line.id"
        >
          <span class="stamp">{{ line.stamp }}</span>
          <span class="text">{{ line.text }}</span>
        </li>
      </ul>
    </section>

    <p
      v-if="allEmpty"
      class="empty-note"
    >
      还没有任何记录 —— 从 tab 栏下那条隐线开始第一组,或在聊天里告诉 AI 你刚练了什么。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { PracticeLedgerRecord, PracticeSummaryGranularity, PracticeSummaryResult } from '@/types'
import { platformApi } from '@/platform'
import { usePracticeStore } from '@/stores/practice'

const props = defineProps<{ active?: boolean }>()

const practiceStore = usePracticeStore()
const { lastSettled, config, soundEnabled } = storeToRefs(practiceStore)

// ── 参数区 ──

const FALLBACK_KEGEL = { holdSec: 10, relaxSec: 5, reps: 20, sets: 3, setRestSec: 60, sound: true }
const FALLBACK_POMODORO = { minutes: 25, categories: ['学习', '看视频', '写作', '其他'] }

const kegelConfig = computed(() => config.value?.kegel ?? FALLBACK_KEGEL)
const pomodoroConfig = computed(() => config.value?.pomodoro ?? FALLBACK_POMODORO)
const newCategory = ref('')

function onKegelParam(key: 'holdSec' | 'relaxSec' | 'reps' | 'sets' | 'setRestSec', event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value < 0) return
  void practiceStore.saveConfig({ kegel: { [key]: Math.round(value) } })
}

function onPomodoroMinutes(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) return
  void practiceStore.saveConfig({ pomodoro: { minutes: Math.round(value) } })
}

function addCategory(): void {
  const name = newCategory.value.trim()
  if (!name || pomodoroConfig.value.categories.includes(name)) {
    newCategory.value = ''
    return
  }
  void practiceStore.saveConfig({ pomodoro: { categories: [...pomodoroConfig.value.categories, name] } })
  newCategory.value = ''
}

function removeCategory(cat: string): void {
  const remaining = pomodoroConfig.value.categories.filter(item => item !== cat)
  if (remaining.length === 0) return
  void practiceStore.saveConfig({ pomodoro: { categories: remaining } })
}

function toggleSound(): void {
  void practiceStore.saveConfig({ kegel: { sound: !soundEnabled.value } })
}

const granularity = ref<PracticeSummaryGranularity>('day')
const summary = ref<PracticeSummaryResult | null>(null)
const recent = ref<PracticeLedgerRecord[]>([])

const granularityOptions: Array<{ id: PracticeSummaryGranularity; label: string }> = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
]

interface LedgerRow {
  key: string
  kegel: string
  pomodoro: string
  exercise: string
  empty: boolean
}

const rows = computed<LedgerRow[]>(() => {
  const buckets = summary.value?.buckets ?? []
  return [...buckets].reverse().map((bucket) => {
    const kegel = bucket.kegel.sessions > 0
      ? `${bucket.kegel.sessions} 次 · ${bucket.kegel.reps} rep`
      : '—'
    const pomodoro = bucket.pomodoro.sessions > 0
      ? `${bucket.pomodoro.sessions} 轮 · ${bucket.pomodoro.minutes}′`
      : '—'
    const exercise = bucket.exercise.byName.length > 0
      ? bucket.exercise.byName
        .map(ex => `${ex.key} ${ex.reps > 0 ? `${ex.sets}组${ex.reps}个` : `${ex.durationMin}′`}`)
        .join(' · ')
      : '—'
    return {
      key: bucket.bucketKey,
      kegel,
      pomodoro,
      exercise,
      empty: bucket.records === 0,
    }
  })
})

const allEmpty = computed(() => rows.value.every(row => row.empty) && recentLines.value.length === 0)

const recentLines = computed(() => recent.value.map((record) => {
  const date = new Date(record.ts)
  const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  let text: string
  if (record.kind === 'kegel' && record.kegel) {
    text = `凯格尔 · ${record.kegel.repsDone} rep · 组 ${record.kegel.setsDone}/${record.kegel.setsTarget}`
  } else if (record.kind === 'pomodoro' && record.pomodoro) {
    text = `番茄 · ${record.name} · ${record.pomodoro.elapsedMin}′${record.pomodoro.completed ? '' : '(中断)'}`
  } else {
    const ex = record.exercise
    const volume = ex?.sets && ex.repsPerSet ? `${ex.sets}×${ex.repsPerSet}` : ex?.durationMin ? `${ex.durationMin}′` : ''
    text = `${record.name}${volume ? ` · ${volume}` : ''}`
  }
  return { id: record.id, stamp, text }
}))

async function refresh(): Promise<void> {
  try {
    const [summaryResult, recentResult] = await Promise.all([
      platformApi.practiceSummary({ granularity: granularity.value }),
      platformApi.practiceRecent({ days: 7, limit: 10 }),
    ])
    summary.value = summaryResult
    recent.value = recentResult.records
  } catch {
    // Web build or early startup: leave the panel empty.
  }
}

onMounted(() => {
  void practiceStore.init()
  void refresh()
})
watch(granularity, refresh)
watch(() => props.active, (active) => {
  if (active) void refresh()
})
// A session or quick log just settled: the ledger changed.
watch(lastSettled, () => void refresh())
</script>

<style scoped>
.practice-panel {
  --pp-ink: var(--ui-text-primary-fg);
  --pp-muted: var(--ui-text-muted-fg);
  --pp-hairline: color-mix(in srgb, var(--ui-border-subtle-border) 60%, transparent);
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  padding: 18px 20px;
  overflow-y: auto;
}

/* ── 参数区 ── */
.params {
  flex-shrink: 0;
  border-bottom: 1px solid var(--pp-hairline);
  padding-bottom: 14px;
}

.params h4 {
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  color: var(--pp-muted);
  margin-bottom: 8px;
}

.param-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 12.5px;
  padding: 4px 0;
}

.param-name {
  width: 52px;
  flex: 0 0 52px;
  font-weight: 600;
  color: var(--pp-ink);
}

.param-body {
  flex: 1;
  color: var(--pp-muted);
  min-width: 0;
}

.param-note {
  font-size: 10.5px;
  color: color-mix(in srgb, var(--pp-muted) 65%, transparent);
  padding: 0 0 4px 64px;
}

.param-dim {
  font-size: 11px;
  color: color-mix(in srgb, var(--pp-muted) 70%, transparent);
  margin-left: 10px;
}

.num {
  width: 2.4ch;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: var(--pp-ink);
  font-size: 12.5px;
  font-family: inherit;
  text-align: center;
  border-bottom: 1px dashed transparent;
}

.num-wide {
  width: 3.2ch;
}

.num:hover,
input.num:focus {
  border-bottom-color: color-mix(in srgb, var(--pp-muted) 60%, transparent);
}

.cat-chip {
  color: var(--pp-ink);
  margin: 0 4px;
  white-space: nowrap;
}

.cat-remove {
  color: color-mix(in srgb, var(--pp-muted) 60%, transparent);
  cursor: pointer;
  margin-left: 2px;
}

.cat-remove:hover {
  color: var(--pp-ink);
}

.cat-add {
  width: 64px;
  border: 1px dashed var(--pp-hairline);
  border-radius: 4px;
  outline: 0;
  background: transparent;
  color: var(--pp-ink);
  font-size: 11px;
  font-family: inherit;
  padding: 0 6px;
  margin-left: 6px;
}

.cat-add::placeholder {
  color: color-mix(in srgb, var(--pp-muted) 55%, transparent);
}

.sound-toggle {
  cursor: pointer;
  color: var(--pp-ink);
}

.sound-toggle.off {
  color: color-mix(in srgb, var(--pp-muted) 55%, transparent);
  text-decoration: line-through;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-shrink: 0;
}

.panel-head h3 {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--pp-ink);
}

.gran-switch {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.gran {
  cursor: pointer;
  color: var(--pp-muted);
  padding-bottom: 1px;
}

.gran:hover {
  color: var(--pp-ink);
}

.gran.on {
  color: var(--pp-ink);
  border-bottom: 1.5px solid var(--pp-ink);
}

.ledger-scroll {
  overflow-x: auto;
  flex-shrink: 0;
}

.ledger {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.ledger th {
  text-align: left;
  font-weight: 400;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--pp-muted);
  padding: 0 10px 6px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--pp-ink) 40%, transparent);
}

.ledger td {
  padding: 6px 10px 6px 0;
  border-bottom: 1px solid var(--pp-hairline);
  color: var(--pp-ink);
  white-space: nowrap;
}

.ledger .date {
  color: var(--pp-muted);
  font-variant-numeric: tabular-nums;
}

.ledger tr.empty td {
  color: color-mix(in srgb, var(--pp-muted) 45%, transparent);
}

.recent {
  flex-shrink: 0;
}

.recent h4 {
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  color: var(--pp-muted);
  margin-bottom: 8px;
}

.recent ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recent li {
  display: flex;
  gap: 10px;
  font-size: 12px;
  flex-shrink: 0;
}

.recent .stamp {
  color: var(--pp-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.recent .text {
  color: var(--pp-ink);
}

.empty-note {
  font-size: 12px;
  color: var(--pp-muted);
  line-height: 1.7;
  max-width: 36em;
}
</style>
